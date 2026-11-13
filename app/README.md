# Chess Drill v2

Refonte propre de l'app : **TypeScript + Vite**, **IndexedDB**, tests (**Vitest**), hébergement **Cloudflare Workers** (app + API `/api/*`), données dans **D1**, analyse des parties **chaque nuit** par GitHub Actions avec Stockfish natif.

```
npm install
npm run dev        # développement
npm test           # tests unitaires
npm run build      # vérification des types + build dans dist/
```

## Structure
- `src/core/` : logique pure et testée — types, win% et précision, PGN, pendules, livre d'ouvertures et déviations (avec transpositions), répétition espacée, structures de pions, aides chess.js.
- `src/storage/db.ts` : IndexedDB (stores `games`, `gfaults`, `kv`) et import unique des données de la v1 (`localStorage` `drill_matt_v3`).
- `src/engine/stockfish.ts` : Stockfish 19 en Web Worker — file de recherche par moteur, MultiPV, nettoyage des FEN, multicœur si `crossOriginIsolated`, vérification profonde avec relance.
- `src/data/` : répertoire, plans animés, structures, pièces (JSON).
- `public/_headers` : COOP/COEP pour Cloudflare Pages.
- `tests/` : tests unitaires (17).

## Architecture
- `worker/index.ts` : API (parties, analyses, fautes, progression, proxy chess.com, « analyser maintenant »), protégée par le secret `APP_TOKEN`.
- `migrations/` : schéma D1. Les analyses sont rangées par pseudo chess.com (partagées), la progression par compte.
- `scripts/analyse.ts` : récupère les parties récentes, les analyse avec Stockfish natif (un moteur par cœur) et les envoie à l'API. Lancé par `.github/workflows/analyse.yml` (3h17 UTC + à la demande).
- `src/core/analysis.ts`, `src/core/ingest.ts` : notation des coups, fautes, import chess.com — partagés par l'app et l'analyse.

```
npx tsx scripts/analyse.ts --input tests/fixtures/chesscom-games.json --user matt_chess00 --days 100000 --out r.json   # hors ligne
npx wrangler d1 migrations apply chess-drill --local && npx wrangler dev                                          # API en local (.dev.vars : APP_TOKEN=…)
```

## Mise en place Cloudflare (une fois)
1. Rien à faire pour D1 : la CI crée la base `chess-drill` au premier déploiement et injecte son identifiant.
2. `APP_TOKEN` est posé par la CI. `GH_TOKEN` (jeton GitHub fin, droit *Actions : écriture* sur ce repo) se pose à part : `npx wrangler secret put GH_TOKEN`.
3. Secrets du repo GitHub : `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `APP_TOKEN` (posé sur le Worker au déploiement et utilisé par l'analyse). Variable du repo : `API_URL`.

## Ancien déploiement Cloudflare Pages
Projet relié au repo GitHub, branche `v2`, **Root directory** `app`, **Build command** `npm run build`, **Output** `dist`.
Le modèle Maia (45 Mo) dépasse la limite de 25 Mo par fichier de Cloudflare Pages : il est chargé depuis GitHub (CSSLab) en attendant un bucket R2 (étape 2).

## Avancement
- [x] 1a — squelette, cœur testé, stockage, moteur
- [x] 1b — analyse de nuit (Stockfish natif), API Worker + D1
- [ ] 1c — écrans : Aujourd'hui, Répertoire (+ plans), Woodpecker, Stats, revue de partie
- [ ] 1d — bascule depuis la v1
