/** Woodpecker : tes fautes de partie rejouées en cycles chronométrés. */
import { Chess, tryMove, uciOf, uciToObj, type Move } from '../core/chess';
import type { Fault } from '../core/analysis';
import { schedulePos } from '../core/schedule';
import { costliestFaults, duePositions, fmtTime, matPhrase, priorityFaults, themeHint } from '../core/wood';
import { Board } from '../ui/board';
import { SFX } from '../ui/sound';
import { $, esc, plural } from '../ui/dom';
import { save, store, woodCur, woodHistory, type WoodCur } from './store';
import { getToken, syncSoon } from './api';

export const GO = '#/wood/go';
/** Début d'une variante, pour l'affichage (les lignes du moteur sont longues). */
const short = (line: string, n = 6) => { const t = line.split(' '); return t.slice(0, n).join(' ') + (t.length > n ? ' …' : ''); };
const byId = () => new Map(store.faults.map(f => [f.id, f]));
export function startCycle(label: string, faults: Fault[]) {
  if (!faults.length) return; store.state.woodCur = { ids: faults.map(f => f.id), i: 0, solved: 0, elapsed: 0, label } satisfies WoodCur; save();
  if (location.hash === GO) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = GO;
}
export const startPriority = () => startCycle('Positions prioritaires', priorityFaults(store.faults, store.state.fault, 10));

export function viewWood(root: HTMLElement) {
  const all = store.faults, cur = woodCur(), hist = woodHistory(), due = duePositions(all, store.state.fault);
  if (!all.length) {
    root.innerHTML = `<section class="hero"><h1>Pas encore de positions</h1><p>${getToken() ? 'Tes fautes apparaissent ici dès que tes parties sont analysées, chaque nuit.' : 'Les exercices viennent de tes propres parties.'}</p>
      ${getToken() ? '' : '<div class="row"><a class="btn pri" href="#/reglages">Relier l\'app à tes parties</a></div>'}</section>`; return;
  }
  const month = costliestFaults(all, 30, 30), last = hist[hist.length - 1];
  root.innerHTML = `
    <section class="hero"><h1>${plural(all.length, 'position')} tirées de tes parties</h1>
      <p>${due ? `${plural(due, 'position')} à revoir aujourd'hui. ` : ''}Refais le même cycle jusqu'à le résoudre vite et sans faute.</p></section>
    ${cur ? `<div class="row"><button class="btn pri" id="bResume">Reprendre : ${esc(cur.label)} (${cur.i + 1}/${cur.ids.length})</button></div>` : ''}
    <div class="row col">
      <button class="btn${cur ? '' : ' pri'}" id="bPrio">${Math.min(10, all.length)} positions prioritaires</button>
      ${month.length ? `<button class="btn" id="bMonth">Les ${month.length} fautes les plus coûteuses du mois</button>` : ''}
      <button class="btn" id="bAll">Tout le stock (${all.length})</button>
    </div>
    ${hist.length ? `<h2>Cycles terminés</h2><table class="cycles"><thead><tr><th>Date</th><th>Cycle</th><th>1er coup</th><th>Temps</th></tr></thead><tbody>${[...hist].reverse().slice(0, 12).map(c =>
      `<tr><td>${new Date(c.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</td><td>${esc(c.label)}</td><td>${c.solved}/${c.n}</td><td>${fmtTime(c.time)}</td></tr>`).join('')}</tbody></table>` : ''}
    ${last ? '' : '<p class="foot">Chaque position vient d\'un coup qui t\'a coûté au moins 15 points de chances de gain. Trouve le coup que le moteur préfère.</p>'}`;
  $('#bResume', root)?.addEventListener('click', () => { location.hash = GO; });
  $('#bPrio', root).addEventListener('click', startPriority);
  $('#bMonth', root)?.addEventListener('click', () => startCycle('Fautes du mois', month));
  $('#bAll', root).addEventListener('click', () => startCycle('Tout le stock', all));
}

/** Écran d'exercice. `header` met à jour le titre de la page ; renvoie le nettoyage. */
export function mountExercise(root: HTMLElement, header: (title: string, sub: string) => void): () => void {
  const faults = byId(); let W = woodCur();
  if (!W || !W.ids.some(id => faults.has(id))) { location.replace('#/wood'); return () => { /* rien à nettoyer */ }; }
  const cyc = W;
  root.innerHTML = `<div class="trainer"><div class="tboard"><div id="board"></div></div>
    <div class="tside"><p class="meta" id="meta"></p><div class="coach" id="coach" aria-live="polite"></div><div class="actions" id="actions"></div></div></div>`;
  const coach = $('#coach', root), actions = $('#actions', root), meta = $('#meta', root);
  let F: Fault, game = new Chess(), last: Move | null = null, tries = 0, solved = false, hintLevel = 0, ended = false;
  let since = Date.now(); const elapsed = () => cyc.elapsed + (ended ? 0 : Date.now() - since);
  const board = new Board($('#board', root), { movable: () => solved || ended ? null : F.side, onMove: m => attempt(m) });
  const sub = () => header(F.theme, `${esc(cyc.label)} · ${cyc.i + 1}/${cyc.ids.length} · ${fmtTime(elapsed())}`);
  const tick = setInterval(() => { if (!ended) sub(); }, 1000);
  const hold = () => { cyc.elapsed = elapsed(); since = Date.now(); store.state.woodCur = cyc; save(); };

  function load() {
    while (cyc.i < cyc.ids.length && !faults.has(cyc.ids[cyc.i])) cyc.i++;   // position disparue du stock : on passe
    if (cyc.i >= cyc.ids.length) return finish();
    F = faults.get(cyc.ids[cyc.i])!; game = new Chess(F.fen); last = null; tries = 0; solved = false; hintLevel = 0;
    board.set(game, F.side); sub();
    meta.innerHTML = `Contre <b>${esc(F.opp)}</b>, ${esc(F.date.split('.').reverse().join('/'))}, coup ${F.move_no}`;
    coach.innerHTML = `<p class="lead you">${F.side === 'w' ? 'Les Blancs' : 'Les Noirs'} jouent : trouve le coup</p><p class="why">${esc(F.phase.charAt(0).toUpperCase() + F.phase.slice(1))}, ${matPhrase(F.mat)}. ${esc(themeHint(F.theme))}</p>`;
    actions.innerHTML = '<button class="btn" id="bHint">Indice</button><button class="btn" id="bSol">Solution</button><button class="btn" id="bSkip">Passer</button>';
    $('#bHint', actions).onclick = () => { hintLevel++; board.hint(hintLevel >= 2 ? [F.best.uci.slice(0, 2), F.best.uci.slice(2, 4)] : [F.best.uci.slice(0, 2)]); };
    $('#bSol', actions).onclick = () => reveal(false); $('#bSkip', actions).onclick = next;
  }
  function explain(found: boolean) {
    const p = F.played, loss = `${Math.round(p.wp_before)} % → ${Math.round(p.wp_after)} % de chances de gain`;
    coach.innerHTML = `<p class="lead ${found ? 'ok' : ''}">${found ? '✓ ' : 'Le coup : '}${esc(F.best.san)}${found && tries === 1 ? '' : found ? ` <span class="tag">${tries} essais</span>` : ''}</p>
      <p>${esc(F.best.desc)}${F.best.suite ? ` Suite : <span class="line">${esc((/^\d/.test(F.best.suite) ? '' : F.move_no + '…') + short(F.best.suite))}</span>` : ''}</p>
      <p class="why">Dans la partie, tu as joué <b>${esc(p.san)}</b> (${loss})${p.refut ? `, puni par <span class="line">${esc(short(p.refut))}</span>` : ''}.</p>`;
    actions.innerHTML = `<button class="btn pri" id="bNext">${cyc.i + 1 < cyc.ids.length ? 'Suivant' : 'Terminer le cycle'}</button><a class="btn" href="https://www.chess.com/game/live/${encodeURIComponent(F.game)}" target="_blank" rel="noopener">Voir la partie</a>`;
    $('#bNext', actions).onclick = next;
  }
  /** Montre le meilleur coup. `found` : trouvé par le joueur (sinon c'est un échec pour la répétition espacée). */
  function reveal(found: boolean, m?: Move) {
    if (solved) return; solved = true; if (!found) tries = Math.max(tries, 1);
    last = tryMove(game, m ?? uciToObj(F.best.uci)); board.set(game, F.side, last, true); if (last) board.flash(last.to, 'good');
    store.state.fault[F.id] = schedulePos(store.state.fault[F.id], !found ? 'fail' : tries === 1 && !hintLevel ? 'good' : 'ok', tries);
    if (found && tries === 1 && !hintLevel) cyc.solved++;
    hold(); explain(found);
  }
  function attempt(m: Move) {
    tries++;
    if (uciOf(m) === F.best.uci) return reveal(true, m);
    board.set(game, F.side); board.flash(m.to, 'bad');
    coach.innerHTML = `<p class="lead bad">${esc(m.san)} n'est pas le meilleur coup</p><p>${uciOf(m) === F.played.uci ? "C'est le coup que tu as joué dans la partie." : 'Regarde encore : échecs, prises, menaces.'}</p>`;
  }
  function next() { if (!solved) store.state.fault[F.id] = schedulePos(store.state.fault[F.id], 'fail', tries || 1); cyc.i++; hold(); load(); }
  function finish() {
    ended = true; cyc.elapsed = cyc.elapsed + Date.now() - since; SFX.done();
    const done = { date: Date.now(), time: cyc.elapsed, solved: cyc.solved, n: cyc.ids.length, label: cyc.label };
    const prev = [...woodHistory()].reverse().find(c => c.label === done.label && c.n === done.n);
    store.state.wood = [...woodHistory(), done]; store.state.woodCur = undefined; save(); syncSoon();
    header('Cycle terminé', esc(done.label));
    root.innerHTML = `<section class="hero center"><h1>${done.solved}/${done.n} du premier coup</h1><p>en ${fmtTime(done.time)}${prev ? `. La fois précédente : ${prev.solved}/${prev.n} en ${fmtTime(prev.time)}` : ''}.</p>
      <div class="row"><button class="btn pri" id="bAgain">Refaire ce cycle</button><a class="btn" href="#/wood">Retour</a></div></section>`;
    $('#bAgain', root).onclick = () => startCycle(done.label, cyc.ids.map(id => faults.get(id)).filter((f): f is Fault => !!f));
  }
  const onHide = () => { if (document.hidden && !ended) hold(); else since = Date.now(); };
  document.addEventListener('visibilitychange', onHide);
  load();
  return () => { clearInterval(tick); document.removeEventListener('visibilitychange', onHide); board.destroy(); if (!ended) { hold(); syncSoon(); } };
}
