/** Point d'entrée : coquille de l'app et navigation par adresse (#/…), pour que le bouton retour du téléphone fonctionne. */
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/space-grotesk/wght.css';
import './styles.css';
import { $, esc, icon } from './ui/dom';
import { setSound, setSoundSet } from './ui/sound';
import { BR, REP, loadStore, store, woodCur } from './app/store';
import { viewBloc, viewBlocs, viewHome, viewSystem, viewTrain } from './app/views';
import { mountTrainer } from './app/trainer';
import { viewSettings } from './app/settings';
import { mountExercise, viewWood } from './app/wood';
import { endSession, lineUrl, session } from './app/session';
import { sync } from './app/api';
import { applyLook, restoreLook } from './app/theme';
import { gameUrl, mountReview, retryFault, reviewTitle, viewGames, viewProfile } from './app/games';
import { mountPlan, mountStruct, planTitle, viewPlans, viewStructs } from './app/plans';
import { STRUCT } from './core/structures';
import { mountFreeExplorer, mountTool, setTool } from './app/explorer';

restoreLook();
/** Trois onglets, rangés par intention : ce que je dois faire, ce que je peux faire, où j'en suis. */
const TABS = [['#/', "Aujourd'hui"], ['#/entrainer', "S'entraîner"], ['#/progres', 'Progrès']] as const;
const TRAIN = '#/entrainer', PROG = '#/progres';
document.getElementById('app')!.innerHTML = `
  <header class="top" id="top" hidden><a class="back" id="back" aria-label="Retour">${icon('back')}</a><div class="htitle"><b id="title"></b><small id="subtitle"></small></div><span class="hright" id="hright"></span><button class="xtool" id="xtool" type="button" hidden>${icon('search')}<span>Explorer</span></button></header>
  <main id="view" tabindex="-1"></main>
  <nav class="tabs surf" id="tabs" aria-label="Sections">${TABS.map(([h, l]) => `<a href="${h}">${l}</a>`).join('')}</nav>`;
const view = $('#view'), back = $<HTMLAnchorElement>('#back');
mountTool($<HTMLButtonElement>('#xtool'));
let cleanup: (() => void) | null = null;

/**
 * Barre du haut (seulement sur les écrans où l'on revient en arrière) et onglet actif. `right` : contenu à droite du titre.
 * `kind` : « board » pour un écran avec échiquier (mise en page large, onglets toujours là pour changer d'endroit),
 * « session » pour un exercice ou un drill en cours (plein écran, une croix pour quitter, comme une leçon Duolingo).
 */
function shell(title: string, sub: string, backHref: string | null, tab: string | null, right = '', kind: 'page' | 'board' | 'review' | 'session' = 'page') {
  $('#title').textContent = title; $('#subtitle').textContent = sub; document.title = title === 'Chess Drill' ? title : `${title} · Chess Drill`;
  $('#top').hidden = !backHref; if (backHref) back.href = backHref; $('#hright').innerHTML = right; setTool('hidden');
  const quit = kind === 'session'; back.innerHTML = icon(quit ? 'close' : 'back'); back.setAttribute('aria-label', quit ? 'Quitter' : 'Retour'); back.classList.toggle('quit', quit);
  // revue et sessions : sur téléphone, tout tient dans l'écran (pas d'onglets en bas, la barre de navigation de l'écran les remplace)
  const fit = quit || kind === 'review';
  $('#tabs').hidden = !tab || quit; document.body.classList.toggle('focus', kind !== 'page'); document.body.classList.toggle('withtabs', !quit && !!tab); document.body.classList.toggle('fit', fit);
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
    shell(br.titre, where, cur ? cur.back : bloc.id === 'plans' ? `#/plan/${br.id.slice(5)}` : `#/rep/${bloc.id}/${sys.id}`, TRAIN, `<a class="hchip" href="${lineUrl(br.id, mode === 'drill' ? 'explore' : 'drill')}">${mode === 'drill' ? 'Voir la ligne' : 'Drill'}</a>`, cur || mode === 'drill' ? 'session' : 'board');
    cleanup = mountTrainer(view, br.id, mode, g ? store.games.find(x => x.id === g) : undefined);
  } else if (p[0] === 'partie' && p[1] && p[2] === 'refaire') {
    const id = decodeURIComponent(p[1]), ply = +p[3], f = retryFault(id, ply), backTo = gameUrl(id, ply + 1);
    if (!f) { location.replace(backTo); return; }
    endSession(); shell('Retrouver le bon coup', '', backTo, null, '', 'session');
    cleanup = mountExercise(view, (title, sub, clock) => {
      $('#title').textContent = title; $('#subtitle').textContent = sub;
      $('#hright').innerHTML = clock ? `<span class="pill clock surf">${icon('clock')}${esc(clock)}</span>` : '';
    }, { fault: f, back: backTo });
  } else if (p[0] === 'partie' && p[1]) {
    endSession(); const id = decodeURIComponent(p[1]), r = q.get('r'), backTo = r && r.startsWith('#/') ? r : PROG, [t, sub] = reviewTitle(id);
    shell(t, sub, backTo, PROG, '', 'review'); cleanup = mountReview(view, id, q.has('i') ? +q.get('i')! : null, backTo);
  } else if (p[0] === 'plan' && p[1]) {
    endSession(); shell(planTitle(p[1]), 'Plan animé', '#/plans', TRAIN, '', 'board'); cleanup = mountPlan(view, p[1], q.has('vu'));
  } else if (p[0] === 'structure' && p[1]) {
    endSession(); shell(STRUCT[p[1]]?.name ?? 'Structure', STRUCT[p[1]]?.fam ?? '', '#/structures', TRAIN, '', 'board'); cleanup = mountStruct(view, p[1]);
  } else if (p[0] === 'wood' && p[1] === 'go') {
    endSession(); shell('Fautes à rejouer', '', woodCur()?.back ?? '#/wood', null, '', 'session');
    cleanup = mountExercise(view, (title, sub, clock) => {
      $('#title').textContent = title; $('#subtitle').textContent = sub;
      $('#hright').innerHTML = clock ? `<span class="pill clock surf">${icon('clock')}${esc(clock)}</span>` : '';
    });
  } else {
    endSession();
    const bloc = p[0] === 'rep' ? REP.blocs.find(b => b.id === p[1]) : undefined, sys = bloc?.systemes.find(s => s.id === p[2]);
    if (bloc && sys) { shell(sys.titre, bloc.titre, `#/rep/${bloc.id}`, TRAIN); viewSystem(view, bloc, sys); }
    else if (bloc) { shell(bloc.titre, bloc.sous, '#/rep', TRAIN); viewBloc(view, bloc); }
    else if (p[0] === 'rep') { shell('Répertoire', '', TRAIN, TRAIN); viewBlocs(view); }
    else if (p[0] === 'wood') { shell('Fautes à rejouer', 'Méthode Woodpecker : les mêmes positions, de plus en plus vite', TRAIN, TRAIN); viewWood(view); }
    else if (p[0] === 'entrainer') { shell("S'entraîner", '', null, TRAIN); viewTrain(view); }
    else if (p[0] === 'explorer') { shell('Explorer une position', '', TRAIN, TRAIN, '', 'board'); cleanup = mountFreeExplorer(view, TRAIN); }
    else if (p[0] === 'progres' || p[0] === 'parties') { shell('Progrès', '', null, PROG); viewGames(view); }
    else if (p[0] === 'profil') { shell('Ta carte joueur', '', PROG, PROG); viewProfile(view); }
    else if (p[0] === 'plans') { shell('Plans animés', '', TRAIN, TRAIN); viewPlans(view); }
    else if (p[0] === 'structures') { shell('Structures de pions', '', TRAIN, TRAIN); viewStructs(view); }
    else if (p[0] === 'reglages') { shell('Réglages', '', '#/', '#/reglages'); viewSettings(view); }
    else { shell('Chess Drill', '', null, '#/'); viewHome(view); }
  }
  window.scrollTo(0, 0);
}

async function boot() {
  await loadStore(); const s = store.state.settings; setSound(s.sound !== false); setSoundSet(String(s.soundSet ?? 'sfx'));
  if (s.palette || s.mode || s.board) applyLook({ palette: s.palette, mode: s.mode, board: s.board });
  window.addEventListener('hashchange', route); route();
  // Nouvelles parties et progression des autres appareils : on rafraîchit l'écran d'accueil si quelque chose est arrivé.
  // (seulement sur les écrans de liste : une revue ou un exercice en cours n'est pas interrompu)
  sync().then(r => { if ((r.games || r.lines) && /^(#\/?)?(rep|wood|parties|progres|entrainer|structures|plans)?$/.test(location.hash)) route(); }).catch(() => { /* hors ligne : l'app reste utilisable */ });
  if (import.meta.env.PROD && 'serviceWorker' in navigator) void navigator.serviceWorker.register('./sw.js');
}
boot().catch(e => { view.innerHTML = `<p class="status err">L'app n'a pas pu démarrer : ${esc((e as Error).message)}</p>`; });
