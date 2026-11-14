"""Jumeau numérique, variante « Maia-2 » : on part du réseau Maia-2 (Université de Toronto, licence MIT, entraîné sur
des millions de parties Lichess, et qui tient compte de l'Elo des deux joueurs), puis on l'affine sur tes coups.

1. Maia-2 brut : on choisit le modèle (rapide ou blitz) et le décalage d'Elo chess.com -> Lichess qui devinent le mieux
   tes coups de validation, sans rien réentraîner.
2. Maia-2 affiné : on continue son entraînement sur tes coups (les récents comptent plus), pendant --minutes minutes,
   en gardant le meilleur état sur la validation.
Écrit preds/maia-brut.json et preds/maia-affine.json (lus par eval.py) et le modèle affiné.

    python maia_ft.py --data data --out model-maia --preds preds --minutes 170
"""
import argparse
import json
import math
import os
import time
from pathlib import Path

import chess
import numpy as np
import torch
import torch.nn.functional as F
from maia2 import model as maia_model
from maia2.utils import board_to_tensor, create_elo_dict, get_all_possible_moves, map_to_category, mirror_move

torch.set_num_threads(os.cpu_count() or 2)
DAY = 86400
MOVES = get_all_possible_moves()
MOVE_ID = {m: i for i, m in enumerate(MOVES)}
ELO = create_elo_dict()


def encode(rows):
    """Positions au format Maia-2 : vues des Blancs (on retourne l'échiquier quand c'est aux Noirs), coup retourné de même."""
    boards, ys, legal, keep = [], [], [], []
    for i, r in enumerate(rows):
        b = chess.Board(r['fen'])
        black = b.turn == chess.BLACK
        if black:
            b = b.mirror()
        mv = mirror_move(r['uci']) if black else r['uci']
        if mv not in MOVE_ID:
            continue
        boards.append(board_to_tensor(b).to(torch.bool))
        ys.append(MOVE_ID[mv])
        legal.append([MOVE_ID[m.uci()] for m in b.legal_moves if m.uci() in MOVE_ID])
        keep.append(i)
    return torch.stack(boards), torch.tensor(ys), legal, keep


def elos(rows, keep, offset):
    cat = lambda e: map_to_category(int(e or 1500) + offset, ELO)
    return torch.tensor([cat(rows[i].get('elo')) for i in keep]), torch.tensor([cat(rows[i].get('opp') or rows[i].get('elo')) for i in keep])


def mask_of(legal_lists, idx):
    m = torch.zeros(len(idx), len(MOVES), dtype=torch.bool)
    for r, i in enumerate(idx):
        m[r, legal_lists[i]] = True
    return m


@torch.no_grad()
def logits_of(net, X, es, eo, idx, bs=512):
    net.eval()
    out = []
    for i in range(0, len(idx), bs):
        j = idx[i:i + bs]
        out.append(net(X[j].float(), es[j], eo[j])[0])
    net.train()
    return torch.cat(out) if out else torch.zeros(0, len(MOVES))


def top1(net, X, Y, es, eo, legal, idx):
    idx = torch.as_tensor(idx)
    lg = logits_of(net, X, es, eo, idx).masked_fill(~mask_of(legal, idx.tolist()), -1e9)
    return (lg.argmax(1) == Y[idx]).float().mean().item()


def ranked(net, X, es, eo, legal, rows, keep):
    """Les coups légaux de chaque position de test, du plus probable au moins probable, remis du bon côté (UCI)."""
    idx = torch.arange(len(keep))
    lg = logits_of(net, X, es, eo, idx).masked_fill(~mask_of(legal, idx.tolist()), -1e9)
    out = [[] for _ in rows]
    for r, i in enumerate(keep):
        black = chess.Board(rows[i]['fen']).turn == chess.BLACK
        order = torch.argsort(lg[r], descending=True)[:len(legal[r])].tolist()
        out[i] = [mirror_move(MOVES[j]) if black else MOVES[j] for j in order]
    return out


def write_preds(path: Path, label, order, preds, combos, info):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({'label': label, 'order': order, 'combos': combos, 'info': info, 'preds': preds}))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--data', default='data')
    ap.add_argument('--out', default='model-maia')
    ap.add_argument('--preds', default='preds')
    ap.add_argument('--minutes', type=float, default=170, help="durée de l'affinage")
    ap.add_argument('--lr', type=float, default=3e-5)
    ap.add_argument('--bs', type=int, default=128)
    ap.add_argument('--half-life', type=float, default=180)
    ap.add_argument('--val-every', type=float, default=15, help='minutes entre deux mesures sur la validation')
    ap.add_argument('--val-n', type=int, default=4000)
    a = ap.parse_args()
    d, out, pr = Path(a.data), Path(a.out), Path(a.preds)
    out.mkdir(parents=True, exist_ok=True)
    torch.manual_seed(0)
    t_start = time.time()

    tr_rows = json.loads((d / 'me_train.meta.json').read_text())
    te_rows = json.loads((d / 'me_test.meta.json').read_text())
    X, Y, legal, keep = encode(tr_rows)
    Xt, _, legal_t, keep_t = encode(te_rows)
    n = len(keep)
    k = int(n * 0.9)
    val = list(range(k, n))[-a.val_n:]   # les plus récents de tes coups d'apprentissage
    print(f'Maia-2 : {k} de tes coups pour apprendre, {len(val)} pour valider, {len(keep_t)} de test ({time.time() - t_start:.0f} s)', flush=True)

    # 1. le meilleur Maia-2 brut : modèle et décalage d'Elo
    best = None
    for kind in ('rapid', 'blitz'):
        net = maia_model.from_pretrained(kind, 'cpu', save_root=str(out / 'base'))
        for off in (0, 100, 200, 300, 400):
            es, eo = elos(tr_rows, keep, off)
            acc = top1(net, X, Y, es, eo, legal, val)
            print(f'  Maia-2 {kind}, Elo chess.com + {off} : {acc:.1%} en validation', flush=True)
            if best is None or acc > best[0]:
                best = (acc, kind, off)
        del net
    acc0, kind, off = best
    print(f'Base retenue : Maia-2 {kind}, Elo + {off} ({acc0:.1%})', flush=True)
    net = maia_model.from_pretrained(kind, 'cpu', save_root=str(out / 'base'))
    es, eo = elos(tr_rows, keep, off)
    es_t, eo_t = elos(te_rows, keep_t, off)
    info = {'base': kind, 'elo_offset': off, 'val_brut': acc0}
    write_preds(pr / 'maia-brut.json', f'Maia-2 brut ({kind}, sans affinage)', 10, ranked(net, Xt, es_t, eo_t, legal_t, te_rows, keep_t), False, info)

    # 2. affinage sur tes coups, les récents pesant plus, pendant un temps donné
    t = torch.tensor([tr_rows[i]['t'] for i in keep[:k]], dtype=torch.float64)
    w = torch.pow(0.5, (t.max() - t) / DAY / a.half_life) if a.half_life > 0 else torch.ones(k, dtype=torch.float64)
    opt = torch.optim.AdamW(net.parameters(), lr=a.lr, weight_decay=1e-5)
    budget = a.minutes * 60
    t0 = last_val = time.time()
    best_acc, best_state, step, seen, curve = acc0, {kk: v.clone() for kk, v in net.state_dict().items()}, 0, 0, []
    net.train()
    while time.time() - t0 < budget:
        frac = (time.time() - t0) / budget
        for g in opt.param_groups:   # montée sur 200 pas, puis descente linéaire avec le temps
            g['lr'] = a.lr * min(1.0, (step + 1) / 200) * max(0.05, 1 - frac)
        j = torch.multinomial(w, a.bs, replacement=True)
        loss = F.cross_entropy(net(X[j].float(), es[j], eo[j])[0], Y[j], label_smoothing=0.05)
        opt.zero_grad()
        loss.backward()
        opt.step()
        step += 1
        seen += a.bs
        if step == 20:
            print(f'  vitesse : {seen / (time.time() - t0):.0f} positions/s', flush=True)
        if time.time() - last_val > a.val_every * 60 or time.time() - t0 >= budget:
            acc = top1(net, X, Y, es, eo, legal, val)
            el = time.time() - t0
            curve.append({'min': round(el / 60, 1), 'seen': seen, 'val_top1': acc})
            print(f'  affinage {el / 60:.0f} min, {seen} positions vues : validation {acc:.1%}', flush=True)
            if acc > best_acc:
                best_acc, best_state = acc, {kk: v.clone() for kk, v in net.state_dict().items()}
            last_val = time.time()
    net.load_state_dict(best_state)
    torch.save({'base': kind, 'elo_offset': off, 'state': net.state_dict()}, out / 'maia-twin.pt')
    info.update({'val_affine': best_acc, 'curve': curve, 'steps': step})
    write_preds(pr / 'maia-affine.json', 'Maia-2 affiné sur tes coups', 40, ranked(net, Xt, es_t, eo_t, legal_t, te_rows, keep_t), True, info)
    print(f'Fini en {(time.time() - t_start) / 60:.0f} min : validation {acc0:.1%} -> {best_acc:.1%}', flush=True)


if __name__ == '__main__':
    main()
