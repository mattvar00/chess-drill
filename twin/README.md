# Jumeau numérique

Un réseau qui joue comme toi : il prédit, dans une position, le coup que **tu** jouerais.

1. `data.py` : tes parties chess.com (chacun de tes coups devient un exemple) et un échantillon de parties
   humaines de ton niveau tiré de la base ouverte de Lichess (CC0).
2. `train.py` : pré-entraînement sur Lichess (un humain de ton niveau), puis affinage sur tes coups.
3. `eval.py` : concordance (part de tes coups prédits exactement) sur tes parties les plus récentes,
   jamais vues, comparée au moteur et à ton livre.

Tourne dans GitHub Actions (workflow « Jumeau, entraînement ») ; le rapport et le modèle sont publiés sur la
branche `twin-results`. Le banc d'essai v0 (approches sans réseau) est `app/scripts/twin.ts`.
