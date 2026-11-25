// Export de tes données pour les lire hors de l'app (par exemple Claude, dans une autre conversation).
// Lit l'API publique du Worker et écrit dans le dossier donné : parties.json, fautes.json, progression.json, LISEZMOI.md.
// Le cours de chaque partie est trouvé comme dans l'app (positions, transpositions comprises), et chaque sortie du cours porte son verdict.
// Usage (depuis app/) : API_URL=… USERS=matt_chess00 npx tsx scripts/export.ts out
import fs from 'node:fs';
import path from 'node:path';
import { buildBook, indexBranches, analyseGame } from '../src/core/book';
import { devOk, refBranch } from '../src/core/drill';
import { phaseAt } from '../src/core/phase';
import type { Game, Repertoire } from '../src/core/types';
import rep from '../src/data/repertoire.json';

const OUT = process.argv[2] || 'out', API = (process.env.API_URL || 'https://chess-drill.mattvar36.workers.dev').replace(/\/$/, '');
const USERS = (process.env.USERS || 'matt_chess00').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const R = rep as unknown as Repertoire, BOOK = buildBook(R), BR = indexBranches(R);
const RATED = new Set(['best', 'good', 'inacc', 'mistake', 'blunder']);

async function get(p: string): Promise<any> {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(API + p, { headers: process.env.API_TOKEN ? { Authorization: 'Bearer ' + process.env.API_TOKEN } : {} });
    if (r.ok) return r.json();
    await new Promise(res => setTimeout(res, 2000 * (i + 1)));
  }
  throw new Error('API injoignable : ' + p);
}

/** Le cours de la partie (comme dans l'app) et sa sortie : qui quitte le cours, avec quel coup, et ce que vaut ce coup. */
function courseOf(g: Game) {
  const a = analyseGame(BOOK, BR, g.sans, g.color), gg = { ...g, a } as Game, id = refBranch(gg, BR);
  if (!id) return null;
  const { sys, br } = BR[id], out: Record<string, unknown> = { cours: sys.id, titre: sys.titre, variante: br.id, suivi: a.depth };
  if ((a.status === 'dev' || a.status === 'gap') && a.ply != null) {
    const k = g.cls?.[a.ply], mine = a.status === 'dev';
    out.sortie = { qui: mine ? 'toi' : 'lui', coup: `${Math.floor(a.ply / 2) + 1}${a.ply % 2 ? '…' : '.'}${a.played}`, attendu: a.expected?.map(e => e.san) ?? [],
      verdict: !k || !RATED.has(k) ? null : mine ? (devOk(gg) ? 'aussi bon que le cours' : 'à corriger') : k === 'mistake' || k === 'blunder' ? 'erreur à punir' : 'variante jouable' };
  }
  return out;
}
const opening = (eco: string) => (eco || '').split('/').pop()!.replace(/-/g, ' ').replace(/\.\.\./g, '…').trim();

fs.mkdirSync(OUT, { recursive: true });
const all: { u: string; parties: any[]; faults: any[] }[] = [];
for (const u of USERS) {
  const games: Game[] = await get(`/api/games?user=${encodeURIComponent(u)}&since=0`);
  const faults = await get(`/api/faults?user=${encodeURIComponent(u)}&since=0`);
  const parties = games.sort((a, b) => b.t - a.t).map(g => ({
    id: g.id, url: g.url, date: new Date(g.t * 1000).toISOString().slice(0, 16), cadence: g.tc, couleur: g.color === 'w' ? 'blancs' : 'noirs',
    adversaire: g.opp, eloAdv: g.oppElo, elo: g.myElo, resultat: { W: 'gagnée', L: 'perdue', D: 'nulle' }[g.res] ?? g.res, ouverture: opening(g.eco),
    cours: courseOf(g), coups: g.sans.join(' '),
    analyse: g.st ? { precision: g.st.acc == null ? null : Math.round(g.st.acc), gaffes: g.st.blunder, erreurs: g.st.mistake, imprecisions: g.st.inacc, profondeur: g.st.depth } : null,
    chances: g.wp ?? null,   // chances des Blancs (0-100) après chaque demi-coup, si analysée
    classes: g.cls ?? null,  // classe de chaque coup : best, good, inacc, mistake, blunder
    phases: g.st?.ph ? { milieu: g.st.ph[0], finale: g.st.ph[1] } : null,   // demi-coups où commencent le milieu de partie et la finale
    phaseFin: g.st?.ph ? phaseAt(g.sans.length - 1, g.st.ph) : null,
    cadenceExacte: g.tcs, fin: g.rr, pendules: g.clocks?.length ? g.clocks : null,
  }));
  all.push({ u, parties, faults });
  const dir = USERS.length > 1 ? path.join(OUT, u) : OUT; fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'parties.json'), JSON.stringify(parties));
  fs.writeFileSync(path.join(dir, 'fautes.json'), JSON.stringify(faults));
}
const progress = await get('/api/progress?since=0');
fs.writeFileSync(path.join(OUT, 'progression.json'), JSON.stringify(progress));

// Un résumé lisible : les dernières parties et le bilan par cours.
const pct = (w: number, n: number) => n ? Math.round(100 * w / n) + ' %' : '-';
let md = `# Données chess-drill\n\nMis à jour le ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC.\n\n`;
md += 'Fichiers : `parties.json` (toutes tes parties, analyse et cours suivi), `fautes.json` (fautes relevées par le moteur), `progression.json` (progression dans l\'app).\n\n';
for (const { u, parties, faults } of all) {
  md += `## ${u}\n\n${parties.length} parties, dont ${parties.filter(p => p.analyse).length} analysées ; ${faults.length} fautes relevées.\n\n### Dernières parties\n\n| Date | Couleur | Adversaire | Résultat | Ouverture | Sortie du cours | Précision |\n|---|---|---|---|---|---|---|\n`;
  for (const p of parties.slice(0, 20)) md += `| ${p.date.replace('T', ' ')} | ${p.couleur} | ${p.adversaire} (${p.eloAdv}) | ${p.resultat} | ${p.ouverture.slice(0, 50)} | ${p.cours ? `${p.cours.titre}${p.cours.sortie ? ` : ${p.cours.sortie.qui} ${p.cours.sortie.coup} (${p.cours.sortie.verdict ?? 'non analysée'})` : ''}` : '-'} | ${p.analyse ? p.analyse.precision + ' %' : '-'} |\n`;
  const by: Record<string, { n: number; w: number; d: number; acc: number[] }> = {};
  for (const p of parties) { const k = p.cours ? `${p.cours.titre} (${p.couleur})` : `hors cours (${p.couleur})`; const x = by[k] ??= { n: 0, w: 0, d: 0, acc: [] }; x.n++; if (p.resultat === 'gagnée') x.w++; if (p.resultat === 'nulle') x.d++; if (p.analyse) x.acc.push(p.analyse.precision); }
  md += `\n### Par cours\n\n| Cours | Parties | Score | Précision moyenne |\n|---|---|---|---|\n`;
  for (const [k, x] of Object.entries(by).sort((a, b) => b[1].n - a[1].n)) md += `| ${k} | ${x.n} | ${pct(x.w + x.d / 2, x.n)} | ${x.acc.length ? Math.round(x.acc.reduce((a, b) => a + b, 0) / x.acc.length) + ' %' : '-'} |\n`;
}
fs.writeFileSync(path.join(OUT, 'LISEZMOI.md'), md);
console.log('export :', all.map(a => `${a.u} ${a.parties.length} parties, ${a.faults.length} fautes`).join(' ; '));
