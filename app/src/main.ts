/** Point d'entrée : coquille de l'app et navigation par adresse (#/…), pour que le bouton retour du téléphone fonctionne. */
import './styles.css';
import { $, esc, icon } from './ui/dom';
import { setSound } from './ui/sound';
import { BR, REP, loadStore, store } from './app/store';
import { viewBloc, viewBlocs, viewHome, viewSystem } from './app/views';
import { mountTrainer } from './app/trainer';
import { viewSettings } from './app/settings';
import { mountExercise, viewWood } from './app/wood';
import { endSession, session } from './app/session';
import { getToken, sync } from './app/api';

const TABS = [['#/', 'Accueil', 'home'], ['#/rep', 'Répertoire', 'book'], ['#/wood', 'Woodpecker', 'target']] as const;
document.getElementById('app')!.innerHTML = `
  <header class="top"><a class="back" id="back" aria-label="Retour">‹</a><div class="htitle"><b id="title"></b><small id="subtitle"></small></div><a class="gear" id="gear" href="#/reglages" aria-label="Réglages">${icon('sliders')}</a></header>
  <main id="view" tabindex="-1"></main>
  <nav class="tabs" id="tabs" aria-label="Sections">${TABS.map(([h, l, i]) => `<a href="${h}">${icon(i)}<span>${l}</span></a>`).join('')}</nav>`;
const view = $('#view'), back = $<HTMLAnchorElement>('#back');
let cleanup: (() => void) | null = null;

function shell(title: string, sub: string, backHref: string | null, tab: string | null) {
  $('#title').textContent = title; $('#subtitle').textContent = sub; document.title = `${title} · Chess Drill`;
  back.hidden = !backHref; if (backHref) back.href = backHref;
  $('#tabs').hidden = !tab; document.body.classList.toggle('focus', !tab); $('#gear').hidden = !tab || !!backHref;
  document.querySelectorAll<HTMLAnchorElement>('#tabs a').forEach(a => { if (a.getAttribute('href') === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
}
function route() {
  cleanup?.(); cleanup = null;
  const [path, query = ''] = location.hash.slice(1).split('?'), p = path.split('/').filter(Boolean), q = new URLSearchParams(query);
  if (p[0] === 'l' && BR[p[1]]) {
    const { br, sys, bloc } = BR[p[1]], mode = p[2] === 'drill' ? 'drill' : 'explore', S = session();
    if (S && !S.pool.includes(br.id)) endSession();
    const cur = session(), g = q.get('g');
    shell(br.titre, cur ? cur.label : sys.titre, cur ? cur.back : `#/rep/${bloc.id}/${sys.id}`, null);
    cleanup = mountTrainer(view, br.id, mode, g ? store.games.find(x => x.id === g) : undefined);
  } else if (p[0] === 'wood' && p[1] === 'go') {
    endSession(); shell('Woodpecker', '', '#/wood', null);
    cleanup = mountExercise(view, (title, sub) => { $('#title').textContent = title; $('#subtitle').innerHTML = sub; });
  } else {
    endSession();
    const bloc = p[0] === 'rep' ? REP.blocs.find(b => b.id === p[1]) : undefined, sys = bloc?.systemes.find(s => s.id === p[2]);
    if (bloc && sys) { shell(sys.titre, bloc.titre, `#/rep/${bloc.id}`, '#/rep'); viewSystem(view, bloc, sys); }
    else if (bloc) { shell(bloc.titre, bloc.sous, '#/rep', '#/rep'); viewBloc(view, bloc); }
    else if (p[0] === 'rep') { shell('Répertoire', '', null, '#/rep'); viewBlocs(view); }
    else if (p[0] === 'wood') { shell('Woodpecker', '', null, '#/wood'); viewWood(view); }
    else if (p[0] === 'reglages') { shell('Réglages', '', '#/', '#/reglages'); viewSettings(view); }
    else { shell('Chess Drill', '', null, '#/'); viewHome(view); }
  }
  window.scrollTo(0, 0);
}

async function boot() {
  await loadStore(); setSound(store.state.settings.sound !== false);
  window.addEventListener('hashchange', route); route();
  // Nouvelles parties et progression des autres appareils : on rafraîchit l'écran d'accueil si quelque chose est arrivé.
  if (getToken()) sync().then(r => { if ((r.games || r.lines) && !location.hash.startsWith('#/l/')) route(); }).catch(() => { /* hors ligne : l'app reste utilisable */ });
  if (import.meta.env.PROD && 'serviceWorker' in navigator) void navigator.serviceWorker.register('./sw.js');
}
boot().catch(e => { view.innerHTML = `<p class="status err">L'app n'a pas pu démarrer : ${esc((e as Error).message)}</p>`; });
