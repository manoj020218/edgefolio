// "Water drop" touch feedback for every .btn-primary / .btn-ghost: a soft splash plus an
// expanding ring from the exact touch point (styles: .ef-ripple in index.css). One delegated
// listener for the whole app, so no component needs to change.
const SELECTOR = '.btn-primary, .btn-ghost';

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

export function installRipples(): void {
  document.addEventListener(
    'pointerdown',
    (e) => {
      const btn = (e.target as HTMLElement | null)?.closest?.(SELECTOR) as HTMLElement | null;
      if (!btn || (btn as HTMLButtonElement).disabled) return;
      spawn(btn, e.clientX, e.clientY);
    },
    { passive: true },
  );
}
