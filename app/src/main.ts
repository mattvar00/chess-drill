/** Point d'entrée v2 (étape 1a) : stockage migré + moteur. Les écrans arrivent à l'étape 1b. */
import { migrateLegacy, getAllGames, getState } from './storage/db';
import { canThread, mainEngine } from './engine/stockfish';
import rep from './data/repertoire.json';

async function boot() {
  const el = document.getElementById('app')!;
  const imported = await migrateLegacy(); const games = await getAllGames(); const st = await getState();
  const n = (rep as { blocs: { systemes: { branches: unknown[] }[] }[] }).blocs.reduce((a, b) => a + b.systemes.reduce((x, s) => x + s.branches.length, 0), 0);
  el.innerHTML = `<h1 style="font-size:20px">Chess Drill v2 · en construction</h1><p>${games.length} parties en base locale${imported ? ` (dont ${imported} importées de l'ancienne version)` : ''} · ${Object.keys(st.br).length} lignes avec historique · ${n} lignes de répertoire.</p><p id="eng">Moteur : démarrage…</p>`;
  const t0 = performance.now(); const e = await mainEngine(); const r = await e.eval('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', 18, 3000);
  document.getElementById('eng')!.textContent = `Moteur : Stockfish 19 ${canThread() && e.threads > 1 ? `multicœur (${e.threads} fils)` : (canThread() ? "multicœur possible (1 seul cœur libre)" : "mono-thread")} · profondeur 18 en ${Math.round(performance.now() - t0)} ms · meilleur coup ${r.best}`;
}
boot().catch(e => { document.getElementById('app')!.textContent = 'Erreur : ' + e.message; });
