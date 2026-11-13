/**
 * Explorateur de variantes : on part d'une position, on parcourt des lignes toutes faites (meilleure suite, réfutation,
 * suite de la partie) ou on joue librement, et Stockfish (dans le navigateur) évalue chaque position atteinte.
 * Il prend la main sur un échiquier existant : l'écran qui l'ouvre lui délègue movable() et onMove().
 */
import { Chess, tryMove, uciOf, uciToObj, type Move } from '../core/chess';
import { winPct } from '../core/winpct';
import type { Color } from '../core/types';
import { mainEngine } from '../engine/stockfish';
import type { Board } from '../ui/board';
import { esc, icon } from '../ui/dom';

export interface ExplorerLine { label: string; sans: string[] }
export interface Explorer { movable(): Color | null; onMove(m: Move): void; destroy(): void }

/** Lignes en notation « 20...Rxc4 21.Nd7 » → coups seuls. */
export const sanTokens = (line: string) => line.split(/\s+/).map(t => t.replace(/^\d+\.(\.\.)?|^\d+…/, '')).filter(t => t && t !== '…');

export function createExplorer(board: Board, el: HTMLElement, o: { fen: string; orient: Color; lines: ExplorerLine[]; close: () => void }): Explorer {
  const startNo = parseInt(o.fen.split(' ')[5]) || 1, startW = o.fen.split(' ')[1] === 'w';
  // chaque ligne est rejouée une fois pour ne garder que les coups légaux
  const lines = o.lines.map(l => { const g = new Chess(o.fen), moves: Move[] = []; for (const s of l.sans) { const m = tryMove(g, s); if (!m) break; moves.push(m); } return { label: l.label, moves }; }).filter(l => l.moves.length);
  let path: Move[] = [], cur = 0, closed = false, ticket = 0, timer: ReturnType<typeof setTimeout> | undefined;
  const label = (k: number) => { const ply = k + (startW ? 0 : 1); return `${startNo + Math.floor(ply / 2)}${ply % 2 ? '…' : '.'}`; };
  const fmt = (moves: Move[], from = 0, cls = (_k: number) => '') => moves.map((m, k) => { const ply = from + k; const showNo = ply === from || (ply + (startW ? 0 : 1)) % 2 === 0;
    return `${showNo ? `<span class="n">${label(ply)}</span>` : ''}<span class="m${cls(k)}" data-k="${k}">${esc(m.san)}</span>`; }).join(' ');

  el.innerHTML = `<div class="explorer">
    <p class="rvlab"><b>Explorateur</b><span class="ev" id="xEval"></span></p>
    <p class="why" id="xEngine">Joue un coup sur l'échiquier ou touche une variante.</p>
    <div class="explnav">${[['first', 'Position de départ', 'first'], ['prev', 'Coup précédent', 'back'], ['next', 'Coup suivant', 'chev'], ['last', 'Dernier coup', 'last']].map(([to, l, ic]) => `<button class="btn" data-x="${to}" aria-label="${l}">${icon(ic)}</button>`).join('')}</div>
    <div class="xlines">${lines.map((l, j) => `<div class="xline" data-j="${j}"><p class="flabel">${esc(l.label)}</p><p class="moves">${fmt(l.moves)}</p></div>`).join('')}
      <div class="xline" id="xMine" hidden><p class="flabel">Ta variante</p><p class="moves" id="xMineMoves"></p></div></div>
    <div class="actions"><button class="btn pri" id="xClose">Fermer l'explorateur</button></div></div>`;
  const evalEl = el.querySelector<HTMLElement>('#xEval')!, engEl = el.querySelector<HTMLElement>('#xEngine')!;

  const isLine = (j: number) => lines[j].moves.length >= cur && path.slice(0, cur).every((m, k) => uciOf(m) === uciOf(lines[j].moves[k]));
  /** Position affichée : la position de départ, puis les coups du chemin jusqu'au curseur. */
  const pos = () => { const g = new Chess(o.fen); for (const m of path.slice(0, cur)) tryMove(g, m.san); return g; };
  function draw(animate = false) {
    const g = pos();
    board.set(g, o.orient, cur ? path[cur - 1] : null, animate);
    el.querySelectorAll<HTMLElement>('.xline[data-j]').forEach(x => { const j = +x.dataset.j!, on = isLine(j) && cur > 0;
      x.querySelectorAll<HTMLElement>('.m').forEach(s => s.classList.toggle('cur', on && +s.dataset.k! === cur - 1)); });
    const free = !lines.some((_, j) => isLine(j) && lines[j].moves.length >= path.length && path.every((m, k) => uciOf(m) === uciOf(lines[j].moves[k])));
    const mine = el.querySelector<HTMLElement>('#xMine')!; mine.hidden = !free || !path.length;
    if (free) el.querySelector('#xMineMoves')!.innerHTML = fmt(path, 0, k => (k === cur - 1 ? ' cur' : ''));
    analyse(g);
  }
  /** Évaluation de la position affichée, après une courte pause (les clics rapides n'en lancent qu'une). */
  function analyse(g: Chess) {
    clearTimeout(timer); const my = ++ticket; evalEl.textContent = '';
    if (g.isGameOver()) { engEl.textContent = g.isCheckmate() ? 'Échec et mat.' : 'Partie nulle.'; return; }
    engEl.textContent = 'Le moteur réfléchit…';
    timer = setTimeout(async () => {
      try {
        const e = await (await mainEngine()).eval(g.fen(), 18, 900, 1); if (closed || my !== ticket) return;
        const side = o.orient, w = winPct(e.cp, e.mate), mine = Math.round(side === 'w' ? w : 100 - w);
        evalEl.textContent = e.mate != null ? `M${Math.abs(e.mate)}` : `${(e.cp ?? 0) >= 0 ? '+' : ''}${((e.cp ?? 0) / 100).toFixed(1)}`;
        const t = new Chess(g.fen()), sans: string[] = []; for (const u of e.pv.slice(0, 6)) { const m = tryMove(t, uciToObj(u)); if (!m) break; sans.push(m.san); }
        engEl.innerHTML = sans.length ? `Meilleur coup : <b>${esc(sans[0])}</b>${sans.length > 1 ? ` (${esc(sans.join(' '))})` : ''}. Tes chances : ${mine} %.` : `Tes chances : ${mine} %.`;
        if (e.best) board.overlay({ arrows: [{ from: e.best.slice(0, 2), to: e.best.slice(2, 4), cls: 'engine' }] });
      } catch { if (!closed && my === ticket) engEl.textContent = "Le moteur n'a pas pu démarrer sur cet appareil."; }
    }, 250);
  }
  const to = (k: number, animate = false) => { cur = Math.max(0, Math.min(path.length, k)); draw(animate); };
  el.querySelector('.explnav')!.addEventListener('click', e => { const x = (e.target as HTMLElement).closest<HTMLElement>('[data-x]')?.dataset.x; if (!x) return;
    x === 'first' ? to(0) : x === 'last' ? to(path.length) : to(cur + (x === 'next' ? 1 : -1), x === 'next'); });
  el.querySelectorAll<HTMLElement>('.xline[data-j]').forEach(x => x.addEventListener('click', e => { const k = (e.target as HTMLElement).closest<HTMLElement>('.m')?.dataset.k; if (k == null) return;
    path = lines[+x.dataset.j!].moves.slice(); to(+k + 1); }));
  el.querySelector('#xMineMoves')!.addEventListener('click', e => { const k = (e.target as HTMLElement).closest<HTMLElement>('.m')?.dataset.k; if (k != null) to(+k + 1); });
  el.querySelector<HTMLButtonElement>('#xClose')!.onclick = () => o.close();
  const onKey = (e: KeyboardEvent) => { if (e.key === 'ArrowRight') to(cur + 1, true); if (e.key === 'ArrowLeft') to(cur - 1); };
  document.addEventListener('keydown', onKey);
  draw();
  return {
    movable: () => (closed ? null : pos().turn()),
    onMove: m => { path = [...path.slice(0, cur), m]; to(cur + 1, true); },
    destroy: () => { closed = true; clearTimeout(timer); document.removeEventListener('keydown', onKey); },
  };
}

/** Bouton commun à tous les écrans qui proposent l'explorateur. */
export const exploreButton = (id = 'bExplore') => `<button class="btn" id="${id}">${icon('search')}Explorer</button>`;
/**
 * Ouvre l'explorateur à la place du panneau `main` (dans `panel`), et le referme sur « Fermer » :
 * `onClose` remet l'écran d'origine dans son état. Renvoie l'explorateur, à qui l'écran délègue son échiquier.
 */
export function openExplorer(board: Board, main: HTMLElement, panel: HTMLElement, opts: Omit<Parameters<typeof createExplorer>[2], 'close'>, onClose: () => void): Explorer {
  main.hidden = true; panel.hidden = false;
  const x = createExplorer(board, panel, { ...opts, close: () => { x.destroy(); panel.hidden = true; panel.innerHTML = ''; main.hidden = false; onClose(); } });
  if (panel.getBoundingClientRect().top < 0) panel.scrollIntoView({ block: 'start' });
  return x;
}
