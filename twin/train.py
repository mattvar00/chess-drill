"""Jumeau numérique : entraînement du réseau maison.

Étape 1 : pré-entraînement sur des parties humaines de ton niveau (Lichess). Avec --init, on repart d'un réseau déjà
          pré-entraîné (le run précédent) et on continue sur d'autres parties : il apprend en plus à lire la pendule.
Étape 2 : affinage sur tes coups, les parties récentes comptant davantage (demi-vie --half-life jours),
          avec un peu de Lichess mélangé pour ne pas tout oublier.
Étape 3 : une dernière passe sur tes --recent-days derniers jours, gardée seulement si elle aide.
On garde toujours le meilleur état selon la concordance sur tes coups les plus récents mis de côté (validation).
À la fin, le réseau classe les coups de chaque position de test : preds/*.json, lus par eval.py.

    python train.py --data data --out model --preds preds --init old/generic.pt
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

from common import Net, index_to_move, legal_mask, load_net, planes

torch.set_num_threads(os.cpu_count() or 2)
DAY = 86400


def load(p: Path):
    z = np.load(p)
    t = torch.from_numpy(z['t']) if 't' in z.files else None
    return [torch.from_numpy(z['codes']), torch.from_numpy(z['extra']), torch.from_numpy(z['y'].astype(np.int64)), t]


def take(data, idx):
    return [x[idx] if x is not None else None for x in data]


def batches(data, bs, order):
    for i in range(0, len(order), bs):
        j = order[i:i + bs]
        yield planes(data[0][j], data[1][j]), data[2][j]


@torch.no_grad()
def accuracy(net, data, bs=2048):
    net.eval()
    ok1 = ok3 = n = 0
    for x, y in batches(data, bs, torch.arange(data[0].shape[0])):
        top = net(x).topk(3, 1).indices   # sans masque des coups légaux : une borne basse, le vrai score est mesuré par eval.py
        ok1 += (top[:, 0] == y).sum().item()
        ok3 += (top == y[:, None]).any(1).sum().item()
        n += len(y)
    net.train()
    return ok1 / max(1, n), ok3 / max(1, n)


def run(net, train, val, epochs, lr, bs, label, log, mix=None, mix_share=0.0, weights=None, keep_start=False):
    """Entraîne `epochs` passes ; chaque passe tire autant d'exemples qu'il y en a, selon `weights` s'il y en a.
    Garde le meilleur état sur la validation (et l'état de départ si keep_start et que rien ne fait mieux)."""
    n = train[0].shape[0]
    if epochs <= 0 or n == 0:
        return
    opt = torch.optim.AdamW(net.parameters(), lr=lr, weight_decay=1e-4)
    steps = max(30, epochs * math.ceil(n / bs))
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=lr, total_steps=steps, pct_start=0.1)
    best, best_state, t0 = -1.0, None, time.time()
    if keep_start:
        best, best_state = accuracy(net, val)[0], {k: v.clone() for k, v in net.state_dict().items()}
        print(f'{label} : départ à {best:.1%} en validation', flush=True)
    for ep in range(epochs):
        tot = cnt = 0
        order = torch.multinomial(weights, n, replacement=True) if weights is not None else torch.randperm(n)
        for x, y in batches(train, bs, order):
            if mix is not None and mix_share > 0:   # un peu de parties Lichess dans chaque lot
                k = max(1, int(len(y) * mix_share))
                j = torch.randint(0, mix[0].shape[0], (k,))
                x = torch.cat([x, planes(mix[0][j], mix[1][j])])
                y = torch.cat([y, mix[2][j]])
            loss = F.cross_entropy(net(x), y, label_smoothing=0.05)
            opt.zero_grad()
            loss.backward()
            opt.step()
            if sched.last_epoch < steps - 1:
                sched.step()
            tot += loss.item() * len(y)
            cnt += len(y)
        a1, a3 = accuracy(net, val)
        el = time.time() - t0
        print(f'{label} époque {ep + 1}/{epochs} : perte {tot / cnt:.3f}, validation top 1 {a1:.1%}, top 3 {a3:.1%} ({el:.0f} s, {cnt * (ep + 1) / max(1e-9, el):.0f} positions/s)', flush=True)
        log.append({'stage': label, 'epoch': ep + 1, 'loss': tot / cnt, 'val_top1': a1, 'val_top3': a3, 'sec': el})
        if a1 > best:
            best, best_state = a1, {k: v.clone() for k, v in net.state_dict().items()}
    net.load_state_dict(best_state)


@torch.no_grad()
def rank_moves(net, data, fens):
    """Pour chaque position de test, ses coups légaux du plus probable au moins probable (en UCI)."""
    net.eval()
    out = []
    for i in range(0, len(fens), 1024):
        logits = net(planes(data[0][i:i + 1024], data[1][i:i + 1024])).numpy()
        for fen, lg in zip(fens[i:i + 1024], logits):
            b = chess.Board(fen)
            mask = legal_mask(b)
            lg = np.where(mask, lg, -1e9)
            m = index_to_move(b)
            out.append([m[j].uci() for j in np.argsort(-lg)[:mask.sum()] if j in m])
    net.train()
    return out


def write_preds(path: Path, label: str, order: int, preds, combos: bool, info=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({'label': label, 'order': order, 'combos': combos, 'info': info or {}, 'preds': preds}))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--data', default='data')
    ap.add_argument('--out', default='model')
    ap.add_argument('--preds', default='preds')
    ap.add_argument('--init', default='', help='réseau pré-entraîné à reprendre (ancien generic.pt)')
    ap.add_argument('--prev', default='', help='jumeau du run précédent, mesuré sur le même test pour comparer')
    ap.add_argument('--blocks', type=int, default=6)
    ap.add_argument('--ch', type=int, default=64)
    ap.add_argument('--pre-epochs', type=int, default=2)
    ap.add_argument('--pre-lr', type=float, default=2e-3)
    ap.add_argument('--fine-epochs', type=int, default=6)
    ap.add_argument('--half-life', type=float, default=180, help='en jours : une partie de cet âge compte moitié moins (0 : toutes pareil)')
    ap.add_argument('--recent-days', type=float, default=90)
    ap.add_argument('--recent-epochs', type=int, default=2)
    ap.add_argument('--bs', type=int, default=512)
    ap.add_argument('--max-pre', type=int, default=0, help='nombre maximal de positions Lichess (0 : toutes)')
    a = ap.parse_args()
    d, out, pr = Path(a.data), Path(a.out), Path(a.preds)
    out.mkdir(parents=True, exist_ok=True)
    torch.manual_seed(0)

    me = load(d / 'me_train.npz')
    # validation : les 10 % les plus récents de tes coups d'apprentissage (le test, lui, reste intouché)
    n = me[0].shape[0]
    k = int(n * 0.9)
    me_tr, me_val = take(me, slice(0, k)), take(me, slice(k, n))
    te = load(d / 'me_test.npz')
    te_fens = [r['fen'] for r in json.loads((d / 'me_test.meta.json').read_text())]
    net = load_net(a.init) if a.init and Path(a.init).exists() else Net(a.blocks, a.ch)
    print(f'Réseau : {sum(p.numel() for p in net.parameters()) / 1e6:.2f} M de paramètres{" (repris de " + a.init + ")" if a.init and Path(a.init).exists() else ""} ; '
          f'tes coups : {k} pour apprendre, {n - k} pour valider', flush=True)
    if a.prev and Path(a.prev).exists():
        write_preds(pr / 'precedent.json', 'Jumeau maison du run précédent', 25, rank_moves(load_net(a.prev), te, te_fens), False)
    log = []
    lich = None
    if (d / 'lichess.npz').exists():
        lich = load(d / 'lichess.npz')
        if a.max_pre:
            lich = take(lich, slice(0, a.max_pre))
        print(f'Pré-entraînement sur {lich[0].shape[0]} positions Lichess', flush=True)
        run(net, lich, me_val, a.pre_epochs, a.pre_lr, a.bs, 'pré-entraînement', log)
        torch.save({'cfg': net.cfg, 'state': net.state_dict()}, out / 'generic.pt')
        write_preds(pr / 'generique.json', 'Réseau « humain de ton niveau » (Lichess seul)', 20, rank_moves(net, te, te_fens), False)

    w = None
    if a.half_life > 0 and me_tr[3] is not None:
        age = (me_tr[3].max() - me_tr[3]).double() / DAY
        w = torch.pow(0.5, age / a.half_life)
        print(f'Poids des parties : demi-vie {a.half_life:.0f} jours ; tes {int((age <= 30).sum())} coups du dernier mois pèsent '
              f'{w[age <= 30].sum() / w.sum():.0%} de l\'entraînement', flush=True)
    run(net, me_tr, me_val, a.fine_epochs, 1e-3 if lich is None else 4e-4, a.bs, 'affinage', log, mix=lich, mix_share=0.25 if lich is not None else 0, weights=w)
    if a.recent_epochs > 0 and me_tr[3] is not None:
        recent = (me_tr[3].max() - me_tr[3]) <= a.recent_days * DAY
        sub = take(me_tr, recent)
        print(f'Passe finale sur tes {a.recent_days:.0f} derniers jours : {sub[0].shape[0]} coups', flush=True)
        run(net, sub, me_val, a.recent_epochs, 1e-4, a.bs, 'récent', log, mix=lich, mix_share=0.25 if lich is not None else 0, keep_start=True)
    torch.save({'cfg': net.cfg, 'state': net.state_dict()}, out / 'twin.pt')
    (out / 'train-log.json').write_text(json.dumps(log, indent=1))
    write_preds(pr / 'jumeau.json', 'Jumeau maison (réseau affiné sur tes coups)', 30, rank_moves(net, te, te_fens), True, {'train_log': log})


if __name__ == '__main__':
    main()
