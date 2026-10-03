/* ---------- Exercices v2 (fautes, coups forcés, Woodpecker) ----------
   Barre d'évaluation, pas d'enchaînement automatique, explication du « pourquoi »,
   et navigation dans la solution et dans le coup de la partie. Remplace faultMove / showSolution / startFault. */
(function(){
const _startFault=window.startFault;
function evbar(wp,txt){ const e=$('#evbar'); if(!e) return; if(wp==null){ e.classList.add('hidden'); return; } e.classList.remove('hidden'); e.querySelector('b').style.height=Math.max(3,Math.min(97,wp))+'%'; e.querySelector('span').textContent=txt||''; }
window.evbar=evbar;
/* les lignes : la solution (coup juste + suite) et le coup de la partie (+ réfutation) */
function lines(F){
  const toks=s=>(s||'').split(/\s+/).map(x=>x.replace(/^\d+\.(\.\.)?/,'')).filter(x=>x&&!/^\d+\.+$/.test(x));
  const sol=[F.best.san,...toks(F.best.suite)], ply=[F.played.san,...toks(F.played.refut)];
  const valid=L=>{ const c=new Chess(F.fen); const out=[]; for(const s of L){ const m=c.move(s); if(!m) break; out.push(m); } return out; };
  return {best:valid(sol).slice(0,8), played:valid(ply).slice(0,8)};
}
function showLine(){ const F=cur.F, v=cur.view; const L=v.L[v.which]; const c=new Chess(F.fen); let last=null; for(let k=0;k<v.k;k++){ last=c.move(L[k]); }
  game=c; lastMove=last; selected=null; legal=[]; render(); paintMoves();
  const known=v.ev&&v.ev[v.which]&&v.ev[v.which][v.k]; const wp=v.which==='best'?F.played.wp_before:F.played.wp_after; evbar(known!=null?known:(v.k===0?F.played.wp_before:wp), known!=null?'':(v.which==='best'||v.k===0?F.best.score:F.played.score));
  paintSolNav(); }
function why(F){
  const out=[]; const c=new Chess(F.fen); const bm=c.move({from:F.best.uci.slice(0,2),to:F.best.uci.slice(2,4),promotion:F.best.uci[4]});
  if(bm&&typeof rvWhat==='function'){ const W=rvWhat(F.fen,bm,true); const L=cur.view.L.best; const pv=L.map(m=>m.from+m.to+(m.promotion||'')); const gain=rvLineMat(F.fen,pv,F.side,Math.min(5,pv.length));
    let s=`<b>Pourquoi ${F.best.san} ?</b> ${W.d}${W.bits.length?', '+W.bits.slice(0,2).join(', '):''}.`;
    if(/mat/.test(F.best.score)) s+=` Ça mène au ${F.best.score}.`; else if(gain>=2) s+=` La suite gagne ${rvMat(gain)}.`;
    else { const rep=cur.view.L.played[1]; if(rep){ const t=new Chess(F.fen); t.move(bm); const still=t.move(rep.san); s+= still?` Il neutralise la menace ${rep.san}, la réponse qui punissait ton coup.`:` Il empêche ${rep.san}, la réponse qui punissait ton coup.`; }
      s+=` Tes chances restent à ${Math.round(F.played.wp_before)} %.`; }
    out.push(s); }
  const pc=new Chess(F.fen); const pm=pc.move(F.played.uci?{from:F.played.uci.slice(0,2),to:F.played.uci.slice(2,4),promotion:F.played.uci[4]}:F.played.san);
  if(pm){ let s=`<b>Dans ta partie : ${F.played.san}.</b> `; const Lp=cur.view.L.played; const rep=Lp[1];
    if(rep){ const lost=-rvLineMat(F.fen,Lp.map(m=>m.from+m.to+(m.promotion||'')),F.side,Math.min(5,Lp.length));
      s+= rep.captured?`L'adversaire répond ${rep.san} et prend ${rvLe(rep.captured)} en ${rep.to}`:`L'adversaire répond ${rep.san}`;
      if(lost>=2) s+=` : tu perds ${rvMat(lost)}`; s+='.'; }
    s+=` Tes chances passaient de ${Math.round(F.played.wp_before)} % à ${Math.round(F.played.wp_after)} %.`; out.push(s); }
  return out.map(x=>`<p class="why2">${x}</p>`).join('');
}
function matAt(F,L,k){ if(typeof rvBal!=='function') return 0; const c=new Chess(F.fen); const b0=rvBal(rvBoard(F.fen),F.side); for(let i=0;i<k;i++) c.move(L[i]); return rvBal(rvBoard(c.fen()),F.side)-b0; }
function paintSolNav(){ const v=cur.view; if(!v) return; const L=v.L[v.which]; const el=$('#solnav'); if(!el) return;
  const mat=matAt(cur.F,L,v.k); const ev=v.ev&&v.ev[v.which]&&v.ev[v.which][v.k];
  el.innerHTML=`<div class="solbtn"><button id="snP" aria-label="Coup précédent">‹</button><button id="snN" aria-label="Coup suivant">›</button>
    <button id="snB" class="${v.which==='best'?'on':''}">Solution</button><button id="snG" class="${v.which==='played'?'on':''}">Coup de ta partie</button></div>
    <div class="solline">${L.map((m,i)=>`<span class="sm ${i<v.k?'done':''} ${i===v.k-1?'cur':''} ${m.color===cur.F.side?'me':'op'}" data-k="${i+1}">${m.san}</span>`).join(' ')}${v.loading?' <span class="dim">…</span>':''}</div>
    <div class="solinfo">${v.k===0?'Position de départ':`Après ${L[v.k-1].san}`} · matériel ${mat>0?'+'+mat:mat<0?mat:'égal'}${ev!=null?` · tes chances ${Math.round(ev)} %`:''}${v.k>=L.length&&!v.loading?` · <b>fin de la ligne</b>`:''}</div>`;
  $('#snP').onclick=()=>{ v.k=Math.max(0,v.k-1); showLine(); }; $('#snN').onclick=()=>{ v.k=Math.min(L.length,v.k+1); showLine(); };
  $('#snB').onclick=()=>{ v.which='best'; v.k=1; showLine(); }; $('#snG').onclick=()=>{ v.which='played'; v.k=Math.min(2,v.L.played.length); showLine(); };
  el.querySelectorAll('.sm').forEach(x=>x.onclick=()=>{ v.k=+x.dataset.k; showLine(); });
}
/* rallonge les deux lignes avec le moteur (ligne principale complète), puis évalue chaque étape */
async function extendLines(F){ const v=cur.view; if(!v||v.extended) return; v.extended=true; v.loading=true; paintSolNav();
  try{ await engineInit(); const toMoves=(fen,pv,first)=>{ const c=new Chess(fen); const out=[]; if(first){ const m=c.move(first); if(!m) return out; out.push(m); } for(const u of pv){ const m=c.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]}); if(!m) break; out.push(m); if(out.length>=14) break; } return out; };
    const e1=await ENGINE.main.eval(F.fen,16,1500,1); if(cur.view!==v) return;
    const lb=e1.best===F.best.uci?toMoves(F.fen,e1.full||e1.pv):toMoves(new Chess(F.fen).fen(),[],null);
    if(lb.length>v.L.best.length&&lb[0].from+lb[0].to===F.best.uci.slice(0,4)) v.L.best=lb;
    const c=new Chess(F.fen); const pm=c.move(F.played.uci?{from:F.played.uci.slice(0,2),to:F.played.uci.slice(2,4),promotion:F.played.uci[4]}:F.played.san);
    if(pm){ const e2=await ENGINE.main.eval(c.fen(),16,1500,1); if(cur.view!==v) return; const lp=[pm,...toMoves(c.fen(),e2.full||e2.pv)].slice(0,12); if(lp.length>v.L.played.length) v.L.played=lp; }
    v.loading=false; paintSolNav();
    /* chances à chaque étape (rapide) */
    v.ev={best:{},played:{}};
    for(const which of ['best','played']){ const L=v.L[which]; const c2=new Chess(F.fen); for(let k=0;k<=L.length;k++){ if(k>0) c2.move(L[k-1]); if(cur.view!==v) return; const e=await ENGINE.main.eval(c2.fen(),10,120,1); const w=WP(e.cp,e.mate); v.ev[which][k]=F.side==='w'?w:100-w; if(v.which===which&&v.k===k){ paintSolNav(); evbar(v.ev[which][k],''); } } }
  }catch(e){ v.loading=false; paintSolNav(); }
}
function solved(viaSolution,altHead){
  const F=cur.F; cur.solved=true; locked=true; if(typeof woodHold==='function') woodHold();
  cur.view={L:lines(F),which:'best',k:1};
  const head=altHead||(viaSolution?`<div class="lead">Solution : ${F.best.san}</div>`:`<div class="lead ok">Bien joué : ${F.best.san}</div>`);
  paintCoach(head+why(F)+`<div class="solnav" id="solnav"></div>`); paintSolNav(); showLine(); extendLines(F);
  if(!viaSolution&&window.SFX) SFX.good();
  paintActions();
}
window._solved=(a,b)=>solved(a,b);
window.startFault=function(i){ _startFault(i); if(cur&&cur.kind==='fault'){ const F=cur.F; evbar(F.played.wp_before,F.best.score); puzzleDifficulty(cur.key,F).then(p=>{ if(p==null||!cur||cur.F!==F||cur.solved) return; $('#coach').insertAdjacentHTML('beforeend',`<p class="why diff">${diffLabel(p)}</p>`); }); } };
async function equivalent_unused(F,m){ try{ await engineInit(); const c=new Chess(F.fen); c.move(m); const e=await ENGINE.main.eval(c.fen(),12,500,1); const w=WP(e.cp,e.mate); const mine=F.side==='w'?w:100-w; return mine>=(F.played.wp_before||50)-4?mine:null; }catch(e){ return null; } }
window.diffLabel=p=>{ const pc=Math.round(100*p); const lvl=p>=0.3?'facile':p>=0.1?'moyenne':'difficile'; return `Difficulté pour ton niveau : <b>${lvl}</b> (environ ${pc} % des joueurs de ton niveau trouvent ce coup).`; };
window.puzzleDifficulty=async function(key,F){ const s=P.fault[key]; if(s&&s.pm!=null) return s.pm; if(typeof MAIA==='undefined'||!MAIA.ready) return null;
  try{ const elo=+(P.settings.myElo||1800); const [r]=await maiaEval([F.fen],elo,elo); const p=r.policy[F.best.uci]||0; P.fault[key]=Object.assign(P.fault[key]||{}, {pm:p}); save(); return p; }catch(e){ return null; } };
window.faultMove=function(m){
  if(cur.free){ freeMove(m); return; }
  const F=cur.F; const uci=m.from+m.to+(m.promotion||''); cur.tries++;
  if(uci===F.best.uci){ game.move(m); lastMove=m; flash(m.to,'good'); render(); paintMoves();
    schedulePos(cur.key,cur.tries===1?'good':'ok',cur.tries); if(WOOD&&cur.tries===1) WOOD.solved++;
    solved(false); return; }
  /* mauvais coup (ou coup à vérifier) : on le JOUE sur l'échiquier, on explique, puis on revient à la position */
  if(cur.checking) return;
  cur.checking=true; locked=true; const mv=game.move(m); lastMove=mv; selected=null; legal=[]; render(); paintMoves();
  paintCoach(`<div class="lead">${m.san}…</div><p class="why">Le moteur vérifie ton coup.</p>`);
  judge(F,m).then(j=>{ if(!cur||cur.F!==F){ return; } cur.checking=false;
    if(j&&j.ok){ flash(m.to,'good'); schedulePos(cur.key,cur.tries===1?'good':'ok',cur.tries); if(WOOD&&cur.tries===1) WOOD.solved++;
      solved(false,`<div class="lead ok">Aussi bon : ${m.san}</div><p class="why">Ton coup garde tes chances à ${Math.round(j.w)} %. Le moteur préférait ${F.best.san}, voici pourquoi :</p>`); return; }
    flash(m.to,'bad');
    const isGame=uci===F.played.uci;
    const why=j?`Tes chances tomberaient à ${Math.round(j.w)} % (contre ${Math.round(F.played.wp_before)} % avec le bon coup)${j.reply?`, car l'adversaire répondrait <b>${j.reply}</b>${j.cap?' et prendrait '+j.cap:''}`:''}.`:'Ce n\'est pas le bon coup.';
    paintCoach(`<div class="lead bad">✗ ${m.san}${isGame?' : c\'est le coup de ta partie':' : pas le bon coup'}</div><p>${why}</p><p class="why">${hintFor(F.theme)} La position revient, réessaie.</p>`);
    evbar(j?j.w:F.played.wp_after, '');
    setTimeout(()=>{ if(!cur||cur.F!==F||cur.solved) return; game=new Chess(F.fen); lastMove=null; locked=false; render(); paintMoves(); evbar(F.played.wp_before,F.best.score); },1700);
    paintActions(); });
};
/* évalue la position après le coup du joueur : accepté s'il garde les chances à 4 points près */
async function judge(F,m){ try{ await engineInit(); const c=new Chess(F.fen); c.move(m); const e=await ENGINE.main.eval(c.fen(),12,500,1); const w=WP(e.cp,e.mate); const mine=F.side==='w'?w:100-w;
  let reply=null, cap=null; if(e.best){ const t=new Chess(c.fen()); const r=t.move({from:e.best.slice(0,2),to:e.best.slice(2,4),promotion:e.best[4]}); if(r){ reply=r.san; if(r.captured&&typeof rvLe==='function') cap=rvLe(r.captured)+' en '+r.to; } }
  return {w:mine, ok:m.from+m.to+(m.promotion||'')!==F.played.uci&&mine>=(F.played.wp_before||50)-4, reply, cap}; }catch(e){ return null; } }
window.showSolution=function(){ const F=cur.F; if(cur.solved) return; schedulePos(cur.key,'fail',cur.tries); solved(true); };
/* boutons : on n'enchaîne plus tout seul, « Suivant » reste explicite */
const _paintActions=window.paintActions;
window.paintActions=function(){ if(!cur||cur.kind!=='fault'){ _paintActions(); return; }
  if(cur.free){ paintFreeActions(); return; }
  const a=$('#actions'); a.innerHTML=cur.solved?`<button id="bFree" class="pri2">Explorer librement</button><button id="bPlayOn">Jouer contre Maia</button><button id="bNext" class="pri">Suivant ›</button>`:`<button id="bHint">Indice</button><button id="bSol">Solution</button><button id="bNext" class="pri">Suivant ›</button>`;
  const bf=$('#bFree'); if(bf) bf.onclick=()=>startFree();
  const po=$('#bPlayOn'); if(po) po.onclick=()=>{ const c=new Chess(cur.F.fen); c.move({from:cur.F.best.uci.slice(0,2),to:cur.F.best.uci.slice(2,4),promotion:cur.F.best.uci[4]}); startSpar(c.fen(),cur.F.side,'Suite de l\'exercice'); };
  const bh=$('#bHint'); if(bh) bh.onclick=hint; const bs=$('#bSol'); if(bs) bs.onclick=showSolution;
  $('#bNext').onclick=()=>{ const n=cur.i+1; if(WOOD){ woodNext(); return; } if(queueNext()) return; if(cur.key&&cur.key.startsWith('R:')){ back(); return; } if(n<allFaults().length) startFault(n); else back(); };
};
/* la barre ne sert qu'aux exercices */
const _startBranch=window.startBranch; window.startBranch=function(){ evbar(null); return _startBranch.apply(this,arguments); };
if(window.startSpar){ const _ss=window.startSpar; window.startSpar=function(){ evbar(null); return _ss.apply(this,arguments); }; }
})();

/* ---------- Exploration libre après l'exercice (à la Lichess) ----------
   Tu joues les coups des deux camps ; chaque position est évaluée et le meilleur coup est montré. */
function startFree(){ const v=cur.view; cur.free={start:game.fen(), hist:[], i:0, ev:{}}; locked=false; selected=null; legal=[];
  paintCoach(`<div class="lead">Exploration libre</div><p class="why">Joue les coups que tu veux, pour les deux camps. Le moteur évalue chaque position et montre son meilleur coup.</p><div id="freeInfo" class="freeinfo"></div><div id="freeLine" class="solline"></div>`);
  paintActions(); freeEval(); }
function freeFen(){ const c=new Chess(cur.free.start); for(let k=0;k<cur.free.i;k++) c.move(cur.free.hist[k]); return c; }
function freeShow(){ const c=freeFen(); game=c; const h=cur.free.hist; lastMove=cur.free.i?(()=>{ const t=new Chess(cur.free.start); let m=null; for(let k=0;k<cur.free.i;k++) m=t.move(h[k]); return m; })():null; selected=null; legal=[]; render(); freePaint(); freeEval(); }
function freeMove(m){ const F=cur.F; const f=cur.free; f.hist=f.hist.slice(0,f.i); const mv=game.move(m); f.hist.push(mv.san); f.i=f.hist.length; lastMove=mv; render(); freePaint(); freeEval(); }
function freePaint(){ const f=cur.free; const el=$('#freeLine'); if(!el) return; const c=new Chess(f.start); const n0=parseInt(f.start.split(' ')[5]); let w=f.start.split(' ')[1]==='w', n=n0;
  el.innerHTML=f.hist.length?f.hist.map((san,k)=>{ const lab=(w?n+'.':(k===0?n+'…':''))+san; if(!w) n++; w=!w; return `<span class="sm done ${k===f.i-1?'cur':''}" data-k="${k+1}">${lab}</span>`; }).join(' '):'<span class="dim">Joue un coup sur l\'échiquier.</span>';
  el.querySelectorAll('.sm').forEach(x=>x.onclick=()=>{ f.i=+x.dataset.k; freeShow(); }); }
let freeTok=0;
async function freeEval(){ const f=cur.free; if(!f) return; const fen=game.fen(); const tok=++freeTok; const info=$('#freeInfo'); if(info) info.innerHTML='<span class="dim">Le moteur réfléchit…</span>';
  document.querySelectorAll('#board .sq.hint').forEach(e=>e.classList.remove('hint'));
  const g2=new Chess(fen); if(g2.game_over()){ if(info) info.innerHTML=g2.in_checkmate()?'<b>Échec et mat.</b>':'<b>Partie nulle.</b>'; return; }
  try{ await engineInit(); const e=await ENGINE.main.eval(fen,13,600,1); if(tok!==freeTok||!cur||!cur.free) return;
    const w=WP(e.cp,e.mate); const mine=cur.F.side==='w'?w:100-w; evbar(mine,''); const t=new Chess(fen); const bm=e.best?t.move({from:e.best.slice(0,2),to:e.best.slice(2,4),promotion:e.best[4]}):null;
    const sg=cur.F.side==='w'?1:-1; const sc=e.mate!=null?(e.mate*sg>0?`tu mates en ${Math.abs(e.mate)}`:`mat contre toi en ${Math.abs(e.mate)}`):(((e.cp*sg)>=0?'+':'')+((e.cp*sg)/100).toFixed(1)+' pour toi');
    const pv=[]; if(bm){ const t2=new Chess(fen); for(const u of (e.full||e.pv).slice(0,6)){ const mm=t2.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]}); if(!mm) break; pv.push(mm.san); } }
    if(info) info.innerHTML=`Tes chances : <b>${Math.round(mine)} %</b> <span class="dim">(${sc})</span>${bm?`<br>Meilleur coup ${t.turn()==='w'?'des Noirs':'des Blancs'} ici : <b>${bm.san}</b> <span class="dim">${pv.slice(1).join(' ')}</span>`:''}`;
    if(bm){ [bm.from,bm.to].forEach(s=>{ const el=sqEl(s); if(el) el.classList.add('hint'); }); }
  }catch(err){ if(info) info.innerHTML='<span class="dim">Moteur indisponible.</span>'; } }
function paintFreeActions(){ const a=$('#actions'); a.innerHTML=`<button id="fBack">↩ Annuler</button><button id="fFwd">↪</button><button id="fReset">⟲ Position de départ</button><button id="fQuit">Fin de l'exploration</button><button id="bNext" class="pri">Suivant ›</button>`;
  $('#fBack').onclick=()=>{ if(cur.free.i>0){ cur.free.i--; freeShow(); } };
  $('#fFwd').onclick=()=>{ if(cur.free.i<cur.free.hist.length){ cur.free.i++; freeShow(); } };
  $('#fReset').onclick=()=>{ cur.free.i=0; cur.free.hist=[]; game=new Chess(cur.F.fen); cur.free.start=cur.F.fen; lastMove=null; render(); freePaint(); freeEval(); };
  $('#fQuit').onclick=()=>{ cur.free=null; freeTok++; locked=true; document.querySelectorAll('#board .sq.hint').forEach(e=>e.classList.remove('hint')); _solved(false,`<div class="lead">${cur.F.best.san}</div>`); };
  $('#bNext').onclick=()=>{ cur.free=null; freeTok++; const n=cur.i+1; if(WOOD){ woodNext(); return; } if(queueNext()) return; if(cur.key&&cur.key.startsWith('R:')){ back(); return; } if(n<allFaults().length) startFault(n); else back(); }; }
