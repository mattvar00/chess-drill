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
  st?: { acc: number | null; loss: number; blunder: number; mistake: number; inacc: number; depth: number };
}

export interface RepMove { san: string; uci: string }
export interface Branch { id: string; titre: string; moves: RepMove[]; notes: Record<string, string> }
export interface System { id: string; titre: string; statut: string; resume: string; branches: Branch[] }
export interface Bloc { id: string; titre: string; sous: string; side: Color; systemes: System[] }
export interface Repertoire { version: number; blocs: Bloc[]; faults: unknown[] }

/** Répétition espacée d'une ligne du répertoire. */
export interface BranchState { clean: number; runs: number; last: number; due: number; ivl: number; ease: number; fails: number; devs?: number; freq?: number; prob?: number }
/** Répétition espacée d'une position d'exercice. */
export interface PosState { ivl?: number; ease?: number; reps?: number; lapses?: number; last?: number; due?: number; done?: boolean; shown?: boolean; tries?: number; pm?: number }
