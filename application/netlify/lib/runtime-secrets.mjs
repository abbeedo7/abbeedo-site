// Private server storage only. There is no HTTP route that exposes this record.
export const BOOTSTRAP_KEY='private-hosting/bootstrap-secrets-v1.json';
const valid=value=>typeof value==='string'&&/^[a-f0-9]{64}$/i.test(value);
const missing=value=>value===undefined||value===null||value==='';
const randomHex=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),value=>value.toString(16).padStart(2,'0')).join('');
function verifyRecord(record) {
  if(!record||record.version!==1||!valid(record.clientSecret)||!valid(record.relayKey)||record.clientSecret.toLowerCase()===record.relayKey.toLowerCase())throw Error('The private hosting key record is invalid');
  return record;
}
export async function resolveRuntimeSecrets(bucket,configured={}) {
  for(const name of ['CLIENT_SECRET','RELAY_KEY'])if(!missing(configured[name])&&!valid(configured[name]))throw Error('The configured server key is invalid');
  if(!missing(configured.CLIENT_SECRET)&&!missing(configured.RELAY_KEY))return {CLIENT_SECRET:configured.CLIENT_SECRET,RELAY_KEY:configured.RELAY_KEY};
  let object=await bucket.get(BOOTSTRAP_KEY),record=object?verifyRecord(await object.json()):null;
  if(!record) {
    const proposed=verifyRecord({version:1,clientSecret:randomHex(),relayKey:randomHex(),createdAt:new Date().toISOString()});
    const inserted=await bucket.put(BOOTSTRAP_KEY,JSON.stringify(proposed),{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json',cacheControl:'no-store'}});
    if(inserted)record=proposed;
    else {
      object=await bucket.get(BOOTSTRAP_KEY);
      if(!object)throw Error('The private hosting key record could not be read');
      record=verifyRecord(await object.json());
    }
  }
  return {CLIENT_SECRET:missing(configured.CLIENT_SECRET)?record.clientSecret:configured.CLIENT_SECRET,RELAY_KEY:missing(configured.RELAY_KEY)?record.relayKey:configured.RELAY_KEY};
}
