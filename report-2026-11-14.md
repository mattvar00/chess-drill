# Jumeau numérique : banc d'essai v0 (matt_chess00)

Le 2026-11-14. Apprentissage : 1500 parties (50358 coups). Test : 100 parties plus récentes (3306 coups), jamais vues. Elo de référence 1702.

Concordance : part de tes coups du test que l'approche prédit exactement.

| Approche | tout | ouverture | milieu | finale | hors livre | rapide | blitz | top 3 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Moteur, meilleur coup | 39,3 % | 38 % | 40,6 % | 38,8 % | 39,3 % | 38,6 % | 41,6 % | 68,8 % |
| Moteur qui voit peu (profondeur 3) | 36,7 % | 29 % | 38,8 % | 41,8 % | 38,9 % | 36,1 % | 38,6 % | – |
| Moteur bridé à ton Elo | 28,3 % | 25,1 % | 29,6 % | 29,7 % | 29,1 % | 27,8 % | 29,7 % | – |
| Ton livre, sinon le moteur | 46,1 % | 60,4 % | 40,6 % | 38,8 % | 39,3 % | 44,9 % | 49,5 % | 70,8 % |
| Modèle appris sur tes coups | 42,5 % | 58,1 % | 35,3 % | 36,6 % | 35,4 % | 41,5 % | 45,5 % | 69,6 % |

Positions du test déjà vues dans tes parties d'apprentissage : 15 %. Ton coup figure dans les candidats du moteur : 82 % (plafond du modèle perso).

Ce qui pèse le plus dans le modèle perso : livre +7,05, rang -1,12, perte -0,78, roque +0,67, dame -0,51, développe +0,5, fou +0,44, valeur prise -0,42.
