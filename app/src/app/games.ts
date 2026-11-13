/** Onglet Parties (statistiques, liste) et revue d'une partie. */
import { Chess, tryMove, uciToObj } from '../core/chess';
import { buildFault, type Fault } from '../core/analysis';
import { CLASS, NOTABLE, commentMove, ecoName, evalText, reviewGame, type ReviewClass } from '../core/review';
import { AXES, byColor, phaseAccuracy, playerCard, profile, structureStats, type AxisKey, type Profile } from '../core/stats';
import { STRUCT, gameStructure } from '../core/structures';
import type { Game } from '../core/types';
import { Board } from '../ui/board';
import { advantageChart, bindChart, eloChart, setAdvantageCursor } from '../ui/charts';
import { $, esc, icon, plural } from '../ui/dom';
import { BR, store } from './store';
import { fullGame, getToken } from './api';
import { lineUrl } from './session';
import { refBranch } from '../core/drill';
import { explorerSlot } from './explorer';

const chev = icon('chev', 'chev');
const RES: Record<string, string> = { W: 'Victoire', D: 'Nulle', L: 'Défaite' };
const TC: Record<string, string> = { bullet: 'Bullet', blitz: 'Blitz', rapid: 'Rapide', daily: 'Par jour' };
const day = (t: number, long = false) => new Date(t * 1000).toLocaleDateString('fr-FR', long ? { day: 'numeric', month: 'long', year: 'numeric' } : { day: 'numeric', month: 'short' });
const num = (i: number) => `${Math.floor(i / 2) + 1}${i % 2 ? '…' : '.'}`;
export const gameUrl = (id: string, ply?: number, back?: string) => `#/partie/${encodeURIComponent(id)}${ply != null || back ? '?' + new URLSearchParams({ ...(ply != null ? { i: String(ply) } : {}), ...(back ? { r: back } : {}) }) : ''}`;

/* ---------- onglet Parties ---------- */
let period = 30, cadence = 'all', shown = 30;
const PERIODS = [[7, '7 jours'], [30, '30 jours'], [90, '90 jours']] as const;
const bar = (v: number | null, max = 100) => `<span class="prog"><b style="width:${v == null ? 0 : Math.max(0, Math.min(100, Math.round((100 * v) / max)))}%"></b></span>`;
const axis = (title: string, big: string, label: string, v: number | null, sub: string, max = 100) =>
  `<div class="axis"><div class="axh"><b>${title}</b><span class="big">${big}</span></div><small>${label}</small>${bar(v, max)}${sub ? `<p class="axs">${sub}</p>` : ''}</div>`;

/** Parties de la période et de la cadence choisies, les plus récentes d'abord. */
const inScope = () => { const cut = period ? Date.now() / 1000 - period * 86400 : 0; return store.games.filter(g => g.t >= cut && !store.state.ignored[g.id] && (cadence === 'all' || g.tc === cadence)).sort((a, b) => b.t - a.t); };
export function gameRow(g: Game, back?: string) {
  return `<a class="rowi" href="${gameUrl(g.id, undefined, back)}"><span class="chip ${g.color}" title="${g.color === 'w' ? 'Blancs' : 'Noirs'}"></span>
    <span class="body"><b>${esc(g.opp)} <span class="dim">${g.oppElo || ''}</span></b><small>${[ecoName(g.eco), day(g.t), TC[g.tc] ?? g.tc].filter(Boolean).map(esc).join(', ')}</small></span>
    ${g.st?.acc != null ? `<span class="acc" title="Ta précision">${g.st.acc}</span>` : ''}<span class="res res-${g.res}">${RES[g.res]}</span>${chev}</a>`;
}
/** Profil de la période et de la cadence choisies, avec les fautes les plus fréquentes. */
function scopeProfile(list: Game[]) {
  const byGame = new Map<string, Fault[]>(); for (const f of store.faults) (byGame.get(f.game) ?? byGame.set(f.game, []).get(f.game)!).push(f);
  return profile(list, ids => { const c: Record<string, number> = {}; for (const id of ids) for (const f of byGame.get(id) ?? []) c[f.theme] = (c[f.theme] || 0) + 1; return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 3); });
}
/** Le chiffre qui explique chaque note de la carte. */
function axisFacts(pr: Profile): Record<AxisKey, string> {
  const o = pr.opening, t = pr.tactics, c = pr.clock, ti = pr.tilt, fr = (n: number) => String(n).replace('.', ',');
  return {
    ouverture: o.coverage == null ? '' : `${o.coverage} % de tes parties restent dans ton répertoire`,
    tactique: t ? `${t.acc} % de précision, ${fr(t.blunders)} gaffe${t.blunders >= 2 ? 's' : ''} par partie` : '',
    conversion: pr.conversion?.rate != null ? `${pr.conversion.rate} % de positions gagnantes converties` : '',
    resilience: pr.resilience?.rate != null ? `${pr.resilience.rate} % de positions perdantes sauvées` : '',
    horloge: c.fastShare != null ? `${c.fastShare} % de tes coups joués en moins de 3 secondes` : '',
    rythme: ti ? `${fr(ti.perDay)} parties par jour joué, jusqu'à ${ti.maxDay} en une journée` : '',
  };
}
const axisName = (k: AxisKey) => AXES.find(a => a[0] === k)![1];
const article = (k: AxisKey) => (k === 'ouverture' || k === 'horloge' ? "l'" : k === 'rythme' ? 'le ' : 'la ') + axisName(k).toLowerCase();

export function viewGames(root: HTMLElement) {
  if (!store.games.length) {
    root.innerHTML = `<header class="pagehead"><h1>Progrès</h1></header><section class="empty"><p>${getToken() ? 'Tes parties apparaissent ici après la première analyse de nuit.' : 'Relie l\'app à tes parties pour voir tes statistiques et revoir chaque partie coup par coup.'}</p></section>
      ${getToken() ? '' : '<a class="btn pri block" href="#/reglages">Relier l\'app à tes parties</a>'}`; return;
  }
  const tcs = [...new Set(store.games.map(g => g.tc))].filter(t => TC[t]);
  // On ne propose une période que si elle laisse de côté des parties : sinon elle afficherait la même chose que « Tout ».
  const oldest = Math.min(...store.games.map(g => g.t)), ageDays = (Date.now() / 1000 - oldest) / 86400;
  const periods: (readonly [number, string])[] = [...PERIODS.filter(([d]) => ageDays > d), [0, 'Tout']];
  if (!periods.some(([d]) => d === period)) period = 0;
  if (cadence !== 'all' && !tcs.includes(cadence)) cadence = 'all';
  const list = inScope(), pr = scopeProfile(list), card = playerCard(pr), facts = axisFacts(pr), ph = phaseAccuracy(list);
  const S = structureStats(list), weak = Object.entries(S).filter(([, o]) => o.n >= 3 && o.errMe - o.errOp > 2).sort((a, b) => (b[1].errMe - b[1].errOp) * b[1].n - (a[1].errMe - a[1].errOp) * a[1].n)[0];
  const seg = (name: string, opts: readonly (readonly [string | number, string])[], cur: string | number) => `<div class="seg" role="group" aria-label="${name === 'period' ? 'Période' : 'Cadence'}">${opts.map(([v, l]) => `<button type="button" data-${name}="${v}" aria-pressed="${v === cur}">${l}</button>`).join('')}</div>`;
  const elo = Object.entries(pr.elo).filter(([, p]) => p.length >= 3).sort((a, b) => b[1].length - a[1].length);
  const colorBar = (c: 'w' | 'b') => { const r = byColor(list, c); return !r.n ? '' : `<div class="wdl"><div class="wdl-h"><b>Avec les ${c === 'w' ? 'Blancs' : 'Noirs'}</b><span>${r.w} gagnée${r.w > 1 ? 's' : ''}, ${r.d} nulle${r.d > 1 ? 's' : ''}, ${r.l} perdue${r.l > 1 ? 's' : ''}</span></div>
    <div class="wdl-bar" role="img" aria-label="${Math.round(100 * r.w / r.n)} % de victoires">${r.w ? `<i class="w" style="flex:${r.w}"></i>` : ''}${r.d ? `<i class="d" style="flex:${r.d}"></i>` : ''}${r.l ? `<i class="l" style="flex:${r.l}"></i>` : ''}</div></div>`; };
  const phase = (l: string, v: number | null) => v == null ? '' : `<span>${l}</span><span class="prog"><b style="width:${v}%"></b></span><b>${v}</b>`;
  root.innerHTML = `
    <header class="pagehead"><h1>Progrès</h1><div class="sumrow"><p>${plural(list.length, 'partie')}${period ? ` sur ${period} jours` : ` depuis le ${day(oldest, true)}`}, ${plural(pr.nAn, 'analysée', 'analysées')}</p></div></header>
    ${periods.length > 1 ? seg('period', periods, period) : ''}
    ${tcs.length > 1 ? seg('tc', [['all', 'Toutes'], ...tcs.map(x => [x, TC[x]] as const)], cadence) : ''}
    ${list.length ? `
    ${card.overall != null ? `<a class="pcard" href="#/profil" aria-label="Ta carte joueur : note globale ${card.overall} sur 100. Voir le détail">
      <div class="pcard-top"><div class="pcard-note"><b>${card.overall}</b><span>Note globale sur 100</span></div>
        <div class="pcard-elo">${elo.slice(0, 2).map(([tc, p], k) => `<span class="${k ? 'out' : ''}">${TC[tc] ?? tc} ${p[p.length - 1].e}</span>`).join('')}</div></div>
      <div class="pcard-id"><b>${esc(String(store.state.settings.user || ''))}</b><span>${esc(card.type)}${card.best && card.worst ? ` : fort sur ${article(card.best)}, à travailler sur ${article(card.worst)}` : ''}</span></div>
      <div class="pcard-grid">${AXES.map(([k, l]) => `<div><b>${card.scores[k] ?? '–'}</b><span>${l}</span></div>`).join('')}</div>
      <span class="pcard-more">Voir le radar et le détail${icon('chev')}</span></a>` : ''}
    ${elo.map(([tc, p]) => `<section class="surf card padded tile"><div class="elohead"><div><span class="label">Elo en ${(TC[tc] ?? tc).toLowerCase()}</span><b>${p[p.length - 1].e}</b></div><span class="res ${p[p.length - 1].e >= p[0].e ? 'res-W' : 'res-L'}">${p[p.length - 1].e >= p[0].e ? '+' : '−'}${Math.abs(p[p.length - 1].e - p[0].e)} sur la période</span></div>${eloChart(p)}</section>`).join('')}
    ${card.worst && facts[card.worst] ? `<a class="tile hot" href="#/profil"><span class="label">Ton point faible</span><b>${cap(article(card.worst))}</b><span>${facts[card.worst]}.</span></a>` : ''}
    <section class="surf card padded tile"><h2>Résultats par couleur</h2>${colorBar('w')}${colorBar('b')}</section>
    ${ph.o != null || ph.m != null ? `<section class="surf card padded tile"><h2>Précision par phase</h2><div class="phases">${phase('Ouverture', ph.o)}${phase('Milieu', ph.m)}${phase('Finale', ph.f)}</div></section>` : ''}
    ${pr.tactics?.themes.length ? `<section class="surf card padded tile"><h2>Tes fautes les plus fréquentes</h2><div class="keys">${pr.tactics.themes.map(([k, v]) => `<span class="cnt c-book">${esc(k)} <b>${v}</b></span>`).join('')}</div></section>` : ''}
    <div class="surf card list">
      <a class="rowi" href="#/structures"><span class="ico">${icon('pawn')}</span><span class="body"><b>${weak ? `À travailler : ${esc(STRUCT[weak[0]].name)}` : 'Tes structures de pions'}</b><small>${weak ? `${plural(weak[1].n, 'partie')}, ${Math.round(weak[1].errMe - weak[1].errOp)} points d'erreurs de plus que tes adversaires` : 'Leurs plans, ton score, et tes fautes à y rejouer'}</small></span>${chev}</a>
    </div>
    <section class="grp"><h2>Tes parties</h2><div class="surf card list" id="glist">${list.slice(0, shown).map(g => gameRow(g)).join('')}</div>
      ${list.length > shown ? `<button class="btn block" id="bMore">Afficher ${Math.min(30, list.length - shown)} parties de plus</button>` : ''}</section>`
    : `<p class="empty">Aucune partie sur cette période.</p>`}`;
  root.querySelectorAll<HTMLButtonElement>('[data-period]').forEach(b => b.onclick = () => { period = +b.dataset.period!; shown = 30; viewGames(root); });
  root.querySelectorAll<HTMLButtonElement>('[data-tc]').forEach(b => b.onclick = () => { cadence = b.dataset.tc!; shown = 30; viewGames(root); });
  root.querySelectorAll<HTMLElement>('.chart.elo').forEach(el => bindChart(el));
  const more = root.querySelector<HTMLButtonElement>('#bMore'); if (more) more.onclick = () => { shown += 30; const y = scrollY; viewGames(root); scrollTo(0, y); };
}
const cap = (s: string) => s.replace(/^l'|^la |^le /, m => m).replace(/^./, c => c.toUpperCase());

/** Détail de la carte joueur : le radar des six notes, puis chaque axe avec ce qui l'explique. */
export function viewProfile(root: HTMLElement) {
  const list = inScope(), pr = scopeProfile(list), card = playerCard(pr), facts = axisFacts(pr), t = pr.tactics, o = pr.opening, c = pr.clock, ti = pr.tilt;
  if (card.overall == null) { root.innerHTML = '<section class="empty"><p>Pas encore assez de parties sur cette période pour établir ton profil.</p></section>'; return; }
  const cx = 170, cy = 150, R = 104, pt = (i: number, r: number) => { const a = -Math.PI / 2 + (i * Math.PI) / 3; return [cx + r * Math.cos(a), cy + r * Math.sin(a)].map(v => v.toFixed(1)).join(','); };
  const ring = (f: number) => `<polygon class="rd-grid" points="${AXES.map((_, i) => pt(i, R * f)).join(' ')}"/>`;
  const lab = [[170, 18], [286, 80], [286, 212], [170, 274], [52, 212], [52, 80]];
  root.innerHTML = `
    <section class="surf card padded"><div class="elohead"><span class="label">${esc(card.type)}</span><span class="dim">Note globale <b class="rd-all">${card.overall}</b></span></div>
      <svg class="radar" viewBox="0 0 340 300" role="img" aria-label="Profil sur six axes : ${AXES.map(([k, l]) => `${l.toLowerCase()} ${card.scores[k] ?? 'inconnu'}`).join(', ')}">
        ${[1, 0.75, 0.5, 0.25].map(ring).join('')}${AXES.map((_, i) => `<line class="rd-grid" x1="${cx}" y1="${cy}" x2="${pt(i, R).split(',')[0]}" y2="${pt(i, R).split(',')[1]}"/>`).join('')}
        <polygon class="rd-area" points="${AXES.map(([k], i) => pt(i, R * (card.scores[k] ?? 0) / 100)).join(' ')}"/>
        ${AXES.map(([k], i) => { const [x, y] = pt(i, R * (card.scores[k] ?? 0) / 100).split(','); return `<circle class="rd-dot" cx="${x}" cy="${y}" r="4"/>`; }).join('')}
        ${AXES.map(([k, l], i) => `<text class="rd-l" x="${lab[i][0]}" y="${lab[i][1]}">${l}</text><text class="rd-v" x="${lab[i][0]}" y="${lab[i][1] + 17}">${card.scores[k] ?? '–'}</text>`).join('')}
      </svg></section>
    <section class="grp"><h2>Axe par axe</h2><div class="surf card list axes">
      ${axis('Ouverture', String(card.scores.ouverture ?? '–'), facts.ouverture, card.scores.ouverture, `${plural(o.devs, 'sortie')}, ${plural(o.gaps, 'trou')}${o.wp10 != null ? `. Au coup 10, tu as en moyenne ${o.wp10} % de chances.` : '.'}`)}
      ${t ? axis('Tactique', String(card.scores.tactique), facts.tactique, card.scores.tactique, `${String(t.mistakes).replace('.', ',')} erreur${t.mistakes >= 2 ? 's' : ''} par partie.${t.themes.length ? ` Fautes les plus fréquentes : ${t.themes.map(([k, v]) => `${k.toLowerCase()} (${v})`).join(', ')}.` : ''}`) : ''}
      ${pr.conversion?.rate != null ? axis('Conversion', String(card.scores.conversion), facts.conversion, card.scores.conversion, `Sur ${plural(pr.conversion.n, 'partie')} où tu as eu au moins 80 % de chances à un moment.`) : ''}
      ${pr.resilience?.rate != null ? axis('Résilience', String(card.scores.resilience), facts.resilience, card.scores.resilience, `Sur ${plural(pr.resilience.n, 'partie')} où tu es tombé à 20 % de chances ou moins. Entre 20 et 30 % sauvées, c'est habituel à ce niveau.`) : ''}
      ${card.scores.horloge != null ? axis('Horloge', String(card.scores.horloge), facts.horloge, card.scores.horloge, `${String(c.avgMove).replace('.', ',')} s par coup en moyenne.${c.fastBlunders != null ? ` ${c.fastBlunders} % de tes gaffes jouées en moins de 3 s, ${c.slowBlunders} % après 15 s ou plus.` : ''}${c.timeouts ? ` ${plural(c.timeouts, 'défaite')} au temps.` : ''}`) : ''}
      ${ti && card.scores.rythme != null ? axis('Rythme', String(card.scores.rythme), facts.rythme, card.scores.rythme, ti.afterTwoL ? `Après deux défaites d'affilée, tu gagnes ${ti.wrAfterTwoL} % des parties (${ti.afterTwoL}), contre ${pr.winRate} % en général.${ti.longSessions && ti.wrLongTail != null ? ` Au-delà de la 10ᵉ partie d'une session : ${ti.wrLongTail} %.` : ''}` : 'Pas encore de série de deux défaites.') : ''}
    </div></section>
    <p class="foot">Chaque note est sur 100, sur une échelle fixe (pas un classement par rapport aux autres joueurs). La note globale est leur moyenne. ${plural(list.length, 'partie')}${period ? ` sur ${period} jours` : ''}.</p>`;
}

/* ---------- revue d'une partie ---------- */
const label = (k: ReviewClass) => `<span class="cls c-${k}"><i>${CLASS[k][1]}</i>${CLASS[k][0]}</span>`;

/** Titre et sous-titre de la revue. */
export function reviewTitle(id: string): [string, string] {
  const g = store.games.find(x => x.id === id); if (!g) return ['Partie', ''];
  return [`${RES[g.res]} contre ${g.opp}`, [day(g.t, true), TC[g.tc] ?? g.tc, ecoName(g.eco)].filter(Boolean).join(', ')];
}

export function mountReview(root: HTMLElement, id: string, start: number | null, back: string): () => void {
  let disposed = false, board: Board | null = null, XS: ReturnType<typeof explorerSlot> | null = null;
  const onKey = (e: KeyboardEvent) => { if (XS?.active() || e.target instanceof HTMLInputElement) return; if (e.key === 'ArrowRight') go(+1); if (e.key === 'ArrowLeft') go(-1); };
  let go = (_d: number) => { /* remplacé une fois la partie chargée */ };
  root.innerHTML = `<p class="status">Chargement de la partie…</p>`;
  fullGame(id).then(g => {
    if (disposed) return;
    if (!g) { root.innerHTML = `<section class="empty"><p>Cette partie n'est plus sur cet appareil.</p><a class="btn" href="${back}">Retour</a></section>`; return; }
    if (!g.ev?.length) { root.innerHTML = `<section class="empty"><p>${g.st ? "L'analyse de cette partie n'a pas pu être chargée. Vérifie ta connexion." : "Cette partie n'est pas encore analysée : elle le sera cette nuit."}</p><a class="btn" href="${back}">Retour</a></section>`; return; }
    const ev = g.ev, A = reviewGame({ ...g, ev }), me = g.color, n = A.R.length;
    let i = start ?? (A.key.length ? A.key[0].i + 1 : 0); i = Math.max(0, Math.min(n, i));
    const ref = g.a?.status === 'dev' && !store.state.fixed[g.id] ? refBranch(g, BR) : null, st = gameStructure(g.sans);
    const mineWp = A.wpW.map(w => (me === 'w' ? w : 100 - w));
    const marks = A.R.filter(r => ['mistake', 'blunder', 'miss', 'brilliant'].includes(r.k)).map(r => ({ i: r.i + 1, cls: r.k, label: `${num(r.i)}${r.m.san} : ${CLASS[r.k][0].toLowerCase()}${r.me === me ? '' : " de l'adversaire"}` }));
    const counts = (['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inacc', 'mistake', 'miss', 'blunder'] as ReviewClass[]).filter(k => A.counts[k]);
    root.innerHTML = `<div class="trainer review">
      <div class="tboard"><div id="board"></div></div>
      <div class="tside"><div id="xp" hidden></div><div id="rv">
        <div class="explnav" id="nav">${[['first', 'Début', 'first'], ['prev', 'Coup précédent', 'back'], ['next', 'Coup suivant', 'chev'], ['last', 'Fin', 'last']].map(([to, l, ic]) => `<button class="btn" data-to="${to}" aria-label="${l}">${icon(ic)}</button>`).join('')}</div>
        <div class="coach" id="coach" aria-live="polite"></div>
        <div class="row" id="act"></div>
        <div class="surf card padded advcard">${advantageChart(mineWp, marks, j => j ? `${num(j - 1)}${A.M[j - 1].san} : ${Math.round(mineWp[j])} % pour toi` : `Départ : ${Math.round(mineWp[0])} %`)}
          ${A.key.length ? `<p class="flabel">Moments clés</p><div class="keys">${A.key.map(r => `<button class="key c-${r.k}" data-k="${r.i + 1}"><i>${CLASS[r.k][1]}</i>${num(r.i)}${esc(r.m.san)}<span class="sr">, ${CLASS[r.k][0].toLowerCase()}${r.me === me ? '' : " de l'adversaire"}</span></button>`).join('')}</div>` : ''}</div>
        <div class="moves rvmoves" id="moves">${A.R.map(r => `${r.i % 2 === 0 ? `<span class="n">${r.i / 2 + 1}.</span>` : ''}<span class="m${NOTABLE.includes(r.k) ? ' c-' + r.k : ''}" data-i="${r.i + 1}">${esc(r.m.san)}${NOTABLE.includes(r.k) ? `<sup>${CLASS[r.k][1]}</sup>` : ''}</span> `).join('')}</div>
        <section class="grp"><h2>Bilan</h2><div class="surf card">
          <div class="stats"><div><b>${A.acc[me] ?? '–'}</b><span>ta précision</span></div><div><b>${A.acc[me === 'w' ? 'b' : 'w'] ?? '–'}</b><span>${esc(g.opp)} (${g.oppElo})</span></div>
            <div><b>${(['o', 'm', 'e'] as const).map(p => A.phAcc[p] ?? '–').join(' / ')}</b><span>ouverture, milieu, finale</span></div></div>
          <div class="counts">${counts.map(k => `<span class="cnt c-${k}"><i>${CLASS[k][1]}</i>${A.counts[k]} ${CLASS[k][0].toLowerCase()}</span>`).join('')}</div>
        </div></section>
        <div class="surf card list">
          ${ref ? `<a class="rowi" href="${lineUrl(ref, 'drill', g.id)}"><span class="ico">${icon('book')}</span><span class="body"><b>Corriger la sortie de répertoire</b><small>Tu as joué ${esc(g.a.played ?? '')} dans ${esc(BR[ref].br.titre)}</small></span>${chev}</a>` : ''}
          ${st && STRUCT[st.id] ? `<a class="rowi" href="#/structure/${st.id}"><span class="ico">${icon('pawn')}</span><span class="body"><b>${esc(STRUCT[st.id].name)}</b><small>Structure de la partie au 12ᵉ coup : ses plans</small></span>${chev}</a>` : ''}
          ${g.url?.startsWith('http') ? `<a class="rowi" href="${esc(g.url)}" target="_blank" rel="noopener"><span class="ico">${icon('link')}</span><span class="body"><b>Voir sur chess.com</b></span>${chev}</a>` : ''}
        </div>
      </div></div></div>`;
    const coach = $('#coach', root), act = $('#act', root), movesEl = $('#moves', root), chart = root.querySelector<HTMLElement>('.chart.adv')!;
    board = new Board($('#board', root), { movable: () => XS?.active()?.movable() ?? null, onMove: m => XS?.active()?.onMove(m) });
    /** Explorateur depuis la position affichée : la suite du moteur, celle de la partie, ou tes propres coups. */
    const exploreOpts = () => {
      const pv = ev[i]?.p?.length ? ev[i].p : [ev[i]?.b].filter((u): u is string => !!u), t = new Chess(A.F[i]), sans: string[] = [];
      for (const u of pv) { const m = tryMove(t, uciToObj(u)); if (!m) break; sans.push(m.san); }
      return { fen: A.F[i], orient: me, lines: [{ label: 'Suite du moteur', sans }, { label: 'Suite de la partie', sans: A.M.slice(i, i + 10).map(m => m.san) }] };
    };
    const draw = (animate = false) => {
      const r = i > 0 ? A.R[i - 1] : null, game = new Chess(A.F[i]);
      board!.set(game, me, r?.m ?? null, animate);
      const best = r && r.loss >= 5 ? ev[r.i].b : null;
      board!.overlay({
        arrows: best && best !== r!.m.from + r!.m.to + (r!.m.promotion || '') ? [{ from: best.slice(0, 2), to: best.slice(2, 4), cls: 'best' }] : [],
        badge: r && !['good', 'excellent', 'book'].includes(r.k) ? { sq: r.m.to, text: CLASS[r.k][1], cls: r.k, label: CLASS[r.k][0] } : null,
      });
      setAdvantageCursor(chart, i);
      movesEl.querySelectorAll('.m').forEach(el => el.classList.toggle('cur', +(el as HTMLElement).dataset.i! === i));
      movesEl.querySelector('.m.cur')?.scrollIntoView({ block: 'nearest' });
      if (!r) { coach.innerHTML = `<p class="lead">Position de départ</p><p class="why">Avance coup par coup ou touche un moment clé. La flèche verte montre le coup qu'il fallait jouer.</p>`; act.innerHTML = ''; return; }
      const mine = r.me === me;
      coach.innerHTML = `<p class="rvlab">${label(r.k)}<b>${num(r.i)}${esc(r.m.san)}</b>${mine ? '' : '<span class="who">adversaire</span>'}<span class="ev">${evalText(ev[r.i + 1], me)}</span></p><p>${esc(commentMove({ color: me, ev }, A, r))}</p>`;
      act.innerHTML = mine && r.loss >= 10 && ev[r.i].b ? `<a class="btn pri" href="#/partie/${encodeURIComponent(g.id)}/refaire/${r.i}">Retrouver le bon coup</a>` : '';
    };
    go = d => { const j = Math.max(0, Math.min(n, i + d)); if (j !== i) { i = j; draw(d === 1); } };
    const to = (j: number) => { i = Math.max(0, Math.min(n, j)); draw(); };
    $('#nav', root).addEventListener('click', e => { const t = (e.target as HTMLElement).closest('button')?.dataset.to; if (t) t === 'first' ? to(0) : t === 'last' ? to(n) : go(t === 'next' ? 1 : -1); });
    movesEl.addEventListener('click', e => { const j = (e.target as HTMLElement).closest<HTMLElement>('.m')?.dataset.i; if (j) to(+j); });
    root.querySelectorAll<HTMLButtonElement>('[data-k]').forEach(b => b.onclick = () => to(+b.dataset.k!));
    bindChart(chart, to);
    XS = explorerSlot(board, () => $('#rv', root), () => $('#xp', root), exploreOpts, () => draw());
    XS.available(true);
    draw();
  }).catch(err => { if (!disposed) root.innerHTML = `<section class="empty"><p>${esc((err as Error).message)}</p><a class="btn" href="${back}">Retour</a></section>`; });
  document.addEventListener('keydown', onKey);
  return () => { disposed = true; XS?.destroy(); board?.destroy(); document.removeEventListener('keydown', onKey); };
}

/** Exercice « Retrouver le bon coup » sur un coup de la partie. */
export function retryFault(id: string, ply: number): Fault | null {
  const g = store.games.find(x => x.id === id); const ev = g?.ev; if (!g || !ev?.[ply] || !ev[ply + 1]) return null;
  const A = reviewGame({ ...g, ev }), r = A.R[ply]; if (!r) return null;
  const raw = (x: typeof ev[number]) => ({ cp: x.c, mate: x.m, best: x.b, pv: x.p?.length ? x.p : [x.b].filter((u): u is string => !!u) });
  const m = tryMove(new Chess(A.F[ply]), uciToObj(r.m.from + r.m.to + (r.m.promotion || ''))); if (!m) return null;
  return buildFault(g, ply, A.F[ply], m, raw(ev[ply]), raw(ev[ply + 1]), r.wb, r.wa);
}
