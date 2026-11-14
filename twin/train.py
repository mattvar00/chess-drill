"""Jumeau numérique : entraînement du réseau.

Étape 1 (si data/lichess.npz existe) : pré-entraînement sur des parties humaines de ton niveau.
Étape 2 : affinage sur tes propres coups (avec un peu de Lichess mélangé pour ne pas tout oublier).
On garde le meilleur état selon la concordance sur une part de tes coups mise de côté (validation).

    python train.py --data data --out model --pre-epochs 2 --fine-epochs 6
"""
import argparse
import json
import math
import os
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F

from common import Net, planes

torch.set_num_threads(os.cpu_count() or 2)


def load(p: Path):
    z = np.load(p)
    return torch.from_numpy(z['codes']), torch.from_numpy(z['extra']), torch.from_numpy(z['y'].astype(np.int64))


def batches(data, bs, shuffle=True):
    n = data[0].shape[0]
    idx = torch.randperm(n) if shuffle else torch.arange(n)
    for i in range(0, n, bs):
        j = idx[i:i + bs]
        yield planes(data[0][j], data[1][j]), data[2][j]


@torch.no_grad()
def accuracy(net, data, bs=2048):
    net.eval()
    ok1 = ok3 = n = 0
    for x, y in batches(data, bs, False):
        top = net(x).topk(3, 1).indices   # sans masque des coups légaux : une borne basse, le vrai score est mesuré par eval.py
        ok1 += (top[:, 0] == y).sum().item()
        ok3 += (top == y[:, None]).any(1).sum().item()
        n += len(y)
    net.train()
    return ok1 / max(1, n), ok3 / max(1, n)


def run(net, train, val, epochs, lr, bs, label, log, mix=None, mix_share=0.0):
    if epochs <= 0 or train[0].shape[0] == 0:
        return
    opt = torch.optim.AdamW(net.parameters(), lr=lr, weight_decay=1e-4)
    steps = max(30, epochs * math.ceil(train[0].shape[0] / bs))
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=lr, total_steps=steps, pct_start=0.1)
    best, best_state, t0 = -1.0, None, time.time()
    for ep in range(epochs):
        tot = cnt = 0
        for x, y in batches(train, bs):
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
        line = f'{label} époque {ep + 1}/{epochs} : perte {tot / cnt:.3f}, validation top 1 {a1:.1%}, top 3 {a3:.1%} ({time.time() - t0:.0f} s, {cnt / max(1e-9, time.time() - t0) * (ep + 1):.0f} positions/s)'
        print(line, flush=True)
        log.append({'stage': label, 'epoch': ep + 1, 'loss': tot / cnt, 'val_top1': a1, 'val_top3': a3, 'sec': time.time() - t0})
        if a1 > best:
            best, best_state = a1, {k: v.clone() for k, v in net.state_dict().items()}
    net.load_state_dict(best_state)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--data', default='data')
    ap.add_argument('--out', default='model')
    ap.add_argument('--blocks', type=int, default=6)
    ap.add_argument('--ch', type=int, default=64)
    ap.add_argument('--pre-epochs', type=int, default=2)
    ap.add_argument('--fine-epochs', type=int, default=6)
    ap.add_argument('--bs', type=int, default=512)
    ap.add_argument('--max-pre', type=int, default=0, help='nombre maximal de positions Lichess (0 : toutes)')
    a = ap.parse_args()
    d, out = Path(a.data), Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    torch.manual_seed(0)

    me = load(d / 'me_train.npz')
    # validation : les 10 % les plus récents de tes coups d'apprentissage (le test, lui, reste intouché)
    n = me[0].shape[0]
    k = int(n * 0.9)
    me_tr, me_val = tuple(t[:k] for t in me), tuple(t[k:] for t in me)
    net = Net(a.blocks, a.ch)
    print(f'Réseau : {sum(p.numel() for p in net.parameters()) / 1e6:.2f} M de paramètres ; tes coups : {k} pour apprendre, {n - k} pour valider', flush=True)
    log = []
    lich = None
    if (d / 'lichess.npz').exists():
        lich = load(d / 'lichess.npz')
        if a.max_pre:
            lich = tuple(t[:a.max_pre] for t in lich)
        print(f'Pré-entraînement sur {lich[0].shape[0]} positions Lichess', flush=True)
        run(net, lich, me_val, a.pre_epochs, 2e-3, a.bs, 'pré-entraînement', log)
        torch.save({'cfg': net.cfg, 'state': net.state_dict()}, out / 'generic.pt')
    run(net, me_tr, me_val, a.fine_epochs, 1e-3 if lich is None else 4e-4, a.bs, 'affinage', log, mix=lich, mix_share=0.25 if lich is not None else 0)
    torch.save({'cfg': net.cfg, 'state': net.state_dict()}, out / 'twin.pt')
    (out / 'train-log.json').write_text(json.dumps(log, indent=1))


if __name__ == '__main__':
    main()
