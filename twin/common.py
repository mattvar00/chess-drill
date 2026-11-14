"""Jumeau numérique : encodage des positions et des coups, et le réseau.

Tout est vu du camp qui joue : si ce sont les Noirs, on retourne le plateau (les rangées) et on échange les couleurs,
pour que le réseau voie toujours « mes pièces montent vers le haut ». Les coups sont codés comme dans AlphaZero :
case de départ (64) x type de coup (73) = 4672 sorties.
"""
import chess
import numpy as np
import torch
import torch.nn as nn

N_MOVES = 64 * 73
# huit directions de dame (dx, dy) dans l'ordre : N, NE, E, SE, S, SO, O, NO
DIRS = [(0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1), (-1, 0), (-1, 1)]
KNIGHT = [(1, 2), (2, 1), (2, -1), (1, -2), (-1, -2), (-2, -1), (-2, 1), (-1, 2)]
UNDER = [chess.KNIGHT, chess.BISHOP, chess.ROOK]


def flip(sq: int, black: bool) -> int:
    return sq ^ 56 if black else sq


def move_index(m: chess.Move, black: bool) -> int:
    """Indice d'un coup (vu du camp qui joue), ou -1."""
    f, t = flip(m.from_square, black), flip(m.to_square, black)
    dx, dy = chess.square_file(t) - chess.square_file(f), chess.square_rank(t) - chess.square_rank(f)
    if m.promotion and m.promotion != chess.QUEEN:
        typ = 64 + UNDER.index(m.promotion) * 3 + (dx + 1)
    elif (dx, dy) in KNIGHT:
        typ = 56 + KNIGHT.index((dx, dy))
    else:
        dist = max(abs(dx), abs(dy))
        if dist == 0:
            return -1
        d = (dx // dist if dx else 0, dy // dist if dy else 0)
        if d not in DIRS:
            return -1
        typ = DIRS.index(d) * 7 + dist - 1
    return typ * 64 + f


N_EXTRA = 8
UNKNOWN_CLOCK = (255, 255, 255)


def clock_code(mine: float | None, theirs: float | None, base: float) -> tuple[int, int, int]:
    """La pendule en 3 octets : mon temps et le sien en part du temps de départ, et mon temps en secondes (plafonné à 10 min)."""
    if mine is None or theirs is None or base <= 0:
        return UNKNOWN_CLOCK
    q = lambda v: int(round(255 * min(1.0, max(0.0, v))))
    return q(mine / base), q(theirs / base), q(mine / 600)


def encode(board: chess.Board, clock: tuple[int, int, int] = UNKNOWN_CLOCK) -> tuple[np.ndarray, np.ndarray]:
    """La position en 64 codes (0 vide, 1-6 mes pièces P C F T D R, 7-12 les siennes) et 8 indicateurs
    (mes roques côté roi/dame, ses roques, colonne de prise en passant + 1 ou 0, puis la pendule, voir clock_code)."""
    black = board.turn == chess.BLACK
    me = board.turn
    codes = np.zeros(64, np.uint8)
    for sq, p in board.piece_map().items():
        codes[flip(sq, black)] = p.piece_type + (0 if p.color == me else 6)
    ep = (chess.square_file(board.ep_square) + 1) if board.ep_square is not None else 0
    extra = np.array([board.has_kingside_castling_rights(me), board.has_queenside_castling_rights(me),
                      board.has_kingside_castling_rights(not me), board.has_queenside_castling_rights(not me), ep, *clock], np.uint8)
    return codes, extra


def legal_mask(board: chess.Board) -> np.ndarray:
    m = np.zeros(N_MOVES, bool)
    black = board.turn == chess.BLACK
    for mv in board.legal_moves:
        i = move_index(mv, black)
        if i >= 0:
            m[i] = True
    return m


def index_to_move(board: chess.Board) -> dict[int, chess.Move]:
    black = board.turn == chess.BLACK
    return {move_index(mv, black): mv for mv in board.legal_moves}


N_PLANES = 20


def planes(codes: torch.Tensor, extra: torch.Tensor) -> torch.Tensor:
    """Codes [B,64] et indicateurs [B,8] -> plans [B,20,8,8] (12 pièces, 4 roques, prise en passant, 3 de pendule).
    Les anciennes données à 5 indicateurs (sans pendule) sont lues comme « pendule inconnue »."""
    B = codes.shape[0]
    if extra.shape[1] < N_EXTRA:
        extra = torch.cat([extra, torch.full((B, N_EXTRA - extra.shape[1]), 255, dtype=extra.dtype)], 1)
    onehot = torch.nn.functional.one_hot(codes.long(), 13)[:, :, 1:].permute(0, 2, 1).float()  # [B,12,64]
    castle = extra[:, :4].float().unsqueeze(-1).expand(B, 4, 64)
    ep = torch.zeros(B, 1, 64)
    has = extra[:, 4] > 0
    if has.any():
        f = (extra[has, 4].long() - 1)
        ep[has, 0, 40 + f] = 1.0   # case d'arrivée de la prise en passant, vue du camp qui joue (6e rangée)
    clock = (extra[:, 5:8].float() / 255).unsqueeze(-1).expand(B, 3, 64)
    return torch.cat([onehot, castle, ep, clock], 1).view(B, N_PLANES, 8, 8)


class Block(nn.Module):
    def __init__(self, c: int):
        super().__init__()
        self.c1, self.b1 = nn.Conv2d(c, c, 3, padding=1, bias=False), nn.BatchNorm2d(c)
        self.c2, self.b2 = nn.Conv2d(c, c, 3, padding=1, bias=False), nn.BatchNorm2d(c)

    def forward(self, x):
        y = torch.relu(self.b1(self.c1(x)))
        return torch.relu(x + self.b2(self.c2(y)))


class Net(nn.Module):
    """Petit réseau résiduel : la position en entrée, une probabilité pour chacun des 4672 coups en sortie."""

    def __init__(self, blocks: int = 6, ch: int = 64, inp: int = N_PLANES):
        super().__init__()
        self.cfg = {'blocks': blocks, 'ch': ch, 'inp': inp}
        self.inp = nn.Sequential(nn.Conv2d(inp, ch, 3, padding=1, bias=False), nn.BatchNorm2d(ch), nn.ReLU())
        self.body = nn.Sequential(*[Block(ch) for _ in range(blocks)])
        self.head = nn.Sequential(nn.Conv2d(ch, ch, 1, bias=False), nn.BatchNorm2d(ch), nn.ReLU(), nn.Conv2d(ch, 73, 1))

    def forward(self, x):
        # [B,73,8,8] -> [B, 73*64] avec l'indice type*64 + case
        return self.head(self.body(self.inp(x))).flatten(1)


def load_net(path, widen: bool = True) -> Net:
    """Charge un réseau sauvegardé. Un ancien réseau sans pendule (17 plans) est élargi à 20 plans :
    les poids des plans de pendule partent de zéro, il joue donc d'abord exactement comme avant."""
    ck = torch.load(path, map_location='cpu')
    cfg = {'inp': 17, **ck['cfg']}
    old = Net(**cfg)
    old.load_state_dict(ck['state'])
    if not widen or cfg['inp'] == N_PLANES:
        return old
    net = Net(cfg['blocks'], cfg['ch'], N_PLANES)
    st = old.state_dict()
    w = st['inp.0.weight']
    st['inp.0.weight'] = torch.cat([w, torch.zeros(w.shape[0], N_PLANES - w.shape[1], 3, 3)], 1)
    net.load_state_dict(st)
    return net
