/** Petits effets de fête : des confettis qui tombent une fois, puis disparaissent. Rien si l'appareil demande moins d'animations. */
const COLORS = ['#F7E11A', '#5FC58A', '#7FB0FF', '#F58CA8', '#F0A35E', '#B79CFF'];
export function confetti(n = 28): void {
  if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.querySelector('.confetti')?.remove();
  const box = document.createElement('div'); box.className = 'confetti'; box.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < n; i++) { const s = document.createElement('i'), r = Math.random;
    s.style.cssText = `left:${(r() * 100).toFixed(1)}%;background:${COLORS[i % COLORS.length]};animation-delay:${(r() * 0.3).toFixed(2)}s;animation-duration:${(1 + r() * 0.8).toFixed(2)}s;--dx:${Math.round((r() - 0.5) * 140)}px;--r:${Math.round(r() * 720 - 360)}deg;width:${6 + Math.round(r() * 4)}px`;
    box.append(s); }
  document.body.append(box); setTimeout(() => box.remove(), 2400);
}
