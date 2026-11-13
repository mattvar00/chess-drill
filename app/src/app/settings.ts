/** Réglages : apparence, code d'accès et synchronisation, son, reprise de la progression de l'ancienne version. */
import { $, esc, plural } from '../ui/dom';
import { setSound } from '../ui/sound';
import type { BranchState } from '../core/types';
import { getToken, lastSync, setToken, sync } from './api';
import { BR, save, store } from './store';
import { BOARDS, MODES, PALETTES, applyLook, look, shownMode } from './theme';

const radios = (name: string, list: readonly (readonly [string, string])[], value: string) => list.map(([v, l]) => `<label><input type="radio" name="${name}" value="${v}" ${value === v ? 'checked' : ''}><span>${l}</span></label>`).join('');
export function viewSettings(root: HTMLElement) {
  const s = store.state.settings, L = look();
  root.innerHTML = `
    <section class="grp"><h2>Apparence</h2><div class="surf card padded stackc">
      <p class="flabel" id="lPal">Couleurs</p>
      <div class="swatches" role="radiogroup" aria-labelledby="lPal">${PALETTES.map(([v, l]) => `<label><input type="radio" name="palette" value="${v}" ${L.palette === v ? 'checked' : ''}><span class="sw" data-palette="${v}" data-mode="${shownMode()}"></span><span>${l}</span></label>`).join('')}</div>
      <p class="flabel" id="lMode">Mode</p>
      <div class="seg" role="radiogroup" aria-labelledby="lMode">${radios('mode', MODES, L.mode)}</div>
      <p class="flabel" id="lBoard">Échiquier</p>
      <div class="seg" role="radiogroup" aria-labelledby="lBoard">${radios('board', BOARDS, L.board)}</div>
      <p class="hint">Assorti suit les couleurs choisies. Vert reprend le plateau par défaut de chess.com, pour t'entraîner sur ce que tu vois en partie.</p>
    </div></section>
    <section class="grp"><h2>Tes parties et ta progression</h2><div class="surf card padded">
      <form id="fSync" class="form">
        <label for="iName">Prénom</label><input id="iName" autocomplete="given-name" value="${esc(s.name ?? '')}">
        <label for="iUser">Pseudo chess.com</label><input id="iUser" autocomplete="off" autocapitalize="none" spellcheck="false" value="${esc(s.user || 'matt_chess00')}">
        <label for="iToken">Code d'accès</label><input id="iToken" type="password" autocomplete="current-password" placeholder="64 caractères" value="${esc(getToken())}">
        <p class="hint">Le code relie cet appareil au serveur : parties analysées chaque nuit et progression commune à tous tes appareils.</p>
        <button class="btn pri" type="submit">Enregistrer et synchroniser</button>
        <p class="status" id="syncStatus" role="status">${lastSync() ? `Dernière synchronisation le ${new Date(lastSync()).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}.` : ''}</p>
      </form>
    </div></section>
    <section class="grp"><h2>Son</h2><div class="surf card padded">
      <label class="check"><input type="checkbox" id="cSound" ${s.sound === false ? '' : 'checked'}> Bruit des pièces et signal de fin de ligne</label>
    </div></section>
    <section class="grp"><h2>Ancienne version</h2><div class="surf card padded stackc">
      <p class="hint">Dans l'ancienne app, ouvre les réglages et exporte tes données, puis choisis le fichier ici. Seule la progression des lignes est reprise ; pour chaque ligne, le passage le plus récent est conservé.</p>
      <label class="btn">Choisir le fichier d'export<input type="file" id="fImport" accept="application/json,.json" hidden></label>
      <p class="status" id="importStatus" role="status"></p>
    </div></section>`;
  const status = $('#syncStatus', root);
  $('#fSync', root).addEventListener('submit', async e => {
    e.preventDefault(); s.name = $<HTMLInputElement>('#iName', root).value.trim(); s.user = $<HTMLInputElement>('#iUser', root).value.trim().toLowerCase() || 'matt_chess00'; setToken($<HTMLInputElement>('#iToken', root).value); save();
    if (!getToken()) { status.className = 'status'; status.textContent = 'Enregistré.'; return; }
    status.className = 'status'; status.textContent = 'Synchronisation en cours…';
    try { const r = await sync(); status.textContent = `Synchronisé : ${plural(r.games, 'nouvelle partie', 'nouvelles parties')}${r.lines ? ', progression mise à jour depuis un autre appareil' : ''}.`; }
    catch (err) { status.className = 'status err'; status.textContent = (err as Error).message; }
  });
  /* Apparence : appliquée tout de suite, sans bouton d'enregistrement. */
  for (const key of ['palette', 'mode', 'board'] as const) root.querySelectorAll<HTMLInputElement>(`input[name=${key}]`).forEach(r => r.addEventListener('change', () => {
    s[key] = r.value; applyLook({ palette: s.palette ?? L.palette, mode: s.mode ?? L.mode, board: s.board ?? L.board }); save();
    root.querySelectorAll<HTMLElement>('.sw').forEach(sw => { sw.dataset.mode = shownMode(); });
  }));
  $('#cSound', root).addEventListener('change', e => { s.sound = (e.target as HTMLInputElement).checked; setSound(s.sound !== false); save(); });
  $('#fImport', root).addEventListener('change', async e => {
    const out = $('#importStatus', root), f = (e.target as HTMLInputElement).files?.[0]; if (!f) return;
    try { const n = importLegacy(JSON.parse(await f.text())); out.className = 'status'; out.textContent = n ? `${plural(n, 'ligne reprise', 'lignes reprises')}.` : 'Rien de plus récent à reprendre dans ce fichier.'; }
    catch { out.className = 'status err'; out.textContent = "Ce fichier n'est pas un export de l'app."; }
  });
}
/** Fusionne la progression des lignes d'un export de l'ancienne version. Renvoie le nombre de lignes reprises. */
export function importLegacy(data: unknown): number {
  const br = (data as { br?: Record<string, BranchState> })?.br; if (!br || typeof br !== 'object') throw new Error('format');
  let n = 0;
  for (const [id, v] of Object.entries(br)) {
    if (!BR[id] || !v || typeof v.last !== 'number' || !v.runs) continue;
    if (v.last > (store.state.br[id]?.last || 0)) { store.state.br[id] = v; n++; }
  }
  if (n) save(); return n;
}
