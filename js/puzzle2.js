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
function solved(viaSolution){
  const F=cur.F; cur.solved=true; locked=true; if(typeof woodHold==='function') woodHold();
  cur.view={L:lines(F),which:'best',k:1};
  const head=viaSolution?`<div class="lead">Solution : ${F.best.san}</div>`:`<div class="lead ok">Bien joué : ${F.best.san}</div>`;
  paintCoach(head+why(F)+`<div class="solnav" id="solnav"></div>`); paintSolNav(); showLine();
  if(!viaSolution&&window.SFX) SFX.good();
  paintActions();
}
window.startFault=function(i){ _startFault(i); if(cur&&cur.kind==='fault'){ const F=cur.F; evbar(F.played.wp_before,F.best.score); } };
window.faultMove=function(m){
  const F=cur.F; const uci=m.from+m.to+(m.promotion||''); cur.tries++;
  if(uci===F.best.uci){ game.move(m); lastMove=m; flash(m.to,'good'); render(); paintMoves();
    P.fault[cur.key]={done:true,tries:cur.tries}; save(); if(WOOD&&cur.tries===1) WOOD.solved++;
    solved(false); return; }
  render(); flash(m.to,'bad');
  if(uci===F.played.uci) paintCoach(`<div class="lead bad">${F.played.san} : c'est le coup de ta partie</div><p>Il faisait passer tes chances de ${Math.round(F.played.wp_before)} % à ${Math.round(F.played.wp_after)} %.${F.played.refut?' L\'adversaire répond '+F.played.refut+'.':''}</p><p class="why">Cherche mieux.</p>`);
  else if(F.second&&uci===F.second.uci) paintCoach(`<div class="lead bad">${F.second.san} : pas le meilleur</div><p class="why">Il existe plus fort. Réessaie.</p>`);
  else paintCoach(`<div class="lead bad">${m.san} : non</div><p class="why">${hintFor(F.theme)}</p>`);
  paintActions();
};
window.showSolution=function(){ const F=cur.F; if(cur.solved) return; P.fault[cur.key]=P.fault[cur.key]||{done:false,shown:true}; save(); solved(true); };
/* boutons : on n'enchaîne plus tout seul, « Suivant » reste explicite */
const _paintActions=window.paintActions;
window.paintActions=function(){ if(!cur||cur.kind!=='fault'){ _paintActions(); return; }
  const a=$('#actions'); a.innerHTML=`<button id="bHint" ${cur.solved?'disabled':''}>Indice</button><button id="bSol" ${cur.solved?'disabled':''}>Solution</button><button id="bNext" class="pri">Suivant ›</button>`;
  $('#bHint').onclick=hint; $('#bSol').onclick=showSolution;
  $('#bNext').onclick=()=>{ const n=cur.i+1; if(WOOD){ woodNext(); return; } if(n<allFaults().length) startFault(n); else back(); };
};
/* la barre ne sert qu'aux exercices */
const _startBranch=window.startBranch; window.startBranch=function(){ evbar(null); return _startBranch.apply(this,arguments); };
if(window.startSpar){ const _ss=window.startSpar; window.startSpar=function(){ evbar(null); return _ss.apply(this,arguments); }; }
})();
