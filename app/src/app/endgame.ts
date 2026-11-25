/**
 * Finales. Trois choses, toutes appuyées sur la table de finales de Lichess (résultat exact à 7 pièces ou moins, gratuite, sans compte) :
 *  - « Tes finales » : pour une de tes parties, le résultat théorique coup par coup, et les moments où il a basculé ;
 *  - « Rejoue ce moment » : la position juste avant ta faute, à rejouer contre la meilleure défense ;
 *  - les classiques (pont de Lucena, Philidor…) : même exercice, depuis une position d'école.
 * Rien n'est récité : tu joues, la table dit si le gain (ou la nulle) tient encore, et répond.
 */
import { Chess, tryMove, uciOf, uciToObj, type Move } from '../core/chess';
import type { Color, Game } from '../core/types';
import { Board, miniFen } from '../ui/board';
import { coachSay, type Mood } from '../ui/coach';
import { $, esc, icon, plural } from '../ui/dom';
import { confetti } from '../ui/fx';
import { SFX } from '../ui/sound';
import { markActive, save, store } from './store';
import { COURS, type Slide } from './endgame-cours';

/* ---------- la table ---------- */
/** Résultat pour le camp au trait : gagné, nul, perdu (les gains qui butent sur la règle des 50 coups comptent comme nuls). */
export type Out = 'w' | 'd' | 'l';
interface TbMove { uci: string; san: string; category: string; dtz?: number | null; precise_dtz?: number | null }
/** `dtz` : nombre de demi-coups avant la prochaine prise ou poussée de pion, en jouant au mieux (sert à voir si un gain avance). */
interface TbReply { uci: string; san: string; out: Out; dtz: number }
interface Tb { out: Out; dtz: number; moves: TbReply[]; over: boolean }
const OUT: Record<string, Out> = { win: 'w', 'syzygy-win': 'w', 'maybe-win': 'w', loss: 'l', 'syzygy-loss': 'l', 'maybe-loss': 'l', draw: 'd', 'cursed-win': 'd', 'blessed-loss': 'd', unknown: 'd' };
const flip = (o: Out): Out => o === 'w' ? 'l' : o === 'l' ? 'w' : 'd';
const cache = new Map<string, Promise<Tb | null>>();
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
export const pieces = (fen: string) => fen.split(' ')[0].replace(/[^a-zA-Z]/g, '').length;
/** Interroge la table. null : position hors table (plus de 7 pièces) ou réseau indisponible. */
export function probe(fen: string): Promise<Tb | null> {
  const key = fen.split(' ').slice(0, 4).join(' ');
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      if (pieces(fen) > 7) return null;
      for (let t = 0; t < 4; t++) {
        try {
          const r = await fetch('https://tablebase.lichess.ovh/standard?fen=' + encodeURIComponent(key + ' 0 1'));
          if (r.status === 429) { await wait(3000 * (t + 1)); continue; }
          if (!r.ok) return null;
          const j = await r.json() as { category: string; dtz?: number | null; precise_dtz?: number | null; checkmate?: boolean; stalemate?: boolean; insufficient_material?: boolean; moves?: TbMove[] };
          // la catégorie d'un coup est donnée pour l'adversaire, après le coup : on la retourne
          const dz = (x: { dtz?: number | null; precise_dtz?: number | null }) => Math.abs(x.precise_dtz ?? x.dtz ?? 0);
          return { out: OUT[j.category] ?? 'd', dtz: dz(j), over: !!(j.checkmate || j.stalemate || j.insufficient_material), moves: (j.moves ?? []).map(m => ({ uci: m.uci, san: m.san, out: flip(OUT[m.category] ?? 'd'), dtz: dz(m) })) };
        } catch { await wait(800); }
      }
      return null;
    })();
    cache.set(key, p); p.then(v => { if (!v) cache.delete(key); });
  }
  return p;
}

/* ---------- les mots ---------- */
const FR: Record<string, string> = { K: 'R', Q: 'D', R: 'T', B: 'F', N: 'C' };
/** Un coup en notation française : Kf3 → Rf3, Rxa7 → Txa7. */
export const frSan = (san: string) => san.replace(/^[KQRBN]/, c => FR[c]).replace(/=([QRBN])/, (_, c) => '=' + FR[c]);
const num = (ply: number) => `${Math.floor((ply - 1) / 2) + 1}${ply % 2 ? '.' : '…'}`;
const orList = (l: string[]) => l.length <= 1 ? l.join('') : `${l.slice(0, -1).join(', ')} ou ${l[l.length - 1]}`;
const NAME: Record<string, string> = { q: 'dame', r: 'tour', b: 'fou', n: 'cavalier', p: 'pion' };
/** Le type de finale en mots : « Tour et pion contre tour ». */
export function material(fen: string, me: Color): string {
  const side = (white: boolean) => { const s = fen.split(' ')[0].replace(/[^a-zA-Z]/g, '').split('').filter(c => (c === c.toUpperCase()) === white && c.toLowerCase() !== 'k').map(c => c.toLowerCase());
    const n = (k: string) => s.filter(c => c === k).length, out: string[] = [];
    for (const k of ['q', 'r', 'b', 'n']) if (n(k)) out.push(n(k) > 1 ? `${n(k)} ${NAME[k]}s` : NAME[k]);
    if (n('p')) out.push(n('p') > 1 ? `${n('p')} pions` : 'pion');
    return out.length ? out.join(' et ') : 'roi seul'; };
  const a = side(me === 'w'), b = side(me !== 'w'), t = `${a} contre ${b}`;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/* ---------- une de tes parties ---------- */
export interface Turn { ply: number; san: string; mine: boolean; from: Out; to: Out; keep: string[]; fen: string }
export interface EndReport { start: number; fen: string; outs: Out[]; turns: Turn[]; last: Out }
const REP = 'cd_eg_';
/** Demi-coup à partir duquel la partie tient dans la table, ou -1 si elle n'y arrive pas (ou trop tard pour être une vraie finale). */
export function endgameStart(g: Pick<Game, 'sans'>): number {
  if (g.sans.length < 30) return -1;
  const c = new Chess(); let k = -1;
  for (let i = 0; i < g.sans.length; i++) { if (!tryMove(c, g.sans[i])) return -1; if (k < 0 && pieces(c.fen()) <= 7) k = i + 1; }
  return k > 0 && g.sans.length - k >= 4 ? k : -1;
}
/** La position qui résume la finale : quelques coups après l'entrée dans la table, une fois les derniers échanges faits. */
export function endFen(g: Pick<Game, 'sans'>): string {
  const k = endgameStart(g), c = new Chess(); for (let i = 0; i < Math.min(g.sans.length, k + 6); i++) tryMove(c, g.sans[i]);
  return c.fen();
}
/** Le rapport d'une finale : résultat de chaque position de ton point de vue, et les coups qui l'ont changé. Gardé sur l'appareil une fois calculé. */
export async function endReport(g: Game, onStep?: (done: number, total: number) => void): Promise<EndReport | null> {
  const old = cachedReport(g.id); if (old) { keepMoments(g, old); return old; }
  const start = endgameStart(g); if (start < 0) return null;
  const c = new Chess(), fens: string[] = [];
  for (let i = 0; i < g.sans.length; i++) { tryMove(c, g.sans[i]); if (i + 1 >= start) fens.push(c.fen()); }
  const tbs: (Tb | null)[] = new Array(fens.length).fill(null); let next = 0, done = 0;
  await Promise.all([0, 1, 2].map(async () => { while (next < fens.length) { const i = next++; tbs[i] = await probe(fens[i]); onStep?.(++done, fens.length); } }));
  if (tbs.some(t => !t)) return null;
  const mineAt = (fen: string) => fen.split(' ')[1] === g.color;                       // le trait est à toi
  const outs = fens.map((f, i) => mineAt(f) ? tbs[i]!.out : flip(tbs[i]!.out));         // de ton point de vue
  const turns: Turn[] = [];
  for (let i = 1; i < fens.length; i++) {
    if (outs[i] === outs[i - 1]) continue;
    const ply = start + i, before = tbs[i - 1]!, mover = mineAt(fens[i - 1]);
    turns.push({ ply, san: g.sans[ply - 1], mine: mover, from: outs[i - 1], to: outs[i], fen: fens[i - 1], keep: before.moves.filter(m => m.out === before.out).map(m => m.san) });
  }
  const rep: EndReport = { start, fen: fens[0], outs, turns, last: outs[outs.length - 1] };
  try { localStorage.setItem(REP + g.id, JSON.stringify(rep)); } catch { /* stockage plein : tant pis */ }
  keepMoments(g, rep);
  return rep;
}
/** Le rapport déjà lu d'une partie, sans rien demander à la table. */
export function cachedReport(id: string): EndReport | null {
  try { const raw = localStorage.getItem(REP + id); return raw ? JSON.parse(raw) as EndReport : null; } catch { return null; }
}

/* ---------- le retour des exercices ---------- */
/**
 * Un exercice réussi revient plus tard : une leçon après 7, 30 puis 90 jours ; une de tes fautes de finale après 3, 10, 30 puis 90 jours.
 * Réussi avec des erreurs, il revient au même rythme sans monter d'un cran. Une faute jamais rejouée est à faire tout de suite.
 */
interface Rev { n: number; t: number }
const DAY = 86400, GAPS = { l: [7, 30, 90], m: [3, 10, 30, 90] };
const S = () => store.state.settings as Record<string, unknown>;
const now = () => Math.floor(Date.now() / 1000);
function revs(): Record<string, Rev> {
  const s = S();
  if (!s.eg) { const eg: Record<string, Rev> = {}; for (const l of LESSONS) if (s[`eg_${l.id}`]) eg[l.id] = { n: 1, t: now() }; s.eg = eg; if (Object.keys(eg).length) save(); }   // leçons réussies avant que les retours existent
  return s.eg as Record<string, Rev>;
}
const isMoment = (key: string) => key.includes(':');
export const isDone = (key: string) => !!revs()[key];
export function isDue(key: string): boolean {
  const r = revs()[key]; if (!r) return isMoment(key);
  const g = isMoment(key) ? GAPS.m : GAPS.l; return now() >= r.t + g[Math.min(Math.max(r.n, 1), g.length) - 1] * DAY;
}
function passed(key: string, clean: boolean) { const r = revs()[key] ?? { n: 0, t: 0 }; revs()[key] = { n: clean ? r.n + 1 : Math.max(1, r.n), t: now() }; save(); }

/** Tes fautes de finale : la position juste avant, gardée pour être rejouée. */
export interface Moment { g: string; ply: number; opp: string; t: number }
const moments = () => (S().egm ??= {}) as Record<string, Moment>;
function keepMoments(g: Game, rep: EndReport) {
  const M = moments(); let add = false;
  for (const t of rep.turns) { const k = `${g.id}:${t.ply}`; if (t.mine && t.from !== 'l' && !M[k]) { M[k] = { g: g.id, ply: t.ply, opp: g.opp, t: g.t }; add = true; } }
  if (!add) return;
  for (const k of Object.keys(M).sort((a, b) => M[b].t - M[a].t).slice(40)) { delete M[k]; delete revs()[k]; }   // on garde les 40 plus récentes
  save();
}
const momentHref = (m: Moment) => `#/finale/${encodeURIComponent(m.g)}/${m.ply}`;
/** Les fautes de finale à rejouer maintenant, les plus récentes d'abord (seulement celles dont la partie est encore sur l'appareil). */
export function dueMoments(): { key: string; m: Moment; href: string }[] {
  const have = new Set(store.games.map(g => g.id)), M = moments();
  return Object.keys(M).filter(k => have.has(M[k].g) && isDue(k)).sort((a, b) => M[b].t - M[a].t || M[a].ply - M[b].ply).map(key => ({ key, m: M[key], href: momentHref(M[key]) }));
}
/** Ce qui est à revoir en finales : d'abord tes fautes, puis les leçons dont le délai est passé. */
export function endDue(): { n: number; href: string; title: string; fen: string; side: Color } | null {
  const dm = dueMoments(), dl = LESSONS.filter(l => isDone(l.id) && isDue(l.id)), n = dm.length + dl.length;
  if (dm[0]) { const g = store.games.find(x => x.id === dm[0].m.g), t = cachedReport(dm[0].m.g)?.turns.find(x => x.ply === dm[0].m.ply);
    return { n, href: dm[0].href, title: 'Tes fautes de finale', fen: t?.fen ?? (g ? endFen(g) : new Chess().fen()), side: g?.color ?? 'w' }; }
  return dl[0] ? { n, href: `#/finales/${dl[0].id}/1`, title: dl[0].titre, fen: dl[0].fen, side: dl[0].side } : null;
}

/** Ton bilan sur les finales déjà lues : selon ce que disait la table à l'entrée en finale, ce que tu en as fait. */
export function endRecord(): { text: string; read: number; todo: Game[] } {
  const gs = endgameGames(), c = { w: [0, 0], d: [0, 0], l: [0, 0] }, todo: Game[] = []; let read = 0;
  for (const g of gs) { const r = cachedReport(g.id); if (!r) { todo.push(g); continue; } read++; const k = c[r.outs[0]]; k[1]++; if (r.outs[0] === 'w' ? g.res === 'W' : g.res !== 'L') k[0]++; }
  const part = (k: number[], a: string, b: string) => k[1] ? `${k[0]} ${a} sur ${k[1]} ${b}` : '';
  return { read, todo, text: [part(c.w, plural1(c.w[0], 'gagnée', 'gagnées'), plural1(c.w[1], 'gagnante', 'gagnantes')), part(c.d, plural1(c.d[0], 'tenue', 'tenues'), plural1(c.d[1], 'nulle', 'nulles')), part(c.l, plural1(c.l[0], 'sauvée', 'sauvées'), plural1(c.l[1], 'perdante', 'perdantes'))].filter(Boolean).join(' · ') };
}
const plural1 = (n: number, one: string, many: string) => n > 1 ? many : one;
const WORD: Record<Out, string> = { w: 'gagnante', d: 'nulle', l: 'perdante' };
/** Ce qu'un coup a changé, en une phrase. */
function turnText(t: Turn): string {
  const only = t.keep.length ? `${t.keep.length === 1 ? 'Seul' : 'Il fallait'} ${orList(t.keep.slice(0, 3).map(frSan))}${t.keep.length === 1 ? (t.from === 'w' ? ' gagnait' : ' tenait') : ''}.` : '';
  if (t.mine) return `${t.from === 'w' ? (t.to === 'd' ? 'Tu rends la nulle.' : 'Tu passes de gagnant à perdant.') : 'Tu perds une position nulle.'} ${only}`;
  return `${t.to === 'w' ? (t.from === 'd' ? 'Il perd une position nulle.' : 'Il te donne le gain.') : 'Il te rend la nulle.'} ${only}`;
}

/** Tes parties récentes qui finissent dans la table. */
export const endgameGames = (max = 12) => [...store.games].filter(g => !store.state.ignored[g.id]).sort((a, b) => b.t - a.t).slice(0, 80).filter(g => endgameStart(g) > 0).slice(0, max);

/* ---------- les classiques ---------- */
export interface Lesson { id: string; g: 'Tours' | 'Pions' | 'Dame' | 'Fou'; nom?: string; titre: string; sub: string; fen: string; side: Color; goal: 'w' | 'd'; n: number; intro: string; idea: string }
/** Chaque position a été passée à la table : le résultat annoncé et les coups qui le tiennent sont exacts. */
export const LESSONS: Lesson[] = [
  { id: 'derriere', g: 'Tours', titre: 'La tour derrière le pion passé', sub: 'Tiré de ta partie contre kis73', fen: '8/8/1R1Pk3/8/p7/1pK5/8/3r4 w - - 0 1', side: 'w', goal: 'd', n: 6,
    intro: 'Tu as deux pions de moins et ton pion d6 va tomber. Un seul coup sauve la nulle.', idea: 'La tour se met derrière le pion passé le plus dangereux : elle l\'attaque et le suit s\'il avance.' },
  { id: 'colle', g: 'Tours', titre: 'Le roi collé à son pion', sub: 'Tiré de ta partie contre LivelyBrake', fen: '8/8/8/4K3/5pk1/8/5r2/6R1 b - - 0 1', side: 'b', goal: 'w', n: 10,
    intro: 'Il te donne échec. Une seule case garde le gain.', idea: 'Ton roi reste à côté de son pion : il le protège et s\'abrite derrière lui.' },
  { id: 'ecart', g: 'Tours', titre: 'La tour loin, pour les échecs de côté', sub: 'Tiré de ta partie contre LivelyBrake', fen: '5R2/8/8/8/5K2/5p2/5rk1/8 b - - 0 1', side: 'b', goal: 'w', n: 10,
    intro: 'Ton roi veut avancer avec son pion, mais ta tour le gêne.', idea: 'Éloigne ta tour sur la rangée : elle libère la case de ton roi et pourra donner échec de loin.' },
  { id: 'lucena', nom: 'le pont de Lucena', g: 'Tours', titre: 'Le pont de Lucena', sub: 'Le gain à connaître', fen: '1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1', side: 'w', goal: 'w', n: 14,
    intro: 'Ton pion est à une case de la dame, mais ton roi est coincé devant lui.', idea: 'Chasse son roi par un échec, amène ta tour sur la 4e rangée, puis sors ton roi : la tour viendra couper les échecs. C\'est le pont.' },
  { id: 'philidor', nom: 'la position de Philidor', g: 'Tours', titre: 'La défense de Philidor', sub: 'La nulle à connaître', fen: '4k3/7R/8/3PK3/8/8/8/r7 b - - 0 1', side: 'b', goal: 'd', n: 8,
    intro: 'Il a un pion de plus et son roi avance. Tu peux tenir la nulle.', idea: 'Ta tour sur la 6e rangée empêche son roi d\'avancer. Dès que le pion y arrive, ta tour descend tout en bas et donne des échecs par derrière.' },
  { id: 'court', nom: 'le côté court', g: 'Tours', titre: 'Le roi du côté court', sub: 'Quand Philidor n\'est plus possible', fen: '4k3/7R/4K3/4P3/8/8/8/r7 b - - 0 1', side: 'b', goal: 'd', n: 8,
    intro: 'Il menace mat. Ton roi doit choisir un côté.', idea: 'Ton roi va du côté court du pion, ta tour garde le côté long : elle aura la place de donner des échecs de côté.' },
  { id: 'vancura', nom: 'la défense de Vancura', g: 'Tours', titre: 'La défense de Vancura', sub: 'Contre le pion de tour', fen: 'R7/6k1/P7/8/8/8/3K4/r7 b - - 0 1', side: 'b', goal: 'd', n: 8,
    intro: 'Sa tour est coincée devant son pion a. Son roi arrive pour l\'aider.', idea: 'Attaque le pion de côté avec ta tour. Si son roi approche, donne échec de côté, puis reviens sur le pion.' },
  { id: 'carre', nom: 'la règle du carré', g: 'Pions', titre: 'La règle du carré', sub: 'Le pion passe-t-il tout seul ?', fen: '8/8/8/8/1k6/8/7P/K7 w - - 0 1', side: 'w', goal: 'w', n: 8,
    intro: 'Ton pion file vers la dame. Son roi peut-il le rattraper ?', idea: 'Trace le carré du pion jusqu\'à sa case de promotion : si son roi ne peut pas y entrer, le pion passe. Ici, il faut avancer de deux cases tout de suite.' },
  { id: 'devant', g: 'Pions', titre: 'Le roi devant son pion', sub: 'Roi et pion contre roi : gagner', fen: '4k3/8/8/4K3/4P3/8/8/8 w - - 0 1', side: 'w', goal: 'w', n: 14,
    intro: 'Le pion ne passera pas tout seul.', idea: 'Ton roi avance d\'abord, devant son pion. Arrivé sur la 6e rangée devant lui, le gain est assuré.' },
  { id: 'oppo', nom: "l'opposition", g: 'Pions', titre: 'Tenir l\'opposition', sub: 'Roi et pion contre roi : annuler', fen: '8/8/4k3/8/4PK2/8/8/8 b - - 0 1', side: 'b', goal: 'd', n: 9,
    intro: 'Un pion de moins. Une seule case de roi tient la nulle.', idea: 'Mets ton roi en face du sien, une case entre les deux : c\'est l\'opposition. Il ne peut plus passer devant son pion.' },
  { id: 'distance', nom: "l'opposition à distance", g: 'Pions', titre: 'L\'opposition à distance', sub: 'Quand ton roi est loin', fen: '4k3/8/8/8/4PK2/8/8/8 b - - 0 1', side: 'b', goal: 'd', n: 10,
    intro: 'Ton roi est loin. Une seule case tient encore.', idea: 'Même colonne que son roi, un nombre impair de cases entre vous : quand il avancera, c\'est toi qui auras l\'opposition.' },
  { id: 'dame7', g: 'Dame', titre: 'Dame contre pion en 7e', sub: 'Gagner avant qu\'il fasse dame', fen: '7K/4Q3/8/8/8/8/3kp3/8 w - - 0 1', side: 'w', goal: 'w', n: 12,
    intro: 'Son pion va faire dame, et ton roi est loin.', idea: 'Donne des échecs jusqu\'à forcer son roi devant son pion. À chaque fois, ton roi gagne un coup pour s\'approcher.' },
  { id: 'pat', g: 'Dame', titre: 'Le pion fou en 7e', sub: 'Le pat qui sauve', fen: '8/8/8/8/8/1Q6/2p5/1k5K b - - 0 1', side: 'b', goal: 'd', n: 6,
    intro: 'Il te donne échec. Tu as un pion en 7e contre une dame.', idea: 'Va dans le coin et laisse ton pion : s\'il le prend, tu es pat. Ça marche avec les pions des colonnes c et f, et avec ceux du bord.' },
  { id: 'fou', nom: 'le fou de la mauvaise couleur', g: 'Fou', titre: 'Le fou de la mauvaise couleur', sub: 'Un fou et un pion de plus, et c\'est nul', fen: '8/8/8/8/5k2/4b2p/8/6K1 w - - 0 1', side: 'w', goal: 'd', n: 6,
    intro: 'Il a un fou et un pion de plus. Tu peux quand même annuler.', idea: 'Son fou ne contrôle pas la case de promotion. Reste dans le coin : il ne peut pas t\'en chasser sans te mettre pat.' },
];

/* ---------- les écrans ---------- */
const dayOf = (t: number) => new Date(t * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
const RES: Record<string, string> = { W: 'Gagnée', D: 'Nulle', L: 'Perdue' };
const GROUPS: [Lesson['g'], string][] = [['Tours', 'Finales de tours'], ['Pions', 'Finales de pions'], ['Dame', 'Dame contre pion'], ['Fou', 'Fou et pion']];
/** La page Finales : tes parties qui se sont jouées en finale, puis les classiques. */
export function viewEndgames(root: HTMLElement): () => void {
  const gs = endgameGames(), done = isDone;
  const nx = nextLesson(), nDone = LESSONS.filter(l => done(l.id)).length, dueL = LESSONS.filter(l => done(l.id) && isDue(l.id)), dm = dueMoments(), rec = endRecord();
  let dead = false;
  root.innerHTML = `<header class="pagehead"><h1>Finales</h1></header>
    <section class="surf card padded egnext"><div><b>${nDone ? `${nDone} sur ${LESSONS.length}` : `${LESSONS.length} leçons`}${dueL.length ? `<small>${dueL.length} à revoir</small>` : ''}</b><span class="prog"><b style="width:${Math.round(100 * nDone / LESSONS.length)}%"></b></span></div>${dueL.length ? `<a class="btn pri" href="#/finales/${dueL[0].id}/1">Revoir</a>` : nx ? `<a class="btn pri" href="#/finales/${nx.id}">${nDone ? 'Continuer' : 'Commencer'}</a>` : ''}</section>
    ${gs.length ? `<section class="grp"><h2>Tes finales</h2><p class="egrec" id="egrec"${rec.text ? '' : ' hidden'}>${esc(rec.text)}</p><div class="surf card list"><a class="rowi egrow" id="egm" href="${dm[0]?.href ?? '#'}"${dm.length ? '' : ' hidden'}><span class="ico">${icon('target')}</span><span class="body"><b>Tes fautes à rejouer</b><small>${plural(dm.length, 'position')}, jugées par la table</small></span>${icon('chev', 'chev')}</a>${gs.map(g => { const f = endFen(g);
      return `<a class="rowi egrow" href="#/finale/${encodeURIComponent(g.id)}">${miniFen(f, g.color).replace('class="mini"', 'class="mini cthumb"')}<span class="body"><b>${esc(material(f, g.color))}</b><small>${RES[g.res] ?? ''} contre ${esc(g.opp)} · ${dayOf(g.t)}</small></span>${icon('chev', 'chev')}</a>`; }).join('')}</div></section>` : ''}
    ${GROUPS.map(([g, title]) => `<section class="grp"><h2>${title}</h2><div class="surf card list">${LESSONS.filter(l => l.g === g).map(l => `<a class="rowi egrow" href="#/finales/${l.id}">${miniFen(l.fen, l.side).replace('class="mini"', 'class="mini cthumb"')}<span class="body"><b>${esc(l.titre)}</b><small>${esc(l.sub)}</small></span>${done(l.id) ? (isDue(l.id) ? '<span class="vdue">à revoir</span>' : `<span class="vok">${icon('check')}</span>`) : ''}${icon('chev', 'chev')}</a>`).join('')}</div></section>`).join('')}`;
  // les finales pas encore lues le sont en fond, une à la fois : le bilan se complète, et tes fautes entrent dans les révisions
  void (async () => { for (const g of rec.todo.slice(0, 6)) { if (dead || !(await endReport(g))) return; if (dead) return; const el = root.querySelector<HTMLElement>('#egrec'), t = endRecord().text; if (el && t) { el.textContent = t; el.hidden = false; }
    const row = root.querySelector<HTMLAnchorElement>('#egm'), d2 = dueMoments(); if (row && d2.length) { row.hidden = false; row.href = d2[0].href; row.querySelector('small')!.textContent = `${plural(d2.length, 'position')}, jugées par la table`; } } })();
  return () => { dead = true; };
}

/** Une de tes finales : la bande gagné / nul / perdu, et chaque moment où le résultat a changé. */
export function viewEndgame(root: HTMLElement, g: Game) {
  let dead = false;
  root.innerHTML = `<section class="surf card padded egload"><p id="egst">La table de finales lit ta partie…</p><span class="prog"><b id="egbar" style="width:0%"></b></span></section>`;
  endReport(g, (d, t) => { if (dead) return; const b = root.querySelector<HTMLElement>('#egbar'); if (b) b.style.width = `${Math.round(100 * d / t)}%`; }).then(rep => {
    if (dead) return;
    if (!rep) { root.innerHTML = `<section class="empty"><p>Cette finale n'a pas pu être lue. Vérifie ta connexion, ou la partie garde plus de 7 pièces jusqu'au bout.</p></section>`; return; }
    const mine = rep.turns.filter(t => t.mine), his = rep.turns.filter(t => !t.mine);
    const verdict = rep.outs[0] === 'd' && !rep.turns.length ? 'Nulle du début à la fin, jouée sans faute.' : `Au départ, la position est ${WORD[rep.outs[0]]} pour toi. Le résultat change ${plural(rep.turns.length, 'fois', 'fois')} : ${mine.length} de ton fait, ${his.length} du sien.`;
    root.innerHTML = `
      <section class="surf card padded eghead">${miniFen(endFen(g), g.color).replace('class="mini"', 'class="mini egboard"')}
        <div><h2>${esc(material(endFen(g), g.color))}</h2><p>${verdict}</p></div></section>
      <div class="egstrip" role="img" aria-label="Résultat théorique coup par coup, de ton point de vue">${rep.outs.map(o => `<i class="${o}"></i>`).join('')}</div>
      <p class="egkey"><span><i class="w"></i>gagnant</span><span><i class="d"></i>nul</span><span><i class="l"></i>perdant</span></p>
      ${rep.turns.length ? `<div class="surf card list">${rep.turns.map(t => `<div class="rowi egturn ${t.mine ? 'mine' : ''}"><span class="body"><b>${num(t.ply)}${esc(frSan(t.san))} ?</b><small>${esc(turnText(t))}</small></span>
        ${t.mine ? `<a class="btn" href="#/finale/${encodeURIComponent(g.id)}/${t.ply}">Rejouer</a>` : ''}</div>`).join('')}</div>` : ''}
      <a class="quiet" href="${esc(g.url)}" target="_blank" rel="noopener">Voir la partie sur Chess.com</a>`;
  });
  return () => { dead = true; };
}

interface Drill { fen: string; side: Color; goal: 'w' | 'd'; n: number; title: string; intro: string; idea: string; back: string; /** le cours de la leçon, pour le revoir */ cours?: string; step?: string; nextLabel?: string; /** `clean` : réussi sans erreur ni indice. */ done?: (clean: boolean) => void;
  /** L'exercice suivant, pour enchaîner sans repasser par la liste. */ next?: string;
  /** Le nom de la position quand elle en a un (« le pont de Lucena ») : dit à la fin, pour le retenir. */ nom?: string }
/** La position d'une de tes fautes de finale, prête à rejouer. */
export async function turnDrill(g: Game, ply: number): Promise<Drill | null> {
  const rep = await endReport(g), t = rep?.turns.find(x => x.ply === ply && x.mine); if (!rep || !t || t.from === 'l') return null;
  const later = rep.turns.find(x => x.mine && x.from !== 'l' && x.ply > ply), key = `${g.id}:${ply}`;
  return { fen: t.fen, side: g.color, goal: t.from, n: t.from === 'w' ? 10 : 6, title: `${num(ply)}${frSan(t.san)} ?`, back: `#/finale/${encodeURIComponent(g.id)}`,
    get next() { return later && isDue(`${g.id}:${later.ply}`) ? `#/finale/${encodeURIComponent(g.id)}/${later.ply}` : dueMoments().find(x => x.key !== key)?.href; },
    done: clean => passed(key, clean),
    intro: t.from === 'w' ? 'Ici tu avais le gain. Retrouve le coup, puis tiens-le.' : 'Ici la nulle tenait encore. Retrouve le coup, puis tiens-la.', idea: turnText(t) };
}
/** La leçon à faire après celle-ci : la prochaine pas encore réussie, sinon une à revoir, sinon simplement la suivante de la liste. */
export function nextLesson(after?: string): Lesson | undefined {
  const i = after ? LESSONS.findIndex(l => l.id === after) : -1, rest = [...LESSONS.slice(i + 1), ...LESSONS.slice(0, Math.max(0, i))];
  return rest.find(l => !isDone(l.id)) ?? rest.find(l => isDue(l.id)) ?? (after ? LESSONS[i + 1] : LESSONS[0]);
}
/* ---------- une leçon : le cours, puis 3 à 5 positions du même thème ---------- */
/** Les positions d'une leçon : celle du cours d'abord, puis les autres, de la plus simple à la plus dure (toutes passées à la table). */
export const exos = (l: Lesson) => [l.fen, ...(COURS[l.id]?.pos ?? [])];
const turnOf = (fen: string): Color => fen.split(' ')[1] === 'b' ? 'b' : 'w';
/** Sans faute sur toutes les positions de la leçon (pour savoir si elle remonte d'un cran). */
const RUN: Record<string, boolean> = {};
export const lessonHref = (l: Lesson) => isDone(l.id) ? `#/finales/${l.id}/1` : `#/finales/${l.id}`;
export function lessonDrill(l: Lesson, k = 1): Drill {
  const ex = exos(l), N = ex.length, i = Math.min(Math.max(k, 1), N), fen = ex[i - 1], nx = nextLesson(l.id);
  return { fen, side: turnOf(fen), goal: l.goal, n: l.n, title: l.titre, back: '#/finales', nom: l.nom, idea: l.idea, cours: `#/finales/${l.id}`,
    intro: i === 1 ? l.intro : `Même thème${l.nom ? ` : ${l.nom}` : ''}, ailleurs sur l'échiquier. Reconnais-le.`,
    step: `Position ${i} sur ${N}`, nextLabel: i < N ? 'Position suivante' : 'Leçon suivante',
    next: i < N ? `#/finales/${l.id}/${i + 1}` : nx && nx.id !== l.id ? `#/finales/${nx.id}` : undefined,
    done: clean => { RUN[l.id] = (i === 1 || RUN[l.id] !== false) && clean; if (i === N) passed(l.id, RUN[l.id]); } };
}

/** Le cours : quelques écrans, chacun une position avec le plan dessiné (flèches, cases clés) et une phrase. */
export function viewCourse(root: HTMLElement, l: Lesson): () => void {
  const S = COURS[l.id]?.cours ?? [], N = S.length;
  if (!N) { location.replace(`#/finales/${l.id}/1`); return () => {}; }
  root.innerHTML = `<div class="trainer cours egc"><div class="tboard"><div id="board"></div></div>
    <div class="tside"><div class="tmain"><div class="coach ctop" id="coach" aria-live="polite"></div><div class="actions" id="actions"></div></div></div></div>`;
  $('.trainer', root).insertBefore($('#coach', root), $('.tboard', root));
  const coach = $('#coach', root), actions = $('#actions', root);
  const board = new Board($('#board', root), { movable: () => null, onMove: () => {} });
  let k = 0;
  const show = () => {
    const s: Slide = S[k], g = new Chess(s.fen ?? l.fen); let last: Move | null = null;
    for (const m of s.pre ?? []) last = tryMove(g, m as never) ?? last;
    board.set(g, l.side, last, k > 0 && !!last);
    board.overlay({ arrows: [...(s.arrows ?? []).map(a => ({ from: a.slice(0, 2), to: a.slice(2, 4), cls: 'best' })), ...(s.plan ?? []).map(a => ({ from: a.slice(0, 2), to: a.slice(2, 4), cls: 'plan' })), ...(s.bad ?? []).map(a => ({ from: a.slice(0, 2), to: a.slice(2, 4), cls: 'bad' }))],
      marks: [...(s.zone ?? []).map(q => ({ sq: q, cls: 'zone' })), ...(s.keys ?? []).map(q => ({ sq: q, cls: 'key' }))] });
    coach.innerHTML = coachSay(k === N - 1 ? 'happy' : 'talk', `${k === 0 ? `<p class="lead">${esc(l.titre)}</p>` : ''}<p>${esc(s.t)}</p><p class="egdots" aria-label="Écran ${k + 1} sur ${N}">${S.map((_, j) => `<i class="${j === k ? 'on' : j < k ? 'ok' : ''}"></i>`).join('')}</p>`);
    const n = exos(l).length;
    actions.innerHTML = `${k ? '<button class="btn" id="cPrev">Précédent</button>' : `<a class="btn" href="#/finales/${l.id}/1">Passer le cours</a>`}${k < N - 1 ? '<button class="btn pri" id="cNext">Suivant</button>' : `<a class="btn pri" href="#/finales/${l.id}/1">À toi : ${plural(n, 'position')}</a>`}`;
    actions.querySelector<HTMLElement>('#cPrev')?.addEventListener('click', () => { k--; show(); });
    actions.querySelector<HTMLElement>('#cNext')?.addEventListener('click', () => { k++; show(); });
  };
  show();
  return () => board.destroy();
}

const sq = (s: string) => [s.charCodeAt(0) - 97, +s[1] - 1];
const kingOf = (c: Chess, col: Color) => { for (const row of c.board()) for (const p of row) if (p && p.type === 'k' && p.color === col) return p.square as string; return 'a1'; };
/** Il ne reste à l'adversaire que son roi, et toi une dame ou une tour : le gain est fait. */
const bare = (fen: string, me: Color) => { const s = fen.split(' ')[0].replace(/[^a-zA-Z]/g, '').split(''), mine = (c: string) => (c === c.toUpperCase()) === (me === 'w');
  return !s.some(c => !mine(c) && c.toLowerCase() !== 'k') && s.some(c => mine(c) && 'qr'.includes(c.toLowerCase())); };
/**
 * La réponse de l'adversaire. S'il est perdant, la défense la plus longue (le premier coup de la table).
 * Si c'est nul, la table ne classe pas ses coups : on prend celui qui essaie vraiment, sans finir la partie, sans donner de matériel,
 * le roi qui avance d'abord, puis la poussée de pion. Sinon la leçon s'arrêterait sur un cadeau au lieu de te faire trouver la défense.
 */
function pickReply(game: Chess, tb: Tb, me: Color): TbReply | undefined {
  const c = tb.moves.filter(m => m.out === tb.moves[0].out);
  if (tb.out !== 'd' || c.length < 2) return c[0];
  let best = c[0], top = -1e9;
  for (const m of c) {
    const x = new Chess(game.fen()), mv = tryMove(x, uciToObj(m.uci)); if (!mv) continue;
    let s: number;
    if (x.isGameOver()) s = -100;
    else if ((x.moves({ verbose: true }) as Move[]).some(u => { if (!u.captured) return false; const y = new Chess(x.fen()); tryMove(y, u); return !(y.moves({ verbose: true }) as Move[]).some(r => r.to === u.to && r.captured); })) s = -50;
    else { const [a, b] = sq(kingOf(x, me === 'w' ? 'b' : 'w')), [e, f] = sq(kingOf(x, me)); s = -Math.max(Math.abs(a - e), Math.abs(b - f)) + (mv.piece === 'p' ? 0.5 : 0); }
    if (s > top) { top = s; best = m; }
  }
  return best;
}

/**
 * L'exercice : tu joues, la table juge. Un coup qui laisse filer le but (le gain, ou la nulle) est repris, et compte comme une erreur.
 * Pour une nulle, c'est réussi quand elle est acquise ou tenue `n` coups. Pour un gain, quand tu mates, fais dame, ne lui laisses que son roi,
 * ou as avancé de `n` coups : un coup qui garde le gain sans le rapprocher est accepté mais ne compte pas, tourner en rond ne suffit pas.
 */
export function mountDrill(root: HTMLElement, d: Drill): () => void {
  root.innerHTML = `<div class="trainer cours"><div class="tboard"><div id="board"></div></div>
    <div class="tside"><div class="tmain"><div class="coach ctop" id="coach" aria-live="polite"></div><div class="actions" id="actions"></div></div></div></div>`;
  $('.trainer', root).insertBefore($('#coach', root), $('.tboard', root));
  const coach = $('#coach', root), actions = $('#actions', root), egx = document.createElement('div');
  egx.className = 'egx ctop'; egx.id = 'egx'; egx.hidden = true; $('.trainer', root).insertBefore(egx, $('.tboard', root));   // en haut, à la place du coach : visible avec l'échiquier
  const xShow = (on: boolean) => { egx.hidden = !on; coach.hidden = on; $('#bX', actions)?.classList.toggle('on', on); };
  let xOpen = false, helped = false, hintLv = 0, xHist: string[] = [], xMoves: Move[] = [], xI = 0;
  let game = new Chess(d.fen), busy = false, over = false, won = false, errs = 0, ok = 0, miss = 0, dead = false, last: Move | null = null, near = Infinity, idle = 0;
  const say = (mood: Mood, head: string, text = '') => { coach.innerHTML = coachSay(mood, `<p class="lead${mood === 'oops' ? ' bad' : ''}">${head}</p>${text ? `<p class="why">${text}</p>` : ''}`); };
  const board = new Board($('#board', root), { movable: () => (xOpen ? new Chess(xHist[xI]).turn() : busy || over ? null : d.side), onMove: m => { if (xOpen) xMove(m); else void play(m); } });
  const goalWord = d.goal === 'w' ? 'le gain' : 'la nulle';
  const paint = (anim = false) => { board.set(game, d.side, last, anim); hintLv = 0; };
  const go = (h: string) => { location.hash = h; };
  const btns = () => {
    actions.innerHTML = over
      ? `<button class="btn" id="bAgain">${icon('restart')}Rejouer</button>${won && d.next ? `<button class="btn pri" id="bNext">${d.nextLabel ?? 'Suivante'}</button>` : `<button class="btn pri" id="bStop">Continuer</button>`}<button class="btn" id="bX">${icon('search')}Explorer</button>${d.cours ? `<button class="btn" id="bCours">Revoir le cours</button>` : ''}${won && d.next ? '<button class="btn" id="bStop">Arrêter là</button>' : ''}`
      : `<button class="btn" id="bHint">${icon('bulb')}Indice</button><button class="btn" id="bX">${icon('search')}Explorer</button><button class="btn" id="bStop">Arrêter là</button>`;
    const on = (id: string, f: () => void) => actions.querySelector<HTMLElement>('#' + id)?.addEventListener('click', f);
    on('bAgain', restart); on('bHint', () => { void hint(); }); on('bX', openX);
    on('bNext', () => go(d.next!)); on('bStop', () => go(d.back)); on('bCours', () => go(d.cours!)); };
  /**
   * L'explorateur : tu joues librement les coups des deux camps depuis la position affichée, tu reviens en arrière,
   * et une ligne dit seulement ce que vaut la position (la table). Pendant l'exercice, l'ouvrir compte comme une aide.
   */
  function openX() {
    if (busy) return; xOpen = true; xHist = [game.fen()]; xMoves = []; xI = 0;
    if (!over && !helped) { helped = true; miss++; }
    xShow(true); xPaint();
  }
  function closeX() { xOpen = false; xShow(false); paint(); btns(); }
  function xMove(m: Move) {
    const g = new Chess(xHist[xI]), made = tryMove(g, { from: m.from, to: m.to, promotion: m.promotion }); if (!made) return;
    xHist = [...xHist.slice(0, xI + 1), g.fen()]; xMoves = [...xMoves.slice(0, xI), made]; xI++; xPaint(true);
  }
  function xPaint(anim = false) {
    const g = new Chess(xHist[xI]); board.set(g, d.side, xMoves[xI - 1] ?? null, anim);
    const side = (c: Color) => c === 'w' ? 'les Blancs' : 'les Noirs';
    actions.innerHTML = `<button class="btn" id="xBack" ${xI ? '' : 'disabled'} aria-label="Coup précédent">${icon('chev', 'flip')}Retour</button><button class="btn" id="xFwd" ${xI < xHist.length - 1 ? '' : 'disabled'} aria-label="Coup suivant">Avancer${icon('chev')}</button><button class="btn pri" id="xClose">Revenir à l'exercice</button>`;
    actions.querySelector<HTMLElement>('#xBack')!.onclick = () => { if (xI) { xI--; xPaint(); } };
    actions.querySelector<HTMLElement>('#xFwd')!.onclick = () => { if (xI < xHist.length - 1) { xI++; xPaint(true); } };
    actions.querySelector<HTMLElement>('#xClose')!.onclick = closeX;
    const head = `<p class="egxh"><b>Exploration libre</b> <span class="dim">· joue les coups des deux camps</span></p>`;
    if (g.isCheckmate()) { egx.innerHTML = `${head}<p class="egxv">Mat : ${side(g.turn() === 'w' ? 'b' : 'w')} gagnent.</p>`; return; }
    if (g.isDraw()) { egx.innerHTML = `${head}<p class="egxv">Nulle${g.isStalemate() ? ' : pat' : ''}.</p>`; return; }
    egx.innerHTML = `${head}<p class="egxv dim">La table regarde…</p>`;
    const fen = g.fen(); void probe(fen).then(tb => { if (dead || !xOpen || xHist[xI] !== fen) return; const v = egx.querySelector('.egxv'); if (!v) return;
      v.classList.remove('dim'); v.textContent = !tb ? 'La table de finales ne répond pas.' : tb.out === 'd' ? `Position nulle. Trait aux ${side(g.turn()).slice(4)}.` : `${tb.out === 'w' ? side(g.turn()) : side(g.turn() === 'w' ? 'b' : 'w')} gagnent. Trait aux ${side(g.turn()).slice(4)}.`.replace(/^l/, 'L'); });
  }
  function restart() { game = new Chess(d.fen); over = false; won = false; busy = false; errs = 0; ok = 0; miss = 0; last = null; near = Infinity; idle = 0; helped = false; xOpen = false; xShow(false); if (d.goal === 'w') void probe(d.fen).then(t => { if (t && near === Infinity && !ok) near = t.dtz; }); $('.trainer', root).classList.remove('fin'); paint(); btns(); say('idle', esc(d.intro), `À toi : ${d.goal === 'w' ? 'gagne' : 'tiens la nulle'}.${d.step ? ` <span class="dim">${d.step}</span>` : ''}`); }
  /** Indice : 1er appui, l'idée et la pièce à jouer (entourée) ; 2e appui, la flèche du coup. Chaque appui compte comme une aide. */
  async function hint() {
    if (busy || over) return; hintLv = Math.min(hintLv + 1, 2); miss++;
    say('talk', hintLv === 1 ? 'Indice : le plan' : 'Indice : le coup', `${esc(d.idea)}${hintLv === 1 ? ' Touche encore Indice pour voir le coup.' : ''}`);
    const fen = game.fen(), tb = await probe(fen); if (dead || game.fen() !== fen) return;
    const m = tb?.moves.find(x => x.out === tb.out) ?? tb?.moves[0];
    if (!m) { say('oops', 'Pas de réseau', 'La table de finales ne répond pas. Réessaie dans un instant.'); return; }
    board.overlay(hintLv === 1 ? { marks: [{ sq: m.uci.slice(0, 2), cls: 'key' }] } : { arrows: [{ from: m.uci.slice(0, 2), to: m.uci.slice(2, 4), cls: 'best' }], marks: [{ sq: m.uci.slice(0, 2), cls: 'key' }] });
  }
  function finish(win: boolean, head: string, text: string) { over = true; won = win; xOpen = false; xShow(false); if (win && d.nom) text = `${text} <b>Retiens : ${esc(d.nom)}.</b>`; $('.trainer', root).classList.add('fin'); if (win) { SFX.done(); if (!errs) confetti(24); d.done?.(!errs && !miss); markActive(); } say(win ? (errs ? 'happy' : 'party') : 'oops', head, text); btns(); }
  async function play(m: Move) {
    if (busy || over) return; busy = true;
    const before = game.fen(), promo = m.flags.includes('p'), made = tryMove(game, { from: m.from, to: m.to, promotion: m.promotion });
    if (!made) { busy = false; return; }
    last = made; paint(true);
    const tb = await probe(game.fen()); if (dead) return;
    if (!tb) { game = new Chess(before); last = null; paint(); busy = false; say('oops', 'Pas de réseau', 'La table de finales ne répond pas. Réessaie dans un instant.'); return; }
    const mine = flip(tb.out);                                         // le résultat pour toi, une fois ton coup joué
    if ((d.goal === 'w' && mine !== 'w') || (d.goal === 'd' && mine === 'l')) {
      errs++; board.flash(m.to, 'bad'); await wait(450); if (dead) return;
      game = new Chess(before); last = null; paint(); busy = false;
      say('oops', `${frSan(made.san)} laisse filer ${goalWord}.`, errs >= 2 ? esc(d.idea) : 'Essaie autre chose.');
      if (errs >= 3) { const t = await probe(before); const b = t?.moves.find(x => x.out === t.out); if (b && !dead) board.overlay({ arrows: [{ from: b.uci.slice(0, 2), to: b.uci.slice(2, 4), cls: 'best' }] }); }
      return;
    }
    // un gain doit avancer : la prochaine prise ou poussée de pion se rapproche (ou le coup en est une)
    const zero = !!made.captured || made.piece === 'p', adv = d.goal === 'd' || zero || tb.dtz < near;
    near = zero ? tb.dtz : Math.min(near, tb.dtz); if (adv) { ok++; idle = 0; } else idle++;
    if (game.isCheckmate()) return finish(true, 'Mat !', errs ? `Avec ${plural(errs, 'erreur')}. ${esc(d.idea)}` : esc(d.idea));
    if (tb.over || game.isDraw()) return finish(d.goal === 'd', d.goal === 'd' ? 'Nulle tenue.' : game.isThreefoldRepetition() ? 'Trois fois la même position : c\'est nul.' : 'C\'est nul.', esc(d.idea));
    if (d.goal === 'w' && promo) return finish(true, 'Dame ! Le gain est fait.', errs ? `Avec ${plural(errs, 'erreur')}. ${esc(d.idea)}` : esc(d.idea));
    if (d.goal === 'w' && bare(game.fen(), d.side)) return finish(true, 'Il ne lui reste que son roi.', errs ? `Avec ${plural(errs, 'erreur')}. ${esc(d.idea)}` : esc(d.idea));
    if (ok >= d.n) return finish(true, d.goal === 'w' ? 'Tu tiens le gain.' : 'Nulle tenue.', errs ? `Avec ${plural(errs, 'erreur')}. ${esc(d.idea)}` : esc(d.idea));
    // la meilleure défense : la table trie les coups du meilleur au moins bon pour le camp au trait
    const reply = pickReply(game, tb, d.side); await wait(380); if (dead) return;
    const rm = reply ? tryMove(game, uciToObj(reply.uci)) : null;
    if (rm) { last = rm; paint(true); if (rm.captured || rm.piece === 'p') near = reply!.dtz; }
    if (game.isCheckmate() || game.isDraw()) return finish(d.goal === 'd' && !game.isCheckmate(), game.isCheckmate() ? 'Mat contre toi.' : d.goal === 'd' ? 'Nulle tenue.' : game.isThreefoldRepetition() ? 'Trois fois la même position : c\'est nul.' : 'Nulle.', esc(d.idea));
    busy = false;
    if (idle >= 2) say('talk', 'Ça gagne encore, mais tu tournes en rond.', `${esc(d.idea)}${rm ? ` Il répond ${frSan(rm.san)}.` : ''}`);
    else say('happy', `${frSan(made.san)} tient ${goalWord}.`, rm ? `Il répond ${frSan(rm.san)}. À toi.` : 'À toi.');
  }
  restart();
  return () => { dead = true; board.destroy(); };
}
void uciOf;
