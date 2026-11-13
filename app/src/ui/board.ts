/** Échiquier : toucher-toucher ou glisser-déposer, animation du dernier coup, sons. */
import { Chess, type Move } from '../core/chess';
import type { Color } from '../core/types';
import piecesJson from '../data/pieces.json';
import { SFX, unlockAudio } from './sound';

const PIECES = piecesJson as Record<string, string>;
const FILES = 'abcdefgh';
export interface BoardOpts {
  /** Un coup légal a été joué sur le plateau (il n'est pas encore appliqué à la partie). */
  onMove(m: Move): void;
  /** Couleur que l'utilisateur peut déplacer maintenant, ou null si le plateau est verrouillé. */
  movable(): Color | null;
}
interface Drag { from: string; ghost: HTMLElement; img: HTMLElement; w: number; moved: boolean; wasSel: boolean; x0: number; y0: number }

export class Board {
  private game = new Chess(); private orient: Color = 'w'; private built: Color | null = null;
  private last: Move | null = null; private sel: string | null = null; private legal: Move[] = [];
  private drag: Drag | null = null; private dropped = false;

  constructor(private el: HTMLElement, private o: BoardOpts) { el.classList.add('board'); }

  /** Affiche une position. `animate` : fait glisser la pièce du dernier coup et joue son bruit. */
  set(game: Chess, orient: Color, last: Move | null = null, animate = false) {
    this.game = game; this.last = last; this.sel = null; this.legal = [];
    if (this.built !== orient) { this.orient = orient; this.build(); }
    this.render();
    if (animate && last) {
      if (!this.dropped) { this.slide(last.from, last.to);
        if (last.flags.includes('k') || last.flags.includes('q')) { const r = last.color === 'w' ? '1' : '8', k = last.flags.includes('k'); this.slide((k ? 'h' : 'a') + r, (k ? 'f' : 'd') + r); } }
      SFX.forMove(last);
    }
    this.dropped = false;
  }
  flash(sq: string, cls: 'good' | 'bad') { const e = this.sq(sq); if (!e) return; e.classList.remove(cls); void e.offsetWidth; e.classList.add(cls); if (cls === 'bad') SFX.bad(); }
  /** Met des cases en évidence (indice). */
  hint(squares: string[]) { this.sel = null; this.legal = []; this.render(); for (const s of squares) this.sq(s)?.classList.add('hint'); }

  private sq(s: string) { return this.el.querySelector<HTMLElement>(`[data-sq="${s}"]`); }
  private build() {
    this.built = this.orient; this.el.innerHTML = '';
    const ranks = this.orient === 'w' ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
    const files = this.orient === 'w' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
    for (const r of ranks) for (const f of files) {
      const sq = FILES[f] + r, d = document.createElement('div');
      d.className = 'sq ' + ((f + r) % 2 === 1 ? 'd' : 'l'); d.dataset.sq = sq;
      if (r === ranks[7]) d.insertAdjacentHTML('beforeend', `<span class="co f">${FILES[f]}</span>`);
      if (f === files[0]) d.insertAdjacentHTML('beforeend', `<span class="co r">${r}</span>`);
      d.addEventListener('pointerdown', ev => this.down(ev, sq));
      this.el.appendChild(d);
    }
  }
  private render() {
    this.el.querySelectorAll<HTMLElement>('.sq').forEach(e => {
      const sq = e.dataset.sq!; e.querySelectorAll('img').forEach(i => i.remove());
      e.classList.remove('sel', 'dot', 'cap', 'last', 'hint', 'hover');
      const p = this.game.get(sq as never);
      if (p) { const img = document.createElement('img'); img.src = PIECES[p.color + p.type]; img.alt = ''; img.draggable = false; e.appendChild(img); }
      if (this.last && (sq === this.last.from || sq === this.last.to)) e.classList.add('last');
    });
    if (this.sel) { this.sq(this.sel)?.classList.add('sel'); for (const m of this.legal) this.sq(m.to)?.classList.add(m.captured ? 'cap' : 'dot'); }
  }
  private slide(from: string, to: string) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const a = this.sq(from), b = this.sq(to), img = b?.querySelector('img'); if (!a || !b || !img) return;
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(), dx = ra.left - rb.left, dy = ra.top - rb.top; if (!dx && !dy) return;
    img.style.transition = 'none'; img.style.transform = `translate(${dx}px,${dy}px)`; img.style.zIndex = '5'; void img.offsetWidth;
    img.style.transition = 'transform 150ms ease-out'; img.style.transform = 'translate(0,0)'; setTimeout(() => { img.style.zIndex = ''; }, 170);
  }

  private select(sq: string) { this.sel = sq; this.legal = this.game.moves({ square: sq as never, verbose: true }); }
  private play(to: string): boolean {
    const c = this.legal.filter(m => m.to === to); if (!c.length) return false;
    const m = c.find(x => x.promotion === 'q') ?? c[0];   // promotion : dame par défaut
    this.sel = null; this.legal = []; this.o.onMove(m); return true;
  }
  private down(ev: PointerEvent, sq: string) {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    unlockAudio(); const side = this.o.movable(); if (!side) return;
    if (this.sel && this.sel !== sq && this.legal.some(m => m.to === sq)) { ev.preventDefault(); this.play(sq); return; }
    const p = this.game.get(sq as never);
    if (!p || p.color !== side) { this.sel = null; this.legal = []; this.render(); return; }
    ev.preventDefault(); const wasSel = this.sel === sq; this.select(sq); this.render();
    const e = this.sq(sq)!, img = e.querySelector('img'); if (!img) return; const r = e.getBoundingClientRect();
    const ghost = img.cloneNode() as HTMLElement; ghost.className = 'ghost'; ghost.style.width = ghost.style.height = r.width + 'px'; document.body.appendChild(ghost); img.style.opacity = '0.35';
    this.drag = { from: sq, ghost, img, w: r.width, moved: false, wasSel, x0: ev.clientX, y0: ev.clientY }; this.place(ev.clientX, ev.clientY);
    window.addEventListener('pointermove', this.onMove, { passive: false }); window.addEventListener('pointerup', this.onUp); window.addEventListener('pointercancel', this.onCancel);
  }
  private place(x: number, y: number) { const d = this.drag; if (d) { d.ghost.style.left = x - d.w / 2 + 'px'; d.ghost.style.top = y - d.w / 2 + 'px'; } }
  private at(x: number, y: number): string | null {
    const e = document.elementsFromPoint(x, y).find(n => n instanceof HTMLElement && n.classList.contains('sq') && this.el.contains(n)) as HTMLElement | undefined; return e?.dataset.sq ?? null;
  }
  private onMove = (ev: PointerEvent) => {
    const d = this.drag; if (!d) return; ev.preventDefault(); if (Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) > 6) d.moved = true; this.place(ev.clientX, ev.clientY);
    this.el.querySelectorAll('.hover').forEach(e => e.classList.remove('hover')); const s = this.at(ev.clientX, ev.clientY); if (s && this.legal.some(m => m.to === s)) this.sq(s)?.classList.add('hover');
  };
  private endDrag() {
    window.removeEventListener('pointermove', this.onMove); window.removeEventListener('pointerup', this.onUp); window.removeEventListener('pointercancel', this.onCancel);
    const d = this.drag; this.drag = null; if (d) { d.ghost.remove(); d.img.style.opacity = ''; } return d;
  }
  private onUp = (ev: PointerEvent) => {
    const d = this.endDrag(); if (!d) return; const to = this.at(ev.clientX, ev.clientY);
    if (to && to !== d.from && this.legal.some(m => m.to === to)) { this.dropped = d.moved; this.play(to); return; }
    if (to === d.from && !d.moved && d.wasSel) { this.sel = null; this.legal = []; }
    this.render();
  };
  private onCancel = () => { this.endDrag(); this.render(); };
  /** À appeler quand l'écran est quitté en plein glisser. */
  destroy() { this.endDrag(); }
}
