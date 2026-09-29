/* ---------- navigation : pile d'écrans, bouton retour, barre du bas ---------- */
const NAV=[]; const ROOTS=['today','train','games','prof'];
const TITLES={today:'Aujourd\'hui',train:'Entraîner',blocs:'Répertoire',threats:'Adversaires réels',faults:'Fautes',forced:'Coups forcés',games:'Parties',prof:'Progrès',settings:'Réglages',board:''};
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
    case 'faults': FMODE='all'; renderFaults(h); break;
    case 'forced': FMODE='forced'; renderFaults(h); break;
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
  const ids=allBranchIds(); const due=ids.filter(isDue);
  const list=gamesList(); const devs=list.filter(g=>g.a.status==='dev'&&!g.a.soft&&!P.ignored[g.id]&&!P.fixed[g.id]);
  const FF=forcedFaults().filter(x=>!(P.fault[x.key]&&P.fault[x.key].done));
  const newF=allFaults().filter(x=>x.src==='game'&&!(P.fault[x.key]&&P.fault[x.key].done));
  const ts=tiltStatus();
  const item=(cls,icon,t,s2,fn)=>{ const id='t'+Math.random().toString(36).slice(2,7); setTimeout(()=>{ const el=document.getElementById(id); if(el) el.onclick=fn; },0); return `<div class="card act ${cls}" id="${id}"><div class="ico">${icon}</div><div class="body"><div class="t">${t}</div><div class="s">${s2}</div></div><div class="go">›</div></div>`; };
  let html='';
  if(ts.warn) html+=`<div class="intro tilt warn"><b>${ts.n} parties aujourd'hui${ts.streak>=2?`, ${ts.streak} défaites d'affilée`:''}.</b> Pas de nouvelle partie : entraîne-toi.</div>`;
  /* mini-carte */
  const SG=Object.values(P.games).filter(g=>g.ev&&g.st&&!P.ignored[g.id]&&tcOk(g)&&inPeriod(g)).sort((a,b)=>b.t-a.t).slice(0,150);
  if(SG.length>=STYLE_MIN){ try{ const c=styleCard(computeStyle(SG)); const id='mc'+Date.now(); setTimeout(()=>{ const el=document.getElementById(id); if(el) el.onclick=()=>root('prof'); },0);
    html+=`<div class="minicard" id="${id}"><b>${c.ovr}</b><div><div class="t">${c.type}</div><div class="s">${[...c.good.slice(0,2).map(x=>'<span class="ok">'+x[0]+'</span>'),...c.bad.slice(0,2).map(x=>'<span class="bad">'+x[0]+'</span>')].join(' · ')}</div></div><div class="go">›</div></div>`; }catch(e){} }
  html+=updBox();
  html+=`<h2 class="sec">À faire</h2>`; let n=0;
  if(due.length){ n++; html+=item('pri','↻',`Réviser ${due.length} ligne${due.length>1?'s':''}`,'Répétition espacée du répertoire',()=>startDrill(due,'Révision')); }
  if(devs.length){ n++; html+=item('pri','⚠',`Corriger ${devs.length} déviation${devs.length>1?'s':''}`,'Tu as quitté ton répertoire',()=>go({s:'games',filter:'dev'})); }
  if(FF.length){ n++; html+=item('','⚡',`${FF.length} coup${FF.length>1?'s':''} forcé${FF.length>1?'s':''} à retrouver`,'Échecs et prises que tu n\'as pas joués',()=>go({s:'forced'})); }
  else if(newF.length){ n++; html+=item('','✕',`${newF.length} faute${newF.length>1?'s':''} à retrouver`,'Extraites de tes parties',()=>go({s:'faults'})); }
  if(!n) html+=item('pri','▶','Drill mixte · 10 lignes','Rien d\'urgent : entretiens ton répertoire',()=>startDrill(ids,'Drill mixte'));
  h.innerHTML=html; bindUpdBox();
}
/* ---------- Entraîner ---------- */
function renderTrain(h){
  const ids=allBranchIds(); const v=ids.filter(isValid).length; const L=allFaults(); const done=L.filter(x=>P.fault[x.key]&&P.fault[x.key].done).length; const W=P.wood||[]; const last=W[W.length-1];
  const item=(icon,t,s,fn,prog)=>{ const id='t'+Math.random().toString(36).slice(2,7); setTimeout(()=>{ const el=document.getElementById(id); if(el) el.onclick=fn; },0); return `<div class="card act" id="${id}"><div class="ico">${icon}</div><div class="body"><div class="t">${t}</div><div class="s">${s}</div></div>${prog!=null?`<div class="prog"><b style="width:${prog}%"></b></div>`:''}<div class="go">›</div></div>`; };
  h.innerHTML=`<h2 class="sec">Ouvertures</h2>`
    +item('♞','Répertoire',`${ids.length} lignes · ${v} validées`,()=>go({s:'blocs'}),Math.round(100*v/ids.length))
    +item('▶','Drill mixte','10 lignes pondérées, tous blocs',()=>startDrill(ids,'Drill mixte'))
    +item('♜','Adversaires réels (Maia)','Les réponses humaines que ton répertoire ne couvre pas',()=>go({s:'threats'}))
    +`<h2 class="sec">Tactique</h2>`
    +item('✕','Fautes',`${L.length} positions tirées de tes parties · ${done} trouvées`,()=>go({s:'faults'}),Math.round(100*done/Math.max(1,L.length)))
    +item('⚡','Coups forcés',`${forcedFaults().length} positions où l'échec ou la prise s'imposait`,()=>go({s:'forced'}))
    +item('⏱','Cycle Woodpecker',last?`dernier : ${fmtT(last.time)}, ${Math.round(100*last.solved/last.n)}% du premier coup`:'Toutes les fautes, chrono, à refaire jusqu\'à l\'automatisme',()=>woodStart())
    +`<h2 class="sec">Jouer</h2>`
    +item('☺',`Partie contre un humain (Maia ${P.settings.maiaElo||1800})`,'Maia imite un joueur de ce niveau : erreurs réalistes à punir',()=>sparPick());
}
function sparPick(){ const c=confirm('Jouer avec les Blancs ? (Annuler = Noirs)'); startSpar('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', c?'w':'b', 'Partie libre'); }

/* réanalyse automatique des parties en cache quand le répertoire change */
window.addEventListener('load',function(){ if(P.settings.dataVersion===DATA.version) return; try{ if(Object.keys(P.games).length) reanalyseAll(); P.settings.dataVersion=DATA.version; save(); if(top()&&top().s!=='board') renderNav(); }catch(e){ console.warn('réanalyse',e); } });
