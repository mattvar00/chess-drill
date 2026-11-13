/** Stockfish natif (UCI) pour Node : un processus par moteur, une recherche à la fois. */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { RawEval } from '../src/core/analysis';

export interface EngineOpts { path?: string; threads?: number; hashMb?: number }

export class UciEngine {
  private p: ChildProcessWithoutNullStreams; private onLine: ((s: string) => void) | null = null; private mpv = 1;
  readonly ready: Promise<void>;
  constructor(o: EngineOpts = {}) {
    this.p = spawn(o.path || process.env.STOCKFISH || 'stockfish', [], { stdio: 'pipe' });
    createInterface({ input: this.p.stdout }).on('line', l => this.onLine?.(l));
    this.ready = new Promise((res, rej) => {
      this.p.once('error', rej);
      this.onLine = l => { if (l === 'uciok') { this.send(`setoption name Threads value ${o.threads ?? 1}`); this.send(`setoption name Hash value ${o.hashMb ?? 64}`); this.send('isready'); }
        else if (l === 'readyok') { this.onLine = null; res(); } };
      this.send('uci');
    });
  }
  private send(s: string) { this.p.stdin.write(s + '\n'); }

  /** Évalue une position ; scores ramenés au point de vue des Blancs. */
  async eval(fen: string, depth: number, multipv = 2, timeoutMs = 60_000): Promise<RawEval> {
    await this.ready;
    if (multipv !== this.mpv) { this.send(`setoption name MultiPV value ${multipv}`); this.mpv = multipv; }
    const black = fen.split(' ')[1] === 'b'; const lines: Record<number, { cp: number | null; mate: number | null; pv: string[] }> = {};
    return new Promise((res, rej) => {
      const t = setTimeout(() => { this.send('stop'); }, timeoutMs);
      this.onLine = s => {
        if (s.startsWith('info ') && s.includes(' score ') && s.includes(' pv ')) {
          const m = / score (cp|mate) (-?\d+)/.exec(s); if (!m || s.includes(' lowerbound') || s.includes(' upperbound')) return;
          const k = +((/ multipv (\d+)/.exec(s) || [0, 1])[1]); let v = +m[2]; if (black) v = -v;
          lines[k] = { cp: m[1] === 'cp' ? v : null, mate: m[1] === 'mate' ? v : null, pv: s.split(' pv ')[1].trim().split(' ') };
        } else if (s.startsWith('bestmove')) {
          clearTimeout(t); this.onLine = null; const best = s.split(' ')[1]; const l1 = lines[1], l2 = lines[2];
          if (!l1 && best === '(none)') return rej(new Error('aucun coup légal'));
          res({ cp: l1?.cp ?? 0, mate: l1?.mate ?? null, best: best === '(none)' ? null : best, pv: l1?.pv ?? [],
            alt: l2 ? { uci: l2.pv[0], cp: l2.cp, mate: l2.mate } : null });
        }
      };
      this.send(`position fen ${fen}`); this.send(`go depth ${depth}`);
    });
  }
  quit() { try { this.send('quit'); } catch { /* déjà fermé */ } this.p.kill(); }
}
