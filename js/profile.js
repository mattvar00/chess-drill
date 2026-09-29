/* ---------- Profil : six axes calculés depuis les parties en cache ---------- */
const clkSec=s=>{ if(!s) return null; const p=s.split(':').map(Number); return p.length===3?p[0]*3600+p[1]*60+p[2]:p.length===2?p[0]*60+p[1]:p[0]; };
const tcParse=tcs=>{ const m=/^(\d+)(?:\+(\d+))?/.exec(tcs||''); return m?{base:+m[1],inc:+(m[2]||0)}:{base:0,inc:0}; };

/* temps passé par toi sur chaque coup (secondes) ; null si pas d'horloge */
function moveTimes(g){
  if(!g.clocks||!g.clocks.length) return null; const {base,inc}=tcParse(g.tcs); const out=[];
  for(let i=0;i<g.sans.length;i++){ const mine=(i%2===0)===(g.color==='w'); if(!mine){ out.push(null); continue; }
    const cur=clkSec(g.clocks[i]); const prev=i>=2?clkSec(g.clocks[i-2]):base; if(cur===null||prev===null||!base){ out.push(null); continue; }
    out.push(Math.max(0, prev-cur+inc)); }
  return out;
}
/* win% de mon point de vue par position (parties analysées) */
function myWp(g){ if(!g.ev) return null; return g.ev.map(e=>{ const w=WP(e.c,e.m); return g.color==='w'?w:100-w; }); }

function sessions(list){ // parties triées par date croissante, coupées aux pauses > 20 min
  const s=[]; let cur=[]; let last=0;
  list.slice().sort((a,b)=>a.t-b.t).forEach(g=>{ if(cur.length&&g.t-last>1200){ s.push(cur); cur=[]; } cur.push(g); last=g.t; });
  if(cur.length) s.push(cur); return s;
}

function computeProfile(days){
  const cut=Date.now()/1000-days*86400;
  const all=Object.values(P.games).filter(g=>g.t>=cut&&!P.ignored[g.id]&&g.a.status!=='err'&&tcOk(g)).sort((a,b)=>a.t-b.t);
  const an=all.filter(g=>g.st&&g.ev);
  const pr={n:all.length, nAn:an.length, days};
  if(!all.length) return pr;
  const wr=l=>l.length?Math.round(100*l.filter(g=>g.res==='W').length/l.length):null;
  pr.winRate=wr(all);
  /* 1. Ouverture */
  const rel=all.filter(g=>g.a.status!=='nobook'); const cov=coverage(all);
  const wp10=an.map(g=>{ const w=myWp(g); const i=Math.min(20,w.length-1); return w[i]; }).filter(x=>x!=null);
  pr.opening={coverage:cov, devs:all.filter(g=>g.a.status==='dev').length, gaps:all.filter(g=>g.a.status==='gap').length, wp10:wp10.length?Math.round(wp10.reduce((a,b)=>a+b)/wp10.length):null, n:rel.length};
  /* 2. Tactique */
  if(an.length){ const bl=an.reduce((a,g)=>a+g.st.blunder,0), mi=an.reduce((a,g)=>a+g.st.mistake,0);
    const themes={}; an.forEach(g=>(P.gfaults[g.id]||[]).forEach(f=>{ themes[f.theme]=(themes[f.theme]||0)+1; }));
    pr.tactics={blundersPerGame:+(bl/an.length).toFixed(2), mistakesPerGame:+(mi/an.length).toFixed(2), acc:Math.round(an.reduce((a,g)=>a+g.st.acc,0)/an.length), themes:Object.entries(themes).sort((a,b)=>b[1]-a[1]).slice(0,4)}; }
  /* 3. Conversion & 4. Résilience */
  if(an.length){ const won=an.filter(g=>Math.max(...myWp(g))>=80), lost=an.filter(g=>Math.min(...myWp(g))<=20);
    pr.conversion={n:won.length, rate:won.length?Math.round(100*won.filter(g=>g.res==='W').length/won.length):null};
    pr.resilience={n:lost.length, rate:lost.length?Math.round(100*lost.filter(g=>g.res!=='L').length/lost.length):null}; }
  /* 5. Horloge */
  const timeouts=all.filter(g=>g.rr==='timeout').length;
  let fast=0,fastBl=0,slowBl=0,nb=0, tSum=0,tN=0; const perGame=[];
  an.forEach(g=>{ const mt=moveTimes(g); if(!mt) return; let gt=0,gn=0;
    g.cls.forEach((k,i)=>{ const t=mt[i]; if(t==null) return; gt+=t; gn++; tSum+=t; tN++; if(t<3) fast++;
      if(k==='blunder'){ nb++; if(t<3) fastBl++; else if(t>=15) slowBl++; } });
    if(gn) perGame.push(gt/gn); });
  pr.clock={timeouts, avgMove:tN?+(tSum/tN).toFixed(1):null, fastShare:tN?Math.round(100*fast/tN):null, blunders:nb, fastBlunders:nb?Math.round(100*fastBl/nb):null, slowBlunders:nb?Math.round(100*slowBl/nb):null, n:perGame.length};
  /* 6. Tilt */
  const byDay={}; all.forEach(g=>{ const d=new Date(g.t*1000).toISOString().slice(0,10); byDay[d]=(byDay[d]||0)+1; });
  const daysPlayed=Object.keys(byDay).length; const maxDay=Math.max(...Object.values(byDay));
  const ss=sessions(all); let afterTwoL=[], sessLen=[];
  ss.forEach(s=>{ sessLen.push(s.length); let streak=0; s.forEach(g=>{ if(streak>=2) afterTwoL.push(g); if(g.res==='L') streak++; else streak=0; }); });
  const longSess=ss.filter(s=>s.length>=10);
  pr.tilt={perDay:+(all.length/daysPlayed).toFixed(1), maxDay, afterTwoL:afterTwoL.length, wrAfterTwoL:wr(afterTwoL), wrBase:pr.winRate, longSessions:longSess.length, wrLongTail:wr(longSess.flatMap(s=>s.slice(10))), avgSess:+(sessLen.reduce((a,b)=>a+b,0)/sessLen.length).toFixed(1)};
  /* elo par cadence */
  pr.elo={}; all.forEach(g=>{ if(!g.myElo) return; (pr.elo[g.tc]=pr.elo[g.tc]||[]).push({t:g.t,e:g.myElo}); });
  return pr;
}

/* garde-fou du jour */
function tiltStatus(){
  const today=new Date().toISOString().slice(0,10); const lim=+(P.settings.dayLimit||12);
  const todays=Object.values(P.games).filter(g=>new Date(g.t*1000).toISOString().slice(0,10)===today).sort((a,b)=>b.t-a.t);
  let streak=0; for(const g of todays){ if(g.res==='L') streak++; else break; }
  return {n:todays.length, streak, lim, warn: todays.length>=lim || streak>=3};
}

function spark(points, w, h){
  if(!points||points.length<2) return '';
  const es=points.map(p=>p.e); const mn=Math.min(...es), mx=Math.max(...es); const r=Math.max(20,mx-mn);
  const xs=points.map((p,i)=>(i/(points.length-1))*w); const ys=es.map(e=>h-((e-mn)/r)*(h-6)-3);
  const d=xs.map((x,i)=>(i?'L':'M')+x.toFixed(1)+' '+ys[i].toFixed(1)).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" class="spark"><path d="${d}" fill="none" stroke="var(--brass)" stroke-width="1.5"/><text x="0" y="${h-1}" font-size="9" fill="var(--dim)">${mn}</text><text x="${w}" y="8" font-size="9" fill="var(--dim)" text-anchor="end">${mx}</text></svg>`;
}
const bar=(v,max,cls)=>`<div class="axisbar"><b class="${cls||''}" style="width:${v==null?0:Math.min(100,Math.round(100*v/max))}%"></b></div>`;

function renderProfile(h){
  const days=+(P.settings.profDays||30); const pr=computeProfile(days); const ts=tiltStatus();
  const opts=[7,30,90].map(d=>`<button class="${d===days?'on':''}" data-d="${d}">${d} j</button>`).join('');
  let html=`<div class="modes prof">${opts}</div>${tcChips()}`;
  html+=`<div class="intro tilt ${ts.warn?'warn':''}"><b>Aujourd'hui : ${ts.n} partie${ts.n>1?'s':''}</b>${ts.streak>=2?`, ${ts.streak} défaites d'affilée`:''}. ${ts.warn?'Stop. Tes chutes d\'Elo viennent des longues séries, pas des ouvertures.':`Limite ${ts.lim}/jour (réglable dans ⚙).`}</div>`;
  if(!pr.n){ h.innerHTML=html+`<div class="intro">Aucune partie sur ${days} jours. Récupère un mois dans l'onglet Parties.</div>`; bindProf(h); return; }
  const SG=Object.values(P.games).filter(g=>g.ev&&g.st&&!P.ignored[g.id]&&tcOk(g)&&g.t>=Date.now()/1000-days*86400).sort((a,b)=>b.t-a.t).slice(0,150);
  if(SG.length>=STYLE_MIN){ try{ const st=computeStyle(SG); html+=renderStyleCard(st)+`<details class="help"><summary>Toi contre tes pairs, indicateur par indicateur</summary>${renderStyleTable(st)}</details>`; }catch(e){ console.warn(e); } }
  else html+=`<div class="intro"><b>Carte joueur.</b> Il faut au moins ${STYLE_MIN} parties analysées au moteur sur la période (${SG.length} pour l'instant) : onglet Parties → Moteur.</div>`;
  html+=radar(pr);
  html+=`<div class="stats"><div class="stat"><div class="n">${pr.n}</div><div class="l">parties · ${days} j</div></div><div class="stat"><div class="n">${pr.winRate}%</div><div class="l">victoires</div></div><div class="stat"><div class="n">${pr.nAn}</div><div class="l">analysées au moteur</div></div></div>`;
  for(const tc in pr.elo){ const pts=pr.elo[tc]; if(pts.length>=3) html+=`<div class="card static"><div class="body"><div class="t">${tc} <span class="dim">${pts[0].e} → ${pts[pts.length-1].e}</span></div>${spark(pts,300,40)}</div></div>`; }
  const o=pr.opening;
  html+=axis('Ouverture', o.coverage==null?'–':o.coverage+'%', 'de parties restées dans le répertoire', bar(o.coverage,100,'ok'),
    `${o.devs} déviation${o.devs>1?'s':''}, ${o.gaps} trou${o.gaps>1?'s':''}${o.wp10!=null?` · ${o.wp10}% de chances au coup 10 (moteur)`:''}`);
  if(pr.tactics){ const t=pr.tactics;
    html+=axis('Tactique', t.acc+'%', 'précision moyenne', bar(t.acc,100,t.acc>=80?'ok':t.acc>=65?'':'bad'),
      `${t.blundersPerGame} gaffe${t.blundersPerGame>1?'s':''} et ${t.mistakesPerGame} erreur${t.mistakesPerGame>1?'s':''} par partie${t.themes.length?` · thèmes : ${t.themes.map(x=>x[0].toLowerCase()+' ×'+x[1]).join(', ')}`:''}`); }
  if(pr.conversion) html+=axis('Conversion', pr.conversion.rate==null?'–':pr.conversion.rate+'%', `de positions gagnantes (≥ 80 %) converties · ${pr.conversion.n} partie${pr.conversion.n>1?'s':''}`, bar(pr.conversion.rate,100,pr.conversion.rate>=85?'ok':pr.conversion.rate>=70?'':'bad'), 'Un +3 non converti coûte plus d\'Elo qu\'une ouverture ratée.');
  if(pr.resilience) html+=axis('Résilience', pr.resilience.rate==null?'–':pr.resilience.rate+'%', `de positions perdantes (≤ 20 %) sauvées · ${pr.resilience.n} partie${pr.resilience.n>1?'s':''}`, bar(pr.resilience.rate,60,pr.resilience.rate>=25?'ok':''), 'À ton niveau, 20-30 % est normal : l\'adversaire rate aussi.');
  const c=pr.clock;
  html+=axis('Horloge', c.avgMove==null?'–':c.avgMove+' s', 'par coup en moyenne (parties analysées avec horloge)', bar(c.fastShare,100,c.fastShare>50?'bad':''),
    c.n?`${c.fastShare}% de coups en moins de 3 s · ${c.fastBlunders!=null?c.fastBlunders+'% de tes gaffes jouées en moins de 3 s, '+c.slowBlunders+'% après 15 s ou plus':''}${c.timeouts?` · ${c.timeouts} défaite${c.timeouts>1?'s':''} au temps`:''}`:'Analyse des parties au moteur pour lier horloge et erreurs.');
  const ti=pr.tilt;
  const tiltBad=ti.wrAfterTwoL!=null&&ti.wrBase!=null&&ti.wrAfterTwoL<ti.wrBase-8;
  html+=axis('Tilt', ti.perDay+'/j', `parties par jour joué · pic ${ti.maxDay} · sessions de ${ti.avgSess} en moyenne`, bar(ti.maxDay,40,ti.maxDay>=20?'bad':ti.maxDay>=12?'':'ok'),
    `${ti.afterTwoL?`Après 2 défaites d'affilée : <b class="${tiltBad?'warn':''}">${ti.wrAfterTwoL}%</b> de victoires (${ti.afterTwoL} parties) contre ${ti.wrBase}% en général.`:'Pas encore de série de 2 défaites.'}${ti.longSessions?` · au-delà de la 10ᵉ partie d'une session : ${ti.wrLongTail==null?'–':ti.wrLongTail+'%'}`:''}`);
  h.innerHTML=html; bindProf(h);
}
function axis(title, big, label, barHtml, sub){ return `<div class="axis"><div class="axh"><span class="t">${title}</span><span class="big">${big}</span></div><div class="l">${label}</div>${barHtml}<div class="s">${sub}</div></div>`; }
function bindProf(h){ h.querySelectorAll('.prof button').forEach(b=>b.onclick=()=>{ P.settings.profDays=+b.dataset.d; save(); renderProfile(h); }); bindTcChips(h,()=>renderProfile(h)); }
/* radar 0-100 par axe (échelles indicatives, pas des percentiles) */
function axisScores(pr){
  const o=pr.opening||{}, t=pr.tactics, c=pr.clock||{}, ti=pr.tilt||{};
  const sc={};
  sc['Ouverture']=o.coverage==null?null:o.coverage;
  sc['Tactique']=t?Math.max(0,Math.min(100,(t.acc-50)*2)):null;
  sc['Conversion']=pr.conversion&&pr.conversion.rate!=null?pr.conversion.rate:null;
  sc['Résilience']=pr.resilience&&pr.resilience.rate!=null?Math.min(100,pr.resilience.rate*2.5):null;
  sc['Horloge']=c.fastBlunders!=null?Math.max(0,100-c.fastBlunders-c.fastShare/2):null;
  const tiltPen=(ti.maxDay?Math.min(60,ti.maxDay*2):0)+(ti.wrAfterTwoL!=null&&ti.wrBase!=null?Math.max(0,(ti.wrBase-ti.wrAfterTwoL)*2):0);
  sc['Tilt']=pr.n?Math.max(0,100-tiltPen):null;
  return sc;
}
function radar(pr){
  const sc=axisScores(pr); const keys=Object.keys(sc); const n=keys.length; const cx=170,cy=150,R=105;
  const pt=(i,r)=>{ const a=-Math.PI/2+i*2*Math.PI/n; return [cx+r*Math.cos(a),cy+r*Math.sin(a)]; };
  const grid=[0.25,0.5,0.75,1].map(f=>`<polygon points="${keys.map((k,i)=>pt(i,R*f).join(',')).join(' ')}" fill="none" stroke="var(--line)"/>`).join('');
  const spokes=keys.map((k,i)=>{ const [x,y]=pt(i,R); return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="var(--line)"/>`; }).join('');
  const poly=keys.map((k,i)=>pt(i,R*((sc[k]==null?0:sc[k])/100)).join(',')).join(' ');
  const labels=keys.map((k,i)=>{ const [x,y]=pt(i,R+22); const v=sc[k]; return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-size="11" fill="var(--mute)">${k}</text><text x="${x}" y="${y+13}" text-anchor="middle" dominant-baseline="middle" font-size="11" font-weight="700" fill="${v==null?'var(--dim)':v>=70?'var(--ok)':v>=45?'var(--brass)':'var(--bad)'}">${v==null?'–':Math.round(v)}</text>`; }).join('');
  return `<svg viewBox="0 0 340 300" class="radar">${grid}${spokes}<polygon points="${poly}" fill="rgba(209,165,74,.25)" stroke="var(--brass)" stroke-width="2"/>${labels}</svg><details class="help"><summary>Lire le radar</summary>Scores 0-100 sur des échelles fixes (pas des percentiles) : ouverture = couverture du répertoire ; tactique = précision moteur ; conversion = positions gagnantes converties ; résilience = positions perdues sauvées ; horloge = pénalise les gaffes jouées vite ; tilt = pénalise le volume et les défaites en série. Les axes moteur exigent des parties analysées.</details>`;
}
