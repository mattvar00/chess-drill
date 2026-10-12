/* ---------- Profil par thème : note par situation et par motif (thèmes Lichess) + positions ratées à retravailler ---------- */
(function(){
  /* données compactes -> objets "faute" compatibles avec l'entraîneur */
  const PH={o:'ouverture',m:'milieu de partie',f:'finale'};
  const NAMES={p:'pion',n:'cavalier',b:'fou',r:'tour',q:'dame',k:'roi'};
  const EXTRA={punir:'Punir une erreur adverse',menace:'Parer une menace',seul:'Trouver le seul bon coup',gagnant:'Garder une position gagnante',defendre:'Défendre une position difficile',equality:'Égalité',middlegame:'Milieu de partie',opening:'Ouverture',endgame:'Finale'};
  const MAIN=['quietMove','discoveredAttack','fork','advancedPawn','sacrifice','defensiveMove','capturingDefender','skewer','intermezzo','pin','advantage','kingsideAttack','mate','hangingPiece','punir','menace','seul','gagnant','defendre'];
  let _T=null;
  function build(){
    const R=window.THEMES_RAW; if(!R) return {cats:[],puzzles:[]};
    const cats=R.cats.map(([id,label,group,ok,n])=>({id,label,group,ok,n}));
    const lab=id=>(cats.find(c=>c.id===id)||{}).label||EXTRA[id]||id;
    const puzzles=[];
    for(const r of R.p){ try{
      const [g,ply,fen,tags,opp,d,res,ph,bu,bs,suite,pu,ps,wb,wa,refut]=r; const tg=tags.split(' ');
      const c=new Chess(fen); const bm=c.move({from:bu.slice(0,2),to:bu.slice(2,4),promotion:bu[4]}); if(!bm) continue; c.undo();
      const pm=c.move({from:pu.slice(0,2),to:pu.slice(2,4),promotion:pu[4]}); if(!pm) continue;
      const nm=NAMES[bm.piece]; const fem=bm.piece==='r'||bm.piece==='q';
      const main=MAIN.find(x=>tg.includes(x))||tg[0];
      puzzles.push({id:'T:'+g+':'+ply,fen,side:fen.split(' ')[1],theme:lab(main),tags:tg,opp,date:'20'+d.slice(0,2)+'.'+d.slice(2,4)+'.'+d.slice(4,6),result:res,
        move_no:Math.floor(ply/2)+1,phase:PH[ph]||'',mat:0,game:g,opening:'',
        best:{san:bm.san,uci:bu,score:bs,desc:`${fem?'La':'Le'} ${nm} ${bm.captured?'prend en':'va en'} ${bm.to}${/[+#]/.test(bm.san)?' avec échec':''}.`,suite,reply:(suite||'').split(' ')[0]||null},
        played:{san:pm.san,uci:pu,score:ps,wp_before:wb,wp_after:wa,refut}});
    }catch(e){} }
    return {date:R.date,games:R.games,cats,puzzles};
  }
  const T=()=>_T||(_T=build());
  window.THEMES_get=T;
  const pct=c=>Math.round(100*c.ok/Math.max(1,c.n));
  function themeFaults(id){ return T().puzzles.filter(F=>F.tags.includes(id)).map(F=>({key:F.id,F,src:'theme'})); }
  window.themeFaults=themeFaults;

  /* les modes "th:<id>" branchent la liste des positions sur un thème */
  const _all=window.allFaults;
  window.allFaults=function(){ if(typeof FMODE==='string'&&FMODE.startsWith('th:')) return themeFaults(FMODE.slice(3)); return _all(); };

  function found(id){ const L=themeFaults(id); return {n:L.length, done:L.filter(x=>P.fault[x.key]&&P.fault[x.key].done).length}; }
  function avg(){ const c=T().cats.filter(c=>c.group==='mot'); const ok=c.reduce((a,x)=>a+x.ok,0), n=c.reduce((a,x)=>a+x.n,0); return n?Math.round(100*ok/n):70; }

  function row(c,ref){
    const p=pct(c); const cls=p>=ref+8?'good':p<=ref-8?'bad':'mid'; const f=found(c.id);
    return `<div class="card throw" data-th="${c.id}"><div class="body"><div class="t">${c.label} <span class="thpct ${cls}">${p} %</span></div>
      <div class="thbar"><b class="${cls}" style="width:${p}%"></b><i style="left:${ref}%"></i></div>
      <div class="s">${c.ok}/${c.n} positions réussies dans tes parties${f.n?` · ${f.n} ratée${f.n>1?'s':''} à retravailler${f.done?`, ${f.done} trouvée${f.done>1?'s':''}`:''}`:''}</div></div>${f.n?'<div class="go">›</div>':''}</div>`;
  }

  window.renderThemes=function(h){
    const D=T(); if(!D.cats.length){ h.innerHTML='<div class="why">Pas encore de profil par thème.</div>'; return; }
    const ref=avg();
    const sit=D.cats.filter(c=>c.group==='sit').sort((a,b)=>pct(a)-pct(b));
    const mot=D.cats.filter(c=>c.group==='mot').sort((a,b)=>pct(a)-pct(b));
    const weak=mot.filter(c=>found(c.id).n>=10&&!['middlegame','opening','endgame'].includes(c.id)).slice(0,3);
    const sitWeak=sit.filter(c=>found(c.id).n>=10).slice(0,1);
    const plan=[...sitWeak,...weak];
    h.innerHTML=`<div class="intro"><b>Ton profil par thème.</b> Chaque position critique de tes ${D.games} dernières parties de rapide (analyse du ${D.date}) est classée par situation et par motif, comme les puzzles Lichess. Le pourcentage indique combien de fois tu as trouvé le meilleur coup ou un coup équivalent. Le trait vertical marque ta moyenne (${ref} %).</div>
      ${plan.length?`<h2 class="sec">Plan recommandé</h2><div class="why">Tes thèmes les plus faibles, avec tes propres positions ratées. Une séance = un thème, 10 positions.</div>
      <div class="sysbar thplan">${plan.map(c=>`<button class="thgo" data-th="${c.id}">${c.label} · ${pct(c)} %</button>`).join('')}</div>`:''}
      <h2 class="sec">Situations</h2>${sit.map(c=>row(c,ref)).join('')}
      <h2 class="sec">Motifs tactiques</h2>${mot.map(c=>row(c,ref)).join('')}
      <div class="why">Sur Lichess : Puzzles → Thèmes. « Coup tranquille », « Coup défensif » et « Coup intermédiaire » sont dans la section Avancé ; « Avantage » et « Égalité » dans Objectifs.</div>`;
    h.querySelectorAll('[data-th]').forEach(el=>el.onclick=()=>{ const id=el.dataset.th; if(found(id).n) go({s:'tfaults',th:id}); });
  };

  window.themeLabel=id=>{ const c=T().cats.find(c=>c.id===id); return c?c.label:id; };

  const css=document.createElement('style'); css.textContent=`
    .throw .t{display:flex;justify-content:space-between;gap:8px}
    .thpct{font-weight:700}.thpct.good{color:#3a9d5d}.thpct.mid{color:#c8902a}.thpct.bad{color:#d0473c}
    .thbar{position:relative;height:8px;border-radius:4px;background:rgba(127,127,127,.18);margin:6px 0 4px}
    .thbar b{position:absolute;left:0;top:0;bottom:0;border-radius:4px}
    .thbar b.good{background:#3a9d5d}.thbar b.mid{background:#c8902a}.thbar b.bad{background:#d0473c}
    .thbar i{position:absolute;top:-3px;bottom:-3px;width:2px;background:currentColor;opacity:.55}
    .thplan{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 4px}.thplan .thgo{flex:1 1 calc(50% - 6px);padding:10px 8px;font-size:14px}`;
  document.head.appendChild(css);
})();
