# Chess Drill v2

Refonte propre de l'app : **TypeScript + Vite**, **IndexedDB**, tests (**Vitest**), hébergement **Cloudflare Pages** (en-têtes COOP/COEP → Stockfish multicœur).

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

## Déploiement Cloudflare Pages
Projet relié au repo GitHub, branche `v2`, **Root directory** `app`, **Build command** `npm run build`, **Output** `dist`.
Le modèle Maia (45 Mo) dépasse la limite de 25 Mo par fichier de Cloudflare Pages : il est chargé depuis GitHub (CSSLab) en attendant un bucket R2 (étape 2).

## Avancement
- [x] 1a — squelette, cœur testé, stockage, moteur
- [ ] 1b — portage des écrans
- [ ] 1c — déploiement Cloudflare et bascule
