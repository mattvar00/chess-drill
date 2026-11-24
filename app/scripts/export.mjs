// Export de tes données pour les lire hors de l'app (par exemple Claude, dans une autre conversation).
// Lit l'API publique du Worker et écrit dans le dossier donné : parties.json, fautes.json, progression.json, LISEZMOI.md.
// Aucune dépendance : node 22 (fetch intégré). Usage : API_URL=… USERS=matt_chess00 node app/scripts/export.mjs out
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = process.argv[2] || 'out', API = (process.env.API_URL || 'https://chess-drill.mattvar36.workers.dev').replace(/\/$/, '');
const USERS = (process.env.USERS || 'matt_chess00').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REP = JSON.parse(fs.readFileSync(path.join(HERE, '../src/data/repertoire.json'), 'utf8'));

async function get(p) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(API + p, { headers: process.env.API_TOKEN ? { Authorization: 'Bearer ' + process.env.API_TOKEN } : {} });
    if (r.ok) return r.json();
    await new Promise(res => setTimeout(res, 2000 * (i + 1)));
  }
  throw new Error('API injoignable : ' + p);
}

/** Le cours qui colle le mieux à la partie : la variante qui partage le plus de coups, et qui en est sorti (toi ou lui). */
function courseOf(g) {
  let best = null;
  for (const b of REP.blocs) if (b.side === g.color) for (const s of b.systemes) for (const br of s.branches) {
    let n = 0; while (n < br.moves.length && n < g.sans.length && br.moves[n].san === g.sans[n]) n++;
    if (!best || n > best.n) best = { n, s, br };
  }
  if (!best || best.n < 2) return null;
  const { n, s, br } = best, mine = (n % 2 === 0) === (g.color === 'w');
  return { cours: s.id, titre: s.titre, variante: br.id, suivi: n, fin: n >= br.moves.length ? 'fin de la variante' : `${Math.floor(n / 2) + 1}${n % 2 ? '…' : '.'} ${mine ? 'toi' : 'lui'} : ${g.sans[n] ?? '(fin de partie)'} au lieu de ${br.moves[n].san}` };
}
const opening = eco => (eco || '').split('/').pop().replace(/-/g, ' ').replace(/\.\.\./g, '…').trim();

fs.mkdirSync(OUT, { recursive: true });
const all = [];
for (const u of USERS) {
  const games = await get(`/api/games?user=${encodeURIComponent(u)}&since=0`);
  const faults = await get(`/api/faults?user=${encodeURIComponent(u)}&since=0`);
  const parties = games.sort((a, b) => b.t - a.t).map(g => ({
    id: g.id, url: g.url, date: new Date(g.t * 1000).toISOString().slice(0, 16), cadence: g.tc, couleur: g.color === 'w' ? 'blancs' : 'noirs',
    adversaire: g.opp, eloAdv: g.oppElo, elo: g.myElo, resultat: { W: 'gagnée', L: 'perdue', D: 'nulle' }[g.res] ?? g.res, ouverture: opening(g.eco),
    cours: courseOf(g), coups: g.sans.join(' '),
    analyse: g.st ? { precision: Math.round(g.st.acc), gaffes: g.st.blunder, erreurs: g.st.mistake, imprecisions: g.st.inacc, profondeur: g.st.depth } : null,
    chances: g.wp ?? null,   // chances des Blancs (0-100) après chaque demi-coup, si analysée
  }));
  all.push({ u, parties, faults });
  const dir = USERS.length > 1 ? path.join(OUT, u) : OUT; fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'parties.json'), JSON.stringify(parties));
  fs.writeFileSync(path.join(dir, 'fautes.json'), JSON.stringify(faults));
}
const progress = await get('/api/progress?since=0');
fs.writeFileSync(path.join(OUT, 'progression.json'), JSON.stringify(progress));

// Un résumé lisible : les dernières parties et le bilan par cours.
const pct = (w, n) => n ? Math.round(100 * w / n) + ' %' : '-';
let md = `# Données chess-drill\n\nMis à jour le ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC.\n\n`;
md += 'Fichiers : `parties.json` (toutes tes parties, analyse et cours suivi), `fautes.json` (fautes relevées par le moteur), `progression.json` (progression dans l\'app).\n\n';
for (const { u, parties, faults } of all) {
  md += `## ${u}\n\n${parties.length} parties, dont ${parties.filter(p => p.analyse).length} analysées ; ${faults.length} fautes relevées.\n\n### Dernières parties\n\n| Date | Couleur | Adversaire | Résultat | Ouverture | Sortie du cours | Précision |\n|---|---|---|---|---|---|---|\n`;
  for (const p of parties.slice(0, 20)) md += `| ${p.date.replace('T', ' ')} | ${p.couleur} | ${p.adversaire} (${p.eloAdv}) | ${p.resultat} | ${p.ouverture.slice(0, 50)} | ${p.cours ? `${p.cours.titre} : ${p.cours.fin}` : '-'} | ${p.analyse ? p.analyse.precision + ' %' : '-'} |\n`;
  const by = {};
  for (const p of parties) { const k = p.cours ? `${p.cours.titre} (${p.couleur})` : `hors cours (${p.couleur})`; const x = by[k] ??= { n: 0, w: 0, d: 0, acc: [] }; x.n++; if (p.resultat === 'gagnée') x.w++; if (p.resultat === 'nulle') x.d++; if (p.analyse) x.acc.push(p.analyse.precision); }
  md += `\n### Par cours\n\n| Cours | Parties | Score | Précision moyenne |\n|---|---|---|---|\n`;
  for (const [k, x] of Object.entries(by).sort((a, b) => b[1].n - a[1].n)) md += `| ${k} | ${x.n} | ${pct(x.w + x.d / 2, x.n)} | ${x.acc.length ? Math.round(x.acc.reduce((a, b) => a + b, 0) / x.acc.length) + ' %' : '-'} |\n`;
}
fs.writeFileSync(path.join(OUT, 'LISEZMOI.md'), md);
console.log('export :', all.map(a => `${a.u} ${a.parties.length} parties, ${a.faults.length} fautes`).join(' ; '));
