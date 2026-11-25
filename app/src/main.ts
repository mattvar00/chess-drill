/** Point d'entrée : coquille de l'app et navigation par adresse (#/…), pour que le bouton retour du téléphone fonctionne. */
import '@fontsource-variable/onest';
import { famTitle, viewOpeningList, viewOpeningPage } from './app/openings';
import { mountConvert } from './app/convert';
import './styles.css';
import { $, esc, icon } from './ui/dom';
import { setSound, setSoundSet } from './ui/sound';
import { BR, REP, loadStore, store, woodCur } from './app/store';
import { viewHome, viewSystem, } from './app/views';
import { mountTrainer } from './app/trainer';
import { viewSettings } from './app/settings';
import { mountExercise, viewWood } from './app/wood';
import { endSession, lineUrl, session } from './app/session';
import { pullChessCom, sync } from './app/api';
import { applyLook, restoreLook } from './app/theme';
import { gameUrl, mountReview, retryFault, reviewTitle, viewGames, viewProfile } from './app/games';
import { LESSONS, endDue, lessonDrill, mountDrill, turnDrill, viewCourse, viewEndgame, viewEndgames } from './app/endgame';
import { viewOpenings } from './app/course';
import { mountPlanPlay } from './app/planplay';
import { mountPlan, mountStruct, planTitle, viewPlans, viewStructs } from './app/plans';
import { STRUCT } from './core/structures';
import { mountFreeExplorer, mountTool, setTool } from './app/explorer';
import { courseNow, setCurrentCourse, shortName, viewLessonEnd, viewPath } from './app/path';
import { popLevel, lineTitle } from './core/names';

restoreLook();
/** Cinq onglets : ce que je fais maintenant, mes cours d'ouvertures, les finales, mes fautes à rejouer, où j'en suis. */
const TABS = [['#/', 'Pour toi'], ['#/rep', 'Ouvertures'], ['#/finales', 'Finales'], ['#/wood', 'Fautes'], ['#/progres', 'Progrès']] as const;
const TRAIN = '#/rep', FIN = '#/finales', WOOD = '#/wood', PROG = '#/progres';
document.getElementById('app')!.innerHTML = `
  <header class="top" id="top" hidden><a class="back" id="back" aria-label="Retour">${icon('back')}</a><div class="htitle"><b id="title"></b><small id="subtitle"></small></div><span class="hright" id="hright"></span><button class="xtool" id="xtool" type="button" hidden>${icon('search')}<span>Explorer</span></button></header>
  <main id="view" tabindex="-1"></main>
  <nav class="tabs surf" id="tabs" aria-label="Sections">${TABS.map(([h, l]) => `<a href="${h}">${l}</a>`).join('')}</nav>`;
const view = $('#view'), back = $<HTMLAnchorElement>('#back');
// Toucher l'onglet où l'on est déjà : retour en haut de la page (sur une sous-page, le lien ramène déjà à la page de l'onglet).
$('#tabs').addEventListener('click', e => { const a = (e.target as HTMLElement).closest('a'); if (!a) return; const h = a.getAttribute('href')!;
  if (h === (location.hash || '#/') || (h === '#/' && location.hash === '')) { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); } });
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
  // un point sur l'onglet Finales quand une faute ou une leçon est à revoir
  try { document.querySelector('#tabs a[href="#/finales"]')?.classList.toggle('dot', !!endDue()); } catch { /* état pas encore chargé */ }
}
/** Retour : la page d'où l'on vient quand elle est passée dans l'adresse (`r`), sinon `dflt`. */
const backOf = (q: URLSearchParams, dflt: string) => { const r = q.get('r'); return r && r.startsWith('#/') ? r : dflt; };
const planSysTitle = (o: string) => { for (const b of REP.blocs) for (const sy of b.systemes) if (sy.id === o) return shortName(sy.titre); return ''; };
/** La liste des plans d'où l'on vient (avec son retour vers la variante en cours), pour y revenir depuis un plan. */
let lastPlans = '#/plans';
function route() {
  cleanup?.(); cleanup = null;
  const [path, query = ''] = location.hash.slice(1).split('?'), p = path.split('/').filter(Boolean), q = new URLSearchParams(query);
  if (p[0] === 'l' && BR[p[1]]) {
    const { br, sys, bloc } = BR[p[1]], mode = p[2] === 'drill' ? 'drill' : 'explore', S = session();
    if (S && !S.pool.includes(br.id)) endSession();
    const cur = session(), g = q.get('g');
    const kind = br.role === 'erreur' ? 'Piège' : br.role === 'theorie' ? 'Théorie' : '';   // on sait toujours si on apprend une punition ou la théorie
    // en séance : le nom de l'ouverture en titre (lisible sur téléphone), et où on en est en dessous ; le nom de la variante, c'est le coach qui le dit
    const where = cur ? `${cur.done.size + (cur.done.has(br.id) ? 0 : 1)} sur ${cur.pool.length}` : `${kind ? kind + ' · ' : ''}${sys.titre}`; void popLevel;
    shell(cur && bloc.id !== 'plans' ? shortName(sys.titre) : lineTitle(br.titre), where, cur ? (cur.exit ?? cur.back) : bloc.id === 'plans' ? `#/plan/${br.id.slice(5)}` : `#/rep/${bloc.id}/${sys.id}`, TRAIN, (cur && mode === 'drill') || br.model ? '' : `<a class="hchip" href="${lineUrl(br.id, mode === 'drill' ? 'explore' : 'drill')}">${mode === 'drill' ? 'Voir la ligne' : 'De mémoire'}</a>`, cur || mode === 'drill' ? 'session' : 'board');
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
  } else if (p[0] === 'conclure') {
    endSession(); shell('Conclure', 'Tes positions gagnantes', '#/progres', PROG, '', 'session');
    cleanup = mountConvert(view, Math.max(0, +(q.get('k') ?? 0) || 0), t => { $('#subtitle').textContent = t; });
  } else if (p[0] === 'plan' && p[1] && p[2] === 'jouer') {
    shell(planTitle(p[1]), 'Joue le plan contre le moteur', `#/plan/${p[1]}?vu=1`, TRAIN, '', 'session'); cleanup = mountPlanPlay(view, p[1]);
  } else if (p[0] === 'plan' && p[1]) {
    const r = q.get('r'); shell(planTitle(p[1]), 'Plan animé', r && r.startsWith('#/') ? r : lastPlans, TRAIN, '', 'board'); cleanup = mountPlan(view, p[1], q.has('vu'));
  } else if (p[0] === 'structure' && p[1]) {
    endSession(); shell(STRUCT[p[1]]?.name ?? 'Structure', STRUCT[p[1]]?.fam ?? '', '#/plans', TRAIN, '', 'board'); cleanup = mountStruct(view, p[1]);
  } else if (p[0] === 'wood' && p[1] === 'go') {
    endSession(); shell('Fautes à rejouer', '', woodCur()?.back ?? '#/wood', null, '', 'session');
    cleanup = mountExercise(view, (title, sub, clock) => {
      $('#title').textContent = title; $('#subtitle').textContent = sub;
      $('#hright').innerHTML = clock ? `<span class="pill clock surf">${icon('clock')}${esc(clock)}</span>` : '';
    });
  } else {
    if (p[0] !== 'plans') endSession();   // les plans se consultent entre deux variantes sans quitter le cours
    const bloc = p[0] === 'rep' ? REP.blocs.find(b => b.id === p[1]) : undefined, sys = bloc?.systemes.find(s => s.id === p[2]);
    // une seule page par cours : #/cours, qui montre le cours choisi ; l'onglet Ouvertures, lui, montre la liste
    if (bloc && sys) { setCurrentCourse(sys.id); const v = q.get('v'); location.replace(`#/cours?o=${sys.id}${v ? '&v=' + v : ''}`); return; }
    else if ((p[0] === 'rep' && (p[1] === 'sorties' || p[1] === 'choisir')) || p[0] === 'entrainer') { location.replace('#/rep'); return; }
    else if (p[0] === 'o' && p[1]) { const so = REP.blocs.flatMap(b => b.systemes).find(x => x.id === p[1]);
      shell(so ? famTitle(so.titre) : 'Ouverture', '', '#/rep', TRAIN); cleanup = viewOpeningPage(view, p[1]) || null; }
    else if (p[0] === 'cours') { const o = q.get('o'); if (o) setCurrentCourse(o); const cur = courseNow();
      shell(cur ? shortName(cur.titre) : 'Le cours', 'Le cours', cur ? `#/o/${cur.id}` : '#/rep', TRAIN); viewPath(view); }
    else if (p[0] === 'rep' && p[1] === 'chercher') { shell('Chercher en jouant les coups', 'Tes lignes qui passent par la position', '#/rep', TRAIN, '', 'board'); cleanup = mountFreeExplorer(view, '#/rep', true); }
    else if (p[0] === 'rep') { shell('Ouvertures', '', null, TRAIN); viewOpeningList(view); }
    else if (p[0] === 'ouvertures') { shell('Tes ouvertures', 'Le bilan de chacune', PROG, PROG); viewOpenings(view); }
    else if (p[0] === 'finales' && p[1] && LESSONS.some(l => l.id === p[1])) { const l = LESSONS.find(x => x.id === p[1])!;
      if (p[2]) { const d = lessonDrill(l, +p[2] || 1); shell(l.titre, `${l.goal === 'w' ? 'À toi de gagner' : 'À toi de tenir la nulle'} · ${d.step}`, '#/finales', FIN, '', 'session'); cleanup = mountDrill(view, d); }
      else { shell(l.titre, 'Le cours', '#/finales', FIN, '', 'session'); cleanup = viewCourse(view, l); } }
    else if (p[0] === 'finales') { shell('Finales', '', null, FIN); cleanup = viewEndgames(view); }
    else if (p[0] === 'finale' && p[1]) { const g = store.games.find(x => x.id === decodeURIComponent(p[1])), back = `#/finale/${p[1]}`;
      if (!g) { location.replace('#/finales'); return; }
      if (p[2]) { shell('Rejoue ce moment', `contre ${g.opp}`, back, FIN, '', 'session'); let off = () => { /* pas encore monté */ }, gone = false; cleanup = () => { gone = true; off(); };
        turnDrill(g, +p[2]).then(d => { if (gone) return; if (!d) { location.replace(back); return; } off = mountDrill(view, d); }); }
      else { shell('Ta finale', `contre ${g.opp}`, '#/finales', FIN); cleanup = viewEndgame(view, g); } }
    else if (p[0] === 'lecon') { shell('Bilan', '', null, null); viewLessonEnd(view); }
    else if (p[0] === 'wood') { shell('Fautes', 'Méthode Woodpecker : les mêmes positions, de plus en plus vite', q.get('r') ? backOf(q, WOOD) : null, WOOD); viewWood(view, q); }
    else if (p[0] === 'explorer') { const back = backOf(q, TRAIN); shell('Explorer une position', q.get('fen') ? 'Le moteur montre le meilleur coup' : '', back, TRAIN, '', 'board');
      cleanup = mountFreeExplorer(view, back, false, q.get('fen') ?? undefined, q.get('o') === 'b' ? 'b' : 'w'); }
    else if (p[0] === 'progres' || p[0] === 'parties') { shell('Progrès', '', null, PROG); viewGames(view); }
    else if (p[0] === 'profil') { shell('Ta carte joueur', '', PROG, PROG); viewProfile(view); }
    else if (p[0] === 'plans') { lastPlans = location.hash || '#/plans'; shell('Plans', q.get('o') ? planSysTitle(q.get('o')!) : 'Quoi faire une fois l\'ouverture jouée', backOf(q, TRAIN), TRAIN); viewPlans(view, q); }
    else if (p[0] === 'structures') { shell('Structures de pions', '', '#/plans', TRAIN); viewStructs(view); }
    else if (p[0] === 'reglages') { shell('Réglages', '', '#/', '#/reglages'); viewSettings(view); }
    else { shell('Chess Drill', '', null, '#/'); viewHome(view); }
  }
  window.scrollTo(0, 0);
}

async function boot() {
  await loadStore(); const s = store.state.settings; setSound(s.sound !== false); setSoundSet(String(s.soundSet ?? 'classique'));
  if (s.palette || s.mode || s.board) applyLook({ palette: s.palette, mode: s.mode, board: s.board });
  window.addEventListener('hashchange', route); route();
  // Nouvelles parties et progression des autres appareils : on rafraîchit l'écran d'accueil si quelque chose est arrivé.
  // (seulement sur les écrans de liste : une revue ou un exercice en cours n'est pas interrompu)
  sync().then(r => { if ((r.games || r.lines) && /^(#\/?)?(rep|wood|parties|progres|entrainer|structures|plans)?$/.test(location.hash)) route(); }).catch(() => { /* hors ligne : l'app reste utilisable */ });
  // Tes dernières parties Chess.com, sans attendre la nuit : une seule requête légère, au plus toutes les 30 minutes, en arrière-plan.
  // Aucun calcul de moteur ici (il reste pour la nuit) : on lit les coups et on les compare au répertoire.
  const PULLED = 'cd_pulled';
  if (navigator.onLine !== false && Date.now() - +(localStorage.getItem(PULLED) || 0) > 30 * 60 * 1000) {
    localStorage.setItem(PULLED, String(Date.now()));
    pullChessCom().then(n => { if (n > 0 && /^(#\/?)?(progres|parties|finales)?$/.test(location.hash)) route(); }).catch(() => { /* hors ligne */ });
  }
  if (import.meta.env.PROD && 'serviceWorker' in navigator) void navigator.serviceWorker.register('./sw.js');
}
boot().catch(e => { view.innerHTML = `<p class="status err">L'app n'a pas pu démarrer : ${esc((e as Error).message)}</p>`; });
