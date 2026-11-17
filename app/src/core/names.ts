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
export const lineTitle = (titre: string) => lineName(titre).title;
/** Étiquette d'une ligne tirée de tes parties. */
export const typeLabel = (t?: 'punir' | 'bon') => t === 'punir' ? 'Punir' : t === 'bon' ? 'Bon coup' : '';
