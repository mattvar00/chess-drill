/**
 * Le coach : un petit pion qui explique les coups. C'est lui qui avance sur le chemin et qui rêve de promotion ;
 * il porte la couronne quand une variante est réussie. Dessin maison, en SVG, aux couleurs du thème.
 */
export type Mood = 'idle' | 'talk' | 'happy' | 'oops' | 'party';

const EYES: Record<Mood, string> = {
  idle: '<circle cx="20" cy="12.5" r="1.9"/><circle cx="28" cy="12.5" r="1.9"/>',
  talk: '<circle cx="20" cy="12" r="1.9"/><circle cx="28" cy="12" r="1.9"/>',
  happy: '<path class="ln" d="M17.6 13.2q2.4-3.4 4.8 0M25.6 13.2q2.4-3.4 4.8 0"/>',
  party: '<path class="ln" d="M17.6 13.2q2.4-3.4 4.8 0M25.6 13.2q2.4-3.4 4.8 0"/>',
  oops: '<circle cx="20" cy="13" r="1.9"/><circle cx="28" cy="13" r="1.9"/><path class="ln" d="M17 10.2l4.4-1.6M31 10.2l-4.4-1.6"/>',
};
const MOUTH: Record<Mood, string> = {
  idle: '<path class="ln" d="M20.6 17q3.4 2.6 6.8 0"/>',
  talk: '<ellipse cx="24" cy="18" rx="2.5" ry="2"/>',
  happy: '<path d="M19.6 16.4q4.4 5.6 8.8 0z"/>',
  party: '<path d="M19.6 16.4q4.4 5.6 8.8 0z"/>',
  oops: '<path class="ln" d="M21 18.8q3-2.2 6 0"/>',
};
/** Le pion, avec son humeur. `aria-hidden` : ce qu'il dit est dans la bulle. */
export function pawn(mood: Mood = 'idle'): string {
  return `<svg class="pawnc m-${mood}" viewBox="0 -9 48 56" aria-hidden="true">
    ${mood === 'party' ? '<path class="crown" d="M15.5 3.4l-1.6-8.6 5.6 4.2L24-7l4.5 6 5.6-4.2-1.6 8.6z"/>' : ''}
    <g class="body"><rect x="9" y="39" width="30" height="7" rx="3.5"/><path d="M16.5 40c0-8 3.6-10 3.6-15h7.8c0 5 3.6 7 3.6 15z"/><rect x="14.5" y="21.5" width="19" height="4.6" rx="2.3"/><circle cx="24" cy="13" r="11.2"/></g>
    <g class="face">${EYES[mood]}${MOUTH[mood]}</g></svg>`;
}
/** Le coach parle : le pion à gauche, ce qu'il dit dans une bulle. */
export const coachSay = (mood: Mood, html: string) => `<div class="crow">${pawn(mood)}<div class="cbub">${html}</div></div>`;
