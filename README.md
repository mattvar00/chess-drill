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
