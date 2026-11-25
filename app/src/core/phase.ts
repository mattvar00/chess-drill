/**
 * La phase d'une position, d'après le matériel : une seule définition pour toute l'app (fautes, bilans, précision par phase).
 * Inspirée du « Divider » de Lichess :
 * - finale : 6 pièces ou moins sur l'échiquier, rois et pions non comptés ;
 * - milieu de partie : 10 pièces ou moins, ou un camp qui a vidé sa première rangée (moins de 4 pièces dessus) ;
 * - ouverture sinon, jusqu'au 12e coup au plus (après, une position encore pleine est un milieu de partie bloqué, pas une ouverture).
 */
export type Phase = 'ouv' | 'mil' | 'fin';
export const PHASE_LABEL: Record<Phase, string> = { ouv: 'ouverture', mil: 'milieu de partie', fin: 'finale' };

export function phaseOf(fen: string): Phase {
  const rows = fen.split(' ')[0].split('/');
  let minorsMajors = 0;
  for (const ch of rows.join('')) if ('nbrqNBRQ'.includes(ch)) minorsMajors++;
  if (minorsMajors <= 6) return 'fin';
  const onRank = (row: string, white: boolean) => { let n = 0; for (const ch of row) if (/[a-z]/i.test(ch) && (ch === ch.toUpperCase()) === white && ch.toLowerCase() !== 'p') n++; return n; };
  const sparse = onRank(rows[7], true) < 4 || onRank(rows[0], false) < 4;
  const move = parseInt(fen.split(' ')[5]) || 1;
  return minorsMajors <= 10 || sparse || move > 12 ? 'mil' : 'ouv';
}

/**
 * Où commencent le milieu de partie et la finale dans une suite de positions (demi-coups, `null` si jamais atteints).
 * La phase n'avance que dans un sens : une fois en finale, la partie y reste.
 */
export function phaseBounds(fens: string[]): [number | null, number | null] {
  let mid: number | null = null, end: number | null = null;
  fens.forEach((fen, i) => { const p = phaseOf(fen);
    if (p !== 'ouv' && mid == null) mid = i;
    if (p === 'fin' && end == null) { end = i; if (mid == null) mid = i; } });
  return [mid, end];
}

/** Phase au demi-coup `ply` d'une partie : d'après les bornes calculées à l'analyse, sinon d'après le numéro du coup (10e et 30e coups). */
export function phaseAt(ply: number, bounds?: [number | null, number | null] | null): Phase {
  if (!bounds) return ply < 20 ? 'ouv' : ply < 60 ? 'mil' : 'fin';
  const [m, f] = bounds;
  return f != null && ply >= f ? 'fin' : m != null && ply >= m ? 'mil' : 'ouv';
}
