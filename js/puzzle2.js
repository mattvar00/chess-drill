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
  const wp=v.which==='best'?F.played.wp_before:F.played.wp_after; evbar(v.k===0?F.played.wp_before:wp, v.which==='best'||v.k===0?F.best.score:F.played.score);
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
function paintSolNav(){ const v=cur.view; if(!v) return; const L=v.L[v.which]; const el=$('#solnav'); if(!el) return;
  el.innerHTML=`<button id="snP" aria-label="Coup précédent">‹</button><button id="snN" aria-label="Coup suivant">›</button>
    <button id="snB" class="${v.which==='best'?'on':''}">Solution</button><button id="snG" class="${v.which==='played'?'on':''}">Coup de ta partie</button>
    <span class="pos">${L.slice(0,v.k).map(m=>m.san).join(' ')||'position de départ'}</span>`;
  $('#snP').onclick=()=>{ v.k=Math.max(0,v.k-1); showLine(); }; $('#snN').onclick=()=>{ v.k=Math.min(L.length,v.k+1); showLine(); };
  $('#snB').onclick=()=>{ v.which='best'; v.k=1; showLine(); }; $('#snG').onclick=()=>{ v.which='played'; v.k=Math.min(2,v.L.played.length); showLine(); };
}
function solved(viaSolution,altHead){
  const F=cur.F; cur.solved=true; locked=true; if(typeof woodHold==='function') woodHold();
  cur.view={L:lines(F),which:'best',k:1};
  const head=altHead||(viaSolution?`<div class="lead">Solution : ${F.best.san}</div>`:`<div class="lead ok">Bien joué : ${F.best.san}</div>`);
  paintCoach(head+why(F)+`<div class="solnav" id="solnav"></div>`); paintSolNav(); showLine();
  if(!viaSolution&&window.SFX) SFX.good();
  paintActions();
}
window.startFault=function(i){ _startFault(i); if(cur&&cur.kind==='fault'){ const F=cur.F; evbar(F.played.wp_before,F.best.score); puzzleDifficulty(cur.key,F).then(p=>{ if(p==null||!cur||cur.F!==F||cur.solved) return; $('#coach').insertAdjacentHTML('beforeend',`<p class="why diff">${diffLabel(p)}</p>`); }); } };
async function equivalent_unused(F,m){ try{ await engineInit(); const c=new Chess(F.fen); c.move(m); const e=await ENGINE.main.eval(c.fen(),12,500,1); const w=WP(e.cp,e.mate); const mine=F.side==='w'?w:100-w; return mine>=(F.played.wp_before||50)-4?mine:null; }catch(e){ return null; } }
window.diffLabel=p=>{ const pc=Math.round(100*p); const lvl=p>=0.3?'facile':p>=0.1?'moyenne':'difficile'; return `Difficulté pour ton niveau : <b>${lvl}</b> (environ ${pc} % des joueurs de ton niveau trouvent ce coup).`; };
window.puzzleDifficulty=async function(key,F){ const s=P.fault[key]; if(s&&s.pm!=null) return s.pm; if(typeof MAIA==='undefined'||!MAIA.ready) return null;
  try{ const elo=+(P.settings.myElo||1800); const [r]=await maiaEval([F.fen],elo,elo); const p=r.policy[F.best.uci]||0; P.fault[key]=Object.assign(P.fault[key]||{}, {pm:p}); save(); return p; }catch(e){ return null; } };
window.faultMove=function(m){
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
  const a=$('#actions'); a.innerHTML=`<button id="bHint" ${cur.solved?'disabled':''}>Indice</button><button id="bSol" ${cur.solved?'disabled':''}>Solution</button><button id="bNext" class="pri">Suivant ›</button>`;
  $('#bHint').onclick=hint; $('#bSol').onclick=showSolution;
  $('#bNext').onclick=()=>{ const n=cur.i+1; if(WOOD){ woodNext(); return; } if(queueNext()) return; if(cur.key&&cur.key.startsWith('R:')){ back(); return; } if(n<allFaults().length) startFault(n); else back(); };
};
/* la barre ne sert qu'aux exercices */
const _startBranch=window.startBranch; window.startBranch=function(){ evbar(null); return _startBranch.apply(this,arguments); };
if(window.startSpar){ const _ss=window.startSpar; window.startSpar=function(){ evbar(null); return _ss.apply(this,arguments); }; }
})();
