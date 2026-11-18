/** Noms affichés : les titres de lignes du répertoire dits plus simplement. Logique pure. */

/** Références internes laissées dans certains titres : « (ta g26) », « (ta partie du 13/09) », « (ta partie g18) ». */
const REF = /\s*\(ta (?:partie[^)]*|g\d+)\)/gi;
const startsWithMoves = (s: string) => /^\d+\s*[.…]/.test(s.trim());
/** Une vraie idée en mots (« reprendre en f6 », « transposition Meran »), pas seulement des coups (« ...Bb7, ...b4 »). */
const hasWords = (s: string) => s.split(/[\s,;:()]+/).some(w => /^[a-zàâçéèêëîïôûùüÿœ'’-]{4,}$/i.test(w) && !/^O-O/.test(w));

/**
 * Titre d'une ligne en deux parties : l'idée d'abord, le détail (les coups) ensuite.
 * « 5.Nc3 e5 6.Nxc6 bxc6 7.Bg5 Rb8 ! — reprendre en f6 avec la dame » → idée « Reprendre en f6 avec la dame », détail « 5.Nc3 … Rb8 ! ».
 * Un titre qui commence par un nom (« Meran 8.Bd3 — … ») garde ce nom en tête.
 */
export function lineName(titre: string): { title: string; detail: string } {
  const t = titre.replace(REF, '').replace(/\s+/g, ' ').trim();
  const k = t.indexOf(' — ');
  if (k < 0) return { title: t, detail: '' };
  const left = t.slice(0, k).trim(), right = t.slice(k + 3).trim();
  if (startsWithMoves(left) && hasWords(right)) return { title: right.charAt(0).toUpperCase() + right.slice(1), detail: left };
  return { title: left, detail: right };
}
/** Le titre seul, sans références internes : pour les en-têtes et les bulles. */
/** Le titre d'une variante en mots seulement : « Il s'accroche au pion : 3…b5 ?! » → « Il s'accroche au pion ». Les coups restent dans le détail. */
export function plainName(titre: string): { title: string; detail: string } {
  const n = lineName(titre), k = n.title.lastIndexOf(' : ');
  if (k > 0 && /^[\d…(]|^[KQRBN]?[a-h]?x?[a-h][1-8]|^O-O/.test(n.title.slice(k + 3).trim()) && /\p{L}{3}/u.test(n.title.slice(0, k)))
    return { title: n.title.slice(0, k).replace(/\s*[?!]+$/, '').trim(), detail: n.detail || n.title.slice(k + 3).trim() };
  return { title: n.title.replace(/\s+[?!]{1,2}$/, ''), detail: n.detail };
}
export const lineTitle = (titre: string) => plainName(titre).title;
/** Étiquette d'une variante de cours : ce que joue la théorie, ou une erreur classique de l'adversaire. */
export const roleLabel = (r?: 'theorie' | 'erreur') => r === 'theorie' ? 'Théorie' : r === 'erreur' ? 'Piège' : '';
const PIECE: Record<string, string> = { N: 'le cavalier', B: 'le fou', R: 'la tour', Q: 'la dame', K: 'le roi' };
/** Un coup dit en mots, comme le dirait un coach : « Joue le cavalier en f3. », « Prends en a8 avec la tour. », « Roque. » */
export function tell(m: { san: string; uci: string }): string {
  if (m.san.startsWith('O-O-O')) return 'Fais le grand roque.';
  if (m.san.startsWith('O-O')) return 'Roque.';
  const piece = PIECE[m.san[0]] ?? 'le pion', from = m.uci.slice(0, 2), to = m.uci.slice(2, 4);
  const which = /^[NBRQ][a-h1-8]x?[a-h][1-8]/.test(m.san) ? `${piece} ${from}` : piece;   // deux pièces pouvaient y aller : on dit laquelle
  return m.san.includes('x') ? `Prends en ${to} avec ${which}.` : `Joue ${which} en ${to}.`;
}
/** Étiquette d'une ligne tirée de tes parties. */
export const typeLabel = (t?: 'punir' | 'bon') => t === 'punir' ? 'Punir' : t === 'bon' ? 'Bon coup' : '';

/** À quel point une variante est jouée à ton niveau (parties Lichess entre 1600 et 2000, blitz et rapide) : 0 inconnu, 1 rare, 2 jouée, 3 très jouée. */
export const popLevel = (pop?: number): 0 | 1 | 2 | 3 => pop == null ? 0 : pop >= 100000 ? 3 : pop >= 5000 ? 2 : 1;
export const popLabel = (pop?: number) => ['', 'rare à ton niveau', 'jouée à ton niveau', 'très jouée à ton niveau'][popLevel(pop)];
/** Trois petites barres, comme un signal : plus il y en a de pleines, plus la variante est jouée. */
export const popBars = (pop?: number) => { const l = popLevel(pop); return l ? `<span class="pop p${l}" role="img" aria-label="${popLabel(pop)}" title="${popLabel(pop)}"><i></i><i></i><i></i></span>` : ''; };

/** Le nom d'une variante sans celui de sa famille (on est déjà dans le cours) : « Slave, variante d'échange » → « Variante d'échange ». */
export const shortNom = (nom: string) => { const p = nom.split(', '), t = (p.length > 1 ? p.slice(1).slice(-2) : p).join(', '); return t.charAt(0).toUpperCase() + t.slice(1); };
