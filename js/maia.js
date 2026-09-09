/* ---------- Maia 3 : modèle humain (policy = ce qu'un joueur d'Elo X joue ici) ---------- */
const MAIA_DEFAULT_URL='https://raw.githubusercontent.com/CSSLab/maia-platform-frontend/main/public/maia3/maia3_simplified.onnx';
const MAIA={w:null, ready:false, init:null, pending:{}, id:0, status:'', progress:0, onStatus:null};
const MAIA_INDEX=(()=>{ const m={}; MAIA_MOVES.forEach((u,i)=>m[u]=i); return m; })();

async function maiaUrl(){
  if(P.settings.maiaUrl) return P.settings.maiaUrl;
  try{ const r=await fetch('js/maia/maia3_simplified.onnx',{method:'HEAD'}); if(r.ok&&(+r.headers.get('Content-Length')||0)>1e6) return new URL('js/maia/maia3_simplified.onnx',location.href).href; }catch(e){}
  return MAIA_DEFAULT_URL;
}
function maiaInit(){
  if(MAIA.init) return MAIA.init;
  MAIA.init=new Promise(async(res,rej)=>{
    try{ MAIA.w=new Worker('js/maia/maia-worker.js'); }catch(e){ MAIA.init=null; return rej(e); }
    MAIA.w.onerror=e=>{ MAIA.init=null; rej(new Error('Maia : '+(e.message||'erreur worker'))); };
    MAIA.w.onmessage=e=>{ const m=e.data;
      if(m.type==='status'){ MAIA.status=m.status; if(MAIA.onStatus) MAIA.onStatus(m.status,MAIA.progress); if(m.status==='ready'){ MAIA.ready=true; res(); } }
      else if(m.type==='progress'){ MAIA.progress=m.progress; if(MAIA.onStatus) MAIA.onStatus('downloading',m.progress); }
      else if(m.type==='result'){ const p=MAIA.pending[m.id]; if(p){ delete MAIA.pending[m.id]; p.res({lm:new Float32Array(m.lm),lv:new Float32Array(m.lv)}); } }
      else if(m.type==='error'){ if(m.id!==undefined&&MAIA.pending[m.id]){ MAIA.pending[m.id].rej(new Error(m.message)); delete MAIA.pending[m.id]; } else { MAIA.init=null; rej(new Error(m.message)); } } };
    MAIA.w.postMessage({type:'init',url:await maiaUrl()});
  });
  return MAIA.init;
}

/* --- encodage --- */
const mirrorSq=s=>s[0]+(9-+s[1]);
const mirrorUci=u=>mirrorSq(u.slice(0,2))+mirrorSq(u.slice(2,4))+u.slice(4);
function mirrorFen(fen){ const [pos,ac,cs,ep,hm,fm]=fen.split(' ');
  const rows=pos.split('/').reverse().map(r=>r.replace(/[A-Za-z]/g,c=>c===c.toUpperCase()?c.toLowerCase():c.toUpperCase()));
  let c=''; if(cs!=='-'){ if(cs.includes('k')) c+='K'; if(cs.includes('q')) c+='Q'; if(cs.includes('K')) c+='k'; if(cs.includes('Q')) c+='q'; }
  return `${rows.join('/')} ${ac==='w'?'b':'w'} ${c||'-'} ${ep!=='-'?mirrorSq(ep):'-'} ${hm} ${fm}`; }
const PT='PNBRQKpnbrqk';
function tokens(fen){ const t=new Float32Array(64*12); const rows=fen.split(' ')[0].split('/');
  for(let rank=0;rank<8;rank++){ const row=7-rank; let file=0; for(const ch of rows[rank]){ const n=parseInt(ch); if(isNaN(n)){ const i=PT.indexOf(ch); if(i>=0) t[(row*8+file)*12+i]=1; file++; } else file+=n; } } return t; }

/* évaluation d'un lot de positions : renvoie [{policy:{uci:p}, win}] — win = proba de gain du trait */
async function maiaEval(fens, eloSelf, eloOppo){
  await maiaInit();
  const n=fens.length; const tok=new Float32Array(n*768); const black=[]; const legal=[];
  fens.forEach((fen,i)=>{ let f=fen; const b=fen.split(' ')[1]==='b'; black.push(b); if(b) f=mirrorFen(fen);
    tok.set(tokens(f),i*768); const c=new Chess(f); legal.push(c.moves({verbose:true}).map(m=>m.from+m.to+(m.promotion||''))); });
  const id=MAIA.id++;
  const out=await new Promise((res,rej)=>{ MAIA.pending[id]={res,rej}; MAIA.w.postMessage({type:'inference',id,tokens:tok.buffer,eloSelf:new Float32Array(n).fill(eloSelf).buffer,eloOppo:new Float32Array(n).fill(eloOppo).buffer,batch:n}); });
  return fens.map((fen,i)=>{
    const lm=out.lm.subarray(i*4352,(i+1)*4352), lv=out.lv.subarray(i*3,(i+1)*3);
    const mx=Math.max(lv[0],lv[1],lv[2]); const e=[0,1,2].map(k=>Math.exp(lv[k]-mx)); const s=e[0]+e[1]+e[2]; const win=(e[2]+0.5*e[1])/s;
    const idx=legal[i].map(u=>MAIA_INDEX[u]).filter(x=>x!==undefined); const lg=idx.map(k=>lm[k]); const m2=Math.max(...lg); const ex=lg.map(x=>Math.exp(x-m2)); const tot=ex.reduce((a,b)=>a+b,0);
    const policy={}; legal[i].forEach((u,k)=>{ if(MAIA_INDEX[u]!==undefined) policy[black[i]?mirrorUci(u):u]=ex[k]/tot; });
    return {policy, win};
  });
}

/* ---------- A. Menaces : ce que les adversaires jouent contre ton répertoire ---------- */
async function maiaThreats(onProgress){
  if(!BOOK) buildBook();
  const oppElo=+(P.settings.oppElo||1800), myElo=+(P.settings.myElo||1800);
  const jobs=[]; // positions où l'adversaire a le trait, par camp
  for(const side of ['w','b']){ for(const k in BOOK[side]){ const e=BOOK[side][k]; if(e.opp.size&&e.ply<=16) jobs.push({side,k,e}); } }
  const res=[]; const B=32;
  for(let i=0;i<jobs.length;i+=B){
    const chunk=jobs.slice(i,i+B); const fens=chunk.map(j=>j.k+' 0 1');
    const ev=await maiaEval(fens,oppElo,myElo);
    chunk.forEach((j,x)=>{ const pol=ev[x].policy; let covered=0; for(const u of j.e.opp) covered+=pol[u]||0;
      const miss=Object.entries(pol).filter(([u])=>!j.e.opp.has(u)).sort((a,b)=>b[1]-a[1]).slice(0,3);
      const pol2={}; for(const u of j.e.opp) pol2[u]=pol[u]||0;
      res.push({side:j.side,fen:fens[x],ply:j.e.ply,covered,miss,pol:pol2,branches:[...j.e.branches]}); });
    if(onProgress) onProgress(Math.min(jobs.length,i+B),jobs.length);
  }
  // probabilité d'atteindre chaque branche (produit des probas Maia des coups adverses de la ligne, jusqu'au demi-coup 16)
  const posByKey={}; res.forEach(r=>posByKey[r.side+'|'+r.fen.split(' ').slice(0,4).join(' ')]=r);
  DATA.blocs.forEach(bl=>bl.systemes.forEach(sy=>sy.branches.forEach(br=>{ const g=new Chess(); let p=1;
    br.moves.forEach((mv,i)=>{ const opp=(i%2===0)!==(bl.side==='w'); const r=posByKey[bl.side+'|'+fenKey(g.fen())]; if(r) r.reach=Math.max(r.reach||0,p);
      if(opp&&i<=16&&r&&r.pol) p*=(r.pol[mv.uci]||0.001);
      g.move({from:mv.uci.slice(0,2),to:mv.uci.slice(2,4),promotion:mv.uci[4]}); });
    const st=brState(br.id); st.prob=+p.toFixed(4); P.br[br.id]=st; })));
  const threats=res.filter(r=>r.miss.length&&r.miss[0][1]>=0.08).map(r=>{ const c=new Chess(r.fen); const miss=r.miss.map(([u,p])=>{ const m=c.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]}); const san=m?m.san:u; c.undo(); return {uci:u,san,p}; }); const o=Object.assign({},r,{miss}); delete o.pol; return o; })
    .sort((a,b)=>b.miss[0].p*(b.reach||0)-a.miss[0].p*(a.reach||0));
  P.maia={ts:Date.now(),oppElo,threats:threats.slice(0,40),nPos:res.length,avgCovered:Math.round(100*res.reduce((a,r)=>a+r.covered,0)/res.length)};
  save(); return P.maia;
}
function renderThreats(h){
  const M=P.maia;
  const head=`<div class="intro"><b>Ton répertoire prévoit des coups « théoriques ». Tes adversaires jouent des coups humains.</b> Maia est un modèle entraîné sur des millions de parties humaines : pour chaque position de ton répertoire, il donne ce qu'un joueur de ${+(P.settings.oppElo||1800)} Elo joue vraiment. Ci-dessous, les réponses fréquentes que <b>aucune de tes lignes ne couvre</b>, classées par probabilité × fréquence de la position. Touche une carte : la ligne s'ouvre à cet endroit, à toi de décider quoi jouer contre.</div>
  <details class="help"><summary>Quoi en faire</summary>Un « Bh5 87 % » veut dire : dans cette position, 87 % des joueurs de ce niveau jouent Bh5, et ta ligne prévoit autre chose. Prépare une réponse (souvent évidente), puis ajoute-la comme branche dans <code>js/data.js</code>. Ce classement pondère aussi le drill : les lignes que tu rencontreras vraiment passent en premier.</details>
  <div class="sysbar"><button id="bThreat" ${MAIA.busy?'disabled':''}>${M?'Recalculer':'Calculer avec Maia'} · ${M?'dernier : '+new Date(M.ts).toLocaleDateString('fr-FR'):'~1 min, modèle 45 Mo la première fois'}</button></div><div id="mProg" class="prog2 hidden"><b></b><span></span></div>`;
  let body='';
  if(M){ body+=`<div class="stats"><div class="stat"><div class="n">${M.avgCovered}%</div><div class="l">des réponses adverses probables couvertes</div></div><div class="stat"><div class="n">${M.nPos}</div><div class="l">positions évaluées</div></div><div class="stat"><div class="n">${M.threats.length}</div><div class="l">trous ≥ 8 %</div></div></div>`;
    body+=M.threats.map((t,i)=>{ const br=t.branches.slice(0,2).map(id=>BR[id]?BR[id].br.titre:id).join(' · ');
      return `<div class="card" data-i="${i}"><div class="sw k ${t.side==='w'?'b':'w'}"></div><div class="body"><div class="t">${t.miss.map(m=>`<b>${m.san}</b> ${Math.round(100*m.p)}%`).join(' · ')}</div><div class="s">coup ${Math.floor(t.ply/2)+1} · position atteinte dans ${(100*(t.reach||0)).toFixed(t.reach>=0.1?0:1)}% de tes parties ${t.side==='w'?'blanches':'noires'} · couvert à ${Math.round(100*t.covered)}%<br><span class="dim">${br}</span></div></div><div class="go">›</div></div>`; }).join(''); }
  h.innerHTML=head+body;
  $('#bThreat').onclick=async()=>{ const p=$('#mProg'); p.classList.remove('hidden'); $('#bThreat').disabled=true; MAIA.busy=true;
    MAIA.onStatus=(s,pr)=>{ p.querySelector('span').textContent=s==='downloading'?`téléchargement du modèle ${pr}%`:s==='loading'?'chargement…':''; p.querySelector('b').style.width=(s==='downloading'?pr:0)+'%'; };
    try{ await maiaThreats((i,n)=>{ p.querySelector('b').style.width=Math.round(100*i/n)+'%'; p.querySelector('span').textContent=`${i}/${n} positions`; }); MAIA.busy=false; renderThreats(h); }
    catch(e){ MAIA.busy=false; p.querySelector('span').textContent='Maia indisponible : '+e.message; $('#bThreat').disabled=false; } };
  h.querySelectorAll('.card[data-i]').forEach(el=>el.onclick=()=>{ const t=M.threats[+el.dataset.i]; startBranch(t.branches[0],'explore',null,{explPly:t.ply}); });
}

/* ---------- B. Sparring : continuer la position contre Maia ---------- */
async function startSpar(fen, side, label){
  const elo=+(P.settings.maiaElo||1800), my=+(P.settings.myElo||1800);
  showBoard();
  cur={kind:'spar',id:'spar',br:{id:'spar',titre:'Sparring',moves:[],notes:{}},sys:{titre:label||'',resume:''},bloc:{titre:'Maia '+elo,side},mode:'drill',ply:0,steps:[],session:null,elo,my,log:[]};
  orient=side; game=new Chess(fen); selected=null;legal=[];lastMove=null;locked=false; boardEl.classList.remove('blind');
  buildBoard(); render(); $('#explnav').classList.add('hidden'); $('#modes').innerHTML=''; $('#stepper').innerHTML='';
  $('#ptitle').innerHTML=`Sparring contre Maia ${elo}<small>${label||''}</small>`; $('#ptag').textContent='humain'; $('#ptag').className='tag b'; $('#branchtag').textContent='';
  $('#topname span').textContent=`Maia ${elo}`; $('#botname span').textContent=side==='w'?'Toi (Blancs)':'Toi (Noirs)';
  $('#topname i').style.background=side==='w'?'#222':'#eee'; $('#botname i').style.background=side==='w'?'#eee':'#222';
  $('#meta').innerHTML=`<span>Maia imite un joueur de <b>${elo}</b> : il fait les erreurs qu'un humain ferait ici. Chaque coup à toi est noté par Stockfish.</span>`;
  $('#actions').innerHTML=`<button id="bSparStop" class="pri">Terminer</button>`; $('#bSparStop').onclick=sparEnd;
  $('#coach').innerHTML=`<div class="lead you">À toi de jouer</div><p class="why">Chargement de Maia…</p>`;
  try{ await maiaInit(); }catch(e){ $('#coach').innerHTML=`<div class="lead bad">Maia indisponible</div><p class="why">${e.message}</p>`; return; }
  paintSparMoves();
  if(game.turn()!==orient){ locked=true; sparReply(); } else $('#coach').innerHTML=`<div class="lead you">À toi de jouer</div><p class="why">Position de fin de ligne. Joue le plan.</p>`;
}
function paintSparMoves(){ const hist=game.history({verbose:true}); const el=$('#moves'); let h='', n=1; const start=cur.startPly||0;
  hist.forEach((m,i)=>{ const w=m.color==='w'; if(w) h+=`<span class="n">${n}.</span>`; else if(i===0) h+=`<span class="n">${n}…</span>`; const k=cur.log[i]; h+=`<span class="m ${i===hist.length-1?'cur':''} ${k&&k!=='best'&&k!=='good'?'c-'+k:''}">${m.san}</span> `; if(!w) n++; });
  el.innerHTML=h||'<span class="n">position de départ</span>'; el.scrollTop=el.scrollHeight; }
async function sparMove(m){
  const fenBefore=game.fen(); game.move(m); lastMove=m; render(); paintSparMoves(); locked=true;
  // feedback moteur rapide
  let fb='';
  try{ await engineInit(); const b=await engineEval(fenBefore,10,200), a=await engineEval(game.fen(),10,200);
    const wb=WP(b.cp,b.mate), wa=WP(a.cp,a.mate); const me=m.color==='w'; const loss=Math.max(0,(me?wb:100-wb)-(me?wa:100-wa)); const uci=m.from+m.to+(m.promotion||''); const k=uci===b.best?'best':classify(loss); cur.log[game.history().length-1]=k;
    if(k!=='best'&&k!=='good'){ const t=new Chess(fenBefore); const bm=b.best?t.move({from:b.best.slice(0,2),to:b.best.slice(2,4),promotion:b.best[4]}):null; fb=`<p><span class="cls ${k}">${CLASS_LABEL[k]}</span> ${bm?`meilleur : <b>${bm.san}</b>`:''}</p>`; }
    else fb=`<p><span class="cls ${k}">${CLASS_LABEL[k]}</span></p>`; paintSparMoves(); }catch(e){}
  if(game.game_over()){ sparOver(fb); return; }
  $('#coach').innerHTML=`<div class="lead">${m.san}</div>${fb}<p class="why">Maia réfléchit…</p>`;
  setTimeout(sparReply,250);
}
async function sparReply(){
  if(!cur||cur.kind!=='spar') return;
  const [r]=await maiaEval([game.fen()],cur.elo,cur.my);
  const entries=Object.entries(r.policy).sort((a,b)=>b[1]-a[1]);
  // échantillonnage tempéré parmi les coups plausibles (>= 5 % de la masse du meilleur)
  const top=entries.filter(([u,p])=>p>=entries[0][1]*0.05).slice(0,6); const tot=top.reduce((a,[,p])=>a+p,0); let x=Math.random()*tot; let pick=top[0][0];
  for(const [u,p] of top){ x-=p; if(x<=0){ pick=u; break; } }
  const mv=game.move({from:pick.slice(0,2),to:pick.slice(2,4),promotion:pick[4]}); lastMove=mv; render(); paintSparMoves(); locked=false;
  const win=Math.round(100*(orient==='w'?1-r.win:r.win)); // r.win = proba de gain du trait (Maia) → la tienne
  $('#coach').innerHTML=`<div class="lead you">À toi de jouer</div><p class="why">Maia a joué <b>${mv.san}</b> (${Math.round(100*r.policy[pick])}% des ${cur.elo} jouent ça). Tes chances vues par un humain : ${win}%.</p>`;
  if(game.game_over()) sparOver('');
}
function sparOver(fb){ locked=true; const res=game.in_checkmate()?(game.turn()===orient?'Tu es mat.':'Mat ! Bien joué.'):'Nulle.'; $('#coach').innerHTML=`<div class="done"><div class="big">${res}</div>${fb}</div>`; $('#actions').innerHTML=`<button id="bSparStop" class="pri">Retour</button>`; $('#bSparStop').onclick=sparEnd; }
function sparEnd(){ const n=Object.keys(cur.log).length; const bad=Object.values(cur.log).filter(k=>k==='mistake'||k==='blunder').length; locked=true;
  $('#coach').innerHTML=`<div class="done"><div class="big">Sparring terminé</div><div class="sub">${n} coups joués · ${bad} erreur${bad>1?'s':''}/gaffe${bad>1?'s':''}</div></div>`; $('#actions').innerHTML=`<button id="bSparBack" class="pri">Retour</button>`; $('#bSparBack').onclick=back; }

/* ---------- C. "Un humain joue ça ?" — proba Maia d'un coup, à la demande ---------- */
async function maiaHumanNote(fenBefore, uci, elo){
  try{ const [r]=await maiaEval([fenBefore],elo,elo); const p=r.policy[uci]||0; const top=Object.entries(r.policy).sort((a,b)=>b[1]-a[1])[0];
    const c=new Chess(fenBefore); const tm=c.move({from:top[0].slice(0,2),to:top[0].slice(2,4),promotion:top[0][4]});
    return `Un ${elo} joue ça dans ${Math.round(100*p)}% des cas${p<0.15&&tm&&top[0]!==uci?` ; le coup humain, c'est <b>${tm.san}</b> (${Math.round(100*top[1])}%)`:''}.`; }catch(e){ return ''; }
}
