import { Device } from '@capacitor/device';

let _platform = null;
let _isNative = null;

export async function getPlatform() {
  if (_platform) return _platform;
  try {
    const info = await Device.getInfo();
    _platform = {
      platform: info.platform,
      osVersion: info.osVersion,
      model: info.model,
      manufacturer: info.manufacturer,
      isIOS: info.platform === 'ios',
      isAndroid: info.platform === 'android',
      isWeb: info.platform === 'web',
    };
  } catch {
    const ua = navigator.userAgent;
    _platform = {
      platform: /iPad|iPhone|iPod/.test(ua) ? 'ios' : /android/i.test(ua) ? 'android' : 'web',
      osVersion: '',
      model: '',
      manufacturer: '',
      isIOS: /iPad|iPhone|iPod/.test(ua),
      isAndroid: /android/i.test(ua),
      isWeb: !/iPad|iPhone|iPod|android/i.test(ua),
    };
  }
  return _platform;
}

export function isNativeShell() {
  if (_isNative !== null) return _isNative;
  _isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform());
  return _isNative;
}

export function isIOS() {
  const p = _platform;
  return p ? p.isIOS : /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export function isAndroid() {
  const p = _platform;
  return p ? p.isAndroid : /android/i.test(navigator.userAgent);
}

export async function initPlatform() {
  await getPlatform();
  isNativeShell();
}
