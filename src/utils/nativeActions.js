import { isNativeShell, isIOS, isAndroid } from './platform';
import { impact, notification } from './haptics';

const cleanPhone = (p) => (p || '').replace(/[^0-9+]/g, '');

function formatPhoneForDisplay(phone) {
  const cleaned = cleanPhone(phone);
  if (!cleaned) return '';
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  return cleaned;
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

function showWebFallbackModal(type, phone, name) {
  const cleaned = escapeHtml(cleanPhone(phone));
  const formatted = escapeHtml(formatPhoneForDisplay(phone));
  const safeName = escapeHtml(name || '');
  const typeLabel = type === 'call' ? 'Call' : 'Text';
  
  const html = `
    <div style="position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999; backdrop-filter: blur(4px);">
      <div style="background: white; border-radius: 16px; padding: 24px; max-width: 320px; box-shadow: 0 20px 25px rgba(0,0,0,0.15); text-align: center;">
        <h3 style="margin: 0 0 8px 0; font-size: 18px; font-weight: bold; color: #111827;">${typeLabel}</h3>
        <p style="margin: 0 0 16px 0; font-size: 14px; color: #6b7280;">
          ${safeName ? `<strong>${safeName}</strong><br/>` : ''}${formatted || cleaned}
        </p>
        <div style="display: flex; gap: 8px; margin-bottom: 12px;">
          <button id="copyBtn" style="flex: 1; padding: 10px 16px; background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 8px; font-weight: 600; font-size: 14px; cursor: pointer; color: #374151; transition: all 0.2s;">
            Copy
          </button>
          <button id="closeBtn" style="flex: 1; padding: 10px 16px; background: #111827; border: none; border-radius: 8px; font-weight: 600; font-size: 14px; cursor: pointer; color: white; transition: all 0.2s;">
            Close
          </button>
        </div>
        <p style="margin: 0; font-size: 12px; color: #9ca3af;">Use your phone to call or text this number</p>
      </div>
    </div>
  `;
  
  const div = document.createElement('div');
  div.innerHTML = html;
  document.body.appendChild(div);
  
  const overlay = div.firstElementChild;
  const copyBtn = div.querySelector('#copyBtn');
  const closeBtn = div.querySelector('#closeBtn');
  
  const cleanup = () => {
    div.remove();
  };
  
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(cleaned);
      copyBtn.textContent = '✓ Copied!';
      copyBtn.style.background = '#d1fae5';
      copyBtn.style.color = '#065f46';
      setTimeout(() => copyBtn.textContent = '📋 Copy', 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  });
  
  closeBtn.addEventListener('click', cleanup);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) cleanup();
  });
}


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
    const { Browser } = await import('@capacitor/browser');
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
      if (isIOS() || isAndroid()) {
        window.location.href = fallbackUrl;
      } else {
        window.open(fallbackUrl, '_blank');
      }
    }
  }
}

export async function openMapLink(primaryUrl, webFallbackUrl) {
  if (isNativeShell()) {
    await openUrlNative(primaryUrl);
    return;
  }
  
  if (isIOS() || isAndroid()) {
    await openUrlWithFallback(primaryUrl, webFallbackUrl || primaryUrl, 2500);
  } else {
    window.open(webFallbackUrl || primaryUrl, '_blank', 'noopener,noreferrer');
  }
}

export async function openNavigation(address, app, origin) {
  await impact('medium');

  const urls = buildNavUrls(address, origin);

  let targetUrl = urls.googleWeb;
  if (app === 'apple') {
    targetUrl = urls.apple; // Apple Maps universal link is urls.apple
  } else if (app === 'waze') {
    targetUrl = urls.wazeWeb; // Waze universal link is urls.wazeWeb
  } else {
    targetUrl = urls.googleWeb; // Google Maps universal link is urls.googleWeb
  }

  if (isNativeShell()) {
    await openUrlNative(targetUrl);
    return;
  }

  if (isIOS() || isAndroid()) {
    window.location.href = targetUrl;
  } else {
    window.open(targetUrl, '_blank', 'noopener,noreferrer');
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
      const { ActionSheet } = await import('@capacitor/action-sheet');
      const result = await ActionSheet.showActions({
        title: 'Navigate to',
        options: items.map((item) => ({
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
      const { App } = await import('@capacitor/app');
      await App.openUrl({ url: `tel:${cleaned}` });
      await notification('success');
      return;
    } catch (err) {
      console.error('Native call failed:', err);
    }
  }

  // Try tel: protocol on mobile browsers
  const isMobileOrTablet = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  if (isMobileOrTablet) {
    try {
      // Try opening tel: protocol
      const a = document.createElement('a');
      a.href = `tel:${cleaned}`;
      a.click();
      return;
    } catch (err) {
      console.error('Mobile tel: protocol failed:', err);
    }
  }

  // Web/Desktop fallback: show helpful modal
  showWebFallbackModal('call', phone, name);
}

export async function sendSMS(phone, name) {
  await impact('medium');

  const cleaned = cleanPhone(phone);
  if (!cleaned) return;

  if (isNativeShell()) {
    try {
      const { App } = await import('@capacitor/app');
      await App.openUrl({ url: `sms:${cleaned}` });
      return;
    } catch (err) {
      console.error('Native SMS failed:', err);
    }
  }

  // Try sms: protocol on mobile browsers
  const isMobileOrTablet = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  if (isMobileOrTablet) {
    try {
      // Try opening sms: protocol
      const a = document.createElement('a');
      a.href = `sms:${cleaned}`;
      a.click();
      return;
    } catch (err) {
      console.error('Mobile sms: protocol failed:', err);
    }
  }

  // Web/Desktop fallback: show helpful modal
  showWebFallbackModal('sms', phone, name);
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
      const { ActionSheet } = await import('@capacitor/action-sheet');
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
