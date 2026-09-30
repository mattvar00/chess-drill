/* ---------- Plans animés : les idées de chaque ouverture, pas à pas ---------- */
let PL_T=null;
function planDoneOf(id){ return (P.planDone||{})[id]; }
/* d'abord jouer la ligne : on réutilise le drill avec une branche temporaire */
function planPlay(id){
  const P=PLANS.find(x=>x.id===id); if(!P) return; const last=P.steps[P.steps.length-1].p;
  const g=new Chess(); const moves=P.sans.slice(0,last).map(s2=>{ const m=g.move(s2); return {san:m.san,uci:m.from+m.to+(m.promotion||'')}; });
  const key='plan:'+id; BR[key]={br:{id:key,titre:P.title,moves,notes:{}},sys:{id:'plan',titre:'Plan',resume:P.sub},bloc:{side:P.side,titre:P.cat}};
  startBranch(key,'drill',null,{planId:id});
}
function plansFor(sysId){ return (window.PLANS||[]).filter(p=>p.sys.includes(sysId)); }
function renderPlans(h){
  const t=navTop()||{}; const list=t.sys?plansFor(t.sys):PLANS; const cats=[...new Set(list.map(p=>p.cat))];
  h.innerHTML=`<div class="why">Chaque animation montre le plan type d'une ouverture : les ruptures, les cases clés, les pièces à échanger. À la fin, tu peux jouer la position contre Maia.</div>`+
    cats.map(c=>`<h2 class="sec">${c}</h2>`+list.filter(p=>p.cat===c).map(p=>`<div class="card" data-pl="${p.id}"><div class="sw k ${p.side}"></div><div class="body"><div class="t">${p.title}</div><div class="s">${p.sub} · ${p.steps.length} étapes</div></div><div class="go">›</div></div>`).join('')).join('');
  h.querySelectorAll('.card[data-pl]').forEach(el=>el.onclick=()=>go({s:'plan',id:el.dataset.pl,i:0}));
}
function planFen(P,p){ const g=new Chess(); for(let i=0;i<p;i++) g.move(P.sans[i]); return {fen:g.fen(), last:p?(()=>{ const t=new Chess(); let m=null; for(let i=0;i<p;i++) m=t.move(P.sans[i]); return m; })():null}; }
function planMoves(P,p){ const out=[]; for(let i=Math.max(0,p-6);i<p;i++){ out.push((i%2===0?(i/2+1)+'.':(i===Math.max(0,p-6)?Math.ceil(i/2)+'…':''))+P.sans[i]); } return out.join(' '); }
function renderPlan(h,t){
  const P=PLANS.find(x=>x.id===t.id); if(!P){ h.innerHTML='<div class="why">Plan introuvable.</div>'; return; }
  $('#htitle').textContent=P.title;
  const done=planDoneOf(P.id);
  if(!t.played&&!t.skip){ const last=P.steps[P.steps.length-1].p; const my=Math.ceil((P.side==='w'?last:last-1)/2);
    h.innerHTML=`<div class="plintro"><div class="t">${P.title}</div><div class="s">${P.sub}</div>
      <p>Avant de voir le plan, <b>rejoue la ligne</b> avec les ${P.side==='w'?'Blancs':'Noirs'} : ${my} coup${my>1?'s':''} jusqu'à la position clé. L'adversaire joue tout seul ; en cas d'erreur, l'app te corrige.</p>
      ${done?`<p class="why">Déjà jouée${done.errs?` (${done.errs} erreur${done.errs>1?'s':''} la dernière fois)`:' sans faute'}.</p>`:''}</div>
      <div class="sysbar"><button id="plGoPlay" class="pri">Jouer la ligne</button><button id="plSkip" class="sec">Voir directement le plan</button></div>`;
    $('#plGoPlay').onclick=()=>planPlay(P.id); $('#plSkip').onclick=()=>{ t.skip=true; renderPlan(h,t); }; return; }
  h.innerHTML=`<div class="why" style="text-align:center">${P.sub}</div>
  <div class="plb"><div class="plgrid" id="plG"></div><svg class="plarr" viewBox="0 0 800 800"><defs><marker id="plah" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#e0703c"/></marker></defs><g id="plA"></g></svg></div>
  <div class="plctl"><button id="plP" aria-label="Étape précédente">‹</button><button id="plPlay" aria-label="Lecture">▶</button><button id="plN" aria-label="Étape suivante">›</button><span id="plC"></span></div>
  <div class="plmv" id="plM"></div><div class="plcap" id="plCap"></div>
  <div class="sysbar"><button id="plSpar">Jouer cette position contre Maia</button><button id="plReplay" class="sec">Rejouer la ligne</button></div>
  <details class="grp"><summary>Toute la ligne et les sources</summary><div class="plmv" style="text-align:left">${P.sans.map((s,i)=>(i%2===0?(i/2+1)+'.':'')+s).join(' ')}</div><div class="why">Idées tirées de : ${P.src.map(u=>`<a href="${u}" target="_blank" rel="noopener">${u.replace(/^https?:\/\/(www\.)?/,'').split('/')[0]}</a>`).join(', ')}. Chaque coup est vérifié au moteur.</div></details>`;
  const draw=()=>{
    const S=P.steps[t.i], flip=P.side==='b'; const {fen,last}=planFen(P,S.p); const board={};
    fen.split(' ')[0].split('/').forEach((row,ri)=>{ let f=0; for(const ch of row){ if(/\d/.test(ch)){ f+=+ch; continue; } board['abcdefgh'[f]+(8-ri)]={color:ch===ch.toUpperCase()?'w':'b',type:ch.toLowerCase()}; f++; } });
    const G=$('#plG'); let html='';
    for(let y=0;y<8;y++) for(let x=0;x<8;x++){ const f=flip?7-x:x, r=flip?y+1:8-y, sq='abcdefgh'[f]+r, light=(f+r)%2===1;
      const cls=['sq',light?'l':'d']; if(last&&(last.from===sq||last.to===sq)) cls.push('last'); if(S.h.includes(sq)) cls.push('plh');
      const pc=board[sq]; html+=`<div class="${cls.join(' ')}">${pc?`<img src="${PIECE(pc)}" alt="">`:''}${x===0?`<span class="plco">${r}</span>`:''}${y===7?`<span class="plcf">${'abcdefgh'[f]}</span>`:''}</div>`; }
    G.innerHTML=html;
    const xy=s=>{ const f=s.charCodeAt(0)-97, r=+s[1]; return flip?[(7-f+.5)*100,(r-.5)*100]:[(f+.5)*100,(8-r+.5)*100]; };
    $('#plA').innerHTML=S.a.map(([a,b])=>{ const [x1,y1]=xy(a),[x2,y2]=xy(b); const dx=x2-x1,dy=y2-y1,L=Math.hypot(dx,dy)||1; return `<line x1="${x1}" y1="${y1}" x2="${x2-dx/L*28}" y2="${y2-dy/L*28}" stroke="#e0703c" stroke-width="16" stroke-linecap="round" opacity=".85" marker-end="url(#plah)"/>`; }).join('');
    $('#plCap').textContent=S.c; $('#plM').textContent=planMoves(P,S.p); $('#plC').textContent=`${t.i+1} / ${P.steps.length}`;
    $('#plSpar').textContent=t.i===P.steps.length-1?'Jouer cette position contre Maia':'Jouer depuis ici contre Maia';
  };
  const stop=()=>{ if(PL_T){ clearInterval(PL_T); PL_T=null; } const b=$('#plPlay'); if(b) b.textContent='▶'; };
  $('#plP').onclick=()=>{ stop(); t.i=Math.max(0,t.i-1); draw(); };
  $('#plN').onclick=()=>{ stop(); t.i=Math.min(P.steps.length-1,t.i+1); draw(); };
  $('#plPlay').onclick=()=>{ if(PL_T){ stop(); return; } if(t.i>=P.steps.length-1) t.i=0; draw(); $('#plPlay').textContent='❚❚';
    PL_T=setInterval(()=>{ if(!$('#plG')){ stop(); return; } if(t.i<P.steps.length-1){ t.i++; draw(); } else stop(); },4500); };
  $('#plReplay').onclick=()=>{ stop(); planPlay(P.id); };
  $('#plSpar').onclick=()=>{ stop(); const {fen}=planFen(P,P.steps[t.i].p); startSpar(fen,P.side,P.title); };
  draw();
}
