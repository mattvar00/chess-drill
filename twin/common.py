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


def encode(board: chess.Board) -> tuple[np.ndarray, np.ndarray]:
    """La position en 64 codes (0 vide, 1-6 mes pièces P C F T D R, 7-12 les siennes) et 5 indicateurs
    (mes roques côté roi/dame, ses roques, colonne de prise en passant + 1 ou 0)."""
    black = board.turn == chess.BLACK
    me = board.turn
    codes = np.zeros(64, np.uint8)
    for sq, p in board.piece_map().items():
        codes[flip(sq, black)] = p.piece_type + (0 if p.color == me else 6)
    ep = (chess.square_file(board.ep_square) + 1) if board.ep_square is not None else 0
    extra = np.array([board.has_kingside_castling_rights(me), board.has_queenside_castling_rights(me),
                      board.has_kingside_castling_rights(not me), board.has_queenside_castling_rights(not me), ep], np.uint8)
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


def planes(codes: torch.Tensor, extra: torch.Tensor) -> torch.Tensor:
    """Codes [B,64] et indicateurs [B,5] -> plans [B,17,8,8] (12 pièces, 4 roques, prise en passant)."""
    B = codes.shape[0]
    onehot = torch.nn.functional.one_hot(codes.long(), 13)[:, :, 1:].permute(0, 2, 1).float()  # [B,12,64]
    castle = extra[:, :4].float().unsqueeze(-1).expand(B, 4, 64)
    ep = torch.zeros(B, 1, 64)
    has = extra[:, 4] > 0
    if has.any():
        f = (extra[has, 4].long() - 1)
        ep[has, 0, 40 + f] = 1.0   # case d'arrivée de la prise en passant, vue du camp qui joue (6e rangée)
    return torch.cat([onehot, castle, ep], 1).view(B, 17, 8, 8)


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

    def __init__(self, blocks: int = 6, ch: int = 64):
        super().__init__()
        self.cfg = {'blocks': blocks, 'ch': ch}
        self.inp = nn.Sequential(nn.Conv2d(17, ch, 3, padding=1, bias=False), nn.BatchNorm2d(ch), nn.ReLU())
        self.body = nn.Sequential(*[Block(ch) for _ in range(blocks)])
        self.head = nn.Sequential(nn.Conv2d(ch, ch, 1, bias=False), nn.BatchNorm2d(ch), nn.ReLU(), nn.Conv2d(ch, 73, 1))

    def forward(self, x):
        # [B,73,8,8] -> [B, 73*64] avec l'indice type*64 + case
        return self.head(self.body(self.inp(x))).flatten(1)
