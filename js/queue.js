/* ---------- Files intelligentes : les 10 positions les plus utiles, répétition espacée ---------- */
const QN=10; let PQ=null;
function posState(k){ return P.fault[k]||{}; }
function posDue(k){ const s=posState(k); return !s.due||s.due<=Date.now(); }
/* résultat : 'good' (trouvé du premier coup), 'ok' (trouvé après erreur), 'fail' (solution affichée) */
function schedulePos(k,res,tries){
  const s=Object.assign({ivl:0,ease:2.3,reps:0,lapses:0},posState(k)); s.reps++; s.last=Date.now(); s.tries=tries||s.tries;
  if(res==='good'){ s.ivl=s.ivl?Math.round(s.ivl*s.ease):3; s.ease=Math.min(3,s.ease+0.1); s.done=true; }
  else if(res==='ok'){ s.ivl=1; s.ease=Math.max(1.3,s.ease-0.15); s.done=true; }
  else { s.ivl=1; s.lapses++; s.ease=Math.max(1.3,s.ease-0.2); s.done=s.done||false; s.shown=true; }
  s.ivl=Math.min(s.ivl,90); s.due=Date.now()+s.ivl*864e5; P.fault[k]=s; save(); return s;
}
function posAgeDays(x){ const g=x.F.game&&P.games[x.F.game]; const t=g?g.t*1000:(x.F.date?Date.parse(x.F.date.replace(/\./g,'-')):0); return t?(Date.now()-t)/864e5:365; }
function posPriority(x){ const s=posState(x.key); const drop=Math.max(0,(x.F.played.wp_before||0)-(x.F.played.wp_after||0));
  return (posDue(x.key)?100:0) + drop*0.6 + Math.max(0,30-posAgeDays(x)) + (s.reps?0:10) + (s.lapses||0)*8; }
function smartQueue(L,n){ return L.map((x,i)=>({x,i,p:posPriority(x)})).filter(o=>posDue(o.x.key)&&!(o.x.F.game&&P.ignored[o.x.F.game])).sort((a,b)=>b.p-a.p).slice(0,n||QN); }
function dueCount(L){ return L.filter(x=>posDue(x.key)).length; }
function posBadge(k){ const s=posState(k); if(!s.reps) return '<span class="badge learn">nouvelle</span>'; if(posDue(k)) return '<span class="badge bad2">à revoir</span>';
  const d=Math.max(1,Math.ceil((s.due-Date.now())/864e5)); return `<span class="badge ok">dans ${d} j</span>`; }
function posCard(x,i){ const F=x.F; const drop=Math.round((F.played.wp_before||0)-(F.played.wp_after||0)); const d=posAgeDays(x);
  return `<div class="card" data-i="${i}"><div class="sw k ${F.side}"></div><div class="body"><div class="t">${F.theme}</div><div class="s">${F.side==='w'?'Blancs':'Noirs'} · coup ${F.move_no} · vs ${F.opp} · ${d<1?'aujourd\'hui':d<2?'hier':d<60?'il y a '+Math.round(d)+' j':F.date||''} · −${drop} pts</div></div>${posBadge(x.key)}<div class="go">›</div></div>`; }

window.renderFaults=function(h){
  const L=allFaults(); const n=L.length; const Q=smartQueue(L,QN); const due=dueCount(L);
  const W=(P.wood||[]).filter(c=>(c.mode||'all')===FMODE); const last=W[W.length-1]; const WC=P.woodCur&&(P.woodCur.mode||'all')===FMODE?P.woodCur:null;
  const intro=FMODE==='forced'?`<div class="intro"><b>Coups forcés.</b> Les positions de tes parties où un échec ou une prise s'imposait et où tu as joué un coup calme. Le réflexe à prendre : <b>échecs, prises, menaces</b> avant chaque coup.</div>`
    :`<div class="intro"><b>Fautes.</b> Tes erreurs les plus coûteuses, tirées de tes parties analysées. Une position réussie du premier coup revient plus tard, de plus en plus espacée ; une position ratée revient dès demain.</div>`;
  h.innerHTML=intro+(n?`
    <h2 class="sec">À revoir maintenant · ${Q.length}${due>Q.length?` <span class="dim">(sur ${due})</span>`:''}</h2>
    ${Q.length?`<div class="sysbar"><button id="bQ" class="pri">Commencer · ${Q.length} position${Q.length>1?'s':''}</button></div>${Q.map(o=>posCard(o.x,o.i)).join('')}`:`<div class="why">Rien à revoir pour l'instant : tout est programmé plus tard. Joue, analyse, et de nouvelles positions arriveront.</div>`}
    <h2 class="sec">Woodpecker</h2>
    <div class="sysbar">${WC?`<button id="bWoodResume">Reprendre le cycle · ${WC.i}/${WC.ids.length} · ${fmtT(WC.elapsed)}</button><button id="bWood" class="sec">Nouveau cycle</button>`:`<button id="bWood">Cycle complet · ${n}</button>${n>QN?`<button id="bWood10" class="sec">Cycle des ${QN} prioritaires</button>`:''}`}</div>
    ${W.length?`<div class="why">Cycles : ${W.slice(-6).map(c=>`${fmtT(c.time)} (${Math.round(100*c.solved/c.n)}%)`).join(' → ')}. Même jeu, plus vite à chaque passage.</div>`:''}
    <details class="grp"><summary>Toutes les positions (${n})</summary>${L.map((x,i)=>({x,i})).sort((a,b)=>posPriority(b.x)-posPriority(a.x)).slice(0,200).map(o=>posCard(o.x,o.i)).join('')}</details>`
    :`<div class="why">Analyse des parties au moteur (Parties → Mettre à jour) pour en générer.</div>`);
  h.querySelectorAll('.card[data-i]').forEach(el=>el.onclick=()=>{ PQ=null; startFault(+el.dataset.i); });
  const bq=$('#bQ'); if(bq) bq.onclick=()=>{ PQ=Q.map(o=>o.x.key); WOOD=null; startFault(Q[0].i); };
  const bw=$('#bWood'); if(bw) bw.onclick=()=>{ PQ=null; woodStart(); };
  const w10=$('#bWood10'); if(w10) w10.onclick=()=>{ PQ=null; const ids=Q.map(o=>o.x.key); WOOD={start:Date.now(),elapsed:0,solved:0,n:ids.length,ids,i:0,mode:FMODE}; woodSave(); startFault(faultIndex(ids[0])); };
  const wr=$('#bWoodResume'); if(wr) wr.onclick=()=>{ PQ=null; woodResume(); };
};
/* « Suivant » dans une file : position suivante de la file, puis retour à la liste */
function queueNext(){ if(!PQ) return false; const k=cur&&cur.key; const j=PQ.indexOf(k); const nk=PQ[j+1]; if(nk){ startFault(faultIndex(nk)); } else { PQ=null; back(); } return true; }

/* premier affichage : l'écran courant a été dessiné avant le chargement de ce module */
if(typeof renderNav==='function'&&typeof navTop==='function'&&navTop()&&navTop().s!=='board') renderNav();
