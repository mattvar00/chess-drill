/* ---------- navigation : pile d'écrans, bouton retour, barre du bas ---------- */
const NAV=[]; const ROOTS=['today','train','games','prof'];
const TITLES={today:'Aujourd\'hui',train:'Entraîner',blocs:'Répertoire',threats:'Adversaires réels',faults:'Fautes',games:'Parties',prof:'Progrès',settings:'Réglages',board:''};
function navTop(){ return NAV[NAV.length-1]; }
function go(entry){ NAV.push(entry); try{ history.pushState({n:NAV.length},''); }catch(e){} renderNav(); }
function replaceTop(entry){ NAV[NAV.length-1]=entry; renderNav(); }
function back(){ if(navTop()&&navTop().s==='board'&&cur&&cur.kind==='fault'&&WOOD) WOOD=null; if(NAV.length>1){ NAV.pop(); renderNav(); } else root('today'); }
function root(s){ NAV.length=0; NAV.push({s}); try{ history.pushState({n:1},''); }catch(e){} renderNav(); }
window.addEventListener('popstate',()=>{ if(NAV.length>1){ NAV.pop(); renderNav(); } });
/* re-rendu de l'écran courant (utilisé après une action) */
function home(){ if(navTop()&&navTop().s==='board') NAV.pop(); if(!NAV.length) NAV.push({s:'today'}); renderNav(); }
/* les écrans "échiquier" s'empilent une seule fois */
function showBoard(){ if(!navTop()||navTop().s!=='board') go({s:'board'}); else renderChrome(); $('#home').classList.add('hidden'); $('#drill').classList.remove('hidden'); }

function renderChrome(){
  const t=navTop(); const rootOf=NAV[0].s;
  $('#back').classList.toggle('hidden', NAV.length<=1);
  $('#htitle').textContent = t.s==='sys'?(DATA.blocs.find(b=>b.id===t.bloc)||{}).titre||'' : t.s==='br'?((DATA.blocs.find(b=>b.id===t.bloc)||{systemes:[]}).systemes.find(s=>s.id===t.sys)||{}).titre||'' : t.s==='board'?'':(TITLES[t.s]||'');
  ROOTS.forEach(r=>$('#nav-'+r).classList.toggle('on',rootOf===r));
}
function renderNav(){
  const t=navTop(); renderChrome();
  if(t.s==='board'){ $('#home').classList.add('hidden'); $('#drill').classList.remove('hidden'); return; }
  cur=null; $('#drill').classList.add('hidden'); $('#home').classList.remove('hidden'); const h=$('#home'); h.innerHTML='';
  switch(t.s){
    case 'today': renderToday(h); break;
    case 'train': renderTrain(h); break;
    case 'blocs': renderBlocs(h); break;
    case 'sys': renderSys(h, DATA.blocs.find(b=>b.id===t.bloc)); break;
    case 'br': renderBranches(h, t.bloc, t.sys); break;
    case 'threats': renderThreats(h); break;
    case 'faults': renderFaults(h); break;
    case 'games': renderGames(h); break;
    case 'prof': renderProfile(h); break;
    case 'settings': renderSettings(h); break;
  }
  window.scrollTo(0,0);
}
function navInit(){ ROOTS.forEach(r=>$('#nav-'+r).onclick=()=>root(r)); $('#back').onclick=back; $('#gear').onclick=()=>go({s:'settings'}); }

/* ---------- Aujourd'hui ---------- */
function allBranchIds(){ return DATA.blocs.flatMap(b=>b.systemes.flatMap(s=>s.branches.map(x=>x.id))); }
function renderToday(h){
  const ids=allBranchIds(); const due=ids.filter(isDue); const fresh=ids.filter(id=>!brState(id).runs);
  const list=gamesList(); const devs=list.filter(g=>g.a.status==='dev'&&!P.ignored[g.id]&&!P.fixed[g.id]);
  const L=allFaults(); const newF=L.filter(x=>x.src==='game'&&!(P.fault[x.key]&&P.fault[x.key].done));
  const ts=tiltStatus(); const last=P.settings.lastSync?new Date(P.settings.lastSync):null;
  const th=P.maia?P.maia.threats.length:0;
  let html=`<div class="hello">${ts.warn?`<div class="intro tilt warn"><b>${ts.n} parties aujourd'hui${ts.streak>=2?`, ${ts.streak} défaites d'affilée`:''}.</b> Pas de nouvelle partie : entraîne-toi.</div>`:`<div class="why">${ts.n?`${ts.n} partie${ts.n>1?'s':''} aujourd'hui.`:'Pas encore de partie aujourd\'hui.'} ${last?`Parties synchronisées le ${last.toLocaleDateString('fr-FR')}.`:'Parties jamais synchronisées.'}</div>`}</div>`;
  const item=(cls,icon,t,s,fn)=>{ const id='t'+Math.random().toString(36).slice(2,7); setTimeout(()=>{ const el=document.getElementById(id); if(el) el.onclick=fn; },0); return `<div class="card act ${cls}" id="${id}"><div class="ico">${icon}</div><div class="body"><div class="t">${t}</div><div class="s">${s}</div></div><div class="go">›</div></div>`; };
  html+=`<h2 class="sec">À faire</h2>`;
  if(due.length) html+=item('pri','↻',`Réviser ${due.length} ligne${due.length>1?'s':''}`,'Branches validées dont la révision est due',()=>startDrill(due,'Révision'));
  if(devs.length) html+=item('pri','⚠',`Corriger ${devs.length} déviation${devs.length>1?'s':''}`,'Tu as quitté ton répertoire dans ces parties',()=>go({s:'games',filter:'dev'}));
  if(newF.length) html+=item('','✕',`${newF.length} faute${newF.length>1?'s':''} à retrouver`,'Extraites de tes parties par le moteur',()=>go({s:'faults'}));
  if(!due.length&&!devs.length&&!newF.length) html+=item('pri','▶','Drill mixte · 10 lignes','Tirage pondéré : lignes neuves, fréquentes, où tu dévies',()=>startDrill(ids,'Drill mixte'));
  html+=`<h2 class="sec">Raccourcis</h2>`;
  html+=item('','⇅','Synchroniser mes parties',`chess.com · ${list.length} en cache`,()=>go({s:'games',sync:true}));
  html+=item('','▶',`Drill ${fresh.length?'· '+fresh.length+' lignes jamais vues':'mixte'}`,'Une ligne au hasard, pondérée',()=>startDrill(fresh.length?fresh:ids,fresh.length?'Nouvelles lignes':'Drill mixte'));
  html+=item('','⚔',th?`${th} réponses adverses non couvertes`:'Que jouent vraiment tes adversaires ?','Maia prédit les coups humains contre ton répertoire',()=>go({s:'threats'}));
  h.innerHTML=html;
}
/* ---------- Entraîner ---------- */
function renderTrain(h){
  const ids=allBranchIds(); const v=ids.filter(isValid).length; const L=allFaults(); const done=L.filter(x=>P.fault[x.key]&&P.fault[x.key].done).length; const W=P.wood||[]; const last=W[W.length-1];
  const item=(icon,t,s,fn,prog)=>{ const id='t'+Math.random().toString(36).slice(2,7); setTimeout(()=>{ const el=document.getElementById(id); if(el) el.onclick=fn; },0); return `<div class="card act" id="${id}"><div class="ico">${icon}</div><div class="body"><div class="t">${t}</div><div class="s">${s}</div></div>${prog!=null?`<div class="prog"><b style="width:${prog}%"></b></div>`:''}<div class="go">›</div></div>`; };
  h.innerHTML=`<h2 class="sec">Ouvertures</h2>`
    +item('♞','Répertoire',`${ids.length} lignes · ${v} validées`,()=>go({s:'blocs'}),Math.round(100*v/ids.length))
    +item('▶','Drill mixte','10 lignes pondérées, tous blocs',()=>startDrill(ids,'Drill mixte'))
    +item('⚔','Adversaires réels (Maia)','Les réponses humaines que ton répertoire ne couvre pas',()=>go({s:'threats'}))
    +`<h2 class="sec">Tactique</h2>`
    +item('✕','Fautes',`${L.length} positions tirées de tes parties · ${done} trouvées`,()=>go({s:'faults'}),Math.round(100*done/Math.max(1,L.length)))
    +item('⏱','Cycle Woodpecker',last?`dernier : ${fmtT(last.time)}, ${Math.round(100*last.solved/last.n)}% du premier coup`:'Toutes les fautes, chrono, à refaire jusqu\'à l\'automatisme',()=>woodStart())
    +`<h2 class="sec">Jouer</h2>`
    +item('☺',`Partie contre un humain (Maia ${P.settings.maiaElo||1800})`,'Maia imite un joueur de ce niveau : erreurs réalistes à punir',()=>sparPick());
}
function sparPick(){ const c=confirm('Jouer avec les Blancs ? (Annuler = Noirs)'); startSpar('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', c?'w':'b', 'Partie libre'); }
