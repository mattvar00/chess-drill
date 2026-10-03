/**
 * Stockfish 19 dans des Web Workers.
 *  - une recherche à la fois par moteur (les appels sont mis en file : c'est ce qui évitait les plantages « unreachable ») ;
 *  - MultiPV : on garde aussi le 2ᵉ meilleur coup ;
 *  - multicœur quand la page est « cross-origin isolated » (en-têtes COOP/COEP de Cloudflare Pages), sinon plusieurs moteurs mono-thread en parallèle.
 */
import { cleanFen } from '../core/chess';
import type { EvalEntry } from '../core/types';

export interface EngineResult { cp: number | null; mate: number | null; best: string | null; pv: string[]; alt: { uci: string; cp: number | null; mate: number | null } | null }
export const canThread = () => typeof SharedArrayBuffer !== 'undefined' && (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated === true;
const BASE = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL || './';

export class Engine {
  private w: Worker; private handler: ((s: string) => void) | null = null; private q: Promise<unknown> = Promise.resolve(); private mpv = 1;
  readonly ready: Promise<void>; dead = false; readonly threads: number;
  constructor(threads = 1) {
    this.threads = threads;
    this.w = new Worker(BASE + (threads > 1 ? 'engine/stockfish-19-lite.js' : 'engine/stockfish-19-lite-single.js'));
    this.ready = new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('moteur : délai dépassé')), 60000);
      this.w.onmessage = e => { const s = String(e.data);
        if (s === 'uciok') { this.w.postMessage('setoption name Hash value ' + (threads > 1 ? 64 : 16)); if (threads > 1) this.w.postMessage('setoption name Threads value ' + threads); this.w.postMessage('isready'); }
        else if (s === 'readyok') { clearTimeout(t); this.w.onmessage = ev => this.handler && this.handler(String(ev.data)); res(); } };
      this.w.onerror = e => { e.preventDefault(); this.dead = true; rej(new Error('moteur : ' + (e.message || 'erreur'))); if (this.fail) this.fail(new Error('crash')); };
      this.w.postMessage('uci');
    });
  }
  private fail: ((e: Error) => void) | null = null;
  /** Évalue une position (scores du point de vue des Blancs). */
  eval(fen: string, depth: number, movetime: number, multipv = 1): Promise<EngineResult> {
    const run = () => this.run(fen, depth, movetime, multipv); const p = this.q.then(run, run); this.q = p.catch(() => {}); return p;
  }
  private run(fen: string, depth: number, movetime: number, multipv: number): Promise<EngineResult> {
    return new Promise((res, rej) => {
      if (multipv !== this.mpv) { this.w.postMessage('setoption name MultiPV value ' + multipv); this.mpv = multipv; }
      const lines: Record<number, { cp: number | null; mate: number | null; pv: string[] }> = {}; const stm = fen.split(' ')[1];
      const wd = setTimeout(() => { this.handler = null; rej(new Error('timeout')); }, movetime * 8 + 8000);
      this.fail = err => { clearTimeout(wd); this.handler = null; rej(err); };
      this.handler = s => {
        if (s.startsWith('info ') && s.includes(' score ') && s.includes(' pv ')) {
          const m = / score (cp|mate) (-?\d+)/.exec(s); if (!m) return; const k = +((/ multipv (\d+)/.exec(s) || [0, 1])[1]);
          let cp: number | null = null, mate: number | null = null; if (m[1] === 'cp') cp = +m[2]; else mate = +m[2];
          if (stm === 'b') { if (cp !== null) cp = -cp; if (mate !== null) mate = -mate; }
          lines[k] = { cp, mate, pv: s.split(' pv ')[1].split(' ') };
        } else if (s.startsWith('bestmove')) { clearTimeout(wd); this.handler = null; const best = s.split(' ')[1]; const l = lines[1], a = lines[2];
          res({ cp: l ? l.cp : 0, mate: l ? l.mate : null, best: best === '(none)' ? null : best, pv: l ? l.pv : [], alt: a ? { uci: a.pv[0], cp: a.cp, mate: a.mate } : null }); }
      };
      this.w.postMessage('position fen ' + cleanFen(fen)); this.w.postMessage(`go depth ${depth} movetime ${movetime}`);
    });
  }
  kill() { try { this.w.terminate(); } catch { /* déjà arrêté */ } }
}
export const toEntry = (e: EngineResult, deep = false): EvalEntry => {
  const o: EvalEntry = { c: e.cp, m: e.mate, b: e.best, p: e.pv.slice(0, 4) }; if (e.alt) { o.b2 = e.alt.uci; o.c2 = e.alt.cp; o.m2 = e.alt.mate; } if (deep) o.deep = 1; return o;
};
/** Nombre de moteurs en parallèle quand on n'a pas le multicœur. */
export function laneCount(): number { const hc = navigator.hardwareConcurrency || 2; const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent); return Math.max(1, Math.min(mobile ? 2 : 4, hc - 1)); }

let main: Engine | null = null;
/** Moteur principal (interactif). Multicœur si possible. */
export async function mainEngine(): Promise<Engine> {
  if (main && !main.dead) { await main.ready; return main; }
  const threads = canThread() ? Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 2) - 1)) : 1;
  main = new Engine(threads); try { await main.ready; } catch (e) { main = null; throw e; } return main;
}
/** Vérification en profondeur ; en cas de plantage, on relance le moteur et on réessaie moins profond. */
export async function deepEval(fen: string, depth: number, movetime: number): Promise<EvalEntry | null> {
  for (const [d, mpv] of [[depth + 6, 2], [depth + 3, 1]] as const) {
    try { const e = await mainEngine(); return toEntry(await e.eval(fen, d, Math.max(1200, movetime * 4), mpv), true); }
    catch { if (main) main.kill(); main = null; }
  }
  return null;
}
