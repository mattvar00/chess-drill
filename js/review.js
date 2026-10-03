/* ---------- Revue de partie : classification, commentaires, graphique, moments clés ---------- */
const RV_V={p:1,n:3,b:3,r:5,q:9,k:0};
const RV_NAME={p:'pion',n:'cavalier',b:'fou',r:'tour',q:'dame',k:'roi'};
const RV_FEM={r:1,q:1};
const rvLe=t=>(RV_FEM[t]?'la ':'le ')+RV_NAME[t], rvUn=t=>(RV_FEM[t]?'une ':'un ')+RV_NAME[t];
const RV_CLASS={brilliant:['Brillant','!!'],great:['Très fort','!'],best:['Meilleur coup','★'],excellent:['Excellent','✓'],good:['Bon','✓'],book:['Théorie','📖'],inacc:['Imprécision','?!'],mistake:['Erreur','?'],miss:['Occasion manquée','✕'],blunder:['Gaffe','??'],forced:['Forcé','□']};
function rvMat(n){ n=Math.round(n); if(n<=0) return ''; return n===1?'un pion':n===2?'deux pions':n===3?'une pièce':n===4?'une pièce et un pion':n===5?'une tour':n>=9?'la dame ou plus':n+' points de matériel'; }

/* --- géométrie : cases attaquées (sans tenir compte des clouages) --- */
function rvBoard(fen){ const B={}; fen.split(' ')[0].split('/').forEach((row,ri)=>{ let f=0; for(const ch of row){ if(/\d/.test(ch)){ f+=+ch; continue; } B['abcdefgh'[f]+(8-ri)]={c:ch===ch.toUpperCase()?'w':'b',t:ch.toLowerCase()}; f++; } }); return B; }
const rvXY=s=>[s.charCodeAt(0)-97,+s[1]-1], rvSq=(x,y)=>(x<0||x>7||y<0||y>7)?null:'abcdefgh'[x]+(y+1);
function rvAttacks(B,sq){ const p=B[sq]; if(!p) return []; const [x,y]=rvXY(sq); const out=[];
  const ray=(dx,dy)=>{ let i=1; while(true){ const s=rvSq(x+dx*i,y+dy*i); if(!s) break; out.push(s); if(B[s]) break; i++; } };
  if(p.t==='p'){ const d=p.c==='w'?1:-1; [rvSq(x-1,y+d),rvSq(x+1,y+d)].forEach(s=>s&&out.push(s)); }
  else if(p.t==='n'){ [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]].forEach(([a,b])=>{ const s=rvSq(x+a,y+b); if(s) out.push(s); }); }
  else if(p.t==='k'){ for(let a=-1;a<=1;a++) for(let b=-1;b<=1;b++) if(a||b){ const s=rvSq(x+a,y+b); if(s) out.push(s); } }
  else { if(p.t!=='r') [[1,1],[1,-1],[-1,1],[-1,-1]].forEach(([a,b])=>ray(a,b)); if(p.t!=='b') [[1,0],[-1,0],[0,1],[0,-1]].forEach(([a,b])=>ray(a,b)); }
  return out; }
function rvAttackers(B,sq,c){ return Object.keys(B).filter(s=>B[s].c===c&&rvAttacks(B,s).includes(sq)); }
function rvBal(B,c){ let s=0; for(const k in B){ const p=B[k]; s+=(p.c===c?1:-1)*RV_V[p.t]; } return s; }
function rvHanging(B,sq){ const p=B[sq]; if(!p||p.t==='k') return false; const opp=p.c==='w'?'b':'w'; const at=rvAttackers(B,sq,opp); if(!at.length) return false; const def=rvAttackers(B,sq,p.c);
  if(!def.length) return true; return at.some(a=>RV_V[B[a].t]<RV_V[p.t]); }
/* clouage : une pièce à longue portée vise une pièce adverse derrière laquelle se trouve une pièce plus forte */
function rvPin(B,sq){ const p=B[sq]; if(!p||!'brq'.includes(p.t)) return null; const [x,y]=rvXY(sq); const dirs=[]; if(p.t!=='r') dirs.push([1,1],[1,-1],[-1,1],[-1,-1]); if(p.t!=='b') dirs.push([1,0],[-1,0],[0,1],[0,-1]);
  for(const [dx,dy] of dirs){ let i=1, first=null; while(true){ const s=rvSq(x+dx*i,y+dy*i); if(!s) break; if(B[s]){ if(!first){ if(B[s].c===p.c) break; first=s; } else { if(B[s].c!==p.c&&B[first].t!=='k'&&(B[s].t==='k'||(RV_V[B[s].t]>RV_V[B[first].t]&&RV_V[B[first].t]>=3))) return {pinned:first,behind:s}; break; } } i++; } }
  return null; }
const rvPassed=(B,sq)=>{ const p=B[sq]; if(!p||p.t!=='p') return false; const [x,y]=rvXY(sq); const d=p.c==='w'?1:-1; for(let yy=y+d;yy>=0&&yy<=7;yy+=d) for(let xx=x-1;xx<=x+1;xx++){ const s=rvSq(xx,yy); if(s&&B[s]&&B[s].t==='p'&&B[s].c!==p.c) return false; } return true; };

/* --- ce que fait un coup (description + intentions) --- */
function rvWhat(fenBefore,m,mine){ if(mine===undefined) mine=true;
  const B0=rvBoard(fenBefore); const c=new Chess(fenBefore); c.move(m); const B1=rvBoard(c.fen()); const me=m.color, opp=me==='w'?'b':'w'; const bits=[];
  let d;
  if(m.flags.includes('k')||m.flags.includes('q')) d=`Roque ${m.flags.includes('k')?'côté roi':'côté dame'} : le roi se met à l'abri et la tour entre en jeu`;
  else if(m.captured) d=`${RV_FEM[m.piece]?'La ':'Le '}${RV_NAME[m.piece]} prend ${rvLe(m.captured)} en ${m.to}`;
  else if(m.promotion) d=`Le pion va à dame en ${m.to}`;
  else d=`${(RV_FEM[m.piece]?'La ':'Le ')+RV_NAME[m.piece]} va en ${m.to}`;
  if(m.san.includes('#')) return {d, bits:['échec et mat'], hang:false, B0, B1, fenAfter:c.fen()}; else if(m.san.includes('+')) bits.push('avec échec');
  /* menaces créées par la pièce jouée */
  const tg=rvAttacks(B1,m.to).filter(s=>B1[s]&&B1[s].c===opp&&B1[s].t!=='k');
  const undef=s=>!rvAttackers(B1,s,opp).length;
  const big=tg.filter(s=>(RV_V[B1[s].t]>RV_V[m.piece]&&RV_V[B1[s].t]>=3)||(undef(s)&&(RV_V[B1[s].t]>=3||!'qk'.includes(m.piece))));
  const valuable=rvAttacks(B1,m.to).filter(s=>B1[s]&&B1[s].c===opp&&(B1[s].t==='k'||(RV_V[B1[s].t]>=3&&(RV_V[B1[s].t]>RV_V[m.piece]||undef(s)))))
    .sort((a,b)=>(B1[b].t==='k'?99:RV_V[B1[b].t])-(B1[a].t==='k'?99:RV_V[B1[a].t])).slice(0,2);
  if(valuable.length>=2&&m.piece!=='k'&&!m.san.includes('#')) bits.push(`fourchette sur ${valuable.map(s=>B1[s].t==='k'?'le roi':rvLe(B1[s].t)).join(' et ')}`);
  else if(big.length) bits.push(`attaque ${rvLe(B1[big[0]].t)} en ${big[0]}${!rvAttackers(B1,big[0],opp).length?', qui n\'est pas défendu'+(RV_FEM[B1[big[0]].t]?'e':''):''}`);
  const pin=rvPin(B1,m.to); if(pin) bits.push(`cloue ${rvLe(B1[pin.pinned].t)} en ${pin.pinned} devant ${B1[pin.behind].t==='k'?'le roi':rvLe(B1[pin.behind].t)}`);
  /* intentions générales */
  const ply=(parseInt(fenBefore.split(' ')[5])-1)*2+(me==='b'?1:0);
  if(ply<24&&'nb'.includes(m.piece)&&(m.from[1]==='1'||m.from[1]==='8')&&!m.captured) bits.push(`développe ${rvLe(m.piece)}`);
  if(m.piece==='p'&&['d4','e4','d5','e5'].includes(m.to)&&ply<24) bits.push('prend de l\'espace au centre');
  if(m.piece==='p'&&rvPassed(B1,m.to)&&!rvPassed(B0,m.from)) bits.push('crée un pion passé');
  if(m.piece==='r'){ const f=m.to[0]; const own=Object.keys(B1).some(s=>s[0]===f&&B1[s].t==='p'&&B1[s].c===me), any=Object.keys(B1).some(s=>s[0]===f&&B1[s].t==='p'); if(!any) bits.push('occupe la colonne ouverte'); else if(!own) bits.push('occupe une colonne semi-ouverte'); }
  if(m.piece==='p'&&m.captured==null){ const k=Object.keys(B0).find(s=>B0[s].t==='k'&&B0[s].c===me); const front=k&&(me==='w'?k[1]==='1':k[1]==='8')&&(('fgh'.includes(k[0])&&'fgh'.includes(m.from[0]))||('abc'.includes(k[0])&&'abc'.includes(m.from[0]))); if(front) bits.push(mine?'avance un pion devant ton roi':'avance un pion devant son roi'); }
  const hang=rvHanging(B1,m.to)&&!m.san.includes('#');
  return {d, bits, hang, B0, B1, fenAfter:c.fen()};
}
function rvPvSan(fen,pv,n){ const c=new Chess(fen); const out=[]; for(const u of (pv||[]).filter(Boolean).slice(0,n||4)){ const m=c.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]}); if(!m) break; out.push(m.san); } return out; }
function rvLineMat(fen,pv,c,n){ const t=new Chess(fen); const b0=rvBal(rvBoard(fen),c); for(const u of (pv||[]).filter(Boolean).slice(0,n||4)){ if(!t.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]})) break; } return rvBal(rvBoard(t.fen()),c)-b0; }

/* --- analyse complète d'une partie (classification + données par coup) --- */
function rvAnalyse(g){
  if(g._rv) return g._rv;
  const c=new Chess(); const F=[c.fen()], M=[]; for(const s of g.sans){ const m=c.move(s); if(!m) break; M.push(m); F.push(c.fen()); }
  const ev=g.ev||[]; const n=Math.min(M.length,ev.length-1); const book=g.a?g.a.depth||0:0; const mt=(typeof moveTimes==='function'?moveTimes(g):null)||[];
  const oppT=[]; { const {base,inc}=tcParse(g.tcs||'600'); const ck=i=>g.clocks&&g.clocks[i]?clkSec(g.clocks[i]):null; for(let i=0;i<n;i++){ const cu=ck(i), pr=i>=2?ck(i-2):base; oppT[i]=(cu!=null&&pr!=null)?Math.max(0,pr-cu+inc):null; } }
  const R=[]; const wpW=ev.map(e=>WP(e.c,e.m));
  for(let i=0;i<n;i++){ const m=M[i], me=m.color; const wb=me==='w'?wpW[i]:100-wpW[i], wa=me==='w'?wpW[i+1]:100-wpW[i+1]; const uci=m.from+m.to+(m.promotion||''); const isBest=uci===ev[i].b; let loss=isBest?0:Math.max(0,wb-wa);
    const legalN=new Chess(F[i]).moves().length;
    let k = legalN===1?'forced' : i<book?'book' : loss<0.5&&isBest?'best' : loss<2?'excellent' : loss<5?'good' : loss<10?'inacc' : loss<20?'mistake' : 'blunder';
    if(k==='blunder'&&wa>=60) k=wa>=70?'inacc':'mistake'; else if(k==='mistake'&&wa>=70) k='inacc';
    const prevOppBl=i>0&&R[i-1]&&R[i-1].loss>=20; if(prevOppBl&&loss>=10&&k!=='blunder') k='miss'; else if(prevOppBl&&loss>=20) k='blunder';
    if((k==='best'||k==='excellent')&&i>=book){ /* sacrifice juste ? */ const after=ev[i+1]; const ml=rvLineMat(F[i+1],after.p&&after.p.length?after.p:[after.b],me,2); if(ml<=-2&&wa>=45&&wb<92) k='brilliant'; else if(k==='best'&&wb<60&&wa>=60) k='great'; }
    R.push({i,m,me,wb,wa,loss,k,t:oppT[i]});
  }
  const acc=c2=>{ const L=R.filter(r=>r.me===c2&&r.k!=='book'&&r.k!=='forced'); if(!L.length) return null; const a=L.reduce((s,r)=>s+r.loss,0)/L.length; return Math.round(Math.max(0,Math.min(100,103.1668*Math.exp(-0.04354*a)-3.1669))); };
  const npcs=f=>f.split(' ')[0].replace(/[^nbrqNBRQ]/g,'').length;
  const phase=i=>i<20?'o':npcs(F[i])<=6?'e':'m';
  const phAcc={}; ['o','m','e'].forEach(p=>{ const L=R.filter(r=>r.me===g.color&&phase(r.i)===p&&r.k!=='book'); phAcc[p]=L.length?Math.round(Math.max(0,Math.min(100,103.1668*Math.exp(-0.04354*(L.reduce((s,r)=>s+r.loss,0)/L.length))-3.1669))):null; });
  const key=R.filter(r=>r.loss>=10||r.k==='brilliant').sort((a,b)=>(b.k==='brilliant'?30:b.loss)-(a.k==='brilliant'?30:a.loss)).slice(0,4).sort((a,b)=>a.i-b.i);
  const counts={}; R.filter(r=>r.me===g.color).forEach(r=>counts[r.k]=(counts[r.k]||0)+1);
  g._rv={F,M,R,wpW,acc:{w:acc('w'),b:acc('b')},phAcc,key,counts}; return g._rv;
}

/* --- commentaire en français pour un coup --- */
function rvComment(g,r){
  const A=g._rv, ev=g.ev, i=r.i, mine=r.me===g.color, who=mine?'Tu':'L\'adversaire', your=mine?'Tes':'Ses';
  const W=rvWhat(A.F[i],r.m,mine); const out=[];
  let s=W.d; if(W.bits.length) s+=', '+W.bits.slice(0,2).join(', '); out.push(s+'.');
  if(r.k==='book') { out.push('Coup de théorie.'); return out.join(' '); }
  if(r.k==='forced') { out.push('Le seul coup légal.'); return out.join(' '); }
  if(r.k==='brilliant') out.push('Un sacrifice juste : le matériel donné revient avec intérêt.');
  if(r.k==='great') out.push('Le seul coup qui garde l\'avantage.');
  if(r.loss>=10){
    out.push(`${your} chances passent de ${Math.round(r.wb)} % à ${Math.round(r.wa)} %.`);
    const after=ev[i+1]; const pv=after.p&&after.p.length?after.p:[after.b]; const rep=rvPvSan(A.F[i+1],pv,4);
    if(after.m!=null&&((r.me==='w'&&after.m<0)||(r.me==='b'&&after.m>0))) out.push(`Après ce coup, ${rep[0]} mène au mat en ${Math.abs(after.m)} (${rep.join(' ')}).`);
    else if(rep.length){ const t=new Chess(A.F[i+1]); const rm=t.move(rep[0]); const lost=-rvLineMat(A.F[i+1],pv,r.me,4);
      if(W.hang&&rm&&rm.to===r.m.to) out.push(`${RV_FEM[r.m.piece]?'La ':'Le '}${RV_NAME[r.m.piece]} que ${mine?'tu viens':'l\'adversaire vient'} de jouer n'est pas assez défendu${RV_FEM[r.m.piece]?'e':''} : ${rep[0]} ${RV_FEM[r.m.piece]?'la':'le'} prend${lost>=2?', '+(mine?'tu perds ':'il perd ')+rvMat(lost):''}.`);
      else if(rm&&rm.captured) out.push(`Réponse : ${rep[0]}, qui prend ${rvLe(rm.captured)} en ${rm.to}${lost>=2?' : '+(mine?'tu perds ':'il perd ')+rvMat(lost):''}.`);
      else if(rm&&rm.san.includes('+')) out.push(`Réponse : l'échec ${rep[0]}${lost>=2?', et '+(mine?'tu perds ':'il perd ')+rvMat(lost):''} (${rep.join(' ')}).`);
      else if(lost>=2) out.push(`Après ${rep.join(' ')}, ${mine?'tu perds':'il perd'} ${rvMat(lost)}.`);
      else { const Wr=rm?rvWhat(A.F[i+1],rm,!mine):null; out.push(`Réponse : ${rep[0]}${Wr&&Wr.bits.length?' ('+Wr.bits[0]+')':''}, et la position bascule.`); } }
    if(r.k==='miss') out.push(mine?'L\'adversaire venait de faire une erreur : il fallait la punir.':'Il n\'a pas puni ton erreur précédente.');
  }
  if(r.loss>=5&&ev[i].b){ const t=new Chess(A.F[i]); const bm=t.move({from:ev[i].b.slice(0,2),to:ev[i].b.slice(2,4),promotion:ev[i].b[4]});
    if(bm){ const Wb=rvWhat(A.F[i],bm,mine); const gain=rvLineMat(A.F[i],ev[i].p&&ev[i].p.length?ev[i].p:[ev[i].b],r.me,4); const pvs=rvPvSan(A.F[i],ev[i].p,4);
      const mate=ev[i].m!=null&&((r.me==='w'&&ev[i].m>0)||(r.me==='b'&&ev[i].m<0));
      let b=`Il fallait ${bm.san}`; const why=[]; if(bm.captured) why.push(`prend ${rvLe(bm.captured)} en ${bm.to}`); Wb.bits.filter(x=>!x.startsWith('développe')||!why.length).slice(0,2).forEach(x=>why.push(x));
      if(mate) why.push(`mat en ${Math.abs(ev[i].m)}`); else if(gain>=2) why.push(`gagne ${rvMat(gain)}`);
      if(why.length) b+=' : '+why.join(', '); if(pvs.length>1) b+=` (${pvs.join(' ')})`; out.push(b+'.'); } }
  else if(r.k==='best'&&!W.bits.length&&mine) out.push('C\'est le coup du moteur.');
  if(mine&&r.t!=null&&r.loss>=10&&r.t<4) out.push(`Joué en ${Math.round(r.t)} s.`);
  return out.join(' ');
}

/* --- écran de revue --- */
function renderReview(h,t){
  const g=P.games[t.id]; if(!g){ h.innerHTML='<div class="why">Partie introuvable.</div>'; return; }
  if(!g.ev){ h.innerHTML=`<div class="intro">Cette partie n'est pas encore analysée.</div><button id="rvAn" class="pri big">Analyser au moteur</button>`; $('#rvAn').onclick=async()=>{ $('#rvAn').textContent='Analyse…'; await analyseBatch([g.id]); renderReview(h,t); }; return; }
  const A=rvAnalyse(g); const me=g.color; if(t.i==null) t.i=A.key.length?A.key[0].i+1:0;
  $('#htitle').textContent=`${g.res==='W'?'Victoire':g.res==='D'?'Nulle':'Défaite'} contre ${g.opp}`;
  const cnt=k=>A.counts[k]||0;
  h.innerHTML=`<div class="rvhead"><div><b>${A.acc[me]??'–'}</b><span>ta précision</span></div><div><b>${A.acc[me==='w'?'b':'w']??'–'}</b><span>${g.opp} (${g.oppElo})</span></div><div class="rvon">${ecoName(g)||''}<br><span class="dim">${new Date(g.t*1000).toLocaleDateString('fr-FR')} · ${g.tc}</span></div></div>
  <div class="rvcnt">${['brilliant','great','best','excellent','good','inacc','mistake','miss','blunder'].map(k=>cnt(k)?`<span class="rvk ${k}" title="${RV_CLASS[k][0]}">${RV_CLASS[k][1]} ${cnt(k)} <small>${RV_CLASS[k][0].toLowerCase()}</small></span>`:'').join('')}</div>
  <div class="rvmain"><div class="rvleft"><div class="rvboardwrap"><div class="rvbar"><b id="rvBar"></b></div><div class="plb rvb"><div class="plgrid" id="rvG"></div><svg class="plarr" viewBox="0 0 800 800"><defs><marker id="rvah" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="context-stroke"/></marker></defs><g id="rvA"></g></svg></div></div>
    <div class="plctl"><button id="rvF">⏮</button><button id="rvP">‹</button><button id="rvN">›</button><button id="rvL">⏭</button></div>
    <svg id="rvGraph" class="rvgraph" viewBox="0 0 400 70" preserveAspectRatio="none"></svg></div>
   <div class="rvright"><div class="rvcoach" id="rvC"></div><div class="sysbar" id="rvAct"></div>
    ${A.key.length?`<div class="rvkeys"><div class="why">Moments clés</div>${A.key.map(r=>`<button data-k="${r.i+1}" class="rvkey ${r.k}">${Math.floor(r.i/2)+1}${r.i%2?'…':'.'}${r.m.san} <span>${RV_CLASS[r.k][1]}</span></button>`).join('')}</div>`:''}
    <div class="rvph">${[['o','Ouverture'],['m','Milieu'],['e','Finale']].map(([k,l])=>A.phAcc[k]!=null?`<div><span>${l}</span><b>${A.phAcc[k]}</b></div>`:'').join('')}</div>
    <div class="moves rvmoves" id="rvM"></div>
    ${g.a&&g.a.status==='dev'&&!P.fixed[g.id]?`<div class="sysbar"><button id="rvDev" class="sec">Corriger la déviation d'ouverture (${g.a.played})</button></div>`:''}
    <div class="sysbar"><button id="rvSpar" class="sec">Rejouer d'ici contre Maia</button>${g.url&&g.url.startsWith('http')?`<a class="lnk" href="${g.url}" target="_blank" rel="noopener">voir sur chess.com</a>`:''}</div></div></div>`;
  /* graphique */
  const n=A.R.length; const pts=A.wpW.slice(0,n+1).map((w,j)=>{ const v=me==='w'?w:100-w; return [j/(Math.max(1,n))*400, 70-v*0.7]; });
  const gr=$('#rvGraph'); gr.innerHTML=`<rect x="0" y="0" width="400" height="35" class="rvup"/><path d="M0,70 ${pts.map(p=>'L'+p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ')} L400,70 Z" class="rvarea"/><line x1="0" y1="35" x2="400" y2="35" class="rvmid"/>`+
    A.R.filter(r=>['mistake','blunder','miss','brilliant'].includes(r.k)).map(r=>`<circle cx="${((r.i+1)/n*400).toFixed(1)}" cy="${(70-(me==='w'?A.wpW[r.i+1]:100-A.wpW[r.i+1])*0.7).toFixed(1)}" r="3.2" class="rvdot ${r.k} ${r.me===me?'me':'op'}"/>`).join('')+`<line id="rvCur" x1="0" y1="0" x2="0" y2="70" class="rvcur"/>`;
  gr.onclick=ev=>{ const rc=gr.getBoundingClientRect(); t.i=Math.max(0,Math.min(n,Math.round((ev.clientX-rc.left)/rc.width*n))); draw(); };
  /* liste des coups */
  $('#rvM').innerHTML=A.R.map(r=>`${r.i%2===0?`<span class="n">${r.i/2+1}.</span>`:''}<span class="m rvm ${r.k}" data-i="${r.i+1}">${r.m.san}${['brilliant','great','inacc','mistake','miss','blunder'].includes(r.k)?`<sup>${RV_CLASS[r.k][1]}</sup>`:''}</span> `).join('');
  h.querySelectorAll('.rvm').forEach(el=>el.onclick=()=>{ t.i=+el.dataset.i; draw(); });
  h.querySelectorAll('.rvkey').forEach(el=>el.onclick=()=>{ t.i=+el.dataset.k; draw(); });
  const go2=d=>{ t.i=Math.max(0,Math.min(n,t.i+d)); draw(); };
  $('#rvF').onclick=()=>{ t.i=0; draw(); }; $('#rvP').onclick=()=>go2(-1); $('#rvN').onclick=()=>go2(1); $('#rvL').onclick=()=>{ t.i=n; draw(); };
  const kb=e=>{ if(!document.getElementById('rvG')){ document.removeEventListener('keydown',kb); return; } if(e.key==='ArrowRight') go2(1); if(e.key==='ArrowLeft') go2(-1); }; document.addEventListener('keydown',kb);
  const dv=$('#rvDev'); if(dv) dv.onclick=()=>openGame(g.id);
  $('#rvSpar').onclick=()=>startSpar(A.F[t.i],me,`${g.opp} · coup ${Math.floor(t.i/2)+1}`);
  function draw(){
    const fen=A.F[t.i]; const B=rvBoard(fen); const flip=me==='b'; const r=t.i>0?A.R[t.i-1]:null; const nx=A.R[t.i];
    let html=''; for(let y=0;y<8;y++) for(let x=0;x<8;x++){ const f=flip?7-x:x, rk=flip?y+1:8-y, sq='abcdefgh'[f]+rk, light=(f+rk)%2===1; const cls=['sq',light?'l':'d'];
      if(r&&(r.m.from===sq||r.m.to===sq)) cls.push('last'); if(r&&r.m.to===sq&&['mistake','blunder','miss','inacc','brilliant','great'].includes(r.k)) cls.push('rvmark',r.k);
      const pc=B[sq]; html+=`<div class="${cls.join(' ')}">${pc?`<img src="${PIECE({color:pc.c,type:pc.t})}" alt="">`:''}${r&&r.m.to===sq&&RV_CLASS[r.k]&&!['good','excellent','book'].includes(r.k)?`<span class="rvbadge ${r.k}">${RV_CLASS[r.k][1]}</span>`:''}${x===0?`<span class="plco">${rk}</span>`:''}${y===7?`<span class="plcf">${'abcdefgh'[f]}</span>`:''}</div>`; }
    $('#rvG').innerHTML=html;
    const xy=s=>{ const f=s.charCodeAt(0)-97, rr=+s[1]; return flip?[(7-f+.5)*100,(rr-.5)*100]:[(f+.5)*100,(8-rr+.5)*100]; };
    const arrow=(u,col)=>{ if(!u) return ''; const [x1,y1]=xy(u.slice(0,2)),[x2,y2]=xy(u.slice(2,4)); const dx=x2-x1,dy=y2-y1,L=Math.hypot(dx,dy)||1; return `<line x1="${x1}" y1="${y1}" x2="${x2-dx/L*28}" y2="${y2-dy/L*28}" stroke="${col}" stroke-width="15" stroke-linecap="round" opacity=".85" marker-end="url(#rvah)"/>`; };
    /* flèche verte : le meilleur coup qu'il y avait avant le coup affiché (si différent) */
    $('#rvA').innerHTML=(r&&r.loss>=5&&g.ev[r.i].b?arrow(g.ev[r.i].b,'#5fb878'):'');
    const w=A.wpW[t.i]; $('#rvBar').style.height=(flip?w:100-w)+'%'; $('#rvBar').parentElement.classList.toggle('flip',flip);
    $('#rvCur').setAttribute('x1',(t.i/Math.max(1,n)*400).toFixed(1)); $('#rvCur').setAttribute('x2',(t.i/Math.max(1,n)*400).toFixed(1));
    h.querySelectorAll('.rvm').forEach(el=>el.classList.toggle('cur',+el.dataset.i===t.i));
    const cm=h.querySelector('.rvm.cur'); if(cm) cm.scrollIntoView({block:'nearest'});
    const e=g.ev[t.i]; const evTxt=e?(e.m!=null?'M'+Math.abs(e.m):((e.c>=0?'+':'')+(e.c/100).toFixed(1))):'';
    if(!r){ $('#rvC').innerHTML=`<div class="lead">Position de départ</div><p class="why">Avance avec › ou touche un moment clé. Les flèches vertes montrent le coup qu'il fallait jouer.</p>`; $('#rvAct').innerHTML=''; return; }
    const lab=RV_CLASS[r.k];
    $('#rvC').innerHTML=`<div class="rvlab ${r.k}"><span>${lab[1]}</span>${Math.floor(r.i/2)+1}${r.i%2?'…':'.'} ${r.m.san} · ${lab[0]}<i>${evTxt}</i></div><p>${rvComment(g,r)}</p>${nx&&r.me!==g.color&&false?'':''}`;
    const mine=r.me===g.color;
    $('#rvAct').innerHTML=mine&&r.loss>=10&&g.ev[r.i].b?`<button id="rvRetry" class="pri">Retrouver le bon coup</button>`:'';
    const rb=$('#rvRetry'); if(rb) rb.onclick=()=>rvRetry(g,r);
  }
  draw();
}
/* « Retrouver le bon coup » : la position devient un exercice (même écran que les fautes) */
let RETRY=[];
function rvRetry(g,r){
  const A=g._rv, i=r.i, ev=g.ev; const bef={cp:ev[i].c,mate:ev[i].m,best:ev[i].b,pv:ev[i].p&&ev[i].p.length?ev[i].p:[ev[i].b]}, aft={cp:ev[i+1].c,mate:ev[i+1].m,best:ev[i+1].b,pv:ev[i+1].p&&ev[i+1].p.length?ev[i+1].p:[ev[i+1].b].filter(Boolean)};
  try{ const F=buildFault(g,i,A.F[i],r.m,bef,aft,r.wb,r.wa,A.M); RETRY=[{key:'R:'+F.id,F,src:'retry'}]; FMODE='retry'; startFault(0); }catch(e){ console.warn(e); }
}
