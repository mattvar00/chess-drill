/** Woodpecker : tes fautes de partie rejouées en cycles chronométrés. */
import { Chess, tryMove, uciOf, uciToObj, type Move } from '../core/chess';
import type { Fault } from '../core/analysis';
import { schedulePos } from '../core/schedule';
import { HANG, costliestFaults, duePositions, fmtTime, hangFaults, matPhrase, priorityFaults, themeCounts, themeHint, themeLabel } from '../core/wood';
import { refBranch } from '../core/drill';
import { STRUCT } from '../core/structures';
import { structureStats } from '../core/stats';
import { BR } from './store';
import { shortName } from './path';
import { balance, puzzleLine, type PuzzleLine } from '../core/puzzle';
import { matPhrase as matText } from '../core/review';
import { Board, miniBoard } from '../ui/board';
import { SFX } from '../ui/sound';
import { $, esc, icon, plural } from '../ui/dom';
import { markActive, markPlan, save, store, woodCur, woodHistory, type WoodCur } from './store';
import { syncSoon } from './api';
import { explorerSlot, sanTokens } from './explorer';
import { gameUrl } from './games';
import { dueMoments } from './endgame';

export const GO = '#/wood/go';
/** Début d'une variante, pour l'affichage (les lignes du moteur sont longues). */
const short = (line: string, n = 6) => { const t = line.split(' '); return t.slice(0, n).join(' ') + (t.length > n ? ' …' : ''); };
const byId = () => new Map(store.faults.map(f => [f.id, f]));
/** `back` : où revenir à la fin du cycle. `plan` : c'est l'étape tactique du plan du jour. */
export function startCycle(label: string, faults: Fault[], back = '#/wood', plan = false) {
  if (!faults.length) return; store.state.woodCur = { ids: faults.map(f => f.id), i: 0, solved: 0, elapsed: 0, label, back, plan } satisfies WoodCur; save();
  if (location.hash === GO) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = GO;
}
export const startPriority = () => startCycle('Positions prioritaires', priorityFaults(store.faults, store.state.fault, 10));

const row = (id: string, ic: string, title: string, sub: string) => `<button class="rowi" id="${id}"><span class="ico">${icon(ic)}</span><span class="body"><b>${title}</b><small>${sub}</small></span>${icon('chev', 'chev')}</button>`;
/** L'ouverture de la partie d'où vient une faute (d'après la ligne du répertoire suivie le plus longtemps). */
function sysOfFault(): (f: Fault) => string | null {
  const games = new Map(store.games.map(g => [g.id, g]));
  return f => { const g = games.get(f.game), id = g ? refBranch(g, BR) : null; return id && BR[id].sys.statut !== 'plan' ? BR[id].sys.id : null; };
}
const sysName = (id: string) => shortName(Object.values(BR).find(r => r.sys.id === id)?.sys.titre ?? id);
/** Un sous-ensemble du stock, choisi depuis une autre page : une ouverture (`o`), un type de faute (`t`) ou une structure de pions (`s`). */
function filtered(q: URLSearchParams): { label: string; faults: Fault[] } | null {
  const all = store.faults;
  if (q.get('o')) { const o = q.get('o')!, of = sysOfFault(); return { label: `Fautes : ${sysName(o)}`, faults: all.filter(f => of(f) === o) }; }
  if (q.get('g') === 'prise') return { label: 'Pièces en prise', faults: hangFaults(all) };
  if (q.get('t')) { const t = q.get('t')!; return { label: themeLabel(t), faults: all.filter(f => f.theme === t) }; }
  if (q.get('s')) { const s = q.get('s')!, S = STRUCT[s], ids = new Set((structureStats(store.games.filter(g => g.st && g.wp)) [s]?.games ?? []).map(g => g.id));
    return S ? { label: `Fautes : ${S.name}`, faults: all.filter(f => ids.has(f.game)) } : null; }
  return null;
}
/** Un cycle : les positions les plus utiles d'abord, au plus 10. */
const cycleOf = (faults: Fault[]) => priorityFaults(faults, store.state.fault, Math.min(10, faults.length));

export function viewWood(root: HTMLElement, q = new URLSearchParams()) {
  const all = store.faults, cur = woodCur(), hist = woodHistory().filter(c => c.solved > 0 || c.time >= 5000), due = duePositions(all, store.state.fault);
  if (!all.length) {
    root.innerHTML = `<section class="empty"><p>Tes fautes apparaissent ici dès que tes parties sont analysées, chaque nuit.</p></section>`; return;
  }
  const here = location.hash, F = filtered(q), egs = dueMoments();
  const month = costliestFaults(all, 30, 30), n = Math.min(10, all.length), prio = priorityFaults(all, store.state.fault, n);
  const of = sysOfFault(), bySys: Record<string, number> = {}; for (const f of all) { const s = of(f); if (s) bySys[s] = (bySys[s] || 0) + 1; }
  const hang = hangFaults(all), other = themeCounts(all.filter(f => !HANG.has(f.theme)))[0]?.[1] ?? 0;
  const themes = themeCounts(all).slice(0, 6), opens = Object.entries(bySys).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const pick = F ? cycleOf(F.faults) : [], shown = (F && pick[0]) || (cur && byId().get(cur.ids[cur.i])) || prio[0];
  const hero = F
    ? `<p class="label">Cycle choisi</p><h2>${esc(F.label)}</h2><p>${F.faults.length ? `${plural(pick.length, 'position')}${F.faults.length > pick.length ? ` sur ${F.faults.length}` : ''}, les plus utiles d'abord.` : 'Aucune position pour l\'instant.'}</p>`
    : cur ? `<p class="label">Cycle en cours</p><h2>${esc(cur.label)}</h2><p>Position ${Math.min(cur.i + 1, cur.ids.length)} sur ${cur.ids.length}, ${fmtTime(cur.elapsed)} au compteur</p>`
    : `<p class="label">Cycle conseillé</p><h2>${plural(n, 'position prioritaire', 'positions prioritaires')}</h2><p>Celles à revoir, puis les plus coûteuses et les plus récentes.</p>`;
  const chip = (key: string, label: string, k: number) => `<button type="button" class="fchip" data-c="${esc(key)}">${esc(label)} <b>${k}</b></button>`;
  root.innerHTML = `
    <header class="pagehead">
      <div class="sumrow"><p>${plural(all.length, 'position tirée', 'positions tirées')} de tes parties</p>${due ? `<p class="duetxt">${due} à revoir</p>` : ''}</div></header>
    <section class="surf today">
      <div class="today-top"><div class="today-text">${hero}</div>${shown ? miniBoard(new Chess(shown.fen), shown.side) : ''}</div>
      ${F ? (pick.length ? '<button class="btn pri block" id="bPick">Commencer le cycle</button>' : '') : `<button class="btn pri block" id="${cur ? 'bResume' : 'bPrio'}">${cur ? 'Reprendre le cycle' : 'Commencer le cycle'}</button>`}
    </section>
    ${F ? '<a class="quiet" href="#/wood">Voir tous les cycles</a>' : ''}
    ${!F && hang.length >= 5 && hang.length >= other ? `<section class="grp"><h2>Ta faute la plus fréquente</h2><div class="surf card list">${row('bHang', 'target', 'Pièces en prise', `${plural(hang.length, 'position')} de tes parties : une pièce attaquée oubliée, ou posée sur une case attaquée. 10 par cycle.`)}</div></section>` : ''}
    ${themes.length ? `<section class="grp"><h2>Par type de faute</h2><div class="fchips">${themes.map(([t, k]) => chip('t:' + t, themeLabel(t), k)).join('')}</div></section>` : ''}
    ${opens.length ? `<section class="grp"><h2>Par ouverture</h2><div class="fchips">${opens.map(([o, k]) => chip('o:' + o, sysName(o), k)).join('')}</div></section>` : ''}
    <section class="grp"><h2>Autres cycles</h2><div class="surf card list">
      ${cur || F ? row('bPrio', 'target', plural(n, 'position prioritaire', 'positions prioritaires'), 'Celles à revoir, puis les plus coûteuses et les plus récentes') : ''}
      ${month.length ? row('bMonth', 'calendar', 'Fautes du mois', `Les ${month.length > 1 ? month.length + ' plus coûteuses' : 'plus coûteuse'} des 30 derniers jours`) : ''}
      ${row('bAll', 'stack', 'Tout le stock', plural(all.length, 'position'))}
      ${egs.length ? `<a class="rowi" href="${egs[0].href}"><span class="ico">${icon('rook')}</span><span class="body"><b>Fautes de finale</b><small>${plural(egs.length, 'position')} à rejouer, jugées par la table de finales</small></span>${icon('chev', 'chev')}</a>` : ''}
    </div></section>
    ${hist.length ? `<section class="grp"><h2>Cycles terminés</h2><div class="surf card"><table class="cycles"><thead><tr><th>Date</th><th>Cycle</th><th>1er coup</th><th>Temps</th></tr></thead><tbody>${[...hist].reverse().slice(0, 12).map(c =>
      `<tr><td>${new Date(c.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</td><td>${esc(c.label)}</td><td>${c.solved}/${c.n}</td><td>${fmtTime(c.time)}</td></tr>`).join('')}</tbody></table></div></section>` : ''}
    <p class="foot">Chaque position vient d'un coup qui t'a coûté au moins 15 points de chances de gain. Refais le même cycle jusqu'à le résoudre vite et sans faute.</p>`;
  $('#bResume', root)?.addEventListener('click', () => { location.hash = GO; });
  $('#bPick', root)?.addEventListener('click', () => startCycle(F!.label, pick, here));
  $('#bPrio', root)?.addEventListener('click', startPriority);
  $('#bHang', root)?.addEventListener('click', () => startCycle('Pièces en prise', cycleOf(hang), here));
  $('#bMonth', root)?.addEventListener('click', () => startCycle('Fautes du mois', month));
  $('#bAll', root).addEventListener('click', () => startCycle('Tout le stock', all));
  root.querySelectorAll<HTMLButtonElement>('[data-c]').forEach(b => b.addEventListener('click', () => {
    const [k, v] = b.dataset.c!.split(/:(.*)/s), f = filtered(new URLSearchParams({ [k]: v }))!;
    startCycle(f.label, cycleOf(f.faults), here);
  }));
}

/**
 * Écran d'exercice. `header` met à jour le titre de la page et le chronomètre ; renvoie le nettoyage.
 * `one` : une seule position hors cycle (« Retrouver le bon coup » depuis la revue), puis retour à `back`.
 */
export function mountExercise(root: HTMLElement, header: (title: string, sub: string, clock?: string) => void, one?: { fault: Fault; back: string }): () => void {
  const faults = one ? new Map([[one.fault.id, one.fault]]) : byId(); let W = one ? { ids: [one.fault.id], i: 0, solved: 0, elapsed: 0, label: 'Retrouver le bon coup' } : woodCur();
  if (!W || !W.ids.some(id => faults.has(id))) { location.replace('#/wood'); return () => { /* rien à nettoyer */ }; }
  const cyc = W;
  root.innerHTML = `<div class="trainer"><div class="tboard"><div id="board"></div></div>
    <div class="tside"><div id="ex"><p class="meta" id="meta"></p><div class="coach" id="coach" aria-live="polite"></div><div class="actions" id="actions"></div></div><div id="xp" hidden></div></div></div>`;
  const coach = $('#coach', root), actions = $('#actions', root), meta = $('#meta', root);
  // `L` : la ligne à jouer (ton coup, la réponse, ton coup…) ; `k` : l'indice du coup attendu dans cette ligne.
  let F: Fault, L: PuzzleLine, k = 0, game = new Chess(), last: Move | null = null, tries = 0, solved = false, hintLevel = 0, ended = false;
  let since = Date.now(); const elapsed = () => cyc.elapsed + (ended ? 0 : Date.now() - since);
  const xa = () => XS.active();
  const board = new Board($('#board', root), { movable: () => xa() ? xa()!.movable() : solved || ended ? null : F.side, onMove: m => xa() ? xa()!.onMove(m) : attempt(m) });
  /** Explorateur (bouton de la barre du haut) : la meilleure suite, la réfutation de ton coup, ou tes propres coups. */
  const XS = explorerSlot(board, () => $('#ex', root), () => $('#xp', root), () => ({ fen: F.fen, orient: F.side, lines: [
    { label: 'Meilleure suite', sans: [F.best.san, ...sanTokens(F.best.suite)] },
    { label: 'Ton coup dans la partie', sans: [F.played.san, ...sanTokens(F.played.refut)] }] }), () => board.set(game, F.side, last));
  const sub = () => header(cyc.label, one ? `Contre ${F.opp}, coup ${F.move_no}` : `Position ${cyc.i + 1} sur ${cyc.ids.length}`, fmtTime(elapsed()));
  const numbered = (san: string) => `${F.move_no}${F.side === 'w' ? '.' : '…'}${san}`;
  /** Une suite de coups numérotée depuis la position du problème : « 23.Cc7+ Rd7 24.Cxa8 ». */
  const fmtLine = (sans: string[]) => { let n = F.move_no, w = F.side === 'w'; return sans.map((x, j) => { const t = w ? `${n}.${x}` : j === 0 ? `${n}…${x}` : x; if (!w) n++; w = !w; return t; }).join(' '); };
  /** Le coup attendu maintenant, en coordonnées (pour l'indice). */
  const expected = () => { const t = new Chess(game.fen()); const m = tryMove(t, L.sans[k]); return m ? uciOf(m) : F.best.uci; };
  const mine = () => (L.sans.length + 1) / 2;
  const tick = setInterval(() => { if (!ended) sub(); }, 1000);
  const hold = () => { cyc.elapsed = elapsed(); since = Date.now(); if (!one) store.state.woodCur = cyc; save(); };

  function load() {
    XS.available(false, 'Trouve le coup, ou affiche la solution, pour explorer la position.');
    while (cyc.i < cyc.ids.length && !faults.has(cyc.ids[cyc.i])) cyc.i++;   // position disparue du stock : on passe
    if (cyc.i >= cyc.ids.length) return finish();
    F = faults.get(cyc.ids[cyc.i])!; game = new Chess(F.fen); last = null; tries = 0; solved = false; hintLevel = 0; k = 0;
    L = puzzleLine(F.fen, F.side, [F.best.san, ...sanTokens(F.best.suite)]);
    board.set(game, F.side); sub();
    meta.innerHTML = `Contre <b>${esc(F.opp)}</b>, ${esc(F.date.split('.').reverse().join('/'))}, coup ${F.move_no}`;
    coach.innerHTML = `<p class="lead"><i class="stm ${F.side}"></i>Aux ${F.side === 'w' ? 'Blancs' : 'Noirs'} de jouer</p><p class="why">${mine() > 1 ? `Trouve le meilleur coup et joue la suite jusqu'au gain : ${mine()} coups.` : 'Trouve le meilleur coup.'} ${esc(F.phase.charAt(0).toUpperCase() + F.phase.slice(1))}, ${matPhrase(F.mat)}. ${esc(themeHint(F.theme))}</p>`;
    actions.className = 'actions duo';
    actions.innerHTML = `<button class="btn" id="bHint">${icon('bulb')}Indice</button><button class="btn" id="bSol">Solution</button><button class="quiet" id="bSkip">Passer cette position</button>`;
    $('#bHint', actions).onclick = () => { hintLevel++; const u = expected(); board.hint(hintLevel >= 2 ? [u.slice(0, 2), u.slice(2, 4)] : [u.slice(0, 2)]); };
    $('#bSol', actions).onclick = () => reveal(false); $('#bSkip', actions).onclick = next;
    if (one) $('#bSkip', actions).remove();
  }
  function explain(found: boolean) {
    const p = F.played, clean = found && tries === 1 && !hintLevel;
    // ce que coûtait le coup de la partie : le matériel perdu au bout de la réfutation
    const t = new Chess(F.fen), b0 = balance(F.fen, F.side); tryMove(t, p.san); for (const x of sanTokens(p.refut).slice(0, 4)) if (!tryMove(t, x)) break;
    const lost = b0 - balance(t.fen(), F.side), mated = t.isCheckmate();
    const why = L.mate ? 'Et c\'est mat.' : L.gain >= 2 ? `Au bout de la ligne, tu gagnes ${matText(L.gain)}.` : mated || lost >= 2 ? 'Ce coup tient la position : celui de la partie perdait.' : '';
    coach.innerHTML = `<p class="lead">${found ? `<span class="okb">${icon('check')}</span>` : 'La solution : '}${esc(fmtLine(L.sans))}${clean ? '<span class="tag ok">du premier coup</span>' : found ? `<span class="tag">${tries > 1 ? plural(tries, 'essai') : 'avec indice'}</span>` : ''}</p>
      ${why ? `<p class="punch">${esc(why)}</p>` : ''}<p>${esc(F.best.desc)}</p>
      <div class="surf ingame"><p class="label">Dans la partie</p>
        <p>Tu as joué <b>${esc(numbered(p.san))}</b>${p.refut ? `, puni par <b>${esc(short(p.refut, 3))}</b>` : ''}${mated ? ' : mat.' : lost >= 2 ? ` : tu perdais ${matText(lost)}.` : '.'}</p>
        <p class="odds"><span>Chances de gain</span><b>${Math.round(p.wp_before)} %</b>${icon('arrow')}<b class="down">${Math.round(p.wp_after)} %</b></p></div>
      <p class="hint">Pour voir d'autres coups ou la suite au moteur, ouvre l'explorateur en haut.</p>`;
    actions.className = 'actions';
    actions.innerHTML = one ? `<a class="btn pri" href="${one.back}">Revenir à la partie</a><button class="btn" id="bAgain1">Refaire</button>`
      : `<button class="btn pri" id="bNext">${cyc.i + 1 < cyc.ids.length ? 'Position suivante' : 'Terminer le cycle'}</button>${store.games.some(g => g.id === F.game) ? `<button class="btn" id="bGame">Voir la partie</button>` : `<a class="btn" href="https://www.chess.com/game/live/${encodeURIComponent(F.game)}" target="_blank" rel="noopener">Voir la partie</a>`}`;
    // la revue s'ouvre au coup de la faute ; en revenant, le cycle reprend à la position suivante
    const bg = actions.querySelector<HTMLButtonElement>('#bGame'); if (bg) bg.onclick = () => { const url = gameUrl(F.game, F.ply + 1, GO); cyc.i++; hold(); location.hash = url; };
    XS.available(true);
    const again = actions.querySelector<HTMLButtonElement>('#bAgain1'); if (again) { again.onclick = () => { since = Date.now(); load(); }; return; }
    $('#bNext', actions).onclick = next;
  }
  /** Montre la solution. `found` : trouvée par le joueur (sinon c'est un échec pour la répétition espacée). */
  function reveal(found: boolean, m?: Move) {
    if (solved) return; solved = true; if (!found) tries = Math.max(tries, 1);
    if (m) last = tryMove(game, m);
    else for (; k < L.sans.length; k++) last = tryMove(game, L.sans[k]) ?? last;   // la solution : le reste de la ligne d'un coup
    board.set(game, F.side, last, true); if (last && found) board.flash(last.to, 'good');
    store.state.fault[F.id] = schedulePos(store.state.fault[F.id], !found ? 'fail' : tries === 1 && !hintLevel ? 'good' : 'ok', tries);
    if (found && tries === 1 && !hintLevel) cyc.solved++;
    cyc.tried = (cyc.tried ?? 0) + 1;
    markActive(); hold(); explain(found);
  }
  function attempt(m: Move) {
    if (k === 0) tries++;
    const want = expected(), right = uciOf(m) === want || m.san.includes('#');
    if (right && (k + 1 >= L.sans.length || m.san.includes('#'))) return reveal(true, m);
    if (right) {
      // bon coup en cours de ligne : on le joue, l'adversaire répond, et on continue
      last = tryMove(game, m); board.set(game, F.side, last, true); board.flash(m.to, 'good');
      coach.innerHTML = `<p class="lead"><span class="okb">${icon('check')}</span>${esc(fmtLine(L.sans.slice(0, k + 1)))}</p><p class="why">Bien. Continue : ${plural(mine() - (k / 2 + 1), 'coup')} encore.</p>`;
      const reply = L.sans[k + 1]; k += 2;
      setTimeout(() => { if (solved || ended) return; last = tryMove(game, reply); board.set(game, F.side, last, true); }, 250);
      return;
    }
    if (k > 0) tries++;
    board.set(game, F.side, last); board.flash(m.to, 'bad');
    coach.innerHTML = k === 0
      ? `<p class="lead bad">${esc(m.san)} n'est pas le meilleur coup</p><p>${uciOf(m) === F.played.uci ? "C'est le coup que tu as joué dans la partie." : 'Regarde encore : échecs, prises, menaces.'}</p>`
      : `<p class="lead bad">${esc(m.san)} laisse filer l'avantage</p><p>Le bon début est joué. Il y a plus fort pour finir le travail.</p>`;
  }
  function next() { if (!solved) store.state.fault[F.id] = schedulePos(store.state.fault[F.id], 'fail', tries || 1); cyc.i++; hold(); load(); }
  function finish() {
    if (one) { ended = true; location.hash = one.back; return; }
    ended = true; cyc.elapsed = cyc.elapsed + Date.now() - since; SFX.done();
    const done = { date: Date.now(), time: cyc.elapsed, solved: cyc.solved, n: cyc.ids.length, label: cyc.label };
    const prev = [...woodHistory()].reverse().find(c => c.label === done.label && c.n === done.n);
    // un cycle où tout a été passé n'est pas un cycle fait : on ne l'inscrit pas dans l'historique
    const counted = !!cyc.tried;
    store.state.wood = counted ? [...woodHistory(), done] : woodHistory(); store.state.woodCur = undefined; save(); syncSoon();
    header('Cycle terminé', done.label); XS.destroy();
    root.innerHTML = `<div class="endwrap"><section class="endcard">${counted ? `<h1>${done.solved}/${done.n} du premier coup</h1><p>En ${fmtTime(done.time)}${prev ? `. La fois précédente : ${prev.solved}/${prev.n} en ${fmtTime(prev.time)}` : ''}.</p>` : '<h1>Cycle passé</h1><p>Aucune position jouée : ce cycle ne compte pas dans ton historique.</p>'}
      <div class="row">${cyc.plan ? `<a class="btn pri" href="${cyc.back ?? '#/'}">Continuer le plan du jour</a><button class="btn" id="bAgain">Refaire</button>` : `<button class="btn pri" id="bAgain">Refaire ce cycle</button><a class="btn" href="${cyc.back ?? '#/wood'}">Retour</a>`}</div></section></div>`;
    if (cyc.plan) markPlan('tac');
    $('#bAgain', root).onclick = () => startCycle(done.label, cyc.ids.map(id => faults.get(id)).filter((f): f is Fault => !!f), cyc.back, cyc.plan);
  }
  const onHide = () => { if (document.hidden && !ended) hold(); else since = Date.now(); };
  document.addEventListener('visibilitychange', onHide);
  load();
  return () => { XS.destroy(); clearInterval(tick); document.removeEventListener('visibilitychange', onHide); board.destroy(); if (!ended) { hold(); syncSoon(); } };
}
