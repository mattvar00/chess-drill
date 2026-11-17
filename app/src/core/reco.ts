/**
 * Recommandations d'ouvertures : à partir de ce que disent tes parties et ta progression, quoi travailler maintenant
 * et ce que tu joues bien. Les chiffres restent ici ; l'écran ne montre qu'une raison en une phrase. Logique pure.
 */
import type { Unit } from './path';

/** Ce qu'on sait d'une ouverture. `score` : part des points pris (0-100) ; `drop` : chances perdues entre les coups 10 et 20. */
export interface Facts {
  u: Unit; games: number; score: number | null; devs: number; due: number; fresh: number; punir: number; drop: number | null; plans: number;
}
export type RecoKind = 'oubli' | 'punir' | 'revoir' | 'fragile' | 'milieu' | 'nouveau' | 'avancer' | 'apprendre';
export interface Reco { f: Facts; kind: RecoKind; weight: number }

/** En dessous, les résultats d'une ouverture ne disent rien. */
export const MIN_OPENING_GAMES = 4;
const progress = (u: Unit) => (u.lessons.length ? u.done / u.lessons.length : 0);

/** La meilleure raison de travailler une ouverture, et son poids ; rien si elle n'a besoin de rien. */
export function recoOf(f: Facts, total: number, overall: number | null): Reco | null {
  const statut = f.u.sys.statut; if (statut === 'alternatif' || statut === 'plan') return null;
  const share = total ? f.games / total : 0, open = f.u.lessons.some(l => l.state === 'cur' || l.state === 'lock');
  const weak = f.games >= MIN_OPENING_GAMES && f.score != null && overall != null && f.score <= Math.min(45, overall - 8);
  const c: [RecoKind, number][] = [];
  if (f.devs) c.push(['oubli', 6 + 2 * Math.min(f.devs, 3) + 6 * share]);
  if (f.punir) c.push(['punir', 6 + Math.min(f.punir, 2) + 4 * share]);
  if (f.due) c.push(['revoir', 4 + 0.6 * Math.min(f.due, 6)]);
  if (weak) c.push([f.drop != null && f.drop <= -5 && f.plans ? 'milieu' : 'fragile', 5 + 10 * share]);
  if (f.fresh) c.push(['nouveau', 4 + 0.5 * Math.min(f.fresh, 3)]);
  if (open && statut === 'à apprendre') c.push(['apprendre', 2 + Math.min(f.games, 3)]);
  else if (open && f.games) c.push(['avancer', 2 + 10 * share * (1 - progress(f.u))]);
  if (!c.length) return null;
  c.sort((a, b) => b[1] - a[1]);
  // une ouverture qui cumule plusieurs raisons passe devant, mais on n'en affiche qu'une : la plus forte
  return { f, kind: c[0][0], weight: c[0][1] + 0.2 * c.slice(1).reduce((s, x) => s + x[1], 0) };
}

/** `todo` : quoi travailler, le plus utile d'abord. `strong` : ce que tu joues bien (assez de parties, plus de points qu'ailleurs, pas d'oubli récent). */
export function recommend(facts: Facts[], max = 4): { todo: Reco[]; strong: Facts[] } {
  const withScore = facts.filter(f => f.score != null && f.games), total = facts.reduce((s, f) => s + f.games, 0);
  const overall = withScore.length ? withScore.reduce((s, f) => s + f.score! * f.games, 0) / withScore.reduce((s, f) => s + f.games, 0) : null;
  let todo = facts.map(f => recoOf(f, total, overall)).filter((r): r is Reco => !!r).sort((a, b) => b.weight - a.weight);
  if (!todo.length) {   // rien ne presse : la suite du chemin de l'ouverture la plus jouée qui n'est pas finie
    const next = [...facts].filter(f => f.u.sys.statut !== 'alternatif' && f.u.lessons.some(l => l.state === 'cur')).sort((a, b) => b.games - a.games)[0];
    if (next) todo = [{ f: next, kind: 'avancer', weight: 1 }];
  }
  const strong = facts.filter(f => f.games >= MIN_OPENING_GAMES && f.score != null && overall != null && f.score >= Math.max(55, overall + 5) && !f.devs)
    .sort((a, b) => b.score! - a.score! || b.games - a.games).slice(0, 3);
  // de la variété : pas plus de deux recommandations pour la même raison
  const seen: Record<string, number> = {}, mixed = todo.filter(r => (seen[r.kind] = (seen[r.kind] || 0) + 1) <= 2);
  return { todo: mixed.slice(0, max), strong };
}
