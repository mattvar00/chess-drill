/**
 * Sorties d'ouverture : pour chaque partie, le premier coup qui quitte ton répertoire, rangé en trois cas.
 * 1. Toi : tu as quitté une ligne que tu connais → la rejouer (rubrique « À corriger »).
 * 2. L'adversaire, avec un coup normal → un trou à combler s'il revient.
 * 3. L'adversaire, avec une erreur (tes chances montent d'au moins `ERR` points) → la punition à apprendre ; « punie » si ta réponse garde l'avantage.
 * Les cartes regroupent les parties par position et par coup adverse, les plus fréquentes d'abord. Logique pure.
 */
import { Chess, tryMove } from './chess';
import type { Game } from './types';

/** Gain de chances (sur 100) qui fait d'un coup adverse une erreur : environ +0,8 en position égale. */
export const ERR = 8;
/** Une réponse garde l'avantage si elle ne rend pas plus de `KEEP` points de chances. */
export const KEEP = 4;
const WEEK = 7 * 864e5;
/** Classes de coup qui gardent l'avantage. */
const GOOD = new Set(['brilliant', 'great', 'best', 'excellent', 'good', 'forced']);

export interface ExitCard {
  key: string; kind: 'punir' | 'connaitre'; color: 'w' | 'b';
  fen: string; fenAfter: string; played: string; line: string[]; ply: number;
  games: Game[]; count: number; punished: number; missed: number; last: number;
  gain: number; replies: Record<string, number>; branches: string[];
}
const mine = (g: Game, wp: number) => (g.color === 'w' ? wp : 100 - wp);

/** Une sortie de l'adversaire : la carte qu'elle donne, ou rien si la partie n'en a pas. */
function exitOf(g: Game) {
  const a = g.a; if (a.status !== 'gap' || a.ply == null || !a.fen || !a.played) return null;
  const ply = a.ply, wp = g.wp, line = g.sans.slice(0, ply + 1);
  const t = new Chess(); for (const s of line) if (!tryMove(t, s)) return null;
  let err: boolean | null = null, ok: boolean | null = null, gain = 0;
  if (wp && wp.length > ply + 2) {
    gain = mine(g, wp[ply + 1]) - mine(g, wp[ply]); err = gain >= ERR;
    // la classe du coup (calculée contre le meilleur coup) est plus sûre que l'écart de chances, qui bouge d'une profondeur à l'autre
    const k = g.cls?.[ply + 1];
    ok = k ? GOOD.has(k) : mine(g, wp[ply + 1]) - mine(g, wp[ply + 2]) < KEEP;
  }
  return { ply, line, fen: a.fen, fenAfter: t.fen(), played: a.played, reply: g.sans[ply + 1], err, ok, gain, branches: a.branches ?? [] };
}

export function scanExits(games: Game[], ignored: Record<string, boolean> = {}) {
  const cards: Record<string, ExitCard> = {}; const mineDev: Game[] = [];
  for (const g of games) {
    if (ignored[g.id]) continue;
    if (g.a.status === 'dev' && !g.a.soft) { mineDev.push(g); continue; }
    const x = exitOf(g); if (!x) continue;
    const key = `${g.color}|${x.fen}|${x.played}`;
    const c = cards[key] ??= { key, kind: 'connaitre', color: g.color, fen: x.fen, fenAfter: x.fenAfter, played: x.played, line: x.line, ply: x.ply,
      games: [], count: 0, punished: 0, missed: 0, last: 0, gain: 0, replies: {}, branches: x.branches };
    c.games.push(g); c.count++; c.last = Math.max(c.last, g.t);
    if (x.reply) c.replies[x.reply] = (c.replies[x.reply] || 0) + 1;
    if (x.err) { c.kind = 'punir'; c.gain = Math.max(c.gain, Math.round(x.gain)); if (x.ok) c.punished++; else c.missed++; }
  }
  const all = Object.values(cards);
  const punir = all.filter(c => c.kind === 'punir').sort((a, b) => b.missed - a.missed || b.count - a.count || b.last - a.last);
  const connaitre = all.filter(c => c.kind === 'connaitre').sort((a, b) => b.count - a.count || b.last - a.last);
  return { punir, connaitre, mineDev: mineDev.sort((a, b) => b.t - a.t) };
}

/** Erreurs adverses dans l'ouverture, et combien tu en as punies, semaine par semaine (les `n` dernières, la plus ancienne d'abord). */
export function punishWeeks(games: Game[], n = 8, now = Date.now()) {
  const out = Array.from({ length: n }, (_, i) => ({ start: now - (n - i) * WEEK, errors: 0, punished: 0 }));
  for (const g of games) {
    const x = exitOf(g); if (!x?.err) continue;
    const k = n - 1 - Math.floor((now - g.t * 1000) / WEEK); if (k < 0 || k >= n) continue;
    out[k].errors++; if (x.ok) out[k].punished++;
  }
  return out;
}
