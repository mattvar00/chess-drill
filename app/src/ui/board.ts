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
/** Glisser en cours. `box` : le plateau mesuré au toucher, pour trouver la case sous le doigt sans interroger le DOM à chaque mouvement. */
interface Drag { from: string; ghost: HTMLElement; img: HTMLElement; w: number; moved: boolean; wasSel: boolean; x0: number; y0: number; box: DOMRect; hover: string | null; x: number; y: number }

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

  /**
   * Dessine par-dessus la position (à rappeler après chaque `set`) : flèches, cases colorées, pastille sur une case.
   * `cls` choisit la couleur (classes CSS .arr-*, .mk-*, .mvb-*).
   */
  overlay(o: { arrows?: { from: string; to: string; cls: string }[]; marks?: { sq: string; cls: string }[]; badge?: { sq: string; text: string; cls: string; label: string } | null }) {
    for (const m of o.marks ?? []) this.sq(m.sq)?.classList.add('mk', 'mk-' + m.cls);
    if (o.badge) this.sq(o.badge.sq)?.insertAdjacentHTML('beforeend', `<span class="mvb mvb-${o.badge.cls}" role="img" aria-label="${o.badge.label}">${o.badge.text}</span>`);
    const c = (s: string): [number, number] => { const f = FILES.indexOf(s[0]), r = +s[1]; return this.orient === 'w' ? [(f + 0.5) * 100, (8 - r + 0.5) * 100] : [(7 - f + 0.5) * 100, (r - 0.5) * 100]; };
    this.svg.innerHTML = (o.arrows ?? []).map(a => { const [x1, y1] = c(a.from), [x2, y2] = c(a.to), dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1;
      const ex = x2 - (dx / L) * 34, ey = y2 - (dy / L) * 34, nx = -dy / L, ny = dx / L;   // la tige s'arrête sous la pointe
      return `<g class="arr arr-${a.cls}"><line x1="${x1}" y1="${y1}" x2="${ex}" y2="${ey}"/><polygon points="${x2},${y2} ${ex + nx * 26},${ey + ny * 26} ${ex - nx * 26},${ey - ny * 26}"/></g>`; }).join('');
  }
  private svg!: SVGSVGElement;
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
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); this.svg.setAttribute('viewBox', '0 0 800 800'); this.svg.classList.add('arrows'); this.svg.setAttribute('aria-hidden', 'true');
    this.el.appendChild(this.svg);
  }
  private render() {
    this.el.querySelectorAll<HTMLElement>('.sq').forEach(e => {
      const sq = e.dataset.sq!; e.querySelectorAll('img, .mvb').forEach(i => i.remove());
      e.classList.remove('sel', 'dot', 'cap', 'last', 'hint', 'hover', 'mk'); e.className = e.className.replace(/\bmk-\S+/g, '').trim();
      const p = this.game.get(sq as never);
      if (p) { const img = document.createElement('img'); img.src = PIECES[p.color + p.type]; img.alt = ''; img.draggable = false; e.appendChild(img); }
      if (this.last && (sq === this.last.from || sq === this.last.to)) e.classList.add('last');
    });
    this.svg.innerHTML = '';
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
  /** Met à jour la sélection et les cases jouables sans retoucher les pièces (bien plus rapide qu'un rendu complet). */
  private marks() {
    this.el.querySelectorAll('.sel, .dot, .cap, .hover').forEach(e => e.classList.remove('sel', 'dot', 'cap', 'hover'));
    if (this.sel) { this.sq(this.sel)?.classList.add('sel'); for (const m of this.legal) this.sq(m.to)?.classList.add(m.captured ? 'cap' : 'dot'); }
  }
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
    if (!p || p.color !== side) { this.sel = null; this.legal = []; this.marks(); return; }
    ev.preventDefault(); const wasSel = this.sel === sq; this.select(sq); this.marks();
    const e = this.sq(sq)!, img = e.querySelector('img'); if (!img) return; const r = e.getBoundingClientRect();
    const ghost = img.cloneNode() as HTMLElement; ghost.className = 'ghost'; ghost.style.width = ghost.style.height = r.width + 'px'; document.body.appendChild(ghost); img.style.opacity = '0.35';
    this.drag = { from: sq, ghost, img, w: r.width, moved: false, wasSel, x0: ev.clientX, y0: ev.clientY, box: this.el.getBoundingClientRect(), hover: null, x: ev.clientX, y: ev.clientY }; this.place();
    window.addEventListener('pointermove', this.onMove, { passive: false }); window.addEventListener('pointerup', this.onUp); window.addEventListener('pointercancel', this.onCancel);
  }
  /** Pose la pièce tenue sous le doigt : une transformation seulement (pas de recalcul de mise en page). */
  private place() { const d = this.drag; if (d) d.ghost.style.transform = `translate3d(${d.x - d.w / 2}px,${d.y - d.w / 2}px,0) scale(1.15)`; }
  /** Case sous un point de l'écran, calculée depuis la géométrie du plateau. */
  private at(x: number, y: number, box = this.el.getBoundingClientRect()): string | null {
    const c = Math.floor(((x - box.left) / box.width) * 8), r = Math.floor(((y - box.top) / box.height) * 8);
    if (c < 0 || c > 7 || r < 0 || r > 7) return null;
    return this.orient === 'w' ? FILES[c] + (8 - r) : FILES[7 - c] + (r + 1);
  }
  private onMove = (ev: PointerEvent) => {
    const d = this.drag; if (!d) return; ev.preventDefault(); if (!d.moved && Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) > 6) d.moved = true;
    d.x = ev.clientX; d.y = ev.clientY; this.place();
    const s = this.at(d.x, d.y, d.box), h = s && this.legal.some(m => m.to === s) ? s : null;
    if (h !== d.hover) { if (d.hover) this.sq(d.hover)?.classList.remove('hover'); if (h) this.sq(h)?.classList.add('hover'); d.hover = h; }
  };
  private endDrag() {
    window.removeEventListener('pointermove', this.onMove); window.removeEventListener('pointerup', this.onUp); window.removeEventListener('pointercancel', this.onCancel);
    const d = this.drag; this.drag = null; if (d) { d.ghost.remove(); d.img.style.opacity = ''; if (d.hover) this.sq(d.hover)?.classList.remove('hover'); } return d;
  }
  private onUp = (ev: PointerEvent) => {
    const d = this.endDrag(); if (!d) return; const to = this.at(ev.clientX, ev.clientY, d.box);
    if (to && to !== d.from && this.legal.some(m => m.to === to)) { this.dropped = d.moved; this.play(to); return; }
    if (to === d.from && !d.moved && d.wasSel) { this.sel = null; this.legal = []; }
    this.marks();
  };
  private onCancel = () => { this.endDrag(); this.marks(); };
  /** À appeler quand l'écran est quitté en plein glisser. */
  destroy() { this.endDrag(); }
}

/** Petit échiquier fixe (aperçu d'une position). */
export function miniBoard(game: Chess, orient: Color): string {
  const ranks = orient === 'w' ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8], files = orient === 'w' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  let h = '';
  for (const r of ranks) for (const f of files) { const p = game.get((FILES[f] + r) as never); h += `<i class="${(f + r) % 2 === 1 ? 'd' : 'l'}">${p ? `<img src="${PIECES[p.color + p.type]}" alt="">` : ''}</i>`; }
  return `<span class="mini" aria-hidden="true">${h}</span>`;
}

/** Petit échiquier à partir d'une position écrite (FEN). `only` : ne montrer que ces pièces, par exemple « p » pour la structure de pions. */
export function miniFen(fen: string, orient: Color, only?: string): string {
  const rows = fen.split(' ')[0].split('/').map(r => { const out: string[] = []; for (const ch of r) { if (/\d/.test(ch)) for (let k = 0; k < +ch; k++) out.push(''); else out.push(ch); } return out; });
  let h = '';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const r = orient === 'w' ? y : 7 - y, f = orient === 'w' ? x : 7 - x, ch = rows[r]?.[f] ?? '', show = ch && (!only || only.includes(ch.toLowerCase()));
    h += `<i class="${(r + f) % 2 === 1 ? 'd' : 'l'}">${show ? `<img src="${PIECES[(ch === ch.toUpperCase() ? 'w' : 'b') + ch.toLowerCase()]}" alt="">` : ''}</i>`; }
  return `<span class="mini" aria-hidden="true">${h}</span>`;
}
