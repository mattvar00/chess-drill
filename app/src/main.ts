/** Point d'entrée : coquille de l'app et navigation par adresse (#/…), pour que le bouton retour du téléphone fonctionne. */
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/space-grotesk/wght.css';
import './styles.css';
import { $, esc, icon } from './ui/dom';
import { setSound } from './ui/sound';
import { BR, REP, loadStore, store } from './app/store';
import { viewBloc, viewBlocs, viewHome, viewSystem } from './app/views';
import { mountTrainer } from './app/trainer';
import { viewSettings } from './app/settings';
import { mountExercise, viewWood } from './app/wood';
import { endSession, lineUrl, session } from './app/session';
import { getToken, sync } from './app/api';
import { applyLook, restoreLook } from './app/theme';
import { gameUrl, mountReview, retryFault, reviewTitle, viewGames } from './app/games';
import { mountPlan, mountQuiz, mountStruct, planTitle, viewPlans, viewStructs } from './app/plans';
import { STRUCT } from './core/structures';
import { mountTool, setTool } from './app/explorer';

restoreLook();
const TABS = [['#/', 'Accueil', 'home'], ['#/rep', 'Répertoire', 'book'], ['#/wood', 'Woodpecker', 'target'], ['#/parties', 'Parties', 'chart']] as const;
document.getElementById('app')!.innerHTML = `
  <header class="top" id="top" hidden><a class="back" id="back" aria-label="Retour">${icon('back')}</a><div class="htitle"><b id="title"></b><small id="subtitle"></small></div><span class="hright" id="hright"></span><button class="xtool" id="xtool" type="button" hidden>${icon('search')}</button></header>
  <main id="view" tabindex="-1"></main>
  <nav class="tabs surf" id="tabs" aria-label="Sections">${TABS.map(([h, l, i]) => `<a href="${h}"><span class="tp">${icon(i)}</span>${l}</a>`).join('')}</nav>`;
const view = $('#view'), back = $<HTMLAnchorElement>('#back');
mountTool($<HTMLButtonElement>('#xtool'));
let cleanup: (() => void) | null = null;

/** Barre du haut (seulement sur les écrans où l'on revient en arrière) et onglet actif. `right` : contenu à droite du titre. */
function shell(title: string, sub: string, backHref: string | null, tab: string | null, right = '') {
  $('#title').textContent = title; $('#subtitle').textContent = sub; document.title = title === 'Chess Drill' ? title : `${title} · Chess Drill`;
  $('#top').hidden = !backHref; if (backHref) back.href = backHref; $('#hright').innerHTML = right; setTool('hidden');
  $('#tabs').hidden = !tab; document.body.classList.toggle('focus', !tab);
  document.querySelectorAll<HTMLAnchorElement>('#tabs a').forEach(a => { if (a.getAttribute('href') === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
}
function route() {
  cleanup?.(); cleanup = null;
  const [path, query = ''] = location.hash.slice(1).split('?'), p = path.split('/').filter(Boolean), q = new URLSearchParams(query);
  if (p[0] === 'l' && BR[p[1]]) {
    const { br, sys, bloc } = BR[p[1]], mode = p[2] === 'drill' ? 'drill' : 'explore', S = session();
    if (S && !S.pool.includes(br.id)) endSession();
    const cur = session(), g = q.get('g');
    const where = cur ? `${cur.label}, ligne ${cur.done.size + (cur.done.has(br.id) ? 0 : 1)} sur ${cur.pool.length}` : sys.titre;
    shell(br.titre, where, cur ? cur.back : bloc.id === 'plans' ? `#/plan/${br.id.slice(5)}` : `#/rep/${bloc.id}/${sys.id}`, null, `<a class="hchip" href="${lineUrl(br.id, mode === 'drill' ? 'explore' : 'drill')}">${mode === 'drill' ? 'Voir la ligne' : 'Drill'}</a>`);
    cleanup = mountTrainer(view, br.id, mode, g ? store.games.find(x => x.id === g) : undefined);
  } else if (p[0] === 'partie' && p[1] && p[2] === 'refaire') {
    const id = decodeURIComponent(p[1]), ply = +p[3], f = retryFault(id, ply), backTo = gameUrl(id, ply + 1);
    if (!f) { location.replace(backTo); return; }
    endSession(); shell('Retrouver le bon coup', '', backTo, null);
    cleanup = mountExercise(view, (title, sub, clock) => {
      $('#title').textContent = title; $('#subtitle').textContent = sub;
      $('#hright').innerHTML = clock ? `<span class="pill clock surf">${icon('clock')}${esc(clock)}</span>` : '';
    }, { fault: f, back: backTo });
  } else if (p[0] === 'partie' && p[1]) {
    endSession(); const id = decodeURIComponent(p[1]), r = q.get('r'), backTo = r && r.startsWith('#/') ? r : '#/parties', [t, sub] = reviewTitle(id);
    shell(t, sub, backTo, null); cleanup = mountReview(view, id, q.has('i') ? +q.get('i')! : null, backTo);
  } else if (p[0] === 'plan' && p[1]) {
    endSession(); shell(planTitle(p[1]), 'Plan animé', '#/plans', null); cleanup = mountPlan(view, p[1], q.has('vu'));
  } else if (p[0] === 'structure' && p[1] && p[2] === 'quiz') {
    endSession(); shell('Quel est le plan ?', '', `#/structure/${p[1]}`, null);
    cleanup = mountQuiz(view, p[1], (title, sub) => { $('#title').textContent = title; $('#subtitle').textContent = sub; });
  } else if (p[0] === 'structure' && p[1]) {
    endSession(); shell(STRUCT[p[1]]?.name ?? 'Structure', STRUCT[p[1]]?.fam ?? '', '#/structures', null); cleanup = mountStruct(view, p[1]);
  } else if (p[0] === 'wood' && p[1] === 'go') {
    endSession(); shell('Woodpecker', '', '#/wood', null);
    cleanup = mountExercise(view, (title, sub, clock) => {
      $('#title').textContent = title; $('#subtitle').textContent = sub;
      $('#hright').innerHTML = clock ? `<span class="pill clock surf">${icon('clock')}${esc(clock)}</span>` : '';
    });
  } else {
    endSession();
    const bloc = p[0] === 'rep' ? REP.blocs.find(b => b.id === p[1]) : undefined, sys = bloc?.systemes.find(s => s.id === p[2]);
    if (bloc && sys) { shell(sys.titre, bloc.titre, `#/rep/${bloc.id}`, '#/rep'); viewSystem(view, bloc, sys); }
    else if (bloc) { shell(bloc.titre, bloc.sous, '#/rep', '#/rep'); viewBloc(view, bloc); }
    else if (p[0] === 'rep') { shell('Répertoire', '', null, '#/rep'); viewBlocs(view); }
    else if (p[0] === 'wood') { shell('Woodpecker', '', null, '#/wood'); viewWood(view); }
    else if (p[0] === 'parties') { shell('Parties', '', null, '#/parties'); viewGames(view); }
    else if (p[0] === 'plans') { shell('Plans animés', '', '#/rep', '#/rep'); viewPlans(view); }
    else if (p[0] === 'structures') { shell('Structures de pions', '', '#/parties', '#/parties'); viewStructs(view); }
    else if (p[0] === 'reglages') { shell('Réglages', '', '#/', '#/reglages'); viewSettings(view); }
    else { shell('Chess Drill', '', null, '#/'); viewHome(view); }
  }
  window.scrollTo(0, 0);
}

async function boot() {
  await loadStore(); const s = store.state.settings; setSound(s.sound !== false);
  if (s.palette || s.mode || s.board) applyLook({ palette: s.palette, mode: s.mode, board: s.board });
  window.addEventListener('hashchange', route); route();
  // Nouvelles parties et progression des autres appareils : on rafraîchit l'écran d'accueil si quelque chose est arrivé.
  // (seulement sur les écrans de liste : une revue ou un exercice en cours n'est pas interrompu)
  if (getToken()) sync().then(r => { if ((r.games || r.lines) && /^(#\/?)?(rep|wood|parties|structures|plans)?$/.test(location.hash)) route(); }).catch(() => { /* hors ligne : l'app reste utilisable */ });
  if (import.meta.env.PROD && 'serviceWorker' in navigator) void navigator.serviceWorker.register('./sw.js');
}
boot().catch(e => { view.innerHTML = `<p class="status err">L'app n'a pas pu démarrer : ${esc((e as Error).message)}</p>`; });
