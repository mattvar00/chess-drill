/**
 * Le contenu des leçons de finales : le cours (quelques écrans avec le plan dessiné) et les positions d'entraînement.
 * Chaque position a été passée à la table de finales : le camp au trait gagne (ou tient la nulle) comme la leçon le demande.
 * Les écrans du cours partent de la position de la leçon (ou de `fen`), après les coups `pre`.
 * `arrows` : le coup à jouer (vert, vérifié à la table) ; `plan` : la suite du plan (orange) ; `bad` : le coup à éviter (rouge) ;
 * `keys` : les cases importantes ; `zone` : une zone à voir (le carré du pion).
 */
export interface Slide { fen?: string; pre?: string[]; t: string; arrows?: string[]; plan?: string[]; bad?: string[]; keys?: string[]; zone?: string[] }

/** Toutes les cases d'un rectangle, de `a` à `b` (« d4 », « h8 »). */
const box = (a: string, b: string) => { const out: string[] = []; for (let f = Math.min(a.charCodeAt(0), b.charCodeAt(0)); f <= Math.max(a.charCodeAt(0), b.charCodeAt(0)); f++) for (let r = Math.min(+a[1], +b[1]); r <= Math.max(+a[1], +b[1]); r++) out.push(String.fromCharCode(f) + r); return out; };

export const COURS: Record<string, { cours: Slide[]; pos: string[] }> = {
  derriere: { pos: ['8/8/3kP1R1/8/7p/5Kp1/8/4r3 w - - 0 1', '4R3/8/5kP1/7P/8/3Kp1r1/8/8 b - - 0 1', '8/8/4R1Pk/8/3p4/4pK2/8/6r1 w - - 0 1', '8/2R5/3Pk3/8/p7/1pK5/8/3r4 w - - 0 1'], cours: [
    { t: 'Il a deux pions passés, a4 et b3. Ta tour b6 ne fait que les regarder : un seul coup tient la nulle.', keys: ['a4', 'b3'] },
    { t: 'Ra6 ! Ta tour se met derrière le pion a. Plus il avance, plus ta tour a de cases pour le suivre.', arrows: ['b6a6'] },
    { pre: ['Ra6', 'Ra1'], t: 'Il protège son pion par devant. Kb2 : ton roi attaque sa tour et bloque le pion b3.', arrows: ['c3b2'], keys: ['b3'] },
  ] },
  colle: { pos: ['8/8/8/3K4/1kp5/8/2r5/1R6 b - - 0 1', '1r6/2R5/8/1KP5/3k4/8/8/8 w - - 0 1', '8/8/8/3K4/4pk2/8/4r3/5R2 b - - 0 1'], cours: [
    { t: 'Sa tour te met en échec, et son roi e5 vise ton pion f4.', plan: ['e5f4'], keys: ['f4'] },
    { t: 'Kf3 ! Ton roi se colle au pion : il le protège et quitte la colonne des échecs.', arrows: ['g4f3'] },
    { pre: ['Kf3', 'Rg6'], t: 'Ta tour quitte la colonne f : la route est libre pour ton roi et ton pion.', arrows: ['f2a2'] },
    { pre: ['Kf3', 'Rg6', 'Ra2', 'Kd4'], t: 'Le roi avance d\'abord, le pion suit juste derrière. Son roi arrive trop tard.', arrows: ['f3f2'], plan: ['f4f3'] },
  ] },
  ecart: { pos: ['2R5/8/8/8/2K5/2p5/1kr5/8 b - - 0 1', '8/1KR5/2P5/2k5/8/8/8/2r5 w - - 0 1', '4R3/8/8/8/4K3/4p3/4rk2/8 b - - 0 1'], cours: [
    { t: 'Ta tour f2 est collée devant ton pion : elle bloque ton roi et le pion.', keys: ['f2'] },
    { t: '…Ra2 : la tour part le plus loin possible sur la rangée. Elle libère f2 et pourra faire des échecs de côté.', arrows: ['f2a2'] },
  ] },
  lucena: { pos: ['4k1K1/6P1/8/8/8/8/7r/5R2 w - - 0 1', '5r2/7R/8/8/8/8/6p1/4K1k1 b - - 0 1', '2K1k3/2P5/8/8/8/8/1r6/3R4 w - - 0 1'], cours: [
    { t: 'Ton pion b7 va faire dame, mais ton roi b8 est coincé devant lui. Sa tour a2 attend : dès que ton roi sort, elle donne des échecs.', keys: ['b8'] },
    { t: 'Rd1+ d\'abord : son roi est repoussé à deux colonnes du pion.', arrows: ['c1d1'] },
    { pre: ['Rd1+', 'Ke7'], t: 'Rd4 ! Ta tour va en 4e rangée. Elle servira de planche au pont.', arrows: ['d1d4'], keys: ['d4'] },
    { pre: ['Rd1+', 'Ke7', 'Rd4', 'Ke6'], t: 'Ton roi sort. Quand ses échecs arrivent sur la colonne b, ta tour vient s\'interposer en b4 : c\'est le pont.', arrows: ['b8c7'], plan: ['d4b4'] },
  ] },
  philidor: { pos: ['3k4/R7/8/3KP3/8/8/8/7r b - - 0 1', '7R/8/8/8/3kp3/8/r7/3K4 w - - 0 1', '4k3/8/7R/3PK3/8/8/8/r7 b - - 0 1'], cours: [
    { t: 'Philidor : ton roi devant le pion, ta tour sur la 6e rangée. Son roi ne peut pas monter sans son pion.', keys: ['a6', 'b6', 'c6', 'd6', 'e6', 'f6', 'g6', 'h6'] },
    { t: '…Ra6 ! La tour barre la 6e rangée. Attends sur cette rangée sans bouger ton roi du coin.', arrows: ['a1a6'] },
    { pre: ['Ra6', 'd6'], t: 'Il pousse d6 : son roi n\'a plus d\'abri devant. Ta tour file au fond et donne des échecs par derrière.', arrows: ['a6a1'] },
  ] },
  court: { pos: ['3k4/R7/3K4/3P4/8/8/8/7r b - - 0 1', '7R/8/8/8/3p4/3k4/r7/3K4 w - - 0 1', '4k3/7R/4K3/4P3/8/8/2r5/8 b - - 0 1'], cours: [
    { t: 'Son roi est déjà en 6e rangée : Philidor est trop tard. Il te faut des échecs de côté, de loin.', keys: ['e6'] },
    { t: '…Ra6+ ! Échec de côté, avec la tour le plus loin possible, du côté long.', arrows: ['a1a6'] },
    { pre: ['Ra6+', 'Kd5'], t: 'Son roi s\'éloigne de son pion : ta tour repart loin, prête à recommencer.', arrows: ['a6a1'] },
  ] },
  vancura: { pos: ['7R/1k6/7P/8/8/8/4K3/7r b - - 0 1', '7R/4k3/8/8/8/7p/1K6/7r w - - 0 1', 'R7/6k1/P7/5K2/8/8/8/r7 b - - 0 1'], cours: [
    { t: 'Pion de tour a6, sa tour devant lui en a8. Ta tour doit attaquer le pion de côté, sur sa rangée.', keys: ['a6'] },
    { t: '…Rf1 puis …Rf6 : ta tour vient sur la 6e rangée et attaque le pion a6. Son roi ne pourra pas venir le défendre.', arrows: ['a1f1'], plan: ['f1f6'], keys: ['f6'] },
  ] },
  carre: { pos: ['8/8/8/8/6k1/8/P7/7K w - - 0 1', '7k/p7/8/6K1/8/8/8/8 b - - 0 1', '8/8/8/8/1k6/8/K6P/8 w - - 0 1'], cours: [
    { t: 'Ton pion h2 file vers h8. Son roi b4 peut-il le rattraper ? Trace le carré du pion.', plan: ['h2h8'] },
    { t: 'h4 ! Le pion saute deux cases. Son carré va de h4 à d8 : son roi b4 est dehors et n\'y entre pas, même en jouant.', arrows: ['h2h4'], zone: box('d4', 'h8') },
    { t: 'Sur h3 ?, le carré grandit (de c3 à h8) et son roi y entre avec …Kc4 : il rattrape le pion.', bad: ['h2h3'], zone: box('c3', 'h8') },
  ] },
  devant: { pos: ['3k4/8/8/3K4/3P4/8/8/8 w - - 0 1', '8/8/8/3p4/3k4/8/8/3K4 b - - 0 1', '4k3/2K5/8/8/4P3/8/8/8 w - - 0 1'], cours: [
    { t: 'Avec un pion en e4, les cases clés sont d6, e6 et f6 : si ton roi en atteint une, tu gagnes, quoi qu\'il fasse.', keys: ['d6', 'e6', 'f6'] },
    { t: 'Ke6 ! Ton roi prend une case clé, devant son pion.', arrows: ['e5e6'], keys: ['d6', 'e6', 'f6'] },
    { pre: ['Ke6', 'Kd8'], t: 'Ton roi reste devant et le pion suit. Ne le pousse que quand ton roi le protège.', plan: ['e4e5'] },
  ] },
  oppo: { pos: ['8/8/3k4/8/2KP4/8/8/8 b - - 0 1', '8/8/8/2kp4/8/3K4/8/8 w - - 0 1', '8/8/3k4/8/3PK3/8/8/8 b - - 0 1'], cours: [
    { t: 'Son roi f4 veut passer devant son pion. Le tien doit lui barrer la route.', plan: ['f4f5'] },
    { t: '…Kf6 ! L\'opposition : vos rois face à face, une case entre eux, et c\'est à lui de jouer. Il doit céder.', arrows: ['e6f6'], keys: ['f5'] },
    { pre: ['Kf6', 'e5+'], t: 'Sur e5+, recule droit devant le pion. Garde toujours la case devant lui.', arrows: ['f6e6'], keys: ['e6'] },
  ] },
  distance: { pos: ['3k4/8/8/8/2KP4/8/8/8 b - - 0 1', '8/8/8/2kp4/8/8/8/3K4 w - - 0 1', '3k4/8/8/8/3PK3/8/8/8 b - - 0 1'], cours: [
    { t: 'Les deux rois sont loin. Il faut prendre l\'opposition à distance.', keys: ['f8', 'f4'] },
    { t: '…Kf8 ! Même colonne que son roi, un nombre impair de cases entre vous (3), et c\'est à lui : tu as l\'opposition.', arrows: ['e8f8'] },
    { pre: ['Kf8', 'Ke5'], t: 'Il change de colonne ? Suis-le : il va en e5, tu vas en e7. Toujours face à face.', arrows: ['f8e7'] },
  ] },
  dame7: { pos: ['K7/3Q4/8/8/8/8/3pk3/8 w - - 0 1', '8/3PK3/8/8/8/8/3q4/k7 b - - 0 1', '6K1/3Q4/8/8/8/8/2kp4/8 w - - 0 1', '4Q2K/8/8/8/8/8/3kp3/8 w - - 0 1'], cours: [
    { t: 'Son pion e2 va faire dame. Ta dame doit forcer son roi à se mettre devant le pion, en e1.', keys: ['e1'] },
    { t: 'Échec, échec, en te rapprochant à chaque fois : Qb4+ d\'abord.', arrows: ['e7b4'] },
    { pre: ['Qb4+', 'Kd1', 'Qd4+', 'Kc1', 'Qc3+', 'Kd1', 'Qd3+', 'Ke1'], t: 'Son roi est devant son pion : le pion est bloqué. Tu as un coup libre, ton roi s\'approche. Puis tu recommences.', arrows: ['h8g7'], keys: ['e1'] },
  ] },
  pat: { pos: ['8/8/8/8/8/6Q1/5p2/K5k1 b - - 0 1', 'k5K1/5P2/6q1/8/8/8/8/8 w - - 0 1'], cours: [
    { t: 'Ton pion c2 est attaqué par sa dame, son roi est très loin. Où mettre ton roi ?', keys: ['c2'] },
    { t: '…Ka1 ! Ton roi va dans le coin. S\'il prend le pion, c\'est pat : tu n\'as plus aucun coup.', arrows: ['b1a1'], plan: ['b3c2'] },
    { pre: ['Ka1', 'Qa3+'], t: 'Sinon il te met en échec : tu reviens en b1, et il ne peut rien faire de plus.', arrows: ['a1b1'] },
  ] },
  fou: { pos: ['8/8/8/8/2k5/p2b4/8/1K6 w - - 0 1', '1k6/8/P2B4/2K5/8/8/8/8 b - - 0 1'], cours: [
    { t: 'Fou et pion contre roi seul, et pourtant c\'est nul : la case de promotion h1 est blanche, son fou est sur les noires.', keys: ['h1'] },
    { t: 'Kh1 ! Ton roi file dans le coin. Ni le fou ni le pion ne peuvent l\'en chasser.', arrows: ['g1h1'], keys: ['h1'] },
    { pre: ['Kh1', 'Kf3'], t: 'Ensuite, va-et-vient entre h1, h2 et g1. S\'il t\'enferme, c\'est pat.', arrows: ['h1h2'] },
  ] },
};
