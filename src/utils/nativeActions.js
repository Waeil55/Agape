import { ActionSheet } from '@capacitor/action-sheet';
import { Browser } from '@capacitor/browser';
import { App } from '@capacitor/app';
import { isNativeShell, isIOS, isAndroid } from './platform';
import { impact, notification } from './haptics';

const cleanPhone = (p) => (p || '').replace(/[^0-9+]/g, '');

function buildNavUrls(address, origin) {
  const encoded = encodeURIComponent(address);
  const originParam = origin ? `&origin=${encodeURIComponent(origin)}` : '';

  return {
    apple: `http://maps.apple.com/?daddr=${encoded}`,
    google: `comgooglemaps://?daddr=${encoded}`,
    googleWeb: `https://www.google.com/maps/dir/?api=1${originParam}&destination=${encoded}`,
    waze: `waze://?q=${encoded}&navigate=yes`,
    wazeWeb: `https://www.waze.com/ul?q=${encoded}&navigate=yes`,
  };
}

async function openUrlNative(url) {
  try {
    await Browser.open({ url, windowName: '_self' });
  } catch {
    window.location.href = url;
  }
}

async function openUrlWithFallback(url, fallbackUrl, timeout = 2500) {
  if (isNativeShell()) {
    await openUrlNative(url);
    return;
  }

  const start = Date.now();
  let hidden = false;

  const onVis = () => { if (document.hidden) hidden = true; };
  document.addEventListener('visibilitychange', onVis);

  window.location.href = url;

  await new Promise((r) => setTimeout(r, timeout));

  document.removeEventListener('visibilitychange', onVis);

  if (!hidden && Date.now() - start >= timeout - 200) {
    if (fallbackUrl) {
      window.location.href = fallbackUrl;
    }
  }
}

export async function openNavigation(address, app, origin) {
  await impact('medium');

  const urls = buildNavUrls(address, origin);

  if (app === 'apple') {
    if (isNativeShell()) {
      await openUrlNative(urls.apple);
    } else {
      window.location.href = urls.apple;
    }
    return;
  }

  if (app === 'google') {
    if (isIOS()) {
      await openUrlWithFallback(urls.google, urls.googleWeb);
    } else if (isAndroid()) {
      window.location.href = urls.googleWeb;
    } else if (isNativeShell()) {
      await openUrlNative(urls.googleWeb);
    } else {
      window.open(urls.googleWeb, '_blank');
    }
    return;
  }

  if (app === 'waze') {
    if (isIOS()) {
      await openUrlWithFallback(urls.waze, urls.wazeWeb);
    } else if (isNativeShell()) {
      try {
        await App.canOpenUrl({ url: urls.waze });
        await App.openUrl({ url: urls.waze });
      } catch {
        await openUrlNative(urls.wazeWeb);
      }
    } else {
      window.open(urls.wazeWeb, '_blank');
    }
    return;
  }

  if (isNativeShell()) {
    await openUrlNative(urls.googleWeb);
  } else {
    window.open(urls.googleWeb, '_blank');
  }
}

export async function showNavActionSheet(address, origin, preferredApp) {
  await impact('light');

  const isNative = isNativeShell();
  const isApple = isIOS();

  const items = [
    { title: preferredApp === 'apple' ? 'Apple Maps (Preferred)' : 'Apple Maps', icon: isApple ? '' : '📍' },
    { title: preferredApp === 'google' ? 'Google Maps (Preferred)' : 'Google Maps', icon: '' },
    { title: preferredApp === 'waze' ? 'Waze (Preferred)' : 'Waze', icon: '' },
    { title: 'Cancel', icon: '' },
  ];

  if (isNative) {
    try {
      const result = await ActionSheet.showActions({
        title: 'Navigate to',
        options: items.map((item, i) => ({
          title: item.title,
        })),
      });

      if (result.index === 3) return;

      const apps = ['apple', 'google', 'waze'];
      await openNavigation(address, apps[result.index], origin);
      return;
    } catch {}
  }

  const choice = window.confirm(
    `Open navigation for:\n${address}\n\nOK = ${preferredApp === 'apple' ? 'Apple Maps' : preferredApp === 'waze' ? 'Waze' : 'Google Maps'}\nCancel = Google Maps`
  );

  if (choice) {
    await openNavigation(address, preferredApp, origin);
  } else {
    await openNavigation(address, 'google', origin);
  }
}

export async function makeCall(phone, name) {
  await impact('heavy');

  const cleaned = cleanPhone(phone);
  if (!cleaned) return;

  if (isNativeShell()) {
    try {
      await App.openUrl({ url: `tel:${cleaned}` });
      await notification('success');
      return;
    } catch {}
  }

  window.location.href = `tel:${cleaned}`;
}

export async function sendSMS(phone, name) {
  await impact('medium');

  const cleaned = cleanPhone(phone);
  if (!cleaned) return;

  if (isNativeShell()) {
    try {
      await App.openUrl({ url: `sms:${cleaned}` });
      return;
    } catch {}
  }

  window.location.href = `sms:${cleaned}`;
}

export async function showCallActionSheet(phone, name) {
  await impact('light');

  const cleaned = cleanPhone(phone);
  if (!cleaned) return;

  const isNative = isNativeShell();

  const items = [
    { title: `Call ${name || cleaned}` },
    { title: `Message ${name || cleaned}` },
    { title: 'Copy Number' },
    { title: 'Cancel' },
  ];

  if (isNative) {
    try {
      const result = await ActionSheet.showActions({
        title: name || cleaned,
        options: items.map((item) => ({ title: item.title })),
      });

      switch (result.index) {
        case 0:
          await makeCall(phone, name);
          break;
        case 1:
          await sendSMS(phone, name);
          break;
        case 2:
          try {
            await navigator.clipboard.writeText(cleaned);
            await notification('success');
          } catch {}
          break;
        default:
          break;
      }
      return;
    } catch {}
  }

  const choice = window.confirm(`Call ${name || cleaned}?`);
  if (choice) {
    await makeCall(phone, name);
  }
}

export async function showConfirmDialog(title, message, confirmText = 'Confirm', cancelText = 'Cancel') {
  await impact('light');

  const isNative = isNativeShell();

  if (isNative) {
    try {
      const { Dialog } = await import('@capacitor/dialog');
      const result = await Dialog.confirm({
        title,
        message,
        okButtonTitle: confirmText,
        cancelButtonTitle: cancelText,
      });
      return result.value;
    } catch {}
  }

  return window.confirm(`${title}\n\n${message}`);
}
