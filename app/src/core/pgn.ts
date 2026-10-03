/** Lecture des PGN chess.com : coups SAN et pendules. */
export function parsePgnMoves(pgn: string): { sans: string[]; clocks: (string | undefined)[] } {
  const body = pgn.replace(/^\[.*\]\s*$/gm, '').replace(/\{[^}]*\}/g, m => { const c = /%clk\s+([\d:.]+)/.exec(m); return c ? ` @${c[1]} ` : ' '; });
  const toks = body.replace(/\([^)]*\)/g, ' ').split(/\s+/).filter(Boolean);
  const sans: string[] = [], clocks: (string | undefined)[] = [];
  for (const t of toks) {
    if (/^\d+\.+$/.test(t)) continue;
    if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t)) break;
    if (t[0] === '@') { clocks[sans.length - 1] = t.slice(1); continue; }
    if (t[0] === '$') continue;
    sans.push(t.replace(/^\d+\.+/, '').replace(/[!?]+$/, ''));
  }
  return { sans: sans.filter(Boolean), clocks };
}
/** Tags d'un PGN. */
export function pgnTag(pgn: string, name: string): string { const m = new RegExp('^\\[' + name + '\\s+"([^"]*)"', 'm').exec(pgn); return m ? m[1] : ''; }
