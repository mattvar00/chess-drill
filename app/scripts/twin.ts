/**
 * Jumeau numérique, banc d'essai v0 : à quel point une approche prédit-elle les coups que tu joues vraiment ?
 *
 * Données : tes parties chess.com (rapide et blitz). On apprend sur les plus anciennes, on mesure sur les plus récentes
 * (jamais vues). Pour chacun de tes coups du jeu de test, chaque approche propose un coup ; le score est la part de coups
 * identiques à celui que tu as joué (« concordance »). On mesure aussi le top 3 quand l'approche classe les coups.
 *
 * Approches comparées :
 *   moteur-fort     Stockfish, meilleur coup (profondeur --depth)
 *   moteur-court    Stockfish à faible profondeur (profondeur 3) : un moteur qui « voit » peu, comme un humain pressé
 *   moteur-elo      Stockfish bridé à ton Elo (UCI_LimitStrength), qui joue volontairement des coups plus faibles
 *   ton-livre       la position exacte a déjà été vue dans tes parties d'apprentissage : ton coup le plus fréquent ;
 *                   sinon le meilleur coup du moteur
 *   modele-perso    un petit modèle appris sur tes coups : parmi les meilleurs coups du moteur, il choisit celui que tu
 *                   jouerais, selon ce que tu as fait dans des situations comparables (prises, échecs, reprises, pièce
 *                   jouée, temps restant, perte acceptée, ton livre…)
 *
 *   npx tsx scripts/twin.ts --user matt_chess00 --train-days 120 --test-days 14
 *   npx tsx scripts/twin.ts --input parties.json --user matt_chess00 --test-share 0.2     (hors ligne)
 *
 * Écrit `--out` (dossier) : results.json et report.md.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { cpus } from 'node:os';
import { parseArgs } from 'node:util';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { Chess, tryMove, uciOf, uciToObj, type Move } from '../src/core/chess';
import { toGame, monthsSince, type ChessComGame } from '../src/core/ingest';
import { winPct } from '../src/core/winpct';
import type { Color, Game } from '../src/core/types';

const { values: a } = parseArgs({ options: {
  user: { type: 'string', default: 'matt_chess00' }, input: { type: 'string' }, out: { type: 'string', default: 'twin-out' },
  'train-days': { type: 'string', default: '120' }, 'test-days': { type: 'string', default: '14' }, 'test-share': { type: 'string' },
  'max-train': { type: 'string', default: '900' }, 'max-test': { type: 'string', default: '200' },
  depth: { type: 'string', default: '11' }, multipv: { type: 'string', default: '6' }, engines: { type: 'string' }, elo: { type: 'string' },
} });
const USER = a.user!.toLowerCase(), DEPTH = +a.depth!, MPV = +a.multipv!;
const NOW = Math.floor(Date.now() / 1000), TEST_SINCE = NOW - +a['test-days']! * 86400, TRAIN_SINCE = NOW - +a['train-days']! * 86400;
const UA = 'chess-drill/2.0 (jumeau, banc d\'essai ; github.com/mattvar00/chess-drill)';

/* ---------- moteur UCI (un processus par moteur) ---------- */
interface Line { uci: string; cp: number | null; mate: number | null }
class Uci {
  private p = spawn(process.env.STOCKFISH || 'stockfish', [], { stdio: 'pipe' }); private on: ((s: string) => void) | null = null; private mpv = 1;
  constructor() { createInterface({ input: this.p.stdout }).on('line', l => this.on?.(l)); }
  private send(s: string) { this.p.stdin.write(s + '\n'); }
  private until(word: string): Promise<void> { return new Promise(res => { this.on = l => { if (l.startsWith(word)) { this.on = null; res(); } }; }); }
  async init(opts: Record<string, string | number> = {}) { const u = this.until('uciok'); this.send('uci'); await u; for (const [k, v] of Object.entries(opts)) this.send(`setoption name ${k} value ${v}`); const r = this.until('readyok'); this.send('isready'); await r; }
  /** Lignes du moteur, scores du point de vue du camp qui joue. */
  search(fen: string, go: string, multipv = 1): Promise<{ best: string | null; lines: Line[] }> {
    if (multipv !== this.mpv) { this.send(`setoption name MultiPV value ${multipv}`); this.mpv = multipv; }
    const L: Record<number, Line> = {};
    return new Promise(res => {
      this.on = s => {
        if (s.startsWith('info ') && s.includes(' pv ') && s.includes(' score ')) {
          if (s.includes('bound')) return; const m = / score (cp|mate) (-?\d+)/.exec(s); if (!m) return;
          const k = +((/ multipv (\d+)/.exec(s) || [0, 1])[1]); L[k] = { uci: s.split(' pv ')[1].split(' ')[0], cp: m[1] === 'cp' ? +m[2] : null, mate: m[1] === 'mate' ? +m[2] : null };
        } else if (s.startsWith('bestmove')) { this.on = null; const b = s.split(' ')[1]; res({ best: b === '(none)' ? null : b, lines: Object.keys(L).map(Number).sort((x, y) => x - y).map(k => L[k]) }); }
      };
      this.send(`position fen ${fen}`); this.send(`go ${go}`);
    });
  }
  quit() { try { this.send('quit'); } catch { /* fermé */ } this.p.kill(); }
}
/** Répartit des tâches sur plusieurs moteurs. */
async function pool<T, R>(items: T[], n: number, init: () => Promise<Uci>, job: (e: Uci, x: T) => Promise<R>, label: string): Promise<R[]> {
  const E = await Promise.all(Array.from({ length: n }, init)), out: R[] = new Array(items.length); let next = 0, done = 0; const t0 = Date.now();
  await Promise.all(E.map(async e => { for (;;) { const i = next++; if (i >= items.length) return; out[i] = await job(e, items[i]);
    if (++done % 2000 === 0 || done === items.length) console.log(`  ${label} : ${done}/${items.length} (${Math.round((Date.now() - t0) / 1000)} s)`); } }));
  E.forEach(e => e.quit()); return out;
}

/* ---------- données ---------- */
async function getJson<T>(url: string): Promise<T> {
  for (let i = 0; ; i++) {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } }); if (r.ok) return r.json() as Promise<T>;
    if ((r.status === 429 || r.status >= 500) && i < 4) { await new Promise(s => setTimeout(s, 1000 * (i + 1))); continue; } throw new Error(`${url} → HTTP ${r.status}`);
  }
}
async function games(): Promise<Game[]> {
  let raw: ChessComGame[];
  if (a.input) raw = JSON.parse(await readFile(a.input, 'utf8'));
  else { const { archives } = await getJson<{ archives: string[] }>(`https://api.chess.com/pub/player/${USER}/games/archives`); raw = [];
    for (const m of monthsSince(archives, TRAIN_SINCE)) raw.push(...(await getJson<{ games: ChessComGame[] }>(m)).games); }
  return raw.filter(g => (g.time_class === 'rapid' || g.time_class === 'blitz') && (a.input || g.end_time >= TRAIN_SINCE))
    .map(g => toGame(g, USER)).filter((g): g is Game => !!g && g.sans.length >= 10).sort((x, y) => x.t - y.t);
}

/** Une décision : une position où c'est à toi de jouer, et le coup que tu as joué. */
interface Pos { fen: string; key: string; side: Color; played: string; ply: number; prevTo: string | null; myPrevTo: string | null; clock: number | null; base: number; tc: string; game: string; nLegal: number }
const keyOf = (fen: string) => fen.split(' ').slice(0, 4).join(' ');
const secs = (c: string | undefined) => { if (!c) return null; const p = c.split(':').map(Number); return p.reduce((s, x) => s * 60 + x, 0); };
function positions(g: Game): Pos[] {
  const c = new Chess(), out: Pos[] = []; let prev: Move | null = null, myPrev: Move | null = null;
  const base = +(g.tcs || '').split('+')[0] || secs(g.clocks[g.color === 'w' ? 0 : 1]) || 0;
  for (let i = 0; i < g.sans.length; i++) {
    const fen = c.fen(), side = c.turn() as Color, legal = c.moves().length, m = tryMove(c, g.sans[i]); if (!m) break;
    if (side === g.color && legal > 1) out.push({ fen, key: keyOf(fen), side, played: uciOf(m), ply: i, prevTo: prev?.to ?? null, myPrevTo: myPrev?.to ?? null, clock: secs(g.clocks[i - 2] ?? g.clocks[i]), base, tc: String(g.tc), game: g.id, nLegal: legal });
    if (side === g.color) myPrev = m; prev = m;
  }
  return out;
}

/* ---------- le modèle perso : un choix entre les coups candidats (logit conditionnel) ---------- */
const VAL: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const FEATS = ['perte', 'perte²', 'rang0', 'rang', 'prise', 'valeur prise', 'échec', 'pion', 'cavalier', 'fou', 'tour', 'dame', 'roi', 'roque', 'reprise',
  'recul', 'distance', 'promotion', 'livre', 'même pièce', 'perte × peu de temps', 'perte × finale', 'développe', 'avance pion'] as const;
interface Cand { uci: string; x: number[] }
function features(p: Pos, lines: Line[], book: Map<string, Map<string, number>>): Cand[] {
  const wp = (l: Line) => winPct(l.cp, l.mate), top = wp(lines[0]), bk = book.get(p.key), bkN = bk ? [...bk.values()].reduce((s, x) => s + x, 0) : 0;
  const nPieces = p.fen.split(' ')[0].replace(/[^nbrqNBRQ]/g, '').length, end = nPieces <= 6 ? 1 : 0, low = p.clock != null && p.base ? (p.clock / p.base < 0.12 ? 1 : 0) : 0;
  const c = new Chess(p.fen);
  return lines.map((l, r) => {
    const m = c.move(uciToObj(l.uci)) as Move | null; if (!m) return null; c.undo();
    const loss = Math.max(0, top - wp(l)) / 100, fr = (m.from.charCodeAt(0) - 97), ff = +m.from[1], tf = (m.to.charCodeAt(0) - 97), tr = +m.to[1];
    const back = p.side === 'w' ? tr < ff : tr > ff, home = p.side === 'w' ? ff === 1 : ff === 8;
    const x = [loss, loss * loss, r === 0 ? 1 : 0, r / 5, m.captured ? 1 : 0, m.captured ? VAL[m.captured] / 9 : 0, m.san.includes('+') ? 1 : 0,
      ...['p', 'n', 'b', 'r', 'q', 'k'].map(t => (m.piece === t ? 1 : 0)), m.flags.includes('k') || m.flags.includes('q') ? 1 : 0,
      m.captured && m.to === p.prevTo ? 1 : 0, back ? 1 : 0, Math.max(Math.abs(tf - fr), Math.abs(tr - ff)) / 7, m.promotion ? 1 : 0,
      bk && bkN ? (bk.get(l.uci) ?? 0) / bkN : 0, m.from === p.myPrevTo ? 1 : 0, loss * low, loss * end,
      (m.piece === 'n' || m.piece === 'b') && home && p.ply < 24 ? 1 : 0, m.piece === 'p' && !m.captured ? 1 : 0];
    return { uci: l.uci, x };
  }).filter((z): z is Cand => !!z);
}
function train(data: { c: Cand[]; y: number }[], epochs = 25): number[] {
  const w = new Array(FEATS.length).fill(0), m = w.map(() => 0), v = w.map(() => 0), lr = 0.05, l2 = 1e-4; let t = 0;
  for (let e = 0; e < epochs; e++) {
    for (let i = data.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [data[i], data[j]] = [data[j], data[i]]; }
    for (let s = 0; s < data.length; s += 64) {
      const g = w.map(() => 0);
      for (const d of data.slice(s, s + 64)) {
        const z = d.c.map(c => c.x.reduce((acc, xi, k) => acc + xi * w[k], 0)), mx = Math.max(...z), ex = z.map(q => Math.exp(q - mx)), S = ex.reduce((p, q) => p + q, 0);
        d.c.forEach((c, k) => { const pr = ex[k] / S - (k === d.y ? 1 : 0); c.x.forEach((xi, f) => { g[f] += pr * xi; }); });
      }
      t++; for (let f = 0; f < w.length; f++) { const gr = g[f] / 64 + l2 * w[f]; m[f] = 0.9 * m[f] + 0.1 * gr; v[f] = 0.999 * v[f] + 0.001 * gr * gr;
        w[f] -= lr * (m[f] / (1 - 0.9 ** t)) / (Math.sqrt(v[f] / (1 - 0.999 ** t)) + 1e-8); }
    }
  }
  return w;
}
const rank = (c: Cand[], w: number[]) => c.map(x => ({ uci: x.uci, s: x.x.reduce((acc, xi, k) => acc + xi * w[k], 0) })).sort((p, q) => q.s - p.s).map(x => x.uci);

/* ---------- banc d'essai ---------- */
async function main() {
  const all = await games(); if (all.length < 20) throw new Error(`trop peu de parties (${all.length})`);
  const share = a['test-share'] ? +a['test-share'] : null;
  const cut = share ? all[Math.floor(all.length * (1 - share))].t : TEST_SINCE;
  const trainG = all.filter(g => g.t < cut).slice(-+a['max-train']!), testG = all.filter(g => g.t >= cut).slice(-+a['max-test']!);
  const myElo = Math.round(testG.reduce((s, g) => s + g.myElo, 0) / Math.max(1, testG.length)) || 1800, elo = +(a.elo || myElo);
  const trainP = trainG.flatMap(positions), testP = testG.flatMap(positions);
  console.log(`${trainG.length} parties d'apprentissage (${trainP.length} coups), ${testG.length} parties de test (${testP.length} coups), Elo ${elo}`);
  const n = +(a.engines || Math.max(1, cpus().length));

  const book = new Map<string, Map<string, number>>();
  for (const p of trainP) { const m = book.get(p.key) ?? book.set(p.key, new Map()).get(p.key)!; m.set(p.played, (m.get(p.played) ?? 0) + 1); }

  const deep = (ps: Pos[], label: string) => pool(ps, n, async () => { const e = new Uci(); await e.init({ Threads: 1, Hash: 32 }); return e; }, (e, p) => e.search(p.fen, `depth ${DEPTH}`, MPV), label);
  console.log('Moteur sur les positions d\'apprentissage…'); const trainL = await deep(trainP, 'apprentissage');
  console.log('Moteur sur les positions de test…'); const testL = await deep(testP, 'test');
  const shallow = await pool(testP, n, async () => { const e = new Uci(); await e.init({ Threads: 1, Hash: 16 }); return e; }, (e, p) => e.search(p.fen, 'depth 3'), 'moteur court');
  const limited = await pool(testP, n, async () => { const e = new Uci(); await e.init({ Threads: 1, Hash: 16, UCI_LimitStrength: 'true', UCI_Elo: Math.max(1320, elo) }); return e; }, (e, p) => e.search(p.fen, 'movetime 60'), 'moteur à ton Elo');

  // apprentissage du modèle : seulement les positions où ton coup est parmi les candidats du moteur
  const data: { c: Cand[]; y: number }[] = [];
  trainP.forEach((p, i) => { const c = features(p, trainL[i].lines, book), y = c.findIndex(x => x.uci === p.played); if (y >= 0 && c.length > 1) data.push({ c, y }); });
  const inCands = data.length / Math.max(1, trainP.length);
  console.log(`Apprentissage du modèle perso sur ${data.length} coups (ton coup est dans les ${MPV} meilleurs du moteur dans ${Math.round(inCands * 100)} % des cas)`);
  const W = train(data);

  type Pred = { top: string[] };
  const P: Record<string, Pred[]> = { 'moteur-fort': [], 'moteur-court': [], 'moteur-elo': [], 'ton-livre': [], 'modele-perso': [] };
  testP.forEach((p, i) => {
    const L = testL[i].lines.map(l => l.uci), bk = book.get(p.key), bkTop = bk ? [...bk.entries()].sort((x, y) => y[1] - x[1]).map(x => x[0]) : [];
    P['moteur-fort'].push({ top: L });
    P['moteur-court'].push({ top: [shallow[i].best ?? L[0]] });
    P['moteur-elo'].push({ top: [limited[i].best ?? L[0]] });
    P['ton-livre'].push({ top: bkTop.length ? [...bkTop, ...L.filter(u => !bkTop.includes(u))] : L });
    P['modele-perso'].push({ top: rank(features(p, testL[i].lines, book), W) });
  });

  const phase = (p: Pos) => p.ply < 20 ? 'ouverture' : p.fen.split(' ')[0].replace(/[^nbrqNBRQ]/g, '').length <= 6 ? 'finale' : 'milieu';
  const groups: Record<string, (p: Pos) => boolean> = { tout: () => true, ouverture: p => phase(p) === 'ouverture', milieu: p => phase(p) === 'milieu', finale: p => phase(p) === 'finale',
    'hors livre': p => !book.has(p.key), rapide: p => p.tc === 'rapid', blitz: p => p.tc === 'blitz' };
  const res: Record<string, Record<string, { n: number; top1: number; top3: number }>> = {};
  for (const [name, preds] of Object.entries(P)) {
    res[name] = {};
    for (const [gname, f] of Object.entries(groups)) {
      const idx = testP.map((p, i) => (f(p) ? i : -1)).filter(i => i >= 0); if (!idx.length) continue;
      const t1 = idx.filter(i => preds[i].top[0] === testP[i].played).length, t3 = idx.filter(i => preds[i].top.slice(0, 3).includes(testP[i].played)).length;
      res[name][gname] = { n: idx.length, top1: +(100 * t1 / idx.length).toFixed(1), top3: +(100 * t3 / idx.length).toFixed(1) };
    }
  }
  const covered = testP.filter(p => book.has(p.key)).length / Math.max(1, testP.length);
  const weights = Object.fromEntries(FEATS.map((f, k) => [f, +W[k].toFixed(2)]));
  const out = { date: new Date().toISOString(), user: USER, elo, depth: DEPTH, multipv: MPV, train: { games: trainG.length, moves: trainP.length, from: trainG[0]?.t, to: trainG.at(-1)?.t },
    test: { games: testG.length, moves: testP.length, from: testG[0]?.t, to: testG.at(-1)?.t }, bookCoverage: +(100 * covered).toFixed(1), inCandidates: +(100 * inCands).toFixed(1), results: res, weights };
  await mkdir(a.out!, { recursive: true });
  await writeFile(`${a.out}/results.json`, JSON.stringify(out, null, 2));
  await writeFile(`${a.out}/report.md`, report(out));
  console.log(report(out));
}

const LABEL: Record<string, string> = { 'moteur-fort': 'Moteur, meilleur coup', 'moteur-court': 'Moteur qui voit peu (profondeur 3)', 'moteur-elo': 'Moteur bridé à ton Elo', 'ton-livre': 'Ton livre, sinon le moteur', 'modele-perso': 'Modèle appris sur tes coups' };
const pc = (x: number) => `${String(x).replace('.', ',')} %`;
function report(o: { date: string; user: string; elo: number; train: { games: number; moves: number }; test: { games: number; moves: number }; bookCoverage: number; inCandidates: number; results: Record<string, Record<string, { n: number; top1: number; top3: number }>>; weights: Record<string, number> }): string {
  const cols = ['tout', 'ouverture', 'milieu', 'finale', 'hors livre', 'rapide', 'blitz'].filter(c => o.results['moteur-fort'][c]);
  const rows = Object.keys(o.results).map(k => `| ${LABEL[k]} | ${cols.map(c => (o.results[k][c] ? pc(o.results[k][c].top1) : '–')).join(' | ')} | ${o.results[k].tout.top3 > o.results[k].tout.top1 ? pc(o.results[k].tout.top3) : '–'} |`);
  const strong = Object.entries(o.weights).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1])).slice(0, 8).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${String(v).replace('.', ',')}`);
  return [`# Jumeau numérique : banc d'essai v0 (${o.user})`, '',
    `Le ${o.date.slice(0, 10)}. Apprentissage : ${o.train.games} parties (${o.train.moves} coups). Test : ${o.test.games} parties plus récentes (${o.test.moves} coups), jamais vues. Elo de référence ${o.elo}.`, '',
    'Concordance : part de tes coups du test que l\'approche prédit exactement.', '',
    `| Approche | ${cols.join(' | ')} | top 3 |`, `|---|${cols.map(() => '---:').join('|')}|---:|`, ...rows, '',
    `Positions du test déjà vues dans tes parties d'apprentissage : ${pc(o.bookCoverage)}. Ton coup figure dans les candidats du moteur : ${pc(o.inCandidates)} (plafond du modèle perso).`, '',
    `Ce qui pèse le plus dans le modèle perso : ${strong.join(', ')}.`, ''].join('\n');
}
main().catch(e => { console.error(e); process.exit(1); });
