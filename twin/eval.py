"""Jumeau numérique : évaluation sur tes parties de test (jamais vues).

Compare, coup par coup, ce que chaque approche aurait joué avec ce que tu as joué :
  moteur           Stockfish, meilleur coup
  livre+moteur     ton coup habituel si la position a déjà été vue, sinon le moteur
  puis chaque fichier de prédictions de --preds (réseau maison, Maia-2…), et pour ceux qui le demandent :
  X + livre        ton livre, sinon X
  X ∩ moteur       X choisit parmi les 6 meilleurs coups du moteur

    python eval.py --data data --preds preds --out report
"""
import argparse
import json
import os
from collections import Counter, defaultdict
from pathlib import Path

import chess
import chess.engine


def key(fen: str) -> str:
    return ' '.join(fen.split()[:4])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--data', default='data')
    ap.add_argument('--preds', default='preds')
    ap.add_argument('--out', default='report')
    ap.add_argument('--stockfish', default=os.environ.get('STOCKFISH', 'stockfish'))
    ap.add_argument('--depth', type=int, default=11)
    a = ap.parse_args()
    d, out = Path(a.data), Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    tr = json.loads((d / 'me_train.meta.json').read_text())
    te = json.loads((d / 'me_test.meta.json').read_text())
    book = defaultdict(Counter)
    for r in tr:
        book[key(r['fen'])][r['uci']] += 1
    boards = [chess.Board(r['fen']) for r in te]
    truth = [r['uci'] for r in te]
    print(f'{len(te)} coups de test, {len(tr)} coups d\'apprentissage', flush=True)

    # moteur : 6 meilleurs coups (une seule recherche multipv par position)
    eng = chess.engine.SimpleEngine.popen_uci(a.stockfish)
    eng.configure({'Threads': max(1, (os.cpu_count() or 2)), 'Hash': 128})
    engine = []
    for i, b in enumerate(boards):
        info = eng.analyse(b, chess.engine.Limit(depth=a.depth), multipv=6)
        engine.append([x['pv'][0].uci() for x in info if x.get('pv')])
        if (i + 1) % 1000 == 0:
            print(f'  moteur : {i + 1}/{len(boards)}', flush=True)
    eng.quit()

    P = {}
    P['moteur'] = engine
    bk = [[m for m, _ in book[key(r['fen'])].most_common()] for r in te]
    P['livre+moteur'] = [b + [m for m in e if m not in b] if b else e for b, e in zip(bk, engine)]
    LABEL = {'moteur': 'Moteur, meilleur coup', 'livre+moteur': 'Ton livre, sinon le moteur'}
    files = sorted((json.loads(p.read_text()) for p in Path(a.preds).glob('*.json')), key=lambda f: f['order'])
    infos = {}
    for f in files:
        name = f['label']
        if len(f['preds']) != len(te):
            print(f'  {name} : {len(f["preds"])} prédictions pour {len(te)} positions, ignoré', flush=True)
            continue
        P[name] = f['preds']
        infos[name] = f.get('info', {})
        if f.get('combos'):
            P[name + ' + ton livre'] = [b + [m for m in t if m not in b] if b else t for b, t in zip(bk, f['preds'])]
            P[name + ', parmi les 6 meilleurs coups du moteur'] = [[m for m in t if m in e] or e for t, e in zip(f['preds'], engine)]

    def phase(r, b):
        if r['ply'] < 20:
            return 'ouverture'
        return 'finale' if len([p for p in b.piece_map().values() if p.piece_type not in (chess.PAWN, chess.KING)]) <= 6 else 'milieu'
    groups = {'tout': lambda r, b: True, 'ouverture': lambda r, b: phase(r, b) == 'ouverture', 'milieu': lambda r, b: phase(r, b) == 'milieu',
              'finale': lambda r, b: phase(r, b) == 'finale', 'hors livre': lambda r, b: key(r['fen']) not in book,
              'rapide': lambda r, b: r['tc'] == 'rapid', 'blitz': lambda r, b: r['tc'] == 'blitz'}
    res = {}
    for name, preds in P.items():
        res[name] = {}
        for g, f in groups.items():
            idx = [i for i, (r, b) in enumerate(zip(te, boards)) if f(r, b)]
            if not idx:
                continue
            t1 = sum(preds[i][:1] == [truth[i]] for i in idx)
            t3 = sum(truth[i] in preds[i][:3] for i in idx)
            res[name][g] = {'n': len(idx), 'top1': round(100 * t1 / len(idx), 1), 'top3': round(100 * t3 / len(idx), 1)}
    (out / 'results-net.json').write_text(json.dumps({'results': res, 'info': infos, 'test_moves': len(te), 'train_moves': len(tr)}, indent=1, ensure_ascii=False))

    pc = lambda x: f'{x:.1f} %'.replace('.', ',')
    cols = [c for c in groups if c in res['moteur']]
    lines = ['# Jumeau numérique : réseau entraîné', '', f'{len(tr)} de tes coups pour apprendre, {len(te)} coups de test (tes parties les plus récentes, jamais vues).', '',
             f'| Approche | {" | ".join(cols)} | top 3 |', f'|---|{"|".join("---:" for _ in cols)}|---:|']
    for k, v in res.items():
        lines.append(f'| {LABEL.get(k, k)} | {" | ".join(pc(v[c]["top1"]) if c in v else "–" for c in cols)} | {pc(v["tout"]["top3"])} |')
    for name, inf in infos.items():
        if 'train_log' in inf:
            lines += ['', f'{name}, entraînement : ' + ' ; '.join(f'{x["stage"]} {x["epoch"]} : {pc(x["val_top1"] * 100)}' for x in inf['train_log']) + '.']
        if 'val_affine' in inf:
            lines += ['', f'Maia-2 : base {inf["base"]}, Elo chess.com + {inf["elo_offset"]} ; validation {pc(inf["val_brut"] * 100)} brut, '
                      f'{pc(inf["val_affine"] * 100)} affiné ({inf["steps"]} pas).']
    (out / 'report-net.md').write_text('\n'.join(lines) + '\n')
    print('\n'.join(lines))


if __name__ == '__main__':
    main()
