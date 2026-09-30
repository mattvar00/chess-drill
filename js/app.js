/* ---------- app : navigation, échiquier, drill / explorer, fautes ---------- */
const PIECE=p=>PIECES[p.color+p.type];
const FILES='abcdefgh'; const $=s=>document.querySelector(s);

/* ---------- index ---------- */
const BR={}; // id -> {br, sys, bloc}
DATA.blocs.forEach(bl=>bl.systemes.forEach(sy=>sy.branches.forEach(br=>{BR[br.id]={br,sys:sy,bloc:bl};})));

/* progression : voir store.js */

/* ---------- état ---------- */
let mode='rep', view={level:'blocs'}, cur=null, game=null, orient='w', selected=null, legal=[], locked=false, lastMove=null;

/* ---------- board ---------- */
const boardEl=$('#board');
function buildBoard(){
  boardEl.innerHTML='';
  const ranks=orient==='w'?[8,7,6,5,4,3,2,1]:[1,2,3,4,5,6,7,8];
  const files=orient==='w'?[0,1,2,3,4,5,6,7]:[7,6,5,4,3,2,1,0];
  for(const r of ranks) for(const f of files){
    const sq=FILES[f]+r; const d=document.createElement('div');
    d.className='sq '+(((f+r)%2===1)?'d':'l'); d.dataset.sq=sq;
    if(r===ranks[7]) d.insertAdjacentHTML('beforeend',`<span class="co f">${FILES[f]}</span>`);
    if(f===files[0]) d.insertAdjacentHTML('beforeend',`<span class="co r">${r}</span>`);
    d.addEventListener('pointerdown',ev=>{ if(ev.button===0||ev.pointerType!=='mouse') tap(sq); });
    boardEl.appendChild(d);
  }
}
const sqEl=sq=>document.querySelector(`.sq[data-sq="${sq}"]`);
function render(){
  document.querySelectorAll('.sq').forEach(el=>{
    const sq=el.dataset.sq; el.querySelectorAll('img').forEach(i=>i.remove());
    el.classList.remove('sel','dot','cap','last','hint');
    const p=game.get(sq); if(p){const img=document.createElement('img');img.src=PIECE(p);el.appendChild(img);}
    if(lastMove&&(sq===lastMove.from||sq===lastMove.to)) el.classList.add('last');
  });
  if(selected){ sqEl(selected).classList.add('sel'); legal.forEach(m=>sqEl(m.to).classList.add(m.captured?'cap':'dot')); }
}
function flash(sq,cls){const el=sqEl(sq); if(!el)return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);}
function tap(sq){
  if(locked||!game) return;
  if(cur.mode==='explore') return;
  if(game.turn()!==orient) return;
  const p=game.get(sq);
  if(selected){ const m=legal.find(x=>x.to===sq); if(m){selected=null;legal=[];onUserMove(m);return;} }
  if(p&&p.color===orient){selected=sq;legal=game.moves({square:sq,verbose:true});} else {selected=null;legal=[];}
  render();
}

/* ---------- navigation listes ---------- */
function threatCountFor(ids){ if(!P.maia) return 0; const set=new Set(ids); return P.maia.threats.filter(t=>t.branches.some(b=>set.has(b))).length; }
function renderBlocs(h){
  const all=DATA.blocs.flatMap(b=>b.systemes.flatMap(s=>s.branches));
  const v=all.filter(b=>isValid(b.id)).length; const due=all.filter(b=>isDue(b.id)).length;
  h.innerHTML=`<div class="stats"><div class="stat"><div class="n">${all.length}</div><div class="l">lignes</div></div><div class="stat"><div class="n">${v}</div><div class="l">validées</div></div><div class="stat"><div class="n">${due}</div><div class="l">à réviser</div></div></div>
  <details class="help"><summary>Comment ça marche</summary>Ouvre un bloc puis un système. <b>Drill</b> te fait rejouer une ligne de mémoire ; <b>Explorer</b> montre la ligne avec les plans. Deux passages sans faute valident une ligne, qui revient ensuite à intervalles croissants. Le tirage favorise les lignes neuves, celles que tu rencontres souvent et celles où tu as dévié en partie.</details>
  <div class="sysbar">${due?`<button id="bRev">Réviser · ${due}</button>`:''}<button id="bAllDrill" class="${due?'sec':''}">Drill mixte</button></div>`;
  h.innerHTML+=DATA.blocs.map(bl=>{ const th=threatCountFor(bl.systemes.flatMap(s=>s.branches.map(b=>b.id))); return `<div class="card" data-bloc="${bl.id}"><div class="sw k ${bl.side}"></div><div class="body"><div class="t">${bl.titre}</div><div class="s">${bl.sous} · ${bl.systemes.reduce((a,s)=>a+s.branches.length,0)} lignes${th?` · <span class="warn">${th} réponse${th>1?'s':''} adverse${th>1?'s':''} non couverte${th>1?'s':''}</span>`:''}</div></div><div class="prog"><b style="width:${blocPct(bl)}%"></b></div><div class="go">›</div></div>`; }).join('');
  h.querySelectorAll('.card').forEach(el=>el.onclick=()=>go({s:'sys',bloc:el.dataset.bloc}));
  const rv=$('#bRev'); if(rv) rv.onclick=()=>startDrill(all.filter(b=>isDue(b.id)).map(b=>b.id),'Révision');
  $('#bAllDrill').onclick=()=>startDrill(all.map(b=>b.id),'Drill mixte');
}
function renderSys(h,bl){
  h.innerHTML=`<div class="sysbar"><button id="bAll">Drill · tout le bloc</button></div>`;
  h.innerHTML+=bl.systemes.map(sy=>{ const th=threatCountFor(sy.branches.map(b=>b.id)); return `<div class="card" data-sys="${sy.id}"><div class="sw"><i></i><i></i><i></i><i></i></div><div class="body"><div class="t">${sy.titre} <span class="badge ${sy.statut==='alternatif'?'alt':sy.statut==='à apprendre'?'learn':'ok'}">${sy.statut}</span></div><div class="s">${sy.branches.length} lignes · ${sy.branches.filter(b=>isValid(b.id)).length} validées${th?` · <span class="warn">${th} trou${th>1?'s':''} probable${th>1?'s':''}</span>`:''}</div></div><div class="prog"><b style="width:${sysPct(sy)}%"></b></div><div class="go">›</div></div>`; }).join('');
  h.querySelectorAll('.card').forEach(el=>el.onclick=()=>go({s:'br',bloc:bl.id,sys:el.dataset.sys}));
  $('#bAll').onclick=()=>startDrill(bl.systemes.flatMap(s=>s.branches.map(b=>b.id)),bl.titre);
}
function renderBranches(h,blId,syId){
  const bl=DATA.blocs.find(b=>b.id===blId), sy=bl.systemes.find(s=>s.id===syId);
  h.innerHTML=`<div class="intro">${sy.resume}</div>
  <div class="sysbar"><button id="bDrill">Drill · ce système</button><button id="bExpl" class="sec">Explorer la 1ʳᵉ</button>${plansFor(sy.id).length?`<button id="bPlans" class="sec">Voir les plans (${plansFor(sy.id).length})</button>`:''}</div>`;
  h.innerHTML+=sy.branches.map(br=>{const st=brState(br.id); const v=isValid(br.id); const th=P.maia?P.maia.threats.filter(t=>t.branches.includes(br.id)):[];
    return `<div class="card" data-br="${br.id}"><div class="sw"><i></i><i></i><i></i><i></i></div><div class="body"><div class="t">${br.titre}</div><div class="s">${br.moves.length} demi-coups · ${Object.keys(br.notes).length} plans${st.runs?` · ${st.runs} passage${st.runs>1?'s':''}`:''}${v?` · révision ${isDue(br.id)?'due':'dans '+daysUntil(st.due)+' j'}`:''}${st.devs?` · <span class="warn">${st.devs} déviation${st.devs>1?'s':''}</span>`:''}${th.length?` · <span class="warn">humains : ${th[0].miss[0].san} ${Math.round(100*th[0].miss[0].p)}%</span>`:''}</div></div>${v?'<span class="badge ok">validée</span>':st.clean>=1?'<span class="badge">1/2</span>':''}<div class="go">›</div></div>`;}).join('');
  h.querySelectorAll('.card').forEach(el=>el.onclick=()=>startBranch(el.dataset.br,'explore'));
  $('#bDrill').onclick=()=>startDrill(sy.branches.map(b=>b.id),sy.titre);
  $('#bExpl').onclick=()=>startBranch(sy.branches[0].id,'explore');
  const bp=$('#bPlans'); if(bp) bp.onclick=()=>{ const L=plansFor(sy.id); if(L.length===1) go({s:'plan',id:L[0].id,i:0}); else go({s:'plans',sys:sy.id}); };
}
let FMODE='all';
function allFaults(){
  if(FMODE==='forced') return forcedFaults();
  const base=DATA.faults.map((F,i)=>({key:'d'+i,F,src:'base'}));
  const gen=[]; Object.values(P.games).sort((a,b)=>b.t-a.t).forEach(g=>{ (P.gfaults[g.id]||[]).forEach(F=>gen.push({key:F.id,F,src:'game'})); });
  return gen.concat(base);
}
function rebuildFaults(){ /* rien à recalculer : allFaults() lit P.gfaults à la volée */ }
function renderFaults(h){
  const L=allFaults(); const n=L.length, done=L.filter(x=>P.fault[x.key]&&P.fault[x.key].done).length;
  const nGen=L.filter(x=>x.src==='game').length;
  const W=(P.wood||[]).filter(c=>(c.mode||'all')===FMODE); const last=W[W.length-1]; const WC=P.woodCur&&(P.woodCur.mode||'all')===FMODE?P.woodCur:null;
  const woodHtml=`${FMODE==='forced'?`<div class="intro"><b>Coups forcés.</b> Les positions de tes parties où un échec ou une prise s'imposait et où tu as joué un coup calme. Ce ne sont pas des combinaisons : c'est presque toujours le coup qu'un joueur de ton niveau jouerait. Le but est de prendre le réflexe <b>échecs, prises, menaces</b> avant chaque coup.${n?'':' Analyse des parties au moteur (onglet Parties) pour en générer.'}</div>`:''}<div class="sysbar">${WC?`<button id="bWoodResume">Reprendre le cycle · ${WC.i}/${WC.ids.length} · ${fmtT(WC.elapsed)}</button><button id="bWood" class="sec">Nouveau</button>`:`<button id="bWood">${FMODE==='forced'?'Série chrono':'Cycle Woodpecker'} · ${n} position${n>1?'s':''}${last?` · dernier ${fmtT(last.time)}`:''}</button>${n>10?'<button id="bWood10" class="sec">10 au hasard</button>':''}`}</div>${W.length?`<div class="why">Cycles : ${W.slice(-6).map(c=>`${fmtT(c.time)} (${Math.round(100*c.solved/c.n)}%)`).join(' → ')}. Même jeu, plus vite à chaque passage.</div>`:''}`;
  h.insertAdjacentHTML('afterbegin', woodHtml);
  h.querySelectorAll('.card').forEach(el=>el.onclick=()=>startFault(+el.dataset.i));
  $('#bWood').onclick=()=>woodStart(); const w10=$('#bWood10'); if(w10) w10.onclick=()=>woodStart(10);
  const wr=$('#bWoodResume'); if(wr) wr.onclick=()=>woodResume();
}
function woodStart(n){ const L=allFaults(); let ids=L.map(x=>x.key); if(n&&n<ids.length) ids=ids.sort(()=>Math.random()-0.5).slice(0,n);
  WOOD={start:Date.now(),elapsed:0,solved:0,n:ids.length,ids,i:0,mode:FMODE}; woodSave(); startFault(faultIndex(ids[0])); }
function woodResume(){ const WC=P.woodCur; if(!WC) return; FMODE=WC.mode||'all'; WOOD={start:Date.now(),elapsed:WC.elapsed,solved:WC.solved,n:WC.ids.length,ids:WC.ids,i:WC.i,mode:FMODE}; startFault(faultIndex(WC.ids[WC.i])); }
function woodSave(){ if(!WOOD) return; P.woodCur={ids:WOOD.ids,i:WOOD.i,solved:WOOD.solved,elapsed:WOOD.elapsed+(Date.now()-WOOD.start),mode:WOOD.mode||'all'}; save(); }
function woodPause(){ if(WOOD){ woodSave(); WOOD=null; } }
function faultIndex(key){ return Math.max(0, allFaults().findIndex(x=>x.key===key)); }
function woodNext(){ WOOD.i++; if(WOOD.i<WOOD.n){ woodSave(); startFault(faultIndex(WOOD.ids[WOOD.i])); } else woodEnd(); }
let WOOD=null; const fmtT=ms=>{ const s=Math.round(ms/1000); return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; };
function woodTick(){ if(!WOOD||!cur||cur.kind!=='fault') return; $('#branchtag').textContent=`Woodpecker ${WOOD.i+1}/${WOOD.n} · ${fmtT(WOOD.elapsed+Date.now()-WOOD.start)}`; }
setInterval(woodTick,1000);
function woodEnd(){ const c={date:Date.now(),time:WOOD.elapsed+Date.now()-WOOD.start,solved:WOOD.solved,n:WOOD.n,mode:WOOD.mode||'all'}; P.wood=(P.wood||[]).concat([c]); P.woodCur=null; save(); const W=P.wood.filter(x=>(x.mode||'all')===c.mode); const prev=W[W.length-2]; WOOD=null;
  $('#coach').innerHTML=`<div class="done"><div class="big">Cycle terminé · ${fmtT(c.time)}</div><div class="sub">${c.solved}/${c.n} du premier coup${prev?` · précédent : ${fmtT(prev.time)}, ${prev.solved}/${prev.n}`:''}</div></div>`;
  $('#actions').innerHTML=`<button id="bWoodAgain" class="pri">Refaire un cycle</button><button id="bWoodTen">10 au hasard</button><button id="bWoodBack">Retour</button>`;
  $('#bWoodAgain').onclick=()=>woodStart(); $('#bWoodTen').onclick=()=>woodStart(10); $('#bWoodBack').onclick=back; locked=true; }

/* ---------- drill / explore ---------- */
function pickNext(pool){
  // priorité : non validées, puis validées à réviser ; aléatoire
  const hot=pool.filter(id=>!isValid(id)||isDue(id));
  return weightedPick(hot.length?hot:pool);
}
function startDrill(pool,label){ const id=pickNext(pool); startBranch(id,'drill',{pool,label}); }
function startBranch(id,m,session,opts){
  opts=opts||{};
  const {br,sys,bloc}=BR[id];
  showBoard();
  cur={kind:'rep',id,br,sys,bloc,mode:m,ply:0,errs:0,steps:[],hintLevel:0,lastNote:null,wrongHere:0,session:session||null,fromGame:opts.fromGame||null,planId:opts.planId||null};
  orient=bloc.side; game=new Chess(); selected=null;legal=[];lastMove=null;locked=false;
  buildBoard(); render(); paintHeader(); paintModes(); paintStepper(); paintMoves();
  if(m==='explore'){ $('#explnav').classList.remove('hidden'); $('#actions').innerHTML=''; explTo(opts.explPly||0); }
  else {
    $('#explnav').classList.add('hidden');
    if(opts.startPly){ playTo(Math.min(opts.startPly, br.moves.length)); }
    if(cur.fromGame){ const g=cur.fromGame, a=g.a; paintCoach(); const alts=(a.branches||[]).filter(b=>b!==id); $('#coach').insertAdjacentHTML('afterbegin',`<div class="fromgame">${a.status==='dev'?`Contre <b>${g.opp}</b> tu as joué <b>${a.played}</b> ici.`:`Contre <b>${g.opp}</b> il a joué <b>${a.played}</b> ici — hors répertoire.`} Ligne de référence : <b>${br.titre}</b>.${alts.length?` <a href="#" id="bAltLine">Autre ligne (${alts.length})</a>`:''}</div>`); const al=$('#bAltLine'); if(al) al.onclick=ev=>{ ev.preventDefault(); pickBranch(a.branches,id,b=>{ P.pref[fenKey(a.fen)]=b; save(); startBranch(b,'drill',null,opts); }); }; }
    else paintCoach();
    if(game.turn()!==orient){locked=true;setTimeout(autoReply,500);}
  }
  window.scrollTo(0,0);
}
/* avancer la ligne jusqu'au demi-coup `target` (les coups sont comptés comme joués) */
function playTo(target){
  const br=cur.br;
  while(cur.ply<target){const mv=br.moves[cur.ply]; lastMove=game.move({from:mv.uci.slice(0,2),to:mv.uci.slice(2,4),promotion:mv.uci[4]}); cur.steps[cur.ply]=cur.steps[cur.ply]||'ok'; cur.ply++;}
  render(); paintMoves(); paintStepper();
}
function paintHeader(){
  const F=cur.kind==='fault'?cur.F:null;
  $('#topname span').textContent='Adversaire'; $('#botname span').textContent=orient==='w'?'Toi (Blancs)':'Toi (Noirs)';
  $('#topname i').style.background=orient==='w'?'#222':'#eee'; $('#botname i').style.background=orient==='w'?'#eee':'#222';
  if(cur.kind==='rep'){
    $('#ptitle').innerHTML=`${cur.br.titre}<small>${cur.bloc.titre} · ${cur.sys.titre}</small>`;
    $('#ptag').textContent=cur.br.id; $('#ptag').className='tag';
    $('#branchtag').textContent= cur.session? cur.session.label : '';
    const st=brState(cur.id);
    if(cur.planId) $('#meta').innerHTML=`<span>Rejoue la ligne jusqu'à la position clé : le plan animé suit.</span><span>Erreurs <b id="errn">0</b></span>`;
    else if(!cur.readonly) $('#meta').innerHTML=`<span>Passages <b>${st.runs}</b></span><span>Sans faute <b>${st.clean}/2</b></span><span>Erreurs ici <b id="errn">0</b></span>`;
  } else {
    $('#ptitle').innerHTML=`${F.theme}<small>${F.opening} · coup ${F.move_no}</small>`; $('#ptag').textContent=F.phase; $('#ptag').className='tag b'; $('#branchtag').textContent='';
    $('#meta').innerHTML=`<span>vs <b>${F.opp}</b> · ${F.date}</span><span>Matériel <b>${F.mat>0?'+'+F.mat:F.mat}</b></span><span>Dans la partie <b>${Math.round(F.played.wp_before)}% → ${Math.round(F.played.wp_after)}%</b></span>`;
  }
}
function applyBlind(){ boardEl.classList.toggle('blind', !!(P.settings.blind && cur && cur.kind==='rep' && cur.mode==='drill')); }
function paintModes(){
  const m=$('#modes');
  if(cur.kind!=='rep'){ m.innerHTML=''; return; }
  m.innerHTML=`<button id="mExpl" class="${cur.mode==='explore'?'on':''}">Explorer</button><button id="mDrill" class="${cur.mode==='drill'?'on':''}">Drill</button><button id="mBlind" class="blindbtn ${P.settings.blind?'on':''}" title="Aveugle : pièces cachées">◐</button>`;
  $('#mExpl').onclick=()=>startBranch(cur.id,'explore',cur.session);
  $('#mDrill').onclick=()=>startBranch(cur.id,'drill',cur.session);
  $('#mBlind').onclick=()=>{ P.settings.blind=!P.settings.blind; save(); applyBlind(); $('#mBlind').classList.toggle('on',!!P.settings.blind); };
  applyBlind();
}
function paintStepper(){
  const st=$('#stepper');
  if(cur.kind!=='rep'||cur.mode!=='drill'){ st.innerHTML=''; return; }
  const mine=cur.br.moves.map((m,i)=>i).filter(i=>(i%2===0)===(orient==='w'));
  st.innerHTML=mine.map(i=>`<i class="${cur.steps[i]||(i===cur.ply?'cur':'')}"></i>`).join('');
}
function paintMoves(){
  const el=$('#moves');
  if(cur.kind==='rep'){
    const mv=cur.br.moves; let h=''; let n=1; const showAll=cur.mode==='explore';
    mv.forEach((m,i)=>{
      if(!showAll && i>=cur.ply) return;
      if(i%2===0) h+=`<span class="n">${n++}.</span>`; else if(i===0||(showAll&&i===0)) h+='';
      const cls=['m']; if(i===cur.ply-1) cls.push('cur'); if(showAll&&i>=cur.ply) cls.push('fut'); if(cur.br.notes[i]) cls.push('note');
      h+=`<span class="${cls.join(' ')}" data-i="${i}">${m.san}</span> `;
    });
    if(!showAll) h+=`<span class="n">· ${mv.length-cur.ply} demi-coup${mv.length-cur.ply>1?'s':''} restants</span>`;
    el.innerHTML=h;
    if(showAll) el.querySelectorAll('.m').forEach(s=>s.onclick=()=>explTo(+s.dataset.i+1));
    else el.scrollTop=el.scrollHeight;
  } else {
    const hist=game.history({verbose:true}); const F=cur.F; let n=F.move_no; let h='';
    if(F.side==='b'&&hist.length) h+=`<span class="n">${n}…</span>`;
    hist.forEach((m,i)=>{const w=m.color==='w'; if(w) h+=`<span class="n">${n}.</span>`; h+=`<span class="m ${i===hist.length-1?'cur':''}">${m.san}</span> `; if(!w) n++;});
    el.innerHTML=h||`<span class="n">position de départ — coup ${F.move_no}</span>`;
  }
}
/* explore */
function explTo(ply){
  const mv=cur.br.moves; ply=Math.max(0,Math.min(mv.length,ply));
  game=new Chess(); lastMove=null;
  for(let i=0;i<ply;i++){ lastMove=game.move({from:mv[i].uci.slice(0,2),to:mv[i].uci.slice(2,4),promotion:mv[i].uci[4]}); }
  cur.ply=ply; render(); paintMoves();
  if(cur.game&&cur.game.cls){ const el=$('#moves'); el.querySelectorAll('.m').forEach(sp=>{ const k=cur.game.cls[+sp.dataset.i]; if(k&&k!=='best'&&k!=='good') sp.classList.add('c-'+k); }); }
  const note = ply>0 ? cur.br.notes[ply-1] : null;
  const c=$('#coach');
  if(ply===0) c.innerHTML=`<div class="lead you">${cur.sys.titre}</div><p class="why">${cur.sys.resume}</p><p class="why">Avance avec › ; les coups soulignés portent un commentaire.</p>`;
  else c.innerHTML=`<div class="lead">${Math.ceil(ply/2)}${ply%2?'.':'...'} ${mv[ply-1].san}</div>${note?`<p>${note}</p>`:cur.readonly?replayNote(ply):'<p class="why">Coup de la ligne.</p>'}`;
  $('#actions').innerHTML = (ply>=mv.length && !cur.readonly) ? `<button id="bToDrill" class="pri">Passer au drill</button><button id="bSpar2">Sparring Maia</button>` : (cur.readonly&&cur.game&&ply>0?`<button id="bSpar2">Rejouer d'ici contre Maia</button>`:'');
  const b=$('#bToDrill'); if(b) b.onclick=()=>startBranch(cur.id,'drill',cur.session);
  const b2=$('#bSpar2'); if(b2) b2.onclick=()=>startSpar(game.fen(),orient,cur.br.titre);
  if(cur.readonly&&cur.game&&ply>0&&MAIA.ready){ const uci=cur.br.moves[ply-1].uci; const t=new Chess(); cur.br.moves.slice(0,ply-1).forEach(x=>t.move({from:x.uci.slice(0,2),to:x.uci.slice(2,4),promotion:x.uci[4]})); const fb=t.fen(); const myPly=ply; maiaHumanNote(fb,uci,+(P.settings.myElo||1800)).then(txt=>{ if(txt&&cur&&cur.ply===myPly) $('#coach').insertAdjacentHTML('beforeend',`<p class="why maia">${txt}</p>`); }); }
}
function replayNote(ply){
  const g=cur.game; let h=`<p class="why">${ply<=(cur.bookDepth||0)?'Dans le répertoire.':'Hors répertoire.'}</p>`;
  if(g&&g.ev&&g.ev[ply]){ const k=g.cls[ply-1]; const mine=cur.br.moves[ply-1]&&((ply-1)%2===0)===(g.color==='w');
    const before=g.ev[ply-1], after=g.ev[ply];
    h=`<p><span class="cls ${k}">${CLASS_LABEL[k]}</span> <span class="dim">éval ${evalText(before)} → ${evalText(after)}</span></p>`;
    if(k!=='best'&&before&&before.b){ const t=new Chess(); cur.br.moves.slice(0,ply-1).forEach(m=>t.move({from:m.uci.slice(0,2),to:m.uci.slice(2,4),promotion:m.uci[4]})); const bm=t.move({from:before.b.slice(0,2),to:before.b.slice(2,4),promotion:before.b[4]}); if(bm) h+=`<p class="why">Meilleur : <b>${bm.san}</b></p>`; }
  }
  return h;
}
$('#eFirst').onclick=()=>explTo(0); $('#ePrev').onclick=()=>explTo(cur.ply-1); $('#eNext').onclick=()=>explTo(cur.ply+1); $('#eLast').onclick=()=>explTo(cur.br.moves.length);
document.addEventListener('keydown',e=>{ if(!cur||cur.kind!=='rep'||cur.mode!=='explore') return; if(e.key==='ArrowRight') explTo(cur.ply+1); if(e.key==='ArrowLeft') explTo(cur.ply-1); });

/* drill coach */
function paintCoach(html){
  const c=$('#coach'); if(html){c.innerHTML=html;return;}
  if(cur.kind==='rep'){
    const br=cur.br; if(cur.ply>=br.moves.length){finishRep();return;}
    const note=br.notes[cur.ply]; const prev=cur.lastNote?`<p class="why">${cur.lastNote}</p>`:'';
    if(cur.ply<=1) c.innerHTML=`<div class="lead you">À toi de jouer</div><p class="why">${cur.sys.resume}</p>`;
    else c.innerHTML=`<div class="lead you">À toi de jouer${note?' <span class="tag b">coup clé</span>':''}</div>${prev||'<p class="why">Continue la ligne.</p>'}`;
  } else {
    const F=cur.F; if(cur.solved) return;
    c.innerHTML=`<div class="lead you">${F.side==='w'?'Les Blancs jouent':'Les Noirs jouent'} — trouve le coup</div><p class="why">${F.phase.charAt(0).toUpperCase()+F.phase.slice(1)}, ${matPhrase(F.mat)}. Thème : ${F.theme.toLowerCase()}. ${hintFor(F.theme)}</p>`;
  }
  paintActions();
}
const matPhrase=m=>m>0?`tu as ${m} point${m>1?'s':''} de plus`:m<0?`tu as ${-m} point${-m>1?'s':''} de moins`:'matériel égal';
function hintFor(t){return {'Échec à jouer':'Commence par lister tous tes échecs. L\'un d\'eux s\'impose.','Prise à jouer':'Regarde chaque prise possible avant de jouer calme.','Échec gagnant raté':'Vérifie tous tes échecs avant de jouer calme.','Pièce à prendre':'Une pièce adverse traîne. Encaisse.','Capture gagnante ratée':'Une prise rapporte du matériel — compte bien avant de la rejeter.','Pièce en prise oubliée':'Une de tes pièces est attaquée. Sauve-la ou trouve plus fort.','Pièce déposée en prise':'La case où tu veux aller est-elle sûre ? Compte attaquants et défenseurs.','Pièce mise en prise':'Que défend la pièce que tu vas bouger ? Cherche ce qui reste en l\'air.','Échec adverse ignoré':'Liste d\'abord tous les échecs de l\'adversaire.','Coup calme':'Rien n\'est forcé. Que menace-t-il au coup suivant ?'}[t]||'';}
function paintActions(){
  const a=$('#actions');
  if(cur.kind==='rep'){
    a.innerHTML=`<button id="bHint">Indice</button><button id="bSkip">⏩ Aller à la théorie</button><button id="bRestart">Recommencer</button>`;
    $('#bHint').onclick=hint; $('#bSkip').onclick=skipToTheory; $('#bRestart').onclick=()=>startBranch(cur.id,'drill',cur.session);
  } else {
    a.innerHTML=`<button id="bHint" ${cur.solved?'disabled':''}>Indice</button><button id="bSol" ${cur.solved?'disabled':''}>Solution</button><button id="bNext" class="pri">Suivant ›</button>`;
    $('#bHint').onclick=hint; $('#bSol').onclick=showSolution; $('#bNext').onclick=()=>{const n=cur.i+1; if(WOOD){ woodNext(); return; } if(n<allFaults().length) startFault(n); else back();};
  }
}
function hint(){
  if(cur.kind==='rep'&&(cur.ply>=cur.br.moves.length||game.turn()!==orient)) return;
  if(cur.kind==='fault'&&cur.solved) return;
  const uci=cur.kind==='rep'?cur.br.moves[cur.ply].uci:cur.F.best.uci;
  selected=null;legal=[]; cur.hintLevel++; render();
  sqEl(uci.slice(0,2)).classList.add('hint'); if(cur.hintLevel>=2) sqEl(uci.slice(2,4)).classList.add('hint');
}
function onUserMove(m){ if(cur.kind==='spar') sparMove(m); else if(cur.kind==='rep') repMove(m); else faultMove(m); }
function repMove(m){
  const br=cur.br, want=br.moves[cur.ply]; const uci=m.from+m.to+(m.promotion||'');
  if(uci===want.uci){
    game.move(m); lastMove=m; if(!cur.steps[cur.ply]) cur.steps[cur.ply]='ok'; flash(m.to,'good');
    cur.lastNote=br.notes[cur.ply]||null; cur.wrongHere=0; cur.hintLevel=0;
    if(cur.lastNote) paintCoach(`<div class="lead ok">${want.san}</div><p>${cur.lastNote}</p>`);
    cur.ply++; render(); paintMoves(); paintStepper();
    if(cur.ply>=br.moves.length){finishRep();return;}
    locked=true; setTimeout(autoReply,450);
  } else {
    cur.errs++; cur.steps[cur.ply]='bad'; $('#errn').textContent=cur.errs; render(); flash(m.to,'bad'); paintStepper();
    const note=br.notes[cur.ply]; cur.wrongHere++;
    const masked=note?note.replace(/^[^:]*:\s*/,''):null;
    paintCoach(`<div class="lead bad">${m.san} n'est pas dans la ligne</div><p>${(cur.wrongHere>=2&&masked)?'Indice de plan : '+masked:'Le répertoire joue autre chose ici. Réessaie, ou demande un indice.'}</p>`);
  }
}
function autoReply(){
  if(!cur||cur.kind!=='rep'||cur.finished) return; const br=cur.br; if(cur.ply>=br.moves.length){locked=false;finishRep();return;}
  const mv=br.moves[cur.ply]; const m=game.move({from:mv.uci.slice(0,2),to:mv.uci.slice(2,4),promotion:mv.uci[4]});
  lastMove=m; cur.ply++; locked=false; render(); paintMoves(); paintStepper();
  if(cur.ply>=br.moves.length) finishRep(); else paintCoach();
}
function skipToTheory(){
  const br=cur.br; const keys=Object.keys(br.notes).map(Number); if(!keys.length) return;
  const first=Math.min(...keys); const target=Math.max(0, first-(orient==='w'?0:1));
  playTo(target);
  if(game.turn()!==orient){locked=true;setTimeout(autoReply,300);} else paintCoach();
}
function finishRep(){
  if(cur.finished) return; cur.finished=true; locked=true;
  if(cur.readonly){ locked=true; return; }
  if(cur.planId){ const pid=cur.planId, e=cur.errs; P.planDone=P.planDone||{}; P.planDone[pid]={t:Date.now(),errs:e}; save();
    $('#coach').innerHTML=`<div class="done"><div class="big">${e===0?'Ligne jouée sans faute':e+' erreur'+(e>1?'s':'')+' sur la ligne'}</div><div class="sub">Tu es arrivé à la position clé. Voyons maintenant le plan, étape par étape.</div></div>`;
    $('#actions').innerHTML=`<button id="bPlanGo" class="pri">Voir le plan animé</button><button id="bPlanAgain">Rejouer la ligne</button>`;
    $('#bPlanGo').onclick=()=>{ NAV.pop(); const tp=navTop(); if(tp&&tp.s==='plan'&&tp.id===pid) replaceTop({s:'plan',id:pid,i:0,played:true}); else go({s:'plan',id:pid,i:0,played:true}); };
    $('#bPlanAgain').onclick=()=>{ NAV.pop(); planPlay(pid); };
    return; }
  if(cur.fromGame&&cur.errs===0){ P.fixed[cur.fromGame.id]=true; }
  const st=schedule(cur.id, cur.errs);
  const v=isValid(cur.id);
  const when = st.ivl===1?'demain':`dans ${st.ivl} jours`;
  $('#coach').innerHTML=`<div class="done"><div class="big">${cur.errs===0?'Ligne sans faute':cur.errs+' erreur'+(cur.errs>1?'s':'')}</div><div class="sub">${cur.errs===0?(v?`Branche validée. Prochaine révision ${when}.`:'Encore une fois sans faute et elle est validée.'):cur.errs===1?`Presque. Elle revient ${when}.`:'Le compteur repart à zéro : deux passages propres d\'affilée pour valider.'}</div></div>`;
  let btns=`<button id="bAgain" ${cur.errs===0?'':'class="pri"'}>Refaire</button>`;
  if(cur.session){ btns+=`<button id="bNextBr" class="pri">Branche suivante ›</button>`; }
  const pls=cur&&cur.sys?plansFor(cur.sys.id):[];
  btns+=`${pls.length?'<button id="bPlan">Voir le plan</button>':''}<button id="bSpar">Sparring Maia</button><button id="bList">Liste</button>`;
  $('#actions').innerHTML=btns;
  $('#bSpar').onclick=()=>startSpar(game.fen(),orient,cur.br.titre);
  const bpl=$('#bPlan'); if(bpl) bpl.onclick=()=>{ const L=plansFor(cur.sys.id); NAV.pop(); if(L.length===1) go({s:'plan',id:L[0].id,i:0}); else go({s:'plans',sys:cur.sys.id}); };
  $('#bAgain').onclick=()=>startBranch(cur.id,'drill',cur.session);
  const nb=$('#bNextBr'); if(nb) nb.onclick=()=>startDrill(cur.session.pool,cur.session.label);
  $('#bList').onclick=()=>{ NAV.pop(); go({s:'br',bloc:cur.bloc.id,sys:cur.sys.id}); };
  paintStepper();
}

/* ---------- fautes ---------- */
function startFault(i){
  const L=allFaults(); const F=L[i].F; showBoard();
  cur={kind:'fault',i,key:L[i].key,F,solved:false,tries:0,hintLevel:0}; boardEl.classList.remove('blind'); orient=F.side; game=new Chess(F.fen);
  selected=null;legal=[];lastMove=null;locked=false; $('#explnav').classList.add('hidden');
  buildBoard(); render(); paintHeader(); paintModes(); paintStepper(); paintCoach(); paintMoves(); woodTick(); window.scrollTo(0,0);
}
function faultMove(m){
  const F=cur.F; const uci=m.from+m.to+(m.promotion||''); cur.tries++;
  if(uci===F.best.uci){
    game.move(m); lastMove=m; flash(m.to,'good'); render(); paintMoves(); cur.solved=true; locked=true;
    P.fault[cur.key]={done:true,tries:cur.tries}; save(); if(WOOD&&cur.tries===1) WOOD.solved++;
    if(WOOD){ setTimeout(()=>{ if(cur&&cur.kind==='fault'&&cur.solved&&WOOD) woodNext(); },1400); }
    let html=`<div class="lead ok">Bien joué : ${F.best.san}</div><p>${F.best.desc} Évaluation ${F.best.score}.</p>`;
    if(F.best.suite) html+=`<p class="pv">Suite : ${F.best.suite}</p>`;
    html+=`<p class="why">Dans la partie tu avais joué <b>${F.played.san}</b> : ${Math.round(F.played.wp_before)}% → ${Math.round(F.played.wp_after)}% (${F.played.score}).${F.played.refut?' Punition : '+F.played.san+' '+F.played.refut+'.':''}</p>`;
    paintCoach(html);
    if(F.best.reply) setTimeout(()=>{const r=game.move(F.best.reply); if(r){lastMove=r;render();paintMoves();}},600);
    paintActions();
  } else if(uci===F.played.uci){ render(); flash(m.to,'bad'); paintCoach(`<div class="lead bad">${F.played.san} — c'est exactement le coup de la partie</div><p>Évaluation ${F.played.score} au lieu de ${F.best.score}.${F.played.refut?' L\'adversaire répond '+F.played.refut+'.':''}</p><p class="why">Reviens en arrière et cherche mieux.</p>`); paintActions(); }
  else if(F.second&&uci===F.second.uci){ render(); flash(m.to,'bad'); paintCoach(`<div class="lead bad">${F.second.san} — pas le meilleur</div><p>Ce coup vaut ${Math.round(F.second.wp)}% contre ${Math.round(F.played.wp_before)}%+ pour le coup juste. Réessaie.</p>`); paintActions(); }
  else { render(); flash(m.to,'bad'); paintCoach(`<div class="lead bad">${m.san} — non</div><p class="why">${hintFor(F.theme)}</p>`); paintActions(); }
}
function showSolution(){
  const F=cur.F; if(cur.solved) return;
  const m=game.move({from:F.best.uci.slice(0,2),to:F.best.uci.slice(2,4),promotion:F.best.uci[4]}); lastMove=m; render(); paintMoves(); cur.solved=true; locked=true;
  P.fault[cur.key]=P.fault[cur.key]||{done:false,shown:true}; save();
  paintCoach(`<div class="lead">Solution : ${F.best.san}</div><p>${F.best.desc} Évaluation ${F.best.score}.</p>${F.best.suite?`<p class="pv">Suite : ${F.best.suite}</p>`:''}<p class="why">Dans la partie : ${F.played.san} (${Math.round(F.played.wp_before)}% → ${Math.round(F.played.wp_after)}%).${F.played.refut?' Punition : '+F.played.san+' '+F.played.refut+'.':''}</p>`);
  paintActions();
}
/* ---------- réglages ---------- */
function renderSettings(h){
  const nb=Object.keys(P.br).length, ng=Object.keys(P.games).length;
  h.innerHTML=`<div class="intro"><b>Pseudo chess.com.</b></div><div class="fetch"><input id="sUser" value="${P.settings.user||''}" placeholder="pseudo chess.com" autocapitalize="off" autocorrect="off"><button id="sUserSave" class="pri">OK</button></div>
  ${syncSection()}
  <div id="sMsg" class="why"></div>
  <div class="intro"><b>Garde-fou.</b> Au-delà de ce nombre de parties par jour, l'app te dit d'arrêter.</div>
  <div class="fetch"><select id="sLim">${[6,8,10,12,15,20].map(d=>`<option ${+(P.settings.dayLimit||12)===d?'selected':''} value="${d}">${d} parties / jour</option>`).join('')}</select><button id="sLimSave" class="pri">OK</button></div>
  <details class="grp"><summary>Avancé : moteur, Maia, sauvegarde, proxy</summary>
  <div class="intro"><b>Sauvegarde.</b> La progression vit dans ce navigateur. Exporte un fichier JSON pour la garder ou la transférer sur un autre appareil ; l'import fusionne (la version la plus avancée de chaque branche gagne).</div>
  <div class="stats"><div class="stat"><div class="n">${nb}</div><div class="l">branches avec historique</div></div><div class="stat"><div class="n">${ng}</div><div class="l">parties en cache</div></div><div class="stat"><div class="n">${Object.values(P.fault).filter(x=>x.done).length}</div><div class="l">fautes trouvées</div></div></div>
  <div class="sysbar"><button id="sExp">Exporter la progression</button><button id="sImp" class="sec">Importer un fichier</button></div>
  <input type="file" id="sFile" accept="application/json" class="hidden">
  <div class="sysbar"><button id="sRean" class="sec">Réanalyser les parties</button><button id="sReset" class="sec danger">Tout effacer</button></div>
  <div class="intro"><b>Moteur.</b> Stockfish 18 lite tourne dans ton navigateur. Profondeur ${P.settings.depth} / ${P.settings.movetime} ms max par position (≈ 20-30 s par partie). Monte à 14-16 sur ordinateur, descends à 10 sur un vieux téléphone.</div>
  <div class="fetch"><select id="sDepth">${[8,10,12,14,16,18].map(d=>`<option ${+P.settings.depth===d?'selected':''} value="${d}">profondeur ${d}</option>`).join('')}</select><select id="sMt">${[200,350,600,1000,2000].map(d=>`<option ${+P.settings.movetime===d?'selected':''} value="${d}">${d} ms max</option>`).join('')}</select><button id="sEngSave" class="pri">Enregistrer</button></div>
  <div class="intro"><b>Maia.</b> Modèle humain (45 Mo, téléchargé une fois puis gardé dans le navigateur). Ton Elo sert à conditionner le modèle ; l'Elo adverse sert aux menaces ; l'Elo de sparring, à la force de Maia.</div>
  <div class="fetch"><input id="sMyElo" type="number" value="${P.settings.myElo||1800}" placeholder="ton Elo"><input id="sOppElo" type="number" value="${P.settings.oppElo||1800}" placeholder="Elo adverse"><input id="sMaiaElo" type="number" value="${P.settings.maiaElo||1800}" placeholder="Elo sparring"><button id="sMaiaSave" class="pri">OK</button></div>
  <div class="intro"><b>Proxy chess.com (optionnel).</b> Si les fetch directs échouent (CORS/429), déploie <code>proxy/worker.js</code> sur Cloudflare Workers (gratuit) et colle son URL ici. L'app essaie d'abord en direct, puis via le proxy.</div>
  <div class="fetch"><input id="sProxy" value="${P.settings.proxy||''}" placeholder="https://chess-drill.xxx.workers.dev" autocapitalize="off"><button id="sProxySave" class="pri">Enregistrer</button></div>
  <div class="intro"><b>Déploiement.</b> Ce dossier est un site statique : pousse-le tel quel sur GitHub Pages (index.html à la racine). L'API chess.com exige http(s) — en local, lance <code>python -m http.server</code> dans le dossier.</div></details>`;
  $('#sUserSave').onclick=()=>{ P.settings.user=$('#sUser').value.trim(); save(); $('#sMsg').textContent='Pseudo enregistré.'; };
  bindSync(h,()=>renderSettings(h));
  $('#sExp').onclick=exportProgress;
  $('#sImp').onclick=()=>$('#sFile').click();
  $('#sFile').onchange=e=>{ const f=e.target.files[0]; if(!f) return; importProgress(f,(err,n)=>{ $('#sMsg').textContent=err?'Import impossible : '+err.message:`Import réussi (${n} branches).`; renderSettings(h); $('#sMsg').textContent=err?'Import impossible : '+err.message:`Import réussi (${n} branches).`; }); };
  $('#sEngSave').onclick=()=>{ P.settings.depth=+$('#sDepth').value; P.settings.movetime=+$('#sMt').value; save(); $('#sMsg').textContent='Réglages moteur enregistrés.'; };
  $('#sMaiaSave').onclick=()=>{ P.settings.myElo=+$('#sMyElo').value||1800; P.settings.oppElo=+$('#sOppElo').value||1800; P.settings.maiaElo=+$('#sMaiaElo').value||1800; save(); $('#sMsg').textContent='Elo enregistrés.'; };
  $('#sLimSave').onclick=()=>{ P.settings.dayLimit=+$('#sLim').value; save(); $('#sMsg').textContent='Garde-fou enregistré.'; };
  $('#sProxySave').onclick=()=>{ P.settings.proxy=$('#sProxy').value.trim(); save(); $('#sMsg').textContent=P.settings.proxy?'Proxy enregistré.':'Proxy retiré (fetch direct).'; };
  $('#sRean').onclick=()=>{ reanalyseAll(); $('#sMsg').textContent='Parties réanalysées avec le répertoire actuel.'; };
  $('#sReset').onclick=()=>{ if(confirm('Effacer toute la progression et le cache des parties ?')){ resetProgress(); renderSettings(h); } };
}
navInit(); root('today');

/* ---------- feuille de choix ---------- */
function openSheet(title, html, bind){ $('#sheettitle').textContent=title; $('#sheetbody').innerHTML=html; $('#sheet').classList.remove('hidden'); if(bind) bind($('#sheetbody')); }
function closeSheet(){ $('#sheet').classList.add('hidden'); }
$('#sheetclose').onclick=closeSheet; $('#sheet').onclick=e=>{ if(e.target.id==='sheet') closeSheet(); };
function pickBranch(ids, current, cb){
  const html=ids.map(id=>{ const {br,sys,bloc}=BR[id]; const st=brState(id); return `<div class="card ${id===current?'sel':''}" data-id="${id}"><div class="sw"><i></i><i></i><i></i><i></i></div><div class="body"><div class="t">${br.titre}</div><div class="s">${sys.titre} · ${sys.statut}${st.runs?` · ${st.runs} passage${st.runs>1?'s':''}`:''}${isValid(id)?' · validée':''}</div></div>${id===current?'<span class="badge ok">actuelle</span>':''}<div class="go">›</div></div>`; }).join('');
  openSheet('Quelle ligne veux-tu jouer ici ?', html, box=>box.querySelectorAll('.card').forEach(el=>el.onclick=()=>{ closeSheet(); cb(el.dataset.id); }));
}
