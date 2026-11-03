import { Haptics, ImpactStyle } from '@capacitor/haptics';

// Touch feedback for the whole app, from one delegated listener (no component changes needed):
//  • "Water drop" ripple on every .btn-primary / .btn-ghost (styles: .ef-ripple in index.css).
//  • A vibration on every button, tab and link: medium tap for the main buttons, light tap for
//    everything else. Turn off with localStorage['edgefolio.haptics']='off'.
const RIPPLE_SELECTOR = '.btn-primary, .btn-ghost';
const TAP_SELECTOR = 'button, a[href], [role="button"], [role="tab"], input[type="checkbox"], input[type="radio"], select';

function spawn(btn: HTMLElement, x: number, y: number) {
  const r = btn.getBoundingClientRect();
  const size = Math.max(r.width, r.height) * 2.2;
  for (const cls of ['ef-ripple', 'ef-ripple ring']) {
    const s = document.createElement('span');
    s.className = cls;
    s.style.width = s.style.height = `${size}px`;
    s.style.left = `${x - r.left}px`;
    s.style.top = `${y - r.top}px`;
    btn.appendChild(s);
    s.addEventListener('animationend', () => s.remove(), { once: true });
    setTimeout(() => s.remove(), 1200); // safety net (reduced motion = no animationend)
  }
}

function hapticsOn(): boolean {
  try { return localStorage.getItem('edgefolio.haptics') !== 'off'; } catch { return true; }
}

let lastBuzz = 0;
function buzz(strong: boolean) {
  const now = Date.now();
  if (now - lastBuzz < 60 || !hapticsOn()) return;   // no machine-gun buzzing on fast taps
  lastBuzz = now;
  // selectionChanged() is too faint / ignored on many phones (MIUI) — use real impacts.
  const p = Haptics.impact({ style: strong ? ImpactStyle.Medium : ImpactStyle.Light });
  void p.catch(() => { /* web / no vibrator */ });
}

export function installRipples(): void {
  document.addEventListener(
    'pointerdown',
    (e) => {
      const target = e.target as HTMLElement | null;
      const el = target?.closest?.(TAP_SELECTOR) as HTMLElement | null;
      if (!el || (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') return;
      const main = el.matches(RIPPLE_SELECTOR) ? el : (target?.closest?.(RIPPLE_SELECTOR) as HTMLElement | null);
      if (main) spawn(main, e.clientX, e.clientY);
      buzz(Boolean(main));
    },
    { passive: true },
  );
}
