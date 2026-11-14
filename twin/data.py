"""Jumeau numérique : préparation des données.

1. Tes parties chess.com (rapide et blitz), toutes tes archives : chacun de tes coups devient un exemple.
   Les parties des `--test-days` derniers jours forment le jeu de test (jamais vues à l'entraînement).
2. Un échantillon de parties humaines de la base ouverte de Lichess (licence CC0), joueurs de ton niveau :
   le réseau y apprend d'abord à jouer « comme un humain de ce niveau », puis il est affiné sur tes coups.

    python data.py --user matt_chess00 --out data/ --lichess-month 2024-01 --lichess-games 60000
    python data.py --user matt_chess00 --out data/ --input parties.json     (hors ligne, sans Lichess)
"""
import argparse
import io
import json
import re
import time
from pathlib import Path

import chess
import chess.pgn
import numpy as np
import requests

from common import encode, move_index

UA = 'chess-drill/2.0 (jumeau ; github.com/mattvar00/chess-drill)'


def get(url, **kw):
    for i in range(5):
        r = requests.get(url, headers={'User-Agent': UA}, timeout=60, **kw)
        if r.ok:
            return r
        if r.status_code in (429, 500, 502, 503) and i < 4:
            time.sleep(2 * (i + 1))
            continue
        r.raise_for_status()


def chesscom_games(user: str) -> list[dict]:
    archives = get(f'https://api.chess.com/pub/player/{user}/games/archives').json()['archives']
    out = []
    for a in archives:
        out += get(a).json().get('games', [])
        time.sleep(0.2)
    return out


SAN = re.compile(r'\{[^}]*\}|\([^)]*\)|\$\d+|\d+\.(\.\.)?|1-0|0-1|1/2-1/2|\*')


def sans_of(pgn: str) -> list[str]:
    body = pgn.split('\n\n', 1)[-1] if '\n\n' in pgn else pgn
    return [t for t in SAN.sub(' ', body).split() if t]


def positions(sans, keep, rows, meta=None, extra_meta=None):
    """Rejoue une partie ; pour chaque coup où `keep(board)` est vrai, ajoute (codes, extra, coup)."""
    b = chess.Board()
    for ply, san in enumerate(sans):
        try:
            mv = b.parse_san(san)
        except ValueError:
            return
        if keep(b) and b.legal_moves.count() > 1:
            idx = move_index(mv, b.turn == chess.BLACK)
            if idx >= 0:
                c, e = encode(b)
                rows['codes'].append(c)
                rows['extra'].append(e)
                rows['y'].append(idx)
                if meta is not None:
                    meta.append({**(extra_meta or {}), 'ply': ply, 'fen': b.fen(), 'uci': mv.uci()})
        b.push(mv)


def save(path: Path, rows, meta=None):
    np.savez_compressed(path, codes=np.array(rows['codes'], np.uint8).reshape(-1, 64), extra=np.array(rows['extra'], np.uint8).reshape(-1, 5),
                        y=np.array(rows['y'], np.int16))
    if meta is not None:
        path.with_suffix('.meta.json').write_text(json.dumps(meta))


def lichess_sample(month: str, n_games: int, lo: int, hi: int, rows):
    """Lit le fichier mensuel de Lichess en flux (sans le télécharger en entier) et garde les parties de ton niveau."""
    import zstandard
    url = f'https://database.lichess.org/standard/lichess_db_standard_rated_{month}.pgn.zst'
    with requests.get(url, headers={'User-Agent': UA}, stream=True, timeout=60) as r:
        r.raise_for_status()
        text = io.TextIOWrapper(zstandard.ZstdDecompressor().stream_reader(r.raw), encoding='utf-8', errors='replace')
        kept, seen, head, moves, t0 = 0, 0, {}, [], time.time()
        for line in text:
            if line.startswith('['):
                m = re.match(r'\[(\w+) "(.*)"\]', line)
                if m:
                    head[m.group(1)] = m.group(2)
                continue
            if line.strip():
                moves.append(line)
                continue
            if not moves:
                continue
            seen += 1
            try:
                we, be = int(head.get('WhiteElo', 0)), int(head.get('BlackElo', 0))
                base = int(head.get('TimeControl', '0+0').split('+')[0] or 0)
            except ValueError:
                we = be = base = 0
            if lo <= we <= hi and lo <= be <= hi and base >= 180 and 'abandoned' not in head.get('Termination', '').lower():
                positions(sans_of(' '.join(moves)), lambda b: True, rows)
                kept += 1
                if kept % 5000 == 0:
                    print(f'  Lichess : {kept} parties gardées sur {seen} lues, {len(rows["y"])} positions ({time.time() - t0:.0f} s)', flush=True)
                if kept >= n_games:
                    break
            head, moves = {}, []
    return kept


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--user', default='matt_chess00')
    ap.add_argument('--out', default='data')
    ap.add_argument('--input')
    ap.add_argument('--test-days', type=float, default=14)
    ap.add_argument('--lichess-month', default='')
    ap.add_argument('--lichess-games', type=int, default=60000)
    ap.add_argument('--elo-lo', type=int, default=1500)
    ap.add_argument('--elo-hi', type=int, default=2050)
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    user = a.user.lower()

    games = json.loads(Path(a.input).read_text()) if a.input else chesscom_games(user)
    games = [g for g in games if g.get('rules', 'chess') == 'chess' and g.get('time_class') in ('rapid', 'blitz') and g.get('pgn')]
    games.sort(key=lambda g: g['end_time'])
    cut = (games[-1]['end_time'] if a.input else time.time()) - a.test_days * 86400
    if a.input:   # hors ligne : les 20 % les plus récentes en test
        cut = games[int(len(games) * 0.8)]['end_time']
    train, test, meta_tr, meta_te = {'codes': [], 'extra': [], 'y': []}, {'codes': [], 'extra': [], 'y': []}, [], []
    for g in games:
        white = g['white']['username'].lower() == user
        if not white and g['black']['username'].lower() != user:
            continue
        me = chess.WHITE if white else chess.BLACK
        is_test = g['end_time'] >= cut
        info = {'game': g.get('url', ''), 't': g['end_time'], 'tc': g['time_class'], 'elo': (g['white'] if white else g['black'])['rating']}
        positions(sans_of(g['pgn']), lambda b: b.turn == me, test if is_test else train, meta_te if is_test else meta_tr, info)
    save(out / 'me_train.npz', train, meta_tr)
    save(out / 'me_test.npz', test, meta_te)
    print(f'Tes parties : {len(train["y"])} coups d\'apprentissage, {len(test["y"])} coups de test ({sum(1 for g in games if g["end_time"] >= cut)} parties)', flush=True)

    if a.lichess_month:
        rows = {'codes': [], 'extra': [], 'y': []}
        n = lichess_sample(a.lichess_month, a.lichess_games, a.elo_lo, a.elo_hi, rows)
        save(out / 'lichess.npz', rows)
        print(f'Lichess : {n} parties, {len(rows["y"])} positions', flush=True)


if __name__ == '__main__':
    main()
