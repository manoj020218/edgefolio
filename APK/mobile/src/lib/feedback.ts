import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

// "Something just happened" feedback for a successful punch: a vibration pattern plus a short
// synthesized chime (Web Audio — no sound files). Never throws: works on web/dev without the plugin.
// Sounds can be muted with localStorage['edgefolio.sounds'] = 'off' (vibration still happens).

type Kind = 'success' | 'offline' | 'already';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    return ctx;
  } catch {
    return null;
  }
}

function soundsOn(): boolean {
  try { return localStorage.getItem('edgefolio.sounds') !== 'off'; } catch { return true; }
}

/** Plays notes [frequency Hz, start s, length s] with a quick attack and soft decay. */
async function chime(notes: Array<[number, number, number]>, peak = 0.18) {
  if (!soundsOn()) return;
  const ac = audio();
  if (!ac) return;
  try {
    if (ac.state === 'suspended') await ac.resume();
    const t0 = ac.currentTime + 0.02;
    for (const [freq, start, len] of notes) {
      for (const [type, gainMul, detune] of [['sine', 1, 0], ['triangle', 0.35, 1200]] as const) {
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        osc.detune.value = detune; // soft octave sparkle on top
        const s = t0 + start;
        gain.gain.setValueAtTime(0.0001, s);
        gain.gain.exponentialRampToValueAtTime(peak * gainMul, s + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, s + len);
        osc.connect(gain).connect(ac.destination);
        osc.start(s);
        osc.stop(s + len + 0.05);
      }
    }
  } catch { /* audio unavailable */ }
}

async function buzz(fn: () => Promise<void>) {
  try { await fn(); } catch { /* no haptics (web) */ }
}

export function celebrate(kind: Kind): void {
  if (kind === 'success') {
    void buzz(() => Haptics.notification({ type: NotificationType.Success }));
    setTimeout(() => void buzz(() => Haptics.impact({ style: ImpactStyle.Medium })), 180);
    // C6 → E6 → G6, last note rings out
    void chime([[1046.5, 0, 0.16], [1318.5, 0.09, 0.16], [1568, 0.18, 0.45]]);
  } else if (kind === 'offline') {
    void buzz(() => Haptics.notification({ type: NotificationType.Warning }));
    void chime([[784, 0, 0.18], [1046.5, 0.12, 0.35]], 0.14); // G5 → C6, softer
  } else {
    void buzz(() => Haptics.impact({ style: ImpactStyle.Light }));
    void chime([[880, 0, 0.3]], 0.1);
  }
}
