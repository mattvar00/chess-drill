# Jumeau numérique

Un réseau qui joue comme toi : il prédit, dans une position, le coup que **tu** jouerais.

1. `data.py` : tes parties chess.com (chacun de tes coups devient un exemple, avec la pendule et l'Elo des deux joueurs)
   et un échantillon de parties humaines de ton niveau tiré de la base ouverte de Lichess (CC0).
2. `train.py` : le réseau maison. Pré-entraînement sur Lichess (repris du run précédent quand il existe), puis affinage
   sur tes coups, les parties récentes comptant davantage, et une dernière passe sur tes trois derniers mois.
3. `maia_ft.py` : la même chose en partant de Maia-2 (Université de Toronto, licence MIT, entraîné sur des millions
   de parties Lichess), qui tient compte de l'Elo des deux joueurs.
4. `eval.py` : concordance (part de tes coups prédits exactement) sur tes parties les plus récentes, jamais vues,
   comparée au moteur et à ton livre.

Tourne dans GitHub Actions (workflow « Jumeau, entraînement ») : les données, puis les deux entraînements en parallèle,
puis l'évaluation. Le rapport et le réseau maison sont publiés sur la branche `twin-results` ; le Maia-2 affiné
(trop lourd pour git) reste dans les artefacts du run. Le banc d'essai v0 (approches sans réseau) est `app/scripts/twin.ts`.
