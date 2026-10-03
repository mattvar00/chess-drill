/* ---------- Plans par structure de pions ----------
   Détection de la structure (au 12e coup), bibliothèque de plans, tes statistiques, quiz « quel est le plan ? » sur tes positions. */
const STRUCTS=[
 {id:'iqp_w',name:'Pion isolé blanc (d4)',fam:'d4 contre d5',anim:[],key:'d5 (case de blocage), e5 (avant-poste blanc)',
  w:['Jouer actif et attaquer à l\'aile roi : Bd3, Qc2 ou Qe2, Re1, Ne5','Préparer la percée d4-d5 au bon moment','Éviter les échanges : chaque pièce échangée affaiblit le pion isolé'],
  b:['Bloquer la case d5 avec une pièce, idéalement un cavalier','Échanger les pièces, surtout les pièces mineures','Attaquer d4 avec les tours et les cavaliers, puis gagner le pion en finale']},
 {id:'iqp_b',name:'Pion isolé noir (d5)',fam:'d4 contre d5',anim:['p_alapin'],key:'d4 (case de blocage), e4 (avant-poste noir)',
  w:['Bloquer la case d4 avec une pièce, idéalement un cavalier','Échanger les pièces, surtout les pièces mineures','Attaquer d5 avec les tours (Rd1, Rfd1) et gagner le pion en finale'],
  b:['Jouer actif : pièces vers l\'aile roi, cavalier en e4','Préparer la percée …d4 au bon moment','Éviter les échanges : ton pion isolé est une force tant qu\'il y a des pièces']},
 {id:'hang_w',name:'Pions pendants blancs (c4-d4)',fam:'d4 contre d5',anim:[],key:'c5, d5 (cases devant les pions)',
  w:['Garder les pions mobiles et côte à côte','Pousser d5 (ou c5) au bon moment pour ouvrir le jeu','Activer les pièces derrière les pions'],
  b:['Attaquer c4 et d4 pour provoquer une avance','Après l\'avance, bloquer la case libérée','Puis attaquer le pion resté en arrière']},
 {id:'hang_b',name:'Pions pendants noirs (c5-d5)',fam:'d4 contre d5',anim:[],key:'c4, d4 (cases devant les pions)',
  w:['Attaquer c5 et d5 (Rc1, Rd1, Na4) pour provoquer une avance','Après l\'avance, bloquer la case libérée','Puis attaquer le pion resté en arrière'],
  b:['Garder les pions mobiles et côte à côte','Pousser …d4 (ou …c4) au bon moment','Activer les pièces derrière les pions']},
 {id:'carlsbad',name:'Carlsbad (Gambit Dame Échange)',fam:'d4 contre d5',anim:['p_nimzod5'],key:'c6 (cible), e4 et e5',
  w:['Attaque de minorité : b4-b5 pour créer une faiblesse en c6','Ou le plan central : f3 puis e4','Tours sur la colonne c'],
  b:['Jeu à l\'aile roi : …Ne4, …f5, …Re8, cavalier vers g6','Bien placer les pièces avant que b5 n\'arrive','Ne pas rester passif : sans contre-jeu, la minorité gagne']},
 {id:'carlsbad_rev',name:'Carlsbad inversé',fam:'d4 contre d5',anim:[],key:'c3 (cible), e5 et e4',
  w:['Jeu à l\'aile roi : Ne5, f4, cavalier vers g3','Placer les pièces avant que …b4 n\'arrive','Ne pas rester passif'],
  b:['Attaque de minorité : …b5-b4 pour créer une faiblesse en c3','Ou le plan central : …f6 puis …e5','Tours sur la colonne c']},
 {id:'triangle',name:'Triangle Semi-Slave (c6-d5-e6)',fam:'d4 contre d5',anim:['p_slav','p_meran','p_antimeran'],key:'e4 (rupture blanche), c5 et e5 (ruptures noires)',
  w:['Préparer e4 avec Qc2, Bd3 et le roque','Après e4 : e5 pour chasser le cavalier f6 et attaquer à l\'aile roi','Contre …dxc4 et …b5 : le fou revient en d3, puis e4'],
  b:['Prendre en c4 au bon moment, puis …b5 et …Bb7','Rupture …c5 (ou …e5 contre e4) pour libérer le jeu','Ne pas laisser les Blancs jouer e4-e5 gratuitement']},
 {id:'stonewall_b',name:'Stonewall noir',fam:'Hollandaise',anim:[],key:'e4 (avant-poste noir), e5 (avant-poste blanc)',
  w:['Échanger le fou de cases noires (Ba3 ou Bf4)','Contrôler et occuper e5 (Ne5)','Jouer à l\'aile dame (b4-b5) ou ouvrir avec cxd5 puis e4'],
  b:['Cavalier en e4, puis attaque à l\'aile roi (…Qe8-h5, …Rf6-h6)','Activer le mauvais fou c8 (…b6 et …Ba6, ou …Bd7-e8-h5)','Garder le fou d6 tant que possible']},
 {id:'french',name:'Chaîne française (e5-d4)',fam:'e4 contre e6',anim:[],key:'d4 (base de la chaîne), f5',
  w:['Espace et attaque à l\'aile roi : Bd3, Qg4, f4-f5','Protéger la base d4','Garder le pion e5'],
  b:['Attaquer la base d4 : …c5, …Nc6, …Qb6','Rupture …f6 pour attaquer la tête de la chaîne','Jouer à l\'aile dame']},
 {id:'svesh',name:'Sveshnikov (d6-e5, trou en d5)',fam:'Sicilienne',anim:['p_svesh','p_svesh2','p_svesh3','p_svesh4'],key:'d5 (trou), f5 (rupture noire)',
  w:['Installer un cavalier en d5 et le soutenir (c3, Nc2-e3)','Jouer a4 contre l\'aile dame noire','Viser le pion d6'],
  b:['Rupture …f5 pour attaquer e4','Échanger ou chasser le cavalier d5 (…Ne7, …Bxd5)','Jeu à l\'aile dame : …b4 pour chasser le défenseur de d5']},
 {id:'maroczy',name:'Maroczy (c4-e4)',fam:'Sicilienne',anim:[],key:'d5, b5 et d5 (ruptures noires)',
  w:['Garder l\'étau : Nc3, Be3, Qd2, f3','Empêcher …b5 et …d5','Plus tard : c5 ou b4 pour l\'espace'],
  b:['Jouer les ruptures …b5 ou …d5 quand elles sont possibles','Échanger des pièces pour avoir plus de place','Cavalier en c5 ou e5']},
 {id:'sicil',name:'Sicilienne ouverte (petit centre d6-e6)',fam:'Sicilienne',anim:['p_sicexch'],key:'d5 (rupture noire), e5 et f5',
  w:['Attaque à l\'aile roi : f4, g4-g5, ou Be3, Qd2, O-O-O','Préparer e5','Garder le contrôle de d5'],
  b:['Contre-jeu à l\'aile dame : …a6, …b5, …Bb7, tour en c8','Rupture …d5 quand elle est possible','Ne pas roquer trop tôt du côté où les Blancs attaquent']},
 {id:'benoni',name:'Benoni (d5-e4 contre c5-d6)',fam:'Indiennes',anim:[],key:'e5 (rupture blanche), b5 (rupture noire)',
  w:['Préparer la rupture e4-e5','Cavalier en c4 contre d6','Avancer f4 si la position le permet'],
  b:['Majorité à l\'aile dame : …a6, …b5','Tour en e8 contre e4','Cavalier vers e5 par d7']},
 {id:'kid',name:'Centre fermé Est-indien (d5 contre d6-e5)',fam:'Indiennes',anim:[],key:'c5 (rupture blanche), f5 (rupture noire)',
  w:['Jouer à l\'aile dame : b4 et c5','Cavalier vers c4 (par d2) ou b5','Ne pas répondre à l\'aile roi tant que ce n\'est pas nécessaire'],
  b:['Attaque à l\'aile roi : …f5, …f4, …g5-g4','Cavalier vers f4 (par h5)','Aller vite : la course est entre les deux ailes']},
 {id:'open',name:'Centre ouvert',fam:'Divers',anim:[],key:'colonnes ouvertes, diagonales',
  w:['Activer toutes les pièces, tours sur les colonnes ouvertes','Viser le roi adverse avec la paire de fous','Calculer les tactiques : ce sont les positions les plus concrètes'],
  b:['Activer toutes les pièces, tours sur les colonnes ouvertes','Viser le roi adverse avec la paire de fous','Calculer les tactiques : ce sont les positions les plus concrètes']},
];
const STRUCT=Object.fromEntries(STRUCTS.map(s=>[s.id,s]));

function stPawns(fen){ const P2={w:[],b:[]}; fen.split(' ')[0].split('/').forEach((row,ri)=>{ let f=0; for(const ch of row){ if(/\d/.test(ch)) f+=+ch; else { if(ch==='P') P2.w.push({f,r:8-ri}); if(ch==='p') P2.b.push({f,r:8-ri}); f++; } } }); return P2; }
function detectStructure(fen){
  const P2=stPawns(fen), W=P2.w, B=P2.b; const on=(a,f)=>a.some(p=>p.f===f), at=(a,f,r)=>a.some(p=>p.f===f&&p.r===r);
  const C=2,D=3,E=4,F=5;
  if(on(W,D)&&!on(W,C)&&!on(W,E)&&(at(W,D,4)||at(W,D,5))) return 'iqp_w';
  if(on(B,D)&&!on(B,C)&&!on(B,E)&&(at(B,D,5)||at(B,D,4))) return 'iqp_b';
  if(at(W,C,4)&&at(W,D,4)&&!on(W,1)&&!on(W,E)) return 'hang_w';
  if(at(B,C,5)&&at(B,D,5)&&!on(B,1)&&!on(B,E)) return 'hang_b';
  if(at(W,D,4)&&at(B,D,5)&&!on(W,C)&&on(B,C)&&!on(B,E)&&on(W,E)) return 'carlsbad';
  if(at(W,D,4)&&at(B,D,5)&&!on(B,C)&&on(W,C)&&!on(W,E)&&on(B,E)) return 'carlsbad_rev';
  if(at(B,D,5)&&at(B,E,6)&&at(B,F,5)) return 'stonewall_b';
  if(at(W,E,5)&&at(W,D,4)&&at(B,E,6)&&at(B,D,5)) return 'french';
  if(at(B,D,5)&&at(B,C,6)&&at(B,E,6)&&on(W,D)) return 'triangle';
  if(at(W,E,4)&&!on(W,D)&&!on(B,C)&&at(B,D,6)&&at(B,E,5)) return 'svesh';
  if(at(W,C,4)&&at(W,E,4)&&!on(W,D)&&!on(B,C)) return 'maroczy';
  if(at(W,E,4)&&!on(W,D)&&!on(B,C)&&(on(B,D)||at(B,E,6))) return 'sicil';
  if(at(W,D,5)&&at(W,E,4)&&at(B,C,5)&&at(B,D,6)&&!on(B,E)) return 'benoni';
  if(at(W,D,5)&&at(B,D,6)&&at(B,E,5)) return 'kid';
  if(!on(W,D)&&!on(W,E)&&!on(B,D)&&!on(B,E)) return 'open';
  return null;
}
/* structure d'une partie : position au 12e coup (ou dernier coup si plus court) */
function gameStructure(g){ if(g._st!==undefined) return g._st; if(!g.sans||g.sans.length<20){ g._st=null; return null; }
  const c=new Chess(); const n=Math.min(24,g.sans.length); for(let i=0;i<n;i++){ if(!c.move(g.sans[i])) break; } const id=detectStructure(c.fen()); g._st=id?{id,ply:n,fen:c.fen()}:null; return g._st; }

/* statistiques par structure : score, chances au coup 8 → 20, erreurs coups 9-25 toi / adversaire */
function structureStats(){
  const R=Object.values(P.games).filter(g=>g.ev&&g.st&&!P.ignored[g.id]&&tcOk(g));
  const S={}; for(const g of R){ const st=gameStructure(g); if(!st) continue; const o=S[st.id]||(S[st.id]={n:0,sc:0,d:0,me:[0,0],op:[0,0],games:[]});
    const w=myWp(g); const me=g.color==='w'?0:1; o.n++; o.sc+=g.res==='W'?1:g.res==='D'?.5:0; o.d+=(w[Math.min(40,w.length-1)]-w[Math.min(16,w.length-1)]);
    for(let i=16;i<50&&i+1<w.length;i++){ const mine=i%2===me; const l=mine?Math.max(0,w[i]-w[i+1]):Math.max(0,w[i+1]-w[i]); const X=mine?o.me:o.op; X[0]++; if(l>=10) X[1]++; }
    o.games.push(g); }
  for(const k in S){ const o=S[k]; o.score=Math.round(100*o.sc/o.n); o.delta=Math.round(o.d/o.n); o.errMe=o.me[0]?100*o.me[1]/o.me[0]:0; o.errOp=o.op[0]?100*o.op[1]/o.op[0]:0; o.games.sort((a,b)=>b.t-a.t); }
  return S;
}

/* petit échiquier statique (même rendu que les plans animés) */
function stBoard(fen,flip,hl){ const B={}; fen.split(' ')[0].split('/').forEach((row,ri)=>{ let f=0; for(const ch of row){ if(/\d/.test(ch)){ f+=+ch; continue; } B['abcdefgh'[f]+(8-ri)]={color:ch===ch.toUpperCase()?'w':'b',type:ch.toLowerCase()}; f++; } });
  let h='<div class="plb"><div class="plgrid">'; for(let y=0;y<8;y++) for(let x=0;x<8;x++){ const f=flip?7-x:x, r=flip?y+1:8-y, sq='abcdefgh'[f]+r, light=(f+r)%2===1; const pc=B[sq];
    h+=`<div class="sq ${light?'l':'d'} ${(hl||[]).includes(sq)?'plh':''}">${pc?`<img src="${PIECE(pc)}" alt="">`:''}${x===0?`<span class="plco">${r}</span>`:''}${y===7?`<span class="plcf">${'abcdefgh'[f]}</span>`:''}</div>`; }
  return h+'</div></div>'; }
const stKeySquares=s=>(s.key.match(/\b[a-h][1-8]\b/g)||[]);

/* ---------- écrans ---------- */
function renderStructs(h){
  const S=structureStats(); const mine=Object.entries(S).sort((a,b)=>b[1].n-a[1].n);
  const card=(id,o)=>{ const s=STRUCT[id]; const gap=o?o.errMe-o.errOp:0;
    return `<div class="card" data-st="${id}"><div class="body"><div class="t">${s.name}</div><div class="s">${o?`${o.n} partie${o.n>1?'s':''} · score ${o.score} % · ${gap>2?`<span class="warn">${gap.toFixed(0)} pts d'erreurs de plus que tes adversaires</span>`:gap<-2?`<span class="okc">${(-gap).toFixed(0)} pts d'erreurs de moins</span>`:'autant d\'erreurs que tes adversaires'}`:s.fam}</div></div>${s.anim.length?`<span class="badge learn">${s.anim.length} animation${s.anim.length>1?'s':''}</span>`:''}<div class="go">›</div></div>`; };
  h.innerHTML=`<div class="intro"><b>Les plans viennent de la structure de pions.</b> L'app reconnaît la structure de chacune de tes parties au 12ᵉ coup, mesure comment tu t'en sors, et t'entraîne sur le plan de la structure avec tes propres positions.</div>
   ${mine.length?`<h2 class="sec">Tes structures</h2>${mine.map(([id,o])=>card(id,o)).join('')}`:`<div class="why">Analyse des parties au moteur (Parties → Mettre à jour) pour voir tes structures.</div>`}
   <details class="grp"><summary>Toutes les structures (${STRUCTS.length})</summary>${STRUCTS.map(s=>card(s.id,S[s.id])).join('')}</details>`;
  h.querySelectorAll('.card[data-st]').forEach(el=>el.onclick=()=>go({s:'struct',id:el.dataset.st}));
}
function renderStruct(h,t){
  const s=STRUCT[t.id]; if(!s){ h.innerHTML='<div class="why">Structure inconnue.</div>'; return; } $('#htitle').textContent=s.name;
  const o=structureStats()[s.id]; const games=o?o.games:[]; const side=games.length?(games.filter(g=>g.color==='w').length>=games.length/2?'w':'b'):'w';
  const ex=games[0]; const fen=ex?gameStructure(ex).fen:null; const flip=ex?ex.color==='b':false;
  const plan=(c,L)=>`<div class="stplan ${c===side?'mine':''}"><div class="t">${c==='w'?'Plan des Blancs':'Plan des Noirs'}${c===side&&games.length?' · ton camp le plus souvent':''}</div><ol>${L.map(x=>`<li>${x}</li>`).join('')}</ol></div>`;
  h.innerHTML=`${fen?stBoard(fen,flip,stKeySquares(s)):''}
   <div class="why" style="text-align:center">${fen?`Exemple de ta partie contre ${ex.opp} · `:''}cases clés : ${s.key}</div>
   ${o?`<div class="stats"><div class="stat"><div class="n">${o.n}</div><div class="l">parties</div></div><div class="stat"><div class="n">${o.score} %</div><div class="l">score</div></div><div class="stat"><div class="n">${Math.round(o.errMe)} % / ${Math.round(o.errOp)} %</div><div class="l">coups 9-25 ratés : toi / adversaires</div></div></div>`:''}
   ${plan('w',s.w)}${plan('b',s.b)}
   <div class="sysbar">${games.length?`<button id="stQuiz" class="pri">Quiz : quel est le plan ? (${Math.min(games.length,10)} positions)</button>`:''}${s.anim.length?`<button id="stAnim" class="sec">Voir les animations (${s.anim.length})</button>`:''}</div>
   ${games.length?`<h2 class="sec">Tes parties dans cette structure</h2>${games.slice(0,15).map(g=>`<div class="card" data-g="${g.id}"><div class="sw k ${g.color}"></div><div class="body"><div class="t"><span class="res ${g.res}">${g.res}</span> vs ${g.opp} <span class="dim">(${g.oppElo}) · ${new Date(g.t*1000).toLocaleDateString('fr-FR')}</span></div><div class="s">${ecoName(g)||''}</div></div><div class="go">›</div></div>`).join('')}`:''}`;
  const q=$('#stQuiz'); if(q) q.onclick=()=>go({s:'squiz',id:s.id,k:0,ok:0,games:games.slice(0,10).map(g=>g.id)});
  const an=$('#stAnim'); if(an) an.onclick=()=>{ if(s.anim.length===1) go({s:'plan',id:s.anim[0],i:0}); else go({s:'plans',ids:s.anim}); };
  h.querySelectorAll('.card[data-g]').forEach(el=>el.onclick=()=>{ const g=P.games[el.dataset.g]; go({s:'review',id:g.id,i:gameStructure(g).ply}); });
}
/* quiz : à la position de ta partie, choisir le plan de ton camp parmi trois */
function renderSQuiz(h,t){
  const s=STRUCT[t.id]; const ids=t.games||[]; if(t.k>=ids.length){ h.innerHTML=`<div class="intro"><b>Quiz terminé : ${t.ok}/${ids.length}.</b> ${t.ok===ids.length?'Tu connais le plan de cette structure.':'Relis les plans, puis rejoue une position contre Maia pour les appliquer.'}</div><div class="sysbar"><button id="qBack" class="pri">Retour à la structure</button></div>`; $('#qBack').onclick=()=>back(); return; }
  const g=P.games[ids[t.k]]; const st=gameStructure(g); const side=g.color;
  if(!t.opts||t.optsK!==t.k){ const right=(side==='w'?s.w:s.b)[0]; const others=STRUCTS.filter(x=>x.id!==s.id&&(side==='w'?x.w:x.b)[0]!==right&&x.id!=='open');
    const pick=others.sort(()=>Math.random()-0.5).slice(0,2).map(x=>(side==='w'?x.w:x.b)[0]); t.opts=[right,...pick].sort(()=>Math.random()-0.5); t.right=right; t.optsK=t.k; t.ans=null; }
  $('#htitle').textContent=`Quiz · ${t.k+1}/${ids.length}`;
  h.innerHTML=`${stBoard(st.fen,side==='b',[])}
   <div class="why" style="text-align:center">Contre ${g.opp} · coup ${Math.floor(st.ply/2)+1} · tu as les ${side==='w'?'Blancs':'Noirs'}</div>
   <div class="intro"><b>Structure : ${s.name}.</b> Quel est le plan principal de ton camp ?</div>
   ${t.opts.map((o,i)=>`<button class="qopt ${t.ans!=null?(o===t.right?'right':(i===t.ans?'wrong':'')):''}" data-i="${i}" ${t.ans!=null?'disabled':''}>${o}</button>`).join('')}
   ${t.ans!=null?`<div class="intro">${t.opts[t.ans]===t.right?'<b>Exact.</b>':'<b>Pas tout à fait.</b> Le plan principal est en vert.'} Le plan complet de ton camp : ${(side==='w'?s.w:s.b).map(x=>x.toLowerCase()).join(' ; ')}.</div>
     <div class="sysbar"><button id="qMaia" class="sec">Jouer cette position contre Maia</button><button id="qRev" class="sec">Voir la suite de ta partie</button><button id="qNext" class="pri">Suivant ›</button></div>`:''}`;
  h.querySelectorAll('.qopt').forEach(b=>b.onclick=()=>{ t.ans=+b.dataset.i; if(t.opts[t.ans]===t.right) t.ok++; if(window.SFX) (t.opts[t.ans]===t.right?SFX.good():SFX.bad()); renderSQuiz(h,t); });
  const n=$('#qNext'); if(n) n.onclick=()=>{ t.k++; renderSQuiz(h,t); window.scrollTo(0,0); };
  const m=$('#qMaia'); if(m) m.onclick=()=>startSpar(st.fen,side,s.name);
  const r=$('#qRev'); if(r) r.onclick=()=>go({s:'review',id:g.id,i:st.ply});
}
