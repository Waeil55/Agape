import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { isNativeShell } from './platform';

export async function impact(style = 'medium') {
  if (!isNativeShell()) return;
  try {
    const map = { light: ImpactStyle.Light, medium: ImpactStyle.Medium, heavy: ImpactStyle.Heavy };
    await Haptics.impact({ style: map[style] || ImpactStyle.Medium });
  } catch {}
}

export async function selection() {
  if (!isNativeShell()) return;
  try { await Haptics.selection(); } catch {}
}

export async function notification(type = 'success') {
  if (!isNativeShell()) return;
  try {
    const map = { success: NotificationType.Success, warning: NotificationType.Warning, error: NotificationType.Error };
    await Haptics.notification({ type: map[type] || NotificationType.Success });
  } catch {}
}

export async function vibrate(ms = 50) {
  if (!isNativeShell()) {
    try { navigator.vibrate && navigator.vibrate(ms); } catch {}
    return;
  }
  try { await Haptics.impact({ style: ImpactStyle.Light }); } catch {}
}
