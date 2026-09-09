/* ---------- Parties : fetch chess.com, détection des déviations vs répertoire ---------- */
const MAX_BOOK_PLY = 24;              // au-delà du coup 12, ce n'est plus l'ouverture

/* clé de position : FEN sans compteurs (transpositions gérées automatiquement) */
const fenKey = fen => fen.split(' ').slice(0,4).join(' ');

/* carte position -> { user:Set(uci), opp:Set(uci), branches:Set(id) } pour chaque camp */
let BOOK = null;
function buildBook(){
  BOOK = {w:{}, b:{}};
  DATA.blocs.forEach(bl=>bl.systemes.forEach(sy=>sy.branches.forEach(br=>{
    const side=bl.side, map=BOOK[side]; const g=new Chess();
    br.moves.forEach((mv,i)=>{
      const k=fenKey(g.fen()); const e=map[k]||(map[k]={user:new Set(),opp:new Set(),branches:new Set(),ply:i});
      const userToMove = (i%2===0)===(side==='w');
      (userToMove?e.user:e.opp).add(mv.uci); e.branches.add(br.id);
      g.move({from:mv.uci.slice(0,2),to:mv.uci.slice(2,4),promotion:mv.uci[4]});
    });
    const k=fenKey(g.fen()); const e=map[k]||(map[k]={user:new Set(),opp:new Set(),branches:new Set(),ply:br.moves.length}); e.branches.add(br.id); e.end=true;
  })));
}

/* PGN chess.com -> { sans:[], clocks:[] } (tags %clk gardés pour le module horloge) */
function parsePgnMoves(pgn){
  const body=pgn.replace(/^\[.*\]\s*$/gm,'').replace(/\{[^}]*\}/g, m=>{ const c=/%clk\s+([\d:.]+)/.exec(m); return c?` @${c[1]} `:' '; });
  const toks=body.replace(/\([^)]*\)/g,' ').split(/\s+/).filter(Boolean);
  const sans=[], clocks=[];
  for(const t of toks){
    if(/^\d+\.+$/.test(t)) continue;
    if(/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t)) break;
    if(t[0]==='@'){ clocks[sans.length-1]=t.slice(1); continue; }
    if(t[0]==='$') continue;
    sans.push(t.replace(/[!?]+$/,''));
  }
  return {sans, clocks};
}

/* analyse d'une partie contre le livre. Retourne un résumé compact. */
function analyseGame(sans, color){
  const map=BOOK[color]; const g=new Chess(); let depth=0, lastBranches=null;
  for(let i=0;i<sans.length && i<MAX_BOOK_PLY;i++){
    const k=fenKey(g.fen()); const e=map[k];
    if(!e){ return {status: depth?'out':'nobook', depth, branches:lastBranches}; }
    if(e.end && !e.user.size && !e.opp.size) return {status:'ok', depth, branches:[...e.branches]};
    const m=g.move(sans[i]); if(!m){ return {status:'err', depth}; }
    const uci=m.from+m.to+(m.promotion||''); const userMove=(i%2===0)===(color==='w');
    const set=userMove?e.user:e.opp;
    if(!set.size){ return {status:'ok', depth, branches:[...e.branches]}; }   // fin de ligne
    if(set.has(uci)){ depth=i+1; lastBranches=[...e.branches]; continue; }
    g.undo();
    const fen=g.fen();
    const expected=[...set].map(u=>{ const mm=g.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]}); const san=mm?mm.san:u; g.undo(); return {uci:u,san}; });
    return {status:userMove?'dev':'gap', ply:i, depth, fen, played:m.san, playedUci:uci, expected, branches:[...e.branches]};
  }
  return {status:'ok', depth, branches:lastBranches};
}

/* fetch d'un mois chess.com */
/* chess.com renvoie parfois une réponse sans en-tête CORS (rate limit) : on réessaie en série, avec attente croissante */
function apiBase(){ const p=(P.settings.proxy||'').trim().replace(/\/+$/,''); return p||'https://api.chess.com'; }
async function fetchMonth(user, y, m, onRetry){
  const path=`/pub/player/${encodeURIComponent(user.toLowerCase())}/games/${y}/${String(m).padStart(2,'0')}`;
  let lastErr;
  for(let i=0;i<5;i++){
    try{
      // essais 1-2 : direct ; ensuite via proxy si configuré (réponses 429 de chess.com sans en-tête CORS)
      const base = (i>=2 && P.settings.proxy) ? apiBase() : 'https://api.chess.com';
      const r=await fetch(base+path,{headers:{'Accept':'application/json'}});
      if(r.status===404) return [];
      if(r.status===429||r.status>=500) throw new Error('chess.com '+r.status);
      if(!r.ok) throw new Error('chess.com '+r.status);
      return (await r.json()).games||[];
    }catch(e){ lastErr=e; if(onRetry) onRetry(i+1); await new Promise(r=>setTimeout(r,800*(i+1))); }
  }
  throw lastErr;
}

/* fallback sans réseau : fichier PGN (export chess.com) ou texte collé, multi-parties */
function pgnToGames(text, user){
  const chunks=text.split(/(?=^\[Event\s)/m).map(t=>t.trim()).filter(Boolean); const out=[];
  for(const c of chunks){
    const tag=n=>{ const m=new RegExp('^\\['+n+'\\s+"([^"]*)"',"m").exec(c); return m?m[1]:''; };
    const white=tag('White'), black=tag('Black'), res=tag('Result'), link=tag('Link')||tag('Site');
    const wr=res==='1-0'?'win':res==='0-1'?'checkmated':'agreed', br=res==='0-1'?'win':res==='1-0'?'checkmated':'agreed';
    const d=(tag('UTCDate')||tag('Date')).replace(/\./g,'-'), t=tag('UTCTime')||tag('StartTime')||'12:00:00';
    const ts=Math.floor(new Date(d+'T'+t+'Z').getTime()/1000)||Math.floor(Date.now()/1000);
    const tcs=tag('TimeControl'); const base=parseInt(tcs)||0; const tclass=base>=1500?'rapid':base>=180?'blitz':base?'bullet':'daily';
    out.push({url:/chess\.com\/game/.test(link)?link:'pgn-'+ts+'-'+white+'-'+black, end_time:ts, time_class:tclass, time_control:tcs, rules:'chess',
      white:{username:white,rating:+tag('WhiteElo')||0,result:wr}, black:{username:black,rating:+tag('BlackElo')||0,result:br}, pgn:c});
  }
  return out.filter(g=>[g.white.username,g.black.username].some(n=>n.toLowerCase()===user.toLowerCase()));
}

function gameId(g){ return (g.url||'').split('/').pop() || String(g.end_time); }

/* analyse + mise en cache d'une liste de parties chess.com */
function ingestGames(games, user){
  if(!BOOK) buildBook();
  const u=user.toLowerCase(); let added=0;
  for(const g of games){
    if(g.rules && g.rules!=='chess') continue;
    const id=gameId(g); if(P.games[id]) continue;
    const isW=(g.white.username||'').toLowerCase()===u; const color=isW?'w':'b';
    const me=isW?g.white:g.black, opp=isW?g.black:g.white;
    const {sans, clocks}=parsePgnMoves(g.pgn||'');
    const a=analyseGame(sans,color);
    const res=me.result==='win'?'W':(['agreed','repetition','stalemate','insufficient','50move','timevsinsufficient'].includes(me.result)?'D':'L');
    P.games[id]={id,url:g.url,t:g.end_time,tc:g.time_class,tcs:g.time_control||'',rr:me.result,color,opp:opp.username,oppElo:opp.rating,myElo:me.rating,res,eco:g.eco?g.eco.split('/').pop():'',
      sans, clocks, nply:sans.length, a};
    added++;
  }
  recomputeBranchStats(); save(); return added;
}

/* réanalyse toutes les parties en cache (si le répertoire a changé) */
function reanalyseAll(){ buildBook(); for(const id in P.games){ const g=P.games[id]; g.a=analyseGame(g.sans,g.color); } recomputeBranchStats(); save(); }

/* stats par branche : fréquence dans tes parties + déviations (nourrissent le tirage du drill) */
function recomputeBranchStats(){
  for(const id in P.br){ P.br[id].devs=0; P.br[id].freq=0; }
  const cut=Date.now()-60*864e5; // 60 derniers jours
  for(const id in P.games){ const g=P.games[id]; if(g.t*1000<cut||P.ignored[id]||!tcOk(g)) continue;
    const br=g.a.branches||[]; br.forEach(b=>{ const s=brState(b); s.freq=(s.freq||0)+1; P.br[b]=s; });
    if(g.a.status==='dev') br.forEach(b=>{ const s=brState(b); s.devs=(s.devs||0)+1; P.br[b]=s; });
  }
}

/* ---------- UI onglet Parties ---------- */
const TC_LABEL={all:'Toutes',rapid:'Rapid',blitz:'Blitz',bullet:'Bullet'};
function tcOk(g){ const f=P.settings.tcFilter||'all'; return f==='all'||g.tc===f; }
function gamesList(){ return Object.values(P.games).filter(tcOk).sort((a,b)=>b.t-a.t); }
function tcChips(){ const f=P.settings.tcFilter||'all'; return `<div class="chips" id="tcChips">${Object.keys(TC_LABEL).map(k=>`<button data-tc="${k}" class="${f===k?'on':''}">${TC_LABEL[k]}</button>`).join('')}</div>`; }
function bindTcChips(h,rerender){ h.querySelectorAll('#tcChips button').forEach(b=>b.onclick=()=>{ P.settings.tcFilter=b.dataset.tc; save(); recomputeBranchStats(); rerender(); }); }
function coverage(list){
  const rel=list.filter(g=>g.a.status!=='nobook'&&g.a.status!=='err'); if(!rel.length) return null;
  const inBook=rel.filter(g=>g.a.status==='ok'||g.a.depth>=8||(g.a.status==='gap')).length; // gap = ce n'est pas toi qui as dévié
  return Math.round(100*inBook/rel.length);
}
function renderGames(h){
  const now=new Date(); const list=gamesList();
  const only=(navTop()&&navTop().filter)||null;
  const devs=list.filter(g=>g.a.status==='dev'&&!P.ignored[g.id]);
  const gaps=list.filter(g=>g.a.status==='gap'&&!P.ignored[g.id]);
  const cov=coverage(list); const notAn=list.filter(g=>!g.st&&!P.ignored[g.id]);
  const months=[]; for(let i=0;i<6;i++){ const d=new Date(now.getFullYear(),now.getMonth()-i,1); months.push({y:d.getFullYear(),m:d.getMonth()+1,label:d.toLocaleDateString('fr-FR',{month:'long',year:'numeric'})}); }
  const ts=tiltStatus();
  h.innerHTML=`
  ${ts.warn?`<div class="intro tilt warn"><b>Aujourd'hui : ${ts.n} parties${ts.streak>=2?`, ${ts.streak} défaites d'affilée`:''}.</b> Stop pour aujourd'hui — drill ou fautes à la place.</div>`:''}
  <div class="fetch">
    <input id="gUser" value="${P.settings.user||''}" placeholder="pseudo chess.com" autocapitalize="off" autocorrect="off">
    <select id="gMonth">${months.map((m,i)=>`<option value="${m.y}-${m.m}" ${i===0?'selected':''}>${m.label}</option>`).join('')}</select>
    <button id="gGo" class="pri">Analyser</button>
  </div>
  <div id="gStatus" class="why"></div>
  ${tcChips()}
  <details class="help"><summary>Comment lire cette page</summary>Chaque partie est rejouée contre ton répertoire. <b>Déviation</b> : tu as quitté ta ligne (ouvre la ligne à cet endroit ; « Autre ligne » si tu préfères une autre variante). <b>Trou</b> : l'adversaire a joué un coup que le répertoire ne couvre pas. Le moteur (bouton ci-dessous) note ensuite chaque coup et extrait tes fautes. Le filtre de cadence s'applique partout (Profil compris).</details>
  <details class="pgnbox"><summary>Scouting : préparer un adversaire</summary>
    <div class="fetch"><input id="scUser" placeholder="pseudo de l'adversaire" autocapitalize="off"><button id="scGo" class="pri">Scouter</button></div>
    <div id="scOut"></div>
  </details>
  <details class="pgnbox"><summary>Ou importer un PGN (fichier exporté de chess.com, ou texte collé)</summary>
    <input type="file" id="gFile" accept=".pgn,text/plain">
    <textarea id="gPgn" rows="4" placeholder="[Event &quot;Live Chess&quot;] …"></textarea>
    <button id="gPgnGo" class="sec">Analyser ce PGN</button>
  </details>
  <div class="stats"><div class="stat"><div class="n">${list.length}</div><div class="l">parties en cache</div></div><div class="stat"><div class="n">${cov===null?'–':cov+'%'}</div><div class="l">restées en livre (coup 4+)</div></div><div class="stat"><div class="n">${devs.length}</div><div class="l">déviations à corriger</div></div></div>
  ${list.length?`<div class="sysbar"><button id="gBatch" ${ENGINE.busy?'disabled':''}>${ENGINE.busy?'Analyse en cours…':`Moteur · analyser ${Math.min(10,notAn.length)} partie${Math.min(10,notAn.length)>1?'s':''} (${notAn.length} restantes)`}</button>${ENGINE.busy?'<button id="gCancel" class="sec">Stop</button>':''}</div><div id="gProg" class="prog2 hidden"><b></b><span></span></div>`:''}
  ${list.length?'':'<div class="intro">Récupère un mois de parties : chaque partie est rejouée contre ton répertoire. <b>Déviation</b> = tu as quitté la ligne ; <b>Trou</b> = l\'adversaire a joué un coup que le répertoire ne couvre pas. Rien ne quitte ton navigateur.</div>'}
  ${devs.length?`<h2 class="sec">Déviations — tu as quitté la ligne</h2>${devs.map(gameCard).join('')}`:''}
  ${only==='dev'?'':`${gaps.length?`<h2 class="sec">Trous — l'adversaire sort du répertoire</h2>${gaps.slice(0,25).map(gameCard).join('')}`:''}
  ${list.length?`<h2 class="sec">Toutes les parties</h2>${list.slice(0,60).map(gameCard).join('')}`:''}`}`;
  bindTcChips(h,()=>renderGames(h));
  $('#gGo').onclick=doFetch;
  const gb=$('#gBatch'); if(gb) gb.onclick=()=>runBatch(notAn.slice(0,10).map(g=>g.id));
  const gc=$('#gCancel'); if(gc) gc.onclick=()=>{ ENGINE.cancel=true; };
  $('#gFile').onchange=e=>{ const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=()=>{ $('#gPgn').value=r.result; ingestPgnText(); }; r.readAsText(f); };
  $('#gPgnGo').onclick=ingestPgnText;
  $('#scGo').onclick=doScout;
  h.querySelectorAll('.card[data-g]').forEach(el=>el.onclick=ev=>{ if(ev.target.closest('.ign')) return; openGame(el.dataset.g); });
  h.querySelectorAll('.ign').forEach(b=>b.onclick=ev=>{ ev.stopPropagation(); const id=b.dataset.g; P.ignored[id]=!P.ignored[id]; recomputeBranchStats(); save(); renderGames(h); });
}
const STATUS_LABEL={ok:'en livre',dev:'déviation',gap:'trou',out:'hors livre',nobook:'hors répertoire',err:'illisible'};
function gameCard(g){
  const a=g.a; const d=new Date(g.t*1000).toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'});
  const ign=P.ignored[g.id]; const fixed=P.fixed[g.id];
  let detail='';
  if(a.status==='dev') detail=`coup ${Math.floor(a.ply/2)+1}${a.ply%2?'…':'.'} tu as joué <b>${a.played}</b>, le répertoire dit <b>${a.expected.map(e=>e.san).join(' / ')}</b>`;
  else if(a.status==='gap') detail=`coup ${Math.floor(a.ply/2)+1}${a.ply%2?'…':'.'} il a joué <b>${a.played}</b> — ligne à ajouter`;
  else if(a.status==='ok') detail=`${a.depth} demi-coups dans le livre`;
  else if(a.status==='out') detail=`sorti du livre après ${a.depth} demi-coups (transposition)`;
  else detail=`${g.sans.slice(0,6).join(' ')}…`;
  const br=(a.branches||[]).slice(0,2).map(id=>BR[id]?BR[id].br.titre:id).join(' · ');
  const st=g.st?` <span class="acc ${g.st.acc>=80?'hi':g.st.acc>=65?'mid':'lo'}">${g.st.acc}%</span>${g.st.blunder?` <span class="dim">${g.st.blunder} gaffe${g.st.blunder>1?'s':''}</span>`:''}`:'';
  return `<div class="card g ${a.status} ${ign?'ign':''}" data-g="${g.id}"><div class="sw k ${g.color}"></div><div class="body"><div class="t"><span class="res ${g.res}">${g.res}</span> vs ${g.opp} <span class="dim">(${g.oppElo}) · ${d} · ${g.tc}</span>${st}</div><div class="s">${detail}${br?`<br><span class="dim">${br}</span>`:''}</div></div>${a.status==='dev'||a.status==='gap'?`<button class="ign" data-g="${g.id}" title="ignorer">${ign?'↺':'✕'}</button>`:''}<span class="badge ${fixed&&a.status==='dev'?'ok':a.status}">${fixed&&a.status==='dev'?'corrigée':STATUS_LABEL[a.status]}</span></div>`;
}
async function doFetch(){
  const user=$('#gUser').value.trim(); if(!user) return;
  P.settings.user=user; save();
  const [y,m]=$('#gMonth').value.split('-').map(Number); const st=$('#gStatus'); const btn=$('#gGo');
  btn.disabled=true; st.textContent='Récupération…';
  try{
    const games=await fetchMonth(user,y,m,n=>{ st.textContent=`chess.com ne répond pas, nouvel essai (${n}/5)…`; });
    st.textContent=`${games.length} parties reçues, analyse…`;
    await new Promise(r=>setTimeout(r,30));
    const added=ingestGames(games,user); P.settings.lastSync=Date.now(); save();
    st.textContent=`${added} nouvelle${added>1?'s':''} partie${added>1?'s':''} analysée${added>1?'s':''}.`;
    renderGames($('#home')); $('#gStatus').textContent=st.textContent;
  }catch(e){ st.textContent='Erreur : '+e.message+(location.protocol==='file:'?' (ouvre l\'app via http, pas file://)':' — réessaie dans une minute, ou importe un PGN ci-dessous.'); btn.disabled=false; }
}
function ingestPgnText(){
  const user=($('#gUser').value||P.settings.user||'').trim(); const txt=$('#gPgn').value; if(!txt.trim()||!user) return;
  P.settings.user=user; const games=pgnToGames(txt,user); const added=ingestGames(games,user);
  renderGames($('#home')); $('#gStatus').textContent=`${games.length} partie${games.length>1?'s':''} lue${games.length>1?'s':''} dans le PGN, ${added} nouvelle${added>1?'s':''}.`;
}
/* ouvrir une partie : déviation → drill de la branche à la position ; sinon replay simple */
function openGame(id){
  const g=P.games[id]; const a=g.a;
  if((a.status==='dev'||a.status==='gap')&&a.branches&&a.branches.length){
    const key=fenKey(a.fen); let cands=a.branches;
    if(a.status==='dev'){ const c=a.branches.filter(b=>{ const mv=BR[b].br.moves[a.ply]; return mv && a.expected.some(e=>e.uci===mv.uci); }); if(c.length) cands=c; }
    const pref=P.pref[key]; const pick=(pref&&cands.includes(pref))?pref:cands[0];
    const open=b=>startBranch(b,'drill',null,{startPly:a.ply, fromGame:g});
    // plusieurs systèmes différents à cette position → on demande, une fois, puis on retient
    const systems=new Set(cands.map(b=>BR[b].sys.id));
    if(systems.size>1 && !pref) pickBranch(cands,null,b=>{ P.pref[key]=b; save(); open(b); }); else open(pick);
  } else replayGame(g);
}
/* replay : la partie en mode explorer (lecture seule) */
function replayGame(g){
  const sans=g.sans; showBoard();
  const fake={id:'game',titre:`vs ${g.opp}`,moves:[],notes:{}};
  const t=new Chess(); sans.forEach(s=>{ const m=t.move(s); if(m) fake.moves.push({san:m.san,uci:m.from+m.to+(m.promotion||'')}); });
  cur={kind:'rep',id:'game',game:g,br:fake,sys:{titre:`${g.res==='W'?'Victoire':g.res==='D'?'Nulle':'Défaite'} · ${g.tc}`,resume:`${g.a.status==='ok'?'Partie restée dans le répertoire.':STATUS_LABEL[g.a.status]+'.'} ${g.eco||''}`},bloc:{titre:'Partie',side:g.color},mode:'explore',ply:0,steps:[],session:null,readonly:true,bookDepth:g.a.depth||0};
  orient=g.color; game=new Chess(); selected=null;legal=[];lastMove=null;locked=true;
  buildBoard(); render(); paintHeader(); $('#ptag').textContent=STATUS_LABEL[g.a.status]; $('#modes').innerHTML=''; paintStepper(); paintMoves();
  $('#explnav').classList.remove('hidden'); explTo(Math.min(fake.moves.length, g.a.depth||0));
  $('#actions').innerHTML = g.st ? '' : `<button id="bEng" class="pri">Analyser au moteur</button>`;
  const be=$('#bEng'); if(be) be.onclick=()=>analyseOne(g);
  if(g.st) $('#ptag').textContent=`${g.st.acc}% · ${STATUS_LABEL[g.a.status]}`;
  $('#meta').innerHTML=`<span>Adversaire <b>${g.opp}</b> (${g.oppElo})</span><span>Toi <b>${g.myElo}</b></span><span><a href="${g.url}" target="_blank" rel="noopener">voir sur chess.com</a></span>`;
  window.scrollTo(0,0);
}

async function runBatch(ids){
  if(!ids.length) return;
  const st=$('#gStatus'); st.textContent='Chargement du moteur (7 Mo, une seule fois)…';
  const prog=$('#gProg'); if(prog) prog.classList.remove('hidden'); $('#gBatch').disabled=true;
  try{
    const n=await analyseBatch(ids,(done,tot,i,np)=>{ const pct=Math.round(100*(done+i/np)/tot); const p=$('#gProg'); if(p){ p.querySelector('b').style.width=pct+'%'; p.querySelector('span').textContent=`partie ${done+1}/${tot} · ${i}/${np}`; } });
    rebuildFaults();
    renderGames($('#home')); $('#gStatus').textContent=`${n} partie${n>1?'s':''} analysée${n>1?'s':''} par le moteur.`;
  }catch(e){ st.textContent='Moteur indisponible : '+e.message; renderGames($('#home')); $('#gStatus').textContent='Moteur indisponible : '+e.message; }
}
async function analyseOne(g){
  const a=$('#actions'); a.innerHTML=`<div class="prog2" id="gProg"><b></b><span>chargement du moteur…</span></div>`;
  try{
    await analyseBatch([g.id],(d,t,i,n)=>{ const p=$('#gProg'); if(p){ p.querySelector('b').style.width=Math.round(100*i/n)+'%'; p.querySelector('span').textContent=`${i}/${n} positions`; } });
    rebuildFaults(); replayGame(g);
  }catch(e){ a.innerHTML=`<span class="why">Moteur indisponible : ${e.message}</span>`; }
}
/* classes de coups → couleur dans la liste, éval dans le coach */
function evalText(e){ if(!e) return ''; if(e.m!==null&&e.m!==undefined) return 'M'+e.m; return (e.c>=0?'+':'')+(e.c/100).toFixed(1); }

/* ---------- Scouting adversaire : ses ouvertures, tes réponses ---------- */
async function doScout(){
  const u=$('#scUser').value.trim(); if(!u) return; const out=$('#scOut'); out.innerHTML='<div class="why">Récupération…</div>';
  try{
    const now=new Date(); let games=[];
    for(let i=0;i<3&&games.length<80;i++){ const d=new Date(now.getFullYear(),now.getMonth()-i,1); games=games.concat(await fetchMonth(u,d.getFullYear(),d.getMonth()+1)); }
    games=games.filter(g=>(!g.rules||g.rules==='chess')&&g.time_class!=='daily').sort((a,b)=>b.end_time-a.end_time).slice(0,120);
    if(!games.length){ out.innerHTML='<div class="why">Aucune partie récente.</div>'; return; }
    if(!BOOK) buildBook();
    const lu=u.toLowerCase(); const side={w:{n:0,win:0,op:{}},b:{n:0,win:0,op:{}}}; let elo=null, tcs={};
    for(const g of games){ const isW=(g.white.username||'').toLowerCase()===lu; const me=isW?g.white:g.black; const S=side[isW?'w':'b']; S.n++; if(me.result==='win') S.win++; elo=elo||me.rating; tcs[g.time_class]=(tcs[g.time_class]||0)+1;
      const {sans}=parsePgnMoves(g.pgn||''); const key=sans.slice(0,isW?5:6).join(' '); if(!key) continue; const o=S.op[key]||(S.op[key]={n:0,win:0,sans:sans.slice(0,10)}); o.n++; if(me.result==='win') o.win++; }
    const block=(S,col)=>{ const ops=Object.entries(S.op).sort((a,b)=>b[1].n-a[1].n).slice(0,4);
      return `<div class="axis"><div class="axh"><span class="t">Avec les ${col==='w'?'Blancs':'Noirs'}</span><span class="big">${S.n?Math.round(100*S.win/S.n):'–'}%</span></div><div class="l">${S.n} parties · victoires</div>${ops.map(([k,o])=>{
        // ta réponse : on rejoue sa ligne avec toi de l'autre couleur, jusqu'à la première position hors livre
        const my=col==='w'?'b':'w'; const a=analyseGame(o.sans,my); const rep=a.status==='ok'||a.depth>=4?`<span class="ok">tu as une ligne (${(a.branches||[]).slice(0,1).map(id=>BR[id]?BR[id].br.titre:id).join('')})</span>`:a.status==='gap'||a.status==='dev'?`<span class="warn">à préparer : après ${a.played}</span>`:'<span class="warn">hors répertoire</span>';
        return `<div class="s"><b>${k}</b> · ${o.n}× (${Math.round(100*o.win/o.n)}% pour lui) — ${rep}</div>`; }).join('')}</div>`; };
    out.innerHTML=`<div class="stats"><div class="stat"><div class="n">${elo||'–'}</div><div class="l">Elo ${Object.keys(tcs).sort((a,b)=>tcs[b]-tcs[a])[0]||''}</div></div><div class="stat"><div class="n">${games.length}</div><div class="l">parties (3 mois)</div></div><div class="stat"><div class="n">${Math.round(100*(side.w.win+side.b.win)/games.length)}%</div><div class="l">victoires</div></div></div>`+block(side.w,'w')+block(side.b,'b');
  }catch(e){ out.innerHTML='<div class="why">Erreur : '+e.message+'</div>'; }
}
