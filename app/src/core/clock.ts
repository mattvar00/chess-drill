/** Pendules chess.com (%clk) et temps par coup. */
export function clkSec(s?: string | null): number | null {
  if (!s) return null; const p = s.split(':').map(Number);
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : p[0];
}
export function tcParse(tcs?: string): { base: number; inc: number } {
  const m = /^(\d+)(?:\+(\d+))?/.exec(tcs || ''); return m ? { base: +m[1], inc: +(m[2] || 0) } : { base: 0, inc: 0 };
}
/** Temps passé sur chaque demi-coup (null si inconnu). */
export function plyTimes(clocks: (string | undefined)[], tcs: string, n: number): (number | null)[] {
  const { base, inc } = tcParse(tcs); const out: (number | null)[] = [];
  for (let i = 0; i < n; i++) { const cu = clkSec(clocks[i]), pr = i >= 2 ? clkSec(clocks[i - 2]) : base;
    out.push(cu != null && pr != null && base ? Math.max(0, pr - cu + inc) : null); }
  return out;
}
