/**
 * Deux petits graphiques en SVG, une seule série chacun (le titre de la carte la nomme, pas de légende) :
 *  - la courbe des chances d'une partie, cliquable pour aller à un coup ;
 *  - la courbe d'Elo d'une cadence.
 * Les points et le curseur sont des éléments HTML posés en pourcentage, pour rester ronds quelle que soit la largeur.
 */
import { esc } from './dom';

const path = (pts: [number, number][]) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');

/** Courbe des chances (0-100, ton point de vue). `marks` : coups à signaler, `label` : texte de l'infobulle pour une position. */
export function advantageChart(wp: number[], marks: { i: number; cls: string; label: string }[], label: (i: number) => string): string {
  const n = Math.max(1, wp.length - 1), H = 100;
  const pts = wp.map((v, i) => [(i / n) * 100, H - v] as [number, number]);
  return `<div class="chart adv" data-n="${n}" role="img" aria-label="Évolution de tes chances de gain au fil de la partie">
    <svg viewBox="0 0 100 ${H}" preserveAspectRatio="none" aria-hidden="true">
      <path class="adv-area" d="${path(pts)} L100,${H} L0,${H} Z"/>
      <line class="adv-mid" x1="0" y1="50" x2="100" y2="50" vector-effect="non-scaling-stroke"/>
      <path class="adv-line" d="${path(pts)}" vector-effect="non-scaling-stroke"/>
    </svg>
    ${marks.map(m => `<i class="adv-dot c-${m.cls}" style="left:${(m.i / n) * 100}%;top:${100 - wp[m.i]}%" title="${esc(m.label)}"></i>`).join('')}
    <i class="adv-cur" style="left:0"></i><span class="tip" hidden></span>
    ${wp.map((_, i) => `<b class="adv-hit" style="left:${((i - 0.5) / n) * 100}%;width:${100 / n}%" data-i="${i}" data-l="${esc(label(i))}"></b>`).join('')}
  </div>`;
}
export function setAdvantageCursor(el: HTMLElement, i: number) {
  const n = +(el.dataset.n || 1), c = el.querySelector<HTMLElement>('.adv-cur'); if (c) c.style.left = `${(i / n) * 100}%`;
}
/** Infobulle au survol et choix d'une position au clic ou au toucher. */
export function bindChart(el: HTMLElement, pick?: (i: number) => void) {
  const tip = el.querySelector<HTMLElement>('.tip'); if (!tip) return;
  el.addEventListener('pointermove', ev => {
    const hit = (ev.target as HTMLElement).closest<HTMLElement>('[data-l]'); if (!hit) { tip.hidden = true; return; }
    tip.textContent = hit.dataset.l || ''; tip.hidden = false;
    const r = el.getBoundingClientRect(), x = Math.max(60, Math.min(r.width - 60, ev.clientX - r.left)); tip.style.left = x + 'px';
  });
  el.addEventListener('pointerleave', () => { tip.hidden = true; });
  if (pick) el.addEventListener('click', ev => { const hit = (ev.target as HTMLElement).closest<HTMLElement>('[data-i]'); if (hit) pick(+hit.dataset.i!); });
}

/** Courbe d'Elo : une ligne, le minimum et le maximum indiqués, infobulle par partie. */
export function eloChart(points: { t: number; e: number }[]): string {
  if (points.length < 2) return '';
  const es = points.map(p => p.e), mn = Math.min(...es), mx = Math.max(...es), span = Math.max(20, mx - mn), H = 100, n = points.length - 1;
  const y = (e: number) => H - 8 - ((e - mn) / span) * (H - 16);
  const pts = points.map((p, i) => [(i / n) * 100, y(p.e)] as [number, number]);
  const day = (t: number) => new Date(t * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  return `<div class="elowrap"><div class="chart elo" role="img" aria-label="Elo de ${points[0].e} à ${points[n].e}, entre ${mn} et ${mx}">
    <svg viewBox="0 0 100 ${H}" preserveAspectRatio="none" aria-hidden="true"><path class="elo-line" d="${path(pts)}" vector-effect="non-scaling-stroke"/></svg>
    <span class="tip" hidden></span>
    ${points.map((p, i) => `<b class="adv-hit" style="left:${((i - 0.5) / n) * 100}%;width:${100 / n}%" data-l="${day(p.t)} : ${p.e}"></b>`).join('')}
  </div><span class="axcol" aria-hidden="true"><span>${mx}</span><span>${mn}</span></span></div>`;
}
