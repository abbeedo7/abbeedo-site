// Stable same-origin aliases always resolve the currently published release.
export const RELEASE_ORIGIN = globalThis.ABUNASSER_CONFIG?.apiOrigin || globalThis.location?.origin || 'https://abbeedo.com';
export const ANDROID_APK = RELEASE_ORIGIN + '/downloads/android.apk';
export const WINDOWS_SETUP = RELEASE_ORIGIN + '/downloads/windows.exe';
export const WINDOWS_PORTABLE = RELEASE_ORIGIN + '/downloads/windows-portable.exe';
export const RELEASE_INDEX = RELEASE_ORIGIN + '/api/releases';
