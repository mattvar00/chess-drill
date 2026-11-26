/** Types partagés de l'app. Un seul utilisateur aujourd'hui, mais tout est prêt pour en avoir plusieurs. */
export type Color = 'w' | 'b';
export type Result = 'W' | 'D' | 'L';
export type TimeClass = 'bullet' | 'blitz' | 'rapid' | 'daily';

/** Évaluation compacte d'une position (point de vue des Blancs). */
export interface EvalEntry {
  c: number | null;   // centipions
  m: number | null;   // mat en N (positif = les Blancs matent)
  b: string | null;   // meilleur coup (uci)
  p: string[];        // début de la ligne principale (uci)
  b2?: string;        // 2ᵉ meilleur coup
  c2?: number | null;
  m2?: number | null;
  deep?: 1;           // vérifié en profondeur
}

export type BookStatus = 'ok' | 'dev' | 'gap' | 'out' | 'nobook' | 'err';
export interface BookResult {
  status: BookStatus; depth: number; ply?: number; fen?: string;
  played?: string; playedUci?: string; expected?: { uci: string; san: string }[];
  branches?: string[] | null; soft?: boolean; transpo?: number;
}

export interface Game {
  id: string; url: string; t: number; tc: TimeClass | string; tcs: string; rr: string;
  color: Color; opp: string; oppElo: number; myElo: number; res: Result; eco: string;
  sans: string[]; clocks: (string | undefined)[]; nply: number;
  a: BookResult;
  ev?: EvalEntry[];
  st?: { acc: number | null; loss: number; blunder: number; mistake: number; inacc: number; depth: number; ph?: [number | null, number | null] };
  /** Chances des Blancs (0-100) avant chaque coup puis à la fin, et classe de chaque coup : envoyées avec la liste des parties analysées. */
  wp?: number[]; cls?: string[];
}

export interface RepMove { san: string; uci: string }
/** `type` : ligne tirée de tes parties. « punir » : l'adversaire s'est trompé, la ligne apprend la punition ; « bon » : tu t'es trompé, elle apprend le coup normal. */
/**
 * `type` : ligne tirée de tes parties (punition / bon coup). Les lignes d'un cours ont en plus un chapitre (`ch` : la réponse adverse
 * qu'elles traitent), un rôle (`role` : la théorie, ou une erreur classique de l'adversaire), une explication (`intro`) et les fautes de l'adversaire
 * (`marks` : demi-coup → « ? », « ?? » ou « ?! », affiché sur sa case), et tes fautes classiques à toi (`wrong` : demi-coup → mauvais coup → pourquoi il est mauvais).
 */
export interface Branch { id: string; titre: string; moves: RepMove[]; notes: Record<string, string>; type?: 'punir' | 'bon'; ch?: string; role?: 'theorie' | 'erreur'; /** Suite de la variante au milieu de jeu : le plan, joué contre les réponses courantes à ton niveau. */ plan?: boolean; intro?: string; marks?: Record<string, string>; wrong?: Record<string, Record<string, string>>; bilan?: string;
  /** `suite` : le plan une fois la variante jouée (« Et après »). */
  suite?: string;
  /** `pop` : nombre de parties Lichess de joueurs entre 1600 et 2000 qui passent par la variante, pour dire lesquelles comptent le plus. */
  pop?: number;
  /** `plus` : variante rare, hors du chemin : elle se travaille après la dame (« Pour aller plus loin »). */
  plus?: boolean;
  /** `nom` : le nom officiel de la variante, en français (d'après lichess-org/chess-openings, CC0). */
  nom?: string }
export interface System { id: string; titre: string; statut: string; resume: string; branches: Branch[];
  /** Part des parties (à ton niveau) où l'adversaire choisit chaque réponse : nom du chapitre → fraction. */
  shares?: Record<string, number> }
export interface Bloc { id: string; titre: string; sous: string; side: Color; systemes: System[] }
export interface Repertoire { version: number; blocs: Bloc[]; faults: unknown[] }

/** Répétition espacée d'une ligne du répertoire. */
export interface BranchState { clean: number; runs: number; last: number; due: number; ivl: number; ease: number; fails: number; devs?: number; freq?: number; prob?: number }
/** Répétition espacée d'une position d'exercice. */
export interface PosState { ivl?: number; ease?: number; reps?: number; lapses?: number; last?: number; due?: number; done?: boolean; shown?: boolean; tries?: number; pm?: number }
