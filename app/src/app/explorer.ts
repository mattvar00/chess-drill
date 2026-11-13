/**
 * Explorateur de variantes : on part d'une position, on parcourt des lignes toutes faites (meilleure suite, réfutation,
 * suite de la partie) ou on joue librement, et Stockfish (dans le navigateur) évalue chaque position atteinte.
 * Il prend la main sur un échiquier existant : l'écran qui l'ouvre lui délègue movable() et onMove().
 */
import { Chess, tryMove, uciOf, uciToObj, type Move } from '../core/chess';
import { winPct } from '../core/winpct';
import type { Color } from '../core/types';
import { mainEngine } from '../engine/stockfish';
import { Board } from '../ui/board';
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
    <div class="xhead"><b>Explorateur</b><span class="ev" id="xEval"></span><button class="iconbtn xclose" id="xClose" aria-label="Fermer l'explorateur">${icon('close')}</button></div>
    <div class="xbar" role="img" aria-label="Tes chances de gain"><b id="xBar" style="width:50%"></b></div>
    <p class="xeng" id="xEngine"></p>
    <p class="hint">Joue tes propres coups sur l'échiquier, ou touche un coup d'une variante.</p>
    <div class="explnav">${[['first', 'Position de départ', 'first'], ['prev', 'Coup précédent', 'back'], ['next', 'Coup suivant', 'chev'], ['last', 'Dernier coup', 'last']].map(([to, l, ic]) => `<button class="btn" data-x="${to}" aria-label="${l}">${icon(ic)}</button>`).join('')}</div>
    <div class="xlines">${lines.map((l, j) => `<div class="xline" data-j="${j}"><p class="flabel">${esc(l.label)}</p><p class="moves">${fmt(l.moves)}</p></div>`).join('')}
      <div class="xline" id="xMine" hidden><p class="flabel">Ta variante</p><p class="moves" id="xMineMoves"></p></div></div></div>`;
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
    const fen = g.fen(); let shown = 0, lastBest = '';
    // Le résultat s'affiche dès la première profondeur, puis s'affine : pas d'attente avant de voir une évaluation.
    const show = (e: { cp: number | null; mate: number | null; best: string | null; pv: string[] }) => {
      if (closed || my !== ticket) return;
      const sign = o.orient === 'w' ? 1 : -1, w = winPct(e.cp, e.mate), mine = Math.round(o.orient === 'w' ? w : 100 - w), cp = (e.cp ?? 0) * sign, mate = e.mate == null ? null : e.mate * sign;
      evalEl.textContent = mate != null ? (mate > 0 ? `Mat en ${mate}` : `Mat en ${-mate} contre toi`) : `${cp >= 0 ? '+' : '−'}${Math.abs(cp / 100).toFixed(1)}`;
      el.querySelector<HTMLElement>('#xBar')!.style.width = mine + '%';
      const t = new Chess(fen), sans: string[] = []; for (const u of e.pv.slice(0, 6)) { const m = tryMove(t, uciToObj(u)); if (!m) break; sans.push(m.san); }
      engEl.innerHTML = `<span class="xodds"><b>${mine} %</b> de chances pour toi</span>${sans.length ? `<span>Meilleur coup <b>${esc(sans[0])}</b>${sans.length > 1 ? `, puis ${esc(sans.slice(1).join(' '))}` : ''}</span>` : ''}`;
      if (e.best && e.best !== lastBest) { lastBest = e.best; board.overlay({ arrows: [{ from: e.best.slice(0, 2), to: e.best.slice(2, 4), cls: 'engine' }] }); }
    };
    timer = setTimeout(async () => {
      try {
        const eng = await mainEngine(); eng.stop();   // la recherche de la position précédente s'arrête tout de suite
        const e = await eng.eval(fen, 22, 2500, 1, r => { const now = Date.now(); if (r.depth >= 6 && now - shown > 150) { shown = now; show(r); } });
        show(e);
      } catch { if (!closed && my === ticket) engEl.textContent = "Le moteur n'a pas pu démarrer. Recharge la page pour réessayer."; }
    }, 120);
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

/* ---------- bouton de la barre du haut : le même sur tous les écrans où il y a une position ---------- */
type ToolState = 'hidden' | 'locked' | 'ready' | 'on';
let tool: { el: HTMLButtonElement; state: ToolState; why: string; toggle: (() => void) | null } | null = null;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
function toast(msg: string) {
  let t = document.getElementById('toast'); if (!t) { t = document.createElement('p'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t!.hidden = true; }, 2600);
}
/** À appeler une fois, avec le bouton de la barre du haut. */
export function mountTool(el: HTMLButtonElement) {
  tool = { el, state: 'hidden', why: '', toggle: null };
  el.addEventListener('click', () => { if (!tool) return; if (tool.state === 'locked') toast(tool.why); else tool.toggle?.(); });
}
export function setTool(state: ToolState, toggle: (() => void) | null = null, why = '') {
  if (!tool) return; Object.assign(tool, { state, toggle, why });
  tool.el.hidden = state === 'hidden'; tool.el.setAttribute('aria-pressed', String(state === 'on'));
  tool.el.setAttribute('aria-disabled', String(state === 'locked')); tool.el.title = state === 'locked' ? why : state === 'on' ? "Fermer l'explorateur" : 'Explorer les variantes';
  tool.el.setAttribute('aria-label', tool.el.title);
}

export type ExplorerOpts = Omit<Parameters<typeof createExplorer>[2], 'close'>;
/**
 * L'explorateur d'un écran : il s'ouvre à la place du panneau `main` (dans `panel`) par le bouton de la barre du haut,
 * et se referme par ce même bouton ou par la croix. `opts()` donne la position du moment ; `onClose` remet l'écran en état.
 */
export function explorerSlot(board: Board, main: () => HTMLElement, panel: () => HTMLElement, opts: () => ExplorerOpts, onClose: () => void) {
  let x: Explorer | null = null;
  const close = () => { if (!x) return; x.destroy(); x = null; const p = panel(); p.hidden = true; p.innerHTML = ''; main().hidden = false; onClose(); setTool('ready', open); };
  const open = () => { const p = panel(); main().hidden = true; p.hidden = false;
    x = createExplorer(board, p, { ...opts(), close }); setTool('on', close);
    if (p.getBoundingClientRect().top < 0) p.scrollIntoView({ block: 'start' }); };
  return {
    /** Indique si l'explorateur est proposé maintenant, et sinon pourquoi. */
    available(on: boolean, why = '') { if (x && !on) close(); if (!x) setTool(on ? 'ready' : 'locked', on ? open : null, why); },
    active: () => x,
    close,
    destroy() { x?.destroy(); x = null; setTool('hidden'); },
  };
}

/** Explorateur libre, depuis la position de départ : un échiquier, tes coups, l'avis du moteur. */
export function mountFreeExplorer(root: HTMLElement, back: string): () => void {
  root.innerHTML = '<div class="trainer"><div class="tboard"><div id="board"></div></div><div class="tside"><div id="xp"></div></div></div>';
  let x: Explorer | null = null;
  const board = new Board(root.querySelector<HTMLElement>('#board')!, { movable: () => x?.movable() ?? null, onMove: m => x?.onMove(m) });
  x = createExplorer(board, root.querySelector<HTMLElement>('#xp')!, { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', orient: 'w', lines: [], close: () => { location.hash = back; } });
  return () => { x?.destroy(); board.destroy(); };
}
