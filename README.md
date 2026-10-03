# Drill — entraînement aux ouvertures (matt_chess00)

Site statique, 100 % client, zéro dépendance réseau hors l'API publique chess.com.

## Lancer en local
```
python -m http.server 8000
# puis http://localhost:8000
```
(`file://` fonctionne pour le drill, mais pas pour le fetch chess.com.)

## Déployer sur GitHub Pages
1. Repo → pousser ce dossier tel quel (index.html à la racine).
2. Settings → Pages → Source : branche `main`, dossier `/`.
3. L'app est en ligne à `https://<pseudo>.github.io/<repo>/`.

## Structure
- `index.html` — coquille : en-tête (retour, titre, ⚙) + barre du bas Aujourd'hui / Entraîner / Parties / Progrès
- `js/nav.js` — pile d'écrans (bouton retour, geste retour du navigateur), écrans Aujourd'hui et Entraîner
- `js/data.js` — répertoire (83 branches, 6 blocs) + 20 fautes. C'est le seul fichier à éditer pour ajouter une ligne.
- `js/store.js` — progression localStorage, répétition espacée (SM-2 adapté), export/import JSON, pondération du drill
- `js/games.js` — fetch chess.com, parsing PGN (+ `%clk`), livre FEN→coups, détection déviation / trou, onglet Parties
- `js/engine.js` — Stockfish 18 lite (WASM, `js/engine/`, 7 Mo) dans un Web Worker : notation de chaque coup (win% Lichess), précision, extraction automatique des fautes
- `js/maia.js` + `js/maia/` — Maia 3 (modèle humain, ONNX Runtime Web, 45 Mo) : menaces probables contre le répertoire, sparring humain, « un humain joue ça ? »
- `js/app.js` — échiquier, drill, explorer, fautes, réglages
- `js/chess.js` — chess.js 0.10 (règles)

## Détection des déviations
Chaque branche est aplatie en une carte *position → coups acceptés* (clé = FEN sans compteurs, donc les transpositions sont gérées). Une partie est rejouée coup par coup :
- ton coup absent de la carte → **déviation** (ouvre le drill directement à cette position) ;
- coup adverse absent → **trou** (ligne à ajouter au répertoire) ;
- position inconnue → sortie de livre. Analyse limitée aux 24 premiers demi-coups.

Les déviations et la fréquence des lignes dans tes 60 derniers jours pondèrent le tirage du drill.

## Ajouter une branche
Dans `js/data.js`, ajouter un objet `{id, titre, moves:[{san,uci}...], notes:{ply:"..."}}` dans le système voulu, puis ⚙ → *Réanalyser les parties*.

## Si le fetch chess.com échoue (CORS / 429)
Chess.com renvoie parfois ses réponses de rate-limit sans en-tête CORS ; le navigateur les voit comme une erreur CORS. L'app réessaie 5 fois en série. Si ça ne suffit pas :
1. Déployer `proxy/worker.js` sur Cloudflare Workers (gratuit, 2 minutes, aucun serveur à maintenir).
2. ⚙ → coller l'URL du worker. Les essais 3-5 passent alors par le proxy, qui ajoute le User-Agent attendu, met en cache les mois passés et renvoie les en-têtes CORS.

## Moteur
Onglet Parties → « Moteur · analyser N parties » (10 à la fois, ~20-30 s par partie à profondeur 12) ou, dans une partie rejouée, « Analyser au moteur ». Chaque coup est classé précis / bon / imprécision / erreur / gaffe selon la perte de win% ; la précision suit la formule Lichess. Tes gaffes (≥ 15 points de win%) deviennent des exercices dans l'onglet Fautes, avec thème, meilleure suite et réfutation.

## Profil
Six axes sur 7/30/90 jours : ouverture (couverture du répertoire, chances au coup 10), tactique (précision, gaffes/partie, thèmes), conversion (positions ≥ 80 % gagnées), résilience (positions ≤ 20 % sauvées), horloge (temps par coup, gaffes jouées en < 3 s, défaites au temps — via les tags `%clk`), tilt (parties/jour, taux de victoire après 2 défaites d'affilée, fin de session). Garde-fou quotidien réglable dans ⚙.

## Woodpecker & aveugle
Onglet Fautes → « Cycle Woodpecker » enchaîne toutes les fautes en chrono ; l'historique des cycles s'affiche. En drill, ◐ cache les pièces (coordonnées visibles) pour travailler la visualisation.

## Maia
- **Menaces** (Répertoire → « Menaces (Maia) ») : pour chaque position du répertoire où l'adversaire a le trait, Maia 3 conditionné à l'Elo adverse donne la distribution des réponses humaines ; l'app liste les réponses probables non couvertes, classées par probabilité × fréquence d'apparition. La probabilité d'atteindre chaque branche pondère aussi le tirage du drill.
- **Sparring** : en fin de ligne (drill ou explorer) ou depuis une partie rejouée, « Sparring Maia » continue la position contre un humain simulé à l'Elo choisi ; chaque coup est noté par Stockfish en direct.
- **Humain ?** : dans une partie rejouée (une fois Maia chargé), chaque coup indique à quelle fréquence un joueur de ton Elo le joue.
Le modèle (`js/maia/maia3_simplified.onnx`, Apache-2.0) est servi depuis le dépôt ; sinon l'app le télécharge depuis le dépôt CSSLab et le garde en IndexedDB.

## Scouting
Onglet Parties → « Scouting » : pseudo adverse → ses 3 derniers mois (jusqu'à 120 parties), taux de victoire par couleur, ses 4 ouvertures les plus fréquentes par couleur, et pour chacune si ton répertoire a une réponse (branche citée) ou s'il faut préparer.

## v4 — navigation
- **Aujourd'hui** : ce qu'il y a à faire (révisions dues, déviations à corriger, fautes nouvelles), garde-fou, raccourcis.
- **Entraîner** : Répertoire, drill mixte, adversaires réels (Maia), Fautes, Woodpecker (reprise d'un cycle interrompu), partie libre contre Maia.
- **Parties** : synchro chess.com / PGN, filtre de cadence (s'applique aussi à Progrès), déviations avec choix de la ligne de référence (retenu par position), scouting.
- **Progrès** : radar 6 axes + détail.
Le bouton ‹ revient toujours à l'écran précédent ; le geste retour du téléphone aussi.

## v5 — répertoire vivant
Trois statuts par système : **joué** (tes lignes réelles : seules elles génèrent des déviations à corriger), **à apprendre** (lignes ajoutées pour toi, drill sans alerte), **alternatif**. Un coup qui retombe dans le répertoire dans les 3 demi-coups est une transposition, pas une déviation. Quand `DATA.version` change, les parties en cache sont réanalysées au chargement.

## v6 — carte joueur et coups forcés
- **Progrès** : carte joueur calculée à chaque synchronisation (≥ 20 parties analysées sur la période). Chaque note compare tes coups à ceux de tes adversaires dans les mêmes parties (75 = leur niveau) : rythme, préparation, conversion, tactique (attaque / défense), défense, mental, positionnel, activité, finale, pendule. Type de joueur selon le modèle Hansen (théoricien, réflecteur, pragmatique, activiste) à partir de l'écart positions calmes / positions forcées. Tableau détaillé toi vs pairs.
- **Coups forcés** (Entraîner) : les positions où un échec ou une prise s'imposait et où tu as joué un coup calme, en série chronométrée (cycles séparés des fautes).

À chaque déploiement, incrémenter `?v=N` sur les `<script>`/`<link>` d'index.html (sinon les navigateurs gardent l'ancien JS en cache jusqu'à 10 min).

## v7 — simplification
- Une seule barre de filtres (période 7 j / 30 j / 3 mois + cadence), partagée par Parties et Progrès.
- Un seul bouton **Mettre à jour** (Aujourd'hui, Parties, Progrès) : récupère tous les mois de la période sur chess.com puis analyse au moteur toutes les parties non analysées, avec progression, temps restant et Arrêter. La mise à jour continue si on change d'écran.
- Aujourd'hui : mini-carte joueur (→ Progrès), Mettre à jour, 3 tâches maximum.
- Parties : trous, écarts, toutes les parties, scouting et import PGN repliés.
- Progrès : filtres, carte, radar ; le reste replié dans « Détails ».
- Réglages : pseudo, synchronisation, garde-fou ; le reste dans « Avancé ».
- **Synchronisation** (`js/sync.js`) : gist privé sur le compte GitHub (token fine-grained, permission compte *Gists : Read and write*). Réception à l'ouverture, envoi groupé 15 s après chaque modification et à la mise en arrière-plan. Fusion sans perte : on garde toujours la version analysée d'une partie, la progression la plus récente d'une branche, les fautes trouvées. Le token reste sur l'appareil (clé `drill_sync`), il n'est jamais synchronisé.

## v8 — analyse robuste
- Plusieurs moteurs Stockfish en parallèle (jusqu'à 4 sur ordinateur, 2 sur téléphone, selon le nombre de cœurs) : chaque moteur est un worker mono-thread indépendant.
- Reprise automatique : si la page est rechargée ou fermée pendant l'analyse, elle repart toute seule à la réouverture (drapeau `drill_upd`). Chaque partie est sauvegardée dès qu'elle est finie.
- Avertissement avant de quitter la page pendant une analyse ; écran maintenu allumé (Wake Lock) sur téléphone.
- Chien de garde : si un moteur ne répond plus (téléphone mis en veille), il est relancé et la partie recommencée.

## Plans animés
`js/plans-data.js` : 14 animations (Sveshnikov ×4, Alapin pion isolé, Meran, Anti-Meran, contre le Londres, Slave 3.Nc3 ×3, contre 1…e6, Nimzo 4.Qc2 ×2). Chaque plan = une ligne (SAN, vérifiée au moteur, aucune perte > ~0,5 pion) + des étapes `{p: demi-coups joués, a: flèches, h: cases clés, c: explication}`. Idées paraphrasées des sources listées dans chaque plan. Accès : Entraîner → Plans animés, bouton « Voir les plans » d'un système, bouton « Voir le plan » en fin de ligne. « Jouer contre Maia » lance le sparring depuis l'étape affichée.

## Itération 1 (v9) — fondations et fluidité
- `js/board2.js` remplace le plateau : glisser-déposer (souris et tactile) en plus du clic-clic, animation des coups (roque compris), sons synthétisés (coup, prise, échec, roque, erreur, réussite ; réglable dans ⚙), promotion en dame par défaut.
- L'échiquier tient toujours dans la hauteur de l'écran ; listes centrées (860 px) sur ordinateur.
- Drill : retour positif après chaque bon coup (« ✓ coup · réponse »), son de fin de ligne.
- Cohérence : textes de systèmes périmés corrigés, références aux anciennes parties retirées ; les déviations ne sont plus comptées sur toutes les lignes d'un système mais sur la ligne concernée ; la carte joueur se calcule sur les 100 dernières parties analysées (stable quelle que soit la période) ; invitation à activer la synchro.

## Itération 2 (v10) — revue de partie et commentaires
`js/review.js`. Onglet Parties → toucher une partie ouvre sa revue :
- précision des deux joueurs (formule Lichess), décompte des coups par classe, précision par phase ;
- classification en 11 classes : théorie, forcé, brillant (sacrifice juste), très fort (seul coup qui garde l'avantage), meilleur, excellent, bon, imprécision, erreur, occasion manquée (après une gaffe adverse non punie), gaffe ; une « gaffe » qui laisse encore nettement gagnant est rétrogradée ;
- échiquier avec barre d'évaluation, badge de classe sur la case d'arrivée, flèche verte du coup qu'il fallait jouer, graphique cliquable, moments clés, liste de coups cliquable, flèches du clavier ;
- **commentaires en français générés par règles** (aucune IA) : ce que fait le coup (prise, échec, fourchette, clouage, attaque d'une pièce non défendue, développement, centre, colonne ouverte, pion passé, pion avancé devant le roi), la réfutation quand le coup est mauvais (mat, pièce laissée en prise, matériel perdu sur la ligne du moteur), le coup qu'il fallait jouer et pourquoi (prise, menace, gain de matériel, mat), et le temps de réflexion d'une gaffe jouée vite ;
- « Retrouver le bon coup » transforme la position en exercice ; « Rejouer d'ici contre Maia » ; « Corriger la déviation » pour les parties sorties du répertoire.

## v11 — exercices plus lisibles
`js/puzzle2.js` : barre d'évaluation à côté de l'échiquier dans les fautes, coups forcés et Woodpecker ; plus d'enchaînement automatique après une réussite (« Suivant » explicite, chrono Woodpecker en pause pendant la lecture) ; explication « Pourquoi ce coup ? » (ce qu'il fait, matériel gagné, mat, menace parée) et « Dans ta partie » (réponse adverse et matériel perdu) ; navigation ‹ › dans la solution et dans le coup de la partie, avec la barre qui suit.

## Itération 3 (v12) — files intelligentes
`js/queue.js`. Fini les compteurs qui s'accumulent : chaque mode (Fautes, Coups forcés) montre « À revoir maintenant », les 10 positions les plus utiles, triées par priorité (position due, chances perdues, récence de la partie, jamais vue, ratée plusieurs fois). Répétition espacée par position : trouvée du premier coup → revient dans 3 jours puis de plus en plus tard ; trouvée après erreur → demain ; solution affichée → demain, facilité réduite. « Commencer » enchaîne la file puis revient à la liste ; Woodpecker en cycle complet ou sur les 10 prioritaires ; toutes les positions restent consultables, avec leur échéance. Aujourd'hui et Parties affichent au plus 10 éléments par tâche.
