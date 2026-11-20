/* Encrypted local data. Browser keys live in IndexedDB as non-extractable
 * CryptoKeys; the iOS shell uses its encrypted file store and Keychain key. */
import {isNative, nativeRequest} from './native.js';
const databases = new Map();
const memories = new Map();
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const VERSION = 1;
const MAX_VALUE_BYTES = 32 * 1024 * 1024;
const MAX_BACKUP_BYTES = 96 * 1024 * 1024;

export class VaultError extends Error {
  constructor(message, code = 'VAULT_ERROR', cause) { super(message, {cause}); this.name = 'VaultError'; this.code = code; }
}

function cryptoAPI() {
  if (!globalThis.crypto?.subtle) throw new VaultError('الحفظ المشفر يحتاج اتصال HTTPS أو تطبيق الآيفون.', 'CRYPTO_UNAVAILABLE');
  return globalThis.crypto;
}
function b64(bytes) {
  let result = ''; for (let n = 0; n < bytes.length; n += 32768) result += String.fromCharCode(...bytes.subarray(n, n + 32768));
  return btoa(result);
}
function unb64(value) {
  if (typeof value !== 'string' || value.length > MAX_BACKUP_BYTES * 2 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new VaultError('صيغة النسخة المشفرة غير صالحة.', 'INVALID_BACKUP');
  return Uint8Array.from(atob(value), c => c.charCodeAt(0));
}
function request(result) { return new Promise((resolve, reject) => { result.onsuccess = () => resolve(result.result); result.onerror = () => reject(result.error); }); }
function transactionDone(tx) { return new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error || new Error('Storage aborted')); tx.onerror = () => reject(tx.error); }); }

async function openDatabase(name) {
  if (!databases.has(name)) databases.set(name, new Promise((resolve, reject) => {
    const opening = indexedDB.open(name, VERSION);
    opening.onupgradeneeded = () => { const db = opening.result; if (!db.objectStoreNames.contains('records')) db.createObjectStore('records', {keyPath: 'id'}); if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', {keyPath: 'id'}); };
    opening.onsuccess = () => { opening.result.onversionchange = () => { opening.result.close(); databases.delete(name); }; resolve(opening.result); };
    opening.onerror = () => { databases.delete(name); reject(opening.error); };
    opening.onblocked = () => { databases.delete(name); reject(new VaultError('أغلق نسخة التطبيق الأخرى ثم حاول الحفظ مجددًا.', 'STORAGE_BLOCKED')); };
  }));
  return databases.get(name);
}

class MemoryDriver {
  constructor(name) { if (!memories.has(name)) memories.set(name, {records: new Map(), key: null}); this.data = memories.get(name); this.durable = false; }
  async get(id) { return this.data.records.get(id); }
  async set(record) { this.data.records.set(record.id, copyTVRecord(record)); }
  async remove(id) { this.data.records.delete(id); }
  async rows() { return [...this.data.records.values()].map(value => copyTVRecord(value)); }
  async key() { return this.data.key ||= cryptoAPI().subtle.generateKey({name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']); }
  async bulk(records, replace) { const next = replace ? new Map() : new Map(this.data.records); for (const record of records) next.set(record.id, copyTVRecord(record)); this.data.records = next; }
}
class IDBDriver {
  constructor(db) { this.db = db; this.durable = true; }
  async get(id) { return request(this.db.transaction('records').objectStore('records').get(id)); }
  async set(record) { const tx = this.db.transaction('records', 'readwrite'); const done = transactionDone(tx); tx.objectStore('records').put(record); await done; }
  async remove(id) { const tx = this.db.transaction('records', 'readwrite'); const done = transactionDone(tx); tx.objectStore('records').delete(id); await done; }
  async rows() { return request(this.db.transaction('records').objectStore('records').getAll()); }
  async bulk(records, replace) { const tx = this.db.transaction('records', 'readwrite'), done = transactionDone(tx), store = tx.objectStore('records'); if (replace) store.clear(); for (const record of records) store.put(record); await done; }
  async key() {
    const old = await request(this.db.transaction('meta').objectStore('meta').get('master-key'));
    if (old?.key) return old.key;
    const candidate = await cryptoAPI().subtle.generateKey({name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
    // Re-read inside one write transaction: two tabs must never replace each other's key.
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('meta', 'readwrite'), store = tx.objectStore('meta'), read = store.get('master-key'); let key;
      read.onsuccess = () => { key = read.result?.key || candidate; if (!read.result) store.put({id: 'master-key', key}); };
      tx.oncomplete = () => resolve(key); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('Key creation aborted'));
    });
  }
}

class NativeDriver {
  constructor(name) { this.name = name; this.durable = true; this.native = true; }
  _parts(id) { const [namespace, key] = JSON.parse(id); return {namespace: `${this.name}|${namespace}`, key}; }
  async get(id) { const result = await nativeRequest('storageGet', this._parts(id)); return result?.found ? {id, value: result.value} : undefined; }
  async set(record) { await nativeRequest('storageSet', {...this._parts(record.id), value: record.value}); }
  async remove(id) { await nativeRequest('storageRemove', this._parts(id)); }
  async rows() { const result = await nativeRequest('storageList'); return (result.records || []).filter(row => row.namespace.startsWith(`${this.name}|`)).map(row => ({id: JSON.stringify([row.namespace.slice(this.name.length + 1), row.key]), value: row.value})); }
  async bulk(records, replace) {
    // Replacement filtering runs inside the native store's serialized transaction;
    // a JS read/merge here could drop another Vault's concurrent write.
    await nativeRequest('storageCommit', {replace, namespacePrefix: `${this.name}|`, records: records.map(record => ({...this._parts(record.id), value: record.value}))});
  }
}

/** get/set/remove/list keys are scoped to namespace. Values are JSON, always encrypted. */
export class Vault {
  constructor({name = 'abunasser-apple-web', namespace = 'default', memory = false, driver = null} = {}) {
    if (typeof namespace !== 'string' || !namespace || namespace.length > 256) throw new VaultError('Invalid namespace', 'INVALID_KEY');
    this.name = name; this.namespace = namespace; this.durable = false; this.fallbackReason = null;
    this.ready = driver ? Promise.resolve(driver) : this._open(memory);
    this.ready.then(value => { this.durable = value.durable; }, () => {});
  }
  async _open(memory) {
    if (!memory && isNative()) return new NativeDriver(this.name);
    cryptoAPI();
    if (!memory && typeof indexedDB !== 'undefined') {
      try { return new IDBDriver(await openDatabase(this.name)); }
      catch (error) { if (error?.code === 'STORAGE_BLOCKED') throw error; this.fallbackReason = 'STORAGE_UNAVAILABLE'; }
    } else this.fallbackReason = memory ? 'MEMORY_REQUESTED' : 'STORAGE_UNAVAILABLE';
    return new MemoryDriver(this.name);
  }
  _id(key) { if (typeof key !== 'string' || !key || key.length > 2048) throw new VaultError('Invalid storage key', 'INVALID_KEY'); return JSON.stringify([this.namespace, key]); }
  scope(namespace) { return new Vault({name: this.name, namespace, driver: this.ready}); }
  async _driver() { let driver = await this.ready; if (driver instanceof Promise) driver = await driver; this.durable = driver.durable; return driver; }
  async get(key, fallback = null) {
    const id = this._id(key), driver = await this._driver(), record = await driver.get(id); if (!record) return fallback;
    if (driver.native) return record.value;
    try {
      const plain = await cryptoAPI().subtle.decrypt({name: 'AES-GCM', iv: record.iv, additionalData: encoder.encode(id)}, await driver.key(), record.ciphertext);
      return JSON.parse(decoder.decode(plain));
    } catch (error) { throw new VaultError('تعذر فتح البيانات المحلية المشفرة. لم تُحذف النسخة المحفوظة.', 'DECRYPT_FAILED', error); }
  }
  async set(key, value) {
    const id = this._id(key), driver = await this._driver(); let json;
    try { json = JSON.stringify(value); } catch (error) { throw new VaultError('لا يمكن حفظ هذه البيانات.', 'INVALID_VALUE', error); }
    if (json === undefined) throw new VaultError('Cannot store undefined', 'INVALID_VALUE');
    const plain = encoder.encode(json); if (plain.byteLength > MAX_VALUE_BYTES) throw new VaultError('البيانات تتجاوز حد الحفظ المحلي.', 'VALUE_TOO_LARGE');
    if (driver.native) { await driver.set({id, value: JSON.parse(json)}); return value; }
    const iv = cryptoAPI().getRandomValues(new Uint8Array(12));
    const ciphertext = await cryptoAPI().subtle.encrypt({name: 'AES-GCM', iv, additionalData: encoder.encode(id)}, await driver.key(), plain);
    await driver.set({id, iv, ciphertext, savedAt: Date.now()}); return value;
  }
  async remove(key) { await (await this._driver()).remove(this._id(key)); }
  async list(prefix = '') {
    const records = await (await this._driver()).rows(); const result = [];
    for (const row of records) { let id; try { id = JSON.parse(row.id); } catch { continue; } if (id[0] === this.namespace && typeof id[1] === 'string' && id[1].startsWith(prefix)) result.push(id[1]); }
    return result.sort();
  }
  async clear({allNamespaces = false} = {}) {
    const driver = await this._driver(); for (const row of await driver.rows()) { let id; try { id = JSON.parse(row.id); } catch { continue; } if (allNamespaces || id[0] === this.namespace) await driver.remove(row.id); }
  }
  async exportBackup(password, {allNamespaces = true} = {}) {
    if (typeof password !== 'string' || password.length < 8) throw new VaultError('استخدم كلمة مرور من 8 أحرف على الأقل للنسخة الاحتياطية.', 'WEAK_PASSWORD');
    const driver = await this._driver(), rows = [];
    for (const record of await driver.rows()) {
      const [namespace, key] = JSON.parse(record.id); if (!allNamespaces && namespace !== this.namespace) continue;
      rows.push({namespace, key, value: await this.scope(namespace).get(key)});
    }
    const plain = encoder.encode(JSON.stringify({schema: 1, createdAt: new Date().toISOString(), records: rows}));
    if (plain.byteLength > MAX_BACKUP_BYTES) throw new VaultError('النسخة أكبر من الحد المسموح.', 'VALUE_TOO_LARGE');
    if (driver.native) { const result = await nativeRequest('backupEncrypt', {plaintext: decoder.decode(plain), password}); return typeof result === 'string' ? result : JSON.stringify(result); }
    const salt = cryptoAPI().getRandomValues(new Uint8Array(16)), iv = cryptoAPI().getRandomValues(new Uint8Array(12)), iterations = 250000;
    const key = await backupKey(password, salt, iterations);
    const ciphertext = await cryptoAPI().subtle.encrypt({name: 'AES-GCM', iv, additionalData: encoder.encode('ABUNASSER-BACKUP-1')}, key, plain);
    return JSON.stringify({format: 'abunasser-encrypted-backup', version: 1, kdf: 'PBKDF2-SHA256', iterations, salt: b64(salt), iv: b64(iv), ciphertext: b64(new Uint8Array(ciphertext))});
  }
  async importBackup(text, password, {replace = false} = {}) {
    if (typeof text !== 'string' || text.length > MAX_BACKUP_BYTES * 2 || typeof password !== 'string') throw new VaultError('ملف النسخة غير صالح.', 'INVALID_BACKUP');
    let envelope, decoded; const driver = await this._driver();
    try {
      envelope = JSON.parse(text);
      if (envelope.format !== 'abunasser-encrypted-backup' || envelope.version !== 1 || envelope.kdf !== 'PBKDF2-SHA256' || !Number.isInteger(envelope.iterations) || envelope.iterations < 100000 || envelope.iterations > 1000000) throw new Error('Invalid envelope');
      const salt = unb64(envelope.salt), iv = unb64(envelope.iv); if (salt.length !== 16 || iv.length !== 12) throw new Error('Invalid cipher parameters');
      let plain;
      if (driver.native) { const result = await nativeRequest('backupDecrypt', {envelope, password}); plain = encoder.encode(result.plaintext); }
      else { const key = await backupKey(password, salt, envelope.iterations); plain = await cryptoAPI().subtle.decrypt({name: 'AES-GCM', iv, additionalData: encoder.encode('ABUNASSER-BACKUP-1')}, key, unb64(envelope.ciphertext)); }
      if (plain.byteLength > MAX_BACKUP_BYTES) throw new Error('Backup too large'); decoded = JSON.parse(decoder.decode(plain));
      if (decoded.schema !== 1 || !Array.isArray(decoded.records) || decoded.records.length > 100000) throw new Error('Invalid records');
      for (const record of decoded.records) { const scope = this.scope(record.namespace); scope._id(record.key); if (!Object.hasOwn(record, 'value')) throw new Error('Invalid value'); const size = encoder.encode(JSON.stringify(record.value)); if (size.length > MAX_VALUE_BYTES) throw new Error('Record too large'); }
    } catch (error) { throw new VaultError('كلمة مرور النسخة غير صحيحة أو الملف تالف.', 'INVALID_BACKUP', error); }
    // Encrypt everything first, then commit in one transaction. A quota error must
    // not delete the existing subscriptions during a replacement restore.
    const encryptionKey = driver.native ? null : await driver.key(), records = [], ids = new Set();
    for (const record of decoded.records) {
      const id = this.scope(record.namespace)._id(record.key); if (ids.has(id)) throw new VaultError('Duplicate backup record', 'INVALID_BACKUP'); ids.add(id);
      if (driver.native) { records.push({id, value: record.value}); continue; }
      const iv = cryptoAPI().getRandomValues(new Uint8Array(12)), plain = encoder.encode(JSON.stringify(record.value));
      const ciphertext = await cryptoAPI().subtle.encrypt({name: 'AES-GCM', iv, additionalData: encoder.encode(id)}, encryptionKey, plain); records.push({id, iv, ciphertext, savedAt: Date.now()});
    }
    await driver.bulk(records, replace);
    return decoded.records.length;
  }
}

async function backupKey(password, salt, iterations) {
  const material = await cryptoAPI().subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return cryptoAPI().subtle.deriveKey({name: 'PBKDF2', salt, iterations, hash: 'SHA-256'}, material, {name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
}

function copyTVRecord(record){return {...record,...(record.iv?{iv:record.iv.slice()}:{}),...(record.ciphertext?{ciphertext:record.ciphertext.slice(0)}:{})};}
