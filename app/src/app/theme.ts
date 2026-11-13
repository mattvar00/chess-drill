/** Apparence : palette, mode clair ou sombre, couleurs du plateau. Gardée aussi hors de la base pour être appliquée avant le premier affichage. */
export const PALETTES = [['cobalt', 'Cobalt'], ['marine', 'Marine et citron'], ['bordeaux', 'Bordeaux']] as const;
export const MODES = [['auto', 'Auto'], ['clair', 'Clair'], ['sombre', 'Sombre']] as const;
export const BOARDS = [['theme', 'Assorti'], ['wood', 'Bois'], ['green', 'Vert']] as const;
export interface Look { palette: string; mode: string; board: string }

const KEY = 'cd_look', dark = matchMedia('(prefers-color-scheme: dark)');
const pick = (list: readonly (readonly [string, string])[], v: unknown, d: string) => list.some(x => x[0] === v) ? String(v) : d;
export const normalize = (l: Partial<Record<keyof Look, unknown>>): Look => ({ palette: pick(PALETTES, l.palette, 'marine'), mode: pick(MODES, l.mode, 'sombre'), board: pick(BOARDS, l.board, 'theme') });
let cur = normalize({});
export const look = () => cur;
/** Mode réellement affiché (« auto » suit le réglage du téléphone ou de l'ordinateur). */
export const shownMode = () => cur.mode === 'auto' ? (dark.matches ? 'sombre' : 'clair') : cur.mode;

export function applyLook(l: Partial<Record<keyof Look, unknown>>) {
  cur = normalize(l); const r = document.documentElement;
  r.dataset.palette = cur.palette; r.dataset.mode = shownMode(); document.body.dataset.board = cur.board;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', getComputedStyle(r).getPropertyValue('--ground').trim());
  try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch { /* stockage indisponible : l'apparence reste celle par défaut au prochain lancement */ }
}
export function restoreLook() { let saved = {}; try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') ?? {}; } catch { /* valeur illisible : apparence par défaut */ } applyLook(saved); }
dark.addEventListener('change', () => { if (cur.mode === 'auto') applyLook(cur); });
