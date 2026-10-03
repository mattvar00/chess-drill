/* ---------- navigation : pile d'écrans, bouton retour, barre du bas ---------- */
const NAV=[]; const ROOTS=['today','train','games','prof'];
const TITLES={today:'Aujourd\'hui',train:'Entraîner',blocs:'Répertoire',threats:'Adversaires réels',faults:'Fautes',forced:'Coups forcés',structs:'Plans par structure',struct:'',squiz:'',review:'',plans:'Plans animés',plan:'',games:'Parties',prof:'Progrès',settings:'Réglages',board:''};
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
    case 'plans': renderPlans(h); break;
    case 'review': renderReview(h,t); break;
    case 'structs': renderStructs(h); break;
    case 'struct': renderStruct(h,t); break;
    case 'squiz': renderSQuiz(h,t); break;
    case 'plan': renderPlan(h,t); break;
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
  const QN_=typeof QN!=='undefined'?QN:10, dc=typeof dueCount==='function'?dueCount:(L=>L.length); const fm=FMODE; FMODE='all'; const LF=allFaults(); FMODE=fm; const ffDue=Math.min(QN_,dc(forcedFaults())), fDue=Math.min(QN_,dc(LF));
  const ts=tiltStatus();
  const item=(cls,icon,t,s2,fn)=>{ const id='t'+Math.random().toString(36).slice(2,7); setTimeout(()=>{ const el=document.getElementById(id); if(el) el.onclick=fn; },0); return `<div class="card act ${cls}" id="${id}"><div class="ico">${icon}</div><div class="body"><div class="t">${t}</div><div class="s">${s2}</div></div><div class="go">›</div></div>`; };
  let html='';
  if(ts.warn) html+=`<div class="intro tilt warn"><b>${ts.n} parties aujourd'hui${ts.streak>=2?`, ${ts.streak} défaites d'affilée`:''}.</b> Pas de nouvelle partie : entraîne-toi.</div>`;
  /* mini-carte */
  const SG=Object.values(P.games).filter(g=>g.ev&&g.st&&!P.ignored[g.id]&&tcOk(g)).sort((a,b)=>b.t-a.t).slice(0,100);
  if(SG.length>=STYLE_MIN){ try{ const c=styleCard(computeStyle(SG)); const id='mc'+Date.now(); setTimeout(()=>{ const el=document.getElementById(id); if(el) el.onclick=()=>root('prof'); },0);
    html+=`<div class="minicard" id="${id}"><b>${c.ovr}</b><div><div class="t">${c.type}</div><div class="s">${[...c.good.slice(0,2).map(x=>'<span class="ok">'+x[0]+'</span>'),...c.bad.slice(0,2).map(x=>'<span class="bad">'+x[0]+'</span>')].join(' · ')}</div></div><div class="go">›</div></div>`; }catch(e){} }
  if(typeof syncOn==='function'&&!syncOn()&&!P.settings.syncHide){ const id='sy'+Date.now(); setTimeout(()=>{ const el=document.getElementById(id); if(!el) return; el.querySelector('.go2').onclick=()=>go({s:'settings'}); el.querySelector('.x').onclick=()=>{ P.settings.syncHide=true; save(); el.remove(); }; },0);
    html+=`<div class="intro syncinv" id="${id}"><b>Tes données restent sur cet appareil.</b> Active la synchro pour retrouver tes analyses sur ton téléphone et ton ordi. <button class="lnk go2">Activer</button><button class="lnk x" aria-label="Masquer">✕</button></div>`; }
  html+=updBox();
  html+=`<h2 class="sec">À faire</h2>`; let n=0;
  if(due.length){ n++; html+=item('pri','↻',`Réviser ${due.length} ligne${due.length>1?'s':''}`,'Répétition espacée du répertoire',()=>startDrill(due,'Révision')); }
  if(devs.length){ n++; const dn=Math.min(devs.length,QN_); html+=item('pri','⚠',`Corriger ${dn} déviation${dn>1?'s':''}`,devs.length>QN_?`Les ${QN_} plus récentes (sur ${devs.length})`:'Tu as quitté ton répertoire',()=>go({s:'games',filter:'dev'})); }
  if(ffDue){ n++; html+=item('','⚡',`${ffDue} coup${ffDue>1?'s':''} forcé${ffDue>1?'s':''} à revoir`,'Les plus utiles d\'abord : échecs et prises que tu n\'as pas joués',()=>go({s:'forced'})); }
  if(fDue){ n++; html+=item('','✕',`${fDue} faute${fDue>1?'s':''} à revoir`,'Tes erreurs les plus coûteuses et les plus récentes',()=>go({s:'faults'})); }
  try{ const S=structureStats(); const w=Object.entries(S).filter(([k,o])=>o.n>=5&&o.errMe-o.errOp>2).sort((a,b)=>(b[1].errMe-b[1].errOp)*b[1].n-(a[1].errMe-a[1].errOp)*a[1].n)[0];
    if(w){ n++; html+=item('','♟',`Structure à travailler : ${STRUCT[w[0]].name}`,`${w[1].n} parties · ${(w[1].errMe-w[1].errOp).toFixed(0)} pts d'erreurs de plus que tes adversaires`,()=>go({s:'struct',id:w[0]})); } }catch(e){}
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
    +item('♟','Plans par structure','Tes structures de pions, leurs plans, et un quiz sur tes positions',()=>go({s:'structs'}))
    +item('▦','Plans animés',`${(window.PLANS||[]).length} animations : ruptures, cases clés, pièces à échanger`,()=>go({s:'plans'}))
    +item('⚡','Coups forcés',`${forcedFaults().length} positions où l'échec ou la prise s'imposait`,()=>go({s:'forced'}))
    +item('⏱','Cycle Woodpecker',last?`dernier : ${fmtT(last.time)}, ${Math.round(100*last.solved/last.n)}% du premier coup`:'Toutes les fautes, chrono, à refaire jusqu\'à l\'automatisme',()=>woodStart())
    +`<h2 class="sec">Jouer</h2>`
    +item('☺',`Partie contre un humain (Maia ${P.settings.maiaElo||1800})`,'Maia imite un joueur de ce niveau : erreurs réalistes à punir',()=>sparPick());
}
function sparPick(){ const c=confirm('Jouer avec les Blancs ? (Annuler = Noirs)'); startSpar('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', c?'w':'b', 'Partie libre'); }

/* réanalyse automatique des parties en cache quand le répertoire change */
window.addEventListener('load',function(){ if(P.settings.dataVersion===DATA.version) return; try{ if(Object.keys(P.games).length) reanalyseAll(); P.settings.dataVersion=DATA.version; save(); if(top()&&top().s!=='board') renderNav(); }catch(e){ console.warn('réanalyse',e); } });
