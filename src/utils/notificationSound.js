let audioCtx = null;
let initAttempted = false;

function getAudioContext() {
  if (!audioCtx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    try {
      audioCtx = new Ctor();
    } catch (e) {
      return null;
    }
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function initAudioContext() {
  if (initAttempted) return;
  initAttempted = true;
  try {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    if (!audioCtx) audioCtx = new Ctor();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch {}
}

['click', 'touchstart', 'keydown'].forEach(evt => {
  window.addEventListener(evt, () => initAudioContext(), { once: true });
});

function playTone(ctx, frequency, startTime, duration, gainValue) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(gainValue, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

export function playNotificationSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    playTone(ctx, 523.25, now, 0.15, 0.3);
    playTone(ctx, 659.25, now + 0.12, 0.25, 0.35);
    playTone(ctx, 783.99, now + 0.24, 0.35, 0.25);
  } catch {}
}

export function playMessageSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    
    // Premium iOS-style subtle "ping" (like a soft bell/marimba)
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    osc1.type = 'sine';
    osc2.type = 'triangle';
    
    osc1.frequency.value = 1200;
    osc2.frequency.value = 2400;
    
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.3, now + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    
    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.3);
    osc2.stop(now + 0.3);
  } catch {}
}

export function playMessageSentSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    playTone(ctx, 660, now, 0.08, 0.16);
    playTone(ctx, 990, now + 0.055, 0.14, 0.13);
  } catch {}
}

export function playAlertSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      playTone(ctx, 880, now + i * 0.15, 0.08, 0.4);
      playTone(ctx, 440, now + i * 0.15 + 0.04, 0.08, 0.3);
    }
  } catch {}
}
