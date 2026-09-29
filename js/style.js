/* ---------- Style : indicateurs comparés à tes adversaires, carte joueur, coups forcés ---------- */
const STYLE_MIN=20;
function forcingMove(f,u){ if(!u) return null; const t=new Chess(f); const m=t.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]}); return m&&(m.captured||m.san.includes('+'))?m:null; }
const _V={p:1,n:3,b:3,r:5,q:9};
function _bal(f,s){ let x=0; for(const ch of f.split(' ')[0]){ const l=ch.toLowerCase(); if(_V[l]) x+=(ch===ch.toUpperCase()?1:-1)*_V[l]; } return s==='w'?x:-x; }
const _npcs=f=>f.split(' ')[0].replace(/[^nbrqNBRQ]/g,'').length;
function _kFile(f,t){ for(const row of f.split(' ')[0].split('/')){ let file=0; for(const ch of row){ if(/\d/.test(ch)) file+=+ch; else { if(ch===t) return file; file++; } } } return 4; }
function _replay(g){ const c=new Chess(); const F=[c.fen()], M=[]; for(const s of g.sans){ const m=c.move(s); if(!m) break; M.push(m); F.push(c.fen()); } return {F,M}; }
function _loss(g,M,i){ const ev=g.ev, m=M[i]; const wb=WP(ev[i].c,ev[i].m), wa=WP(ev[i+1].c,ev[i+1].m); const p0=m.color==='w'?wb:100-wb, p1=m.color==='w'?wa:100-wa; let l=Math.max(0,p0-p1); if(m.from+m.to+(m.promotion||'')===ev[i].b) l=0; return {l,p0,p1}; }

let _styleCache={key:'',val:null};
function computeStyle(L){
  const key=L.map(g=>g.id).join(',');
  if(_styleCache.key===key) return _styleCache.val;
  const mk=()=>({mv:0,accs:[],bl:0,chk:0,push:0,sac:0,tac:[0,0,0],pos:[0,0,0],ph:{o:[0,0,0],m:[0,0,0],e:[0,0,0]},worse:[0,0],better:[0,0,0],t:[0,0],off:0,def:0,pun:[0,0],ca:[0,0],cb:[0,0]});
  const S={me:mk(),opp:mk()}; const conv={me:[0,0],opp:[0,0]}; const endClk=[]; let stal=0;
  for(const g of L){
    const {F,M}=_replay(g); const ev=g.ev; const n=Math.min(M.length,ev.length-1); if(n<10) continue;
    const {base,inc}=tcParse(g.tcs||'600'); const ck=i=>g.clocks&&g.clocks[i]?clkSec(g.clocks[i]):null;
    const loss=[]; const gl={me:[0,0],opp:[0,0]};
    for(let i=0;i<n;i++){
      const m=M[i], who=m.color===g.color?'me':'opp', X=S[who]; const {l,p0,p1}=_loss(g,M,i); loss[i]={l,p1};
      X.mv++; gl[who][0]+=l; gl[who][1]++; if(l>=20) X.bl++; if(m.san.includes('+')) X.chk++;
      if(m.piece==='p'&&i>=16){ const ek=_kFile(F[i],m.color==='w'?'k':'K'); if(Math.abs('abcdefgh'.indexOf(m.to[0])-ek)<=1){ const rr=+m.to[1]; if((m.color==='w'?rr:9-rr)>=4) X.push++; } }
      const bf=!!forcingMove(F[i],ev[i].b); const T=bf?X.tac:X.pos; T[0]++; T[1]+=l; if(l>=20) T[2]++;
      const ph=i<20?'o':_npcs(F[i])<=6?'e':'m'; X.ph[ph][0]++; X.ph[ph][1]+=l; if(l>=20) X.ph[ph][2]++;
      if(p0<35){ X.worse[0]++; X.worse[1]+=l; } else if(p0>65){ X.better[0]++; X.better[1]+=l; if(l>=20) X.better[2]++; }
      if(l>=10){ if(forcingMove(F[i+1],ev[i+1].b)) X.def++; else if(bf) X.off++; }
      const cu=ck(i), pr=i>=2?ck(i-2):base; if(cu!=null&&pr!=null){ X.t[0]+=Math.max(0,pr-cu+inc); X.t[1]++; }
      if(i+4<F.length){ const a=_bal(F[i],m.color), b=_bal(F[i+2],m.color), d=_bal(F[i+4],m.color); if(a-b>=2&&a-d>=2&&l<8) X.sac++; }
    }
    for(let i=0;i+1<n;i++){ if(loss[i].l>=20&&loss[i].p1<=40){ const Y=S[M[i+1].color===g.color?'me':'opp']; Y.pun[0]++; if(loss[i+1].l<10) Y.pun[1]++; }
      const X=S[M[i].color===g.color?'me':'opp']; const nx=[i+2,i+4,i+6].filter(j=>j<n); if(!nx.length) continue; const hit=nx.some(j=>loss[j].l>=20);
      X.cb[0]++; if(hit) X.cb[1]++; if(loss[i].l>=10){ X.ca[0]++; if(hit) X.ca[1]++; } }
    ['me','opp'].forEach(k=>{ if(gl[k][1]) S[k].accs.push(Math.max(0,Math.min(100,103.1668*Math.exp(-0.04354*gl[k][0]/gl[k][1])-3.1669))); });
    const w=myWp(g); if(Math.max(...w)>=80){ conv.me[0]++; if(g.res==='W') conv.me[1]++; else if(g.rr==='stalemate') stal++; } if(Math.min(...w)<=20){ conv.opp[0]++; if(g.res==='L') conv.opp[1]++; }
    const me=g.color==='w'?0:1; for(let i=(g.clocks||[]).length-1;i>=0;i--){ if(i%2===me&&g.clocks[i]){ endClk.push(clkSec(g.clocks[i])); break; } }
  }
  const r=(a,b)=>b?a/b:0; const f=X=>({mv:X.mv, acc:X.accs.reduce((a,b)=>a+b,0)/Math.max(1,X.accs.length), blG:X.bl/Math.max(1,L.length), chk:r(X.chk,X.mv), push:r(X.push,X.mv), sac:X.sac/Math.max(1,L.length),
    tacL:r(X.tac[1],X.tac[0]), tacB:r(X.tac[2],X.tac[0]), posL:r(X.pos[1],X.pos[0]), posB:r(X.pos[2],X.pos[0]),
    oL:r(X.ph.o[1],X.ph.o[0]), mL:r(X.ph.m[1],X.ph.m[0]), eL:r(X.ph.e[1],X.ph.e[0]), eB:r(X.ph.e[2],X.ph.e[0]),
    worseL:r(X.worse[1],X.worse[0]), betterL:r(X.better[1],X.better[0]), betterB:r(X.better[2],X.better[0]), t:r(X.t[0],X.t[1]),
    off:r(X.off,X.mv), def:r(X.def,X.mv), pun:r(X.pun[1],X.pun[0]), casc:r(r(X.ca[1],X.ca[0]),r(X.cb[1],X.cb[0])) });
  const me=f(S.me), op=f(S.opp);
  me.conv=r(conv.me[1],conv.me[0]); op.conv=r(conv.opp[1],conv.opp[0]); me.resi=1-op.conv; op.resi=1-me.conv;
  const ss=sessions(L); let a2=[]; ss.forEach(s=>{ let st=0; s.forEach(g=>{ if(st>=2) a2.push(g); if(g.res==='L') st++; else st=0; }); });
  const wr=x=>x.length?x.filter(g=>g.res==='W').length/x.length:null;
  const val={n:L.length, me, op, endClk:endClk.length?endClk.reduce((a,b)=>a+b,0)/endClk.length/60:null, stal, wrAfter2L:a2.length>=5?wr(a2):null, wrBase:wr(L), oppElo:Math.round(L.reduce((a,g)=>a+g.oppElo,0)/L.length)};
  _styleCache={key,val}; return val;
}

/* notes : 75 = niveau de tes adversaires dans les mêmes parties */
const _sc=x=>Math.max(40,Math.min(95,Math.round(75+30*(isFinite(x)?x:0))));
const _lowBetter=(me,op)=>op?(op-me)/op:0, _highBetter=(me,op)=>op?(me-op)/op:0, _avg=(...a)=>a.reduce((x,y)=>x+y,0)/a.length;
function styleCard(st){
  const M=st.me, O=st.op;
  const att={
    RYT:_sc(_lowBetter(M.t,O.t)),
    PRE:_sc(_lowBetter(M.oL,O.oL)),
    CON:_sc(_avg(_lowBetter(M.betterL,O.betterL),_lowBetter(M.betterB,O.betterB),_highBetter(M.conv,O.conv))),
    TAC:_sc(_avg(_lowBetter(M.tacL,O.tacL),_lowBetter(M.tacB,O.tacB))),
    DEF:_sc(_avg(_lowBetter(M.worseL,O.worseL),(M.resi-O.resi)/Math.max(0.05,O.resi))),
    MEN:_sc(_lowBetter(M.casc,O.casc)+(st.wrAfter2L!=null&&st.wrBase!=null?st.wrAfter2L-st.wrBase:0))
  };
  const sub={
    TATT:_sc(_lowBetter(M.off,O.off)), TDEF:_sc(_lowBetter(M.def,O.def)),
    POS:_sc(_avg(_lowBetter(M.posL,O.posL),_lowBetter(M.posB,O.posB))),
    ATQ:_sc(0.5*_avg(_highBetter(M.chk,O.chk),_highBetter(M.push,O.push))),
    FIN:_sc(_avg(_lowBetter(M.eL,O.eL),_lowBetter(M.eB,O.eB))),
    PEN:st.endClk==null?75:Math.max(40,Math.min(95,Math.round(75-(st.endClk-3)*5)))
  };
  const ovr=Math.round(_avg(...Object.values(att)));
  /* type de joueur (modèle Hansen) : positions calmes vs forcées, préparation, activité */
  const calmEdge=_lowBetter(M.posB,O.posB)-_lowBetter(M.tacB,O.tacB);
  const chkR=O.chk?M.chk/O.chk:1, sacR=O.sac?M.sac/O.sac:1;
  let type, code;
  if(calmEdge>0.15){ if(att.PRE>=78){ type='Théoricien'; code='THÉ'; } else { type='Réflecteur'; code='RÉF'; } }
  else if(calmEdge<-0.15){ if(sacR>=1.2||chkR>=1.3){ type='Activiste'; code='ACT'; } else { type='Pragmatique'; code='PRA'; } }
  else { type='Polyvalent'; code='POL'; }
  if((code==='THÉ'||code==='RÉF')&&chkR>=1.3) type+=' actif';
  if(code==='PRA'&&M.t>O.t*1.08) type+=' calculateur';
  /* traits */
  const good=[], bad=[];
  if(att.PRE>=80) good.push(['Préparé',`ouverture ${Math.round(100*_lowBetter(M.oL,O.oL))} % plus précise que tes pairs`]);
  if(chkR>=1.3) good.push(["Donneur d'échecs",`${Math.round(100*M.chk)} % de tes coups sont des échecs, ${Math.round(100*O.chk)} % chez tes pairs`]);
  if(M.pun>=O.pun+0.03) good.push(['Bourreau',`tu punis ${Math.round(100*M.pun)} % des gaffes adverses (${Math.round(100*O.pun)} %)`]);
  if(sub.TATT>=80) good.push(['Tacticien',`occasions ratées ${Math.round(100*_lowBetter(M.off,O.off))} % de moins que tes pairs`]);
  if(att.MEN>=80) good.push(['Sang-froid','tu ne t\'effondres pas après une erreur ou une défaite']);
  if(calmEdge<-0.15&&att.TAC>=80) good.push(['Calculateur','fort dans les positions forcées']);
  if(sub.TATT<=68) bad.push(['Coups forcés ratés',`${Math.round(100*(M.off/O.off-1))} % d'occasions ratées de plus que tes pairs`]);
  if(sub.TDEF<=68) bad.push(['Angle mort',`tu laisses ${Math.round(100*(M.def/O.def-1))} % de tactiques de plus`]);
  if(st.stal>=2) bad.push(['Relâchement',`${st.stal} pats en position gagnante`]);
  if(st.endClk!=null&&st.endClk>=5) bad.push(['Pendule dormante',`${st.endClk.toFixed(1)} min inutilisées en fin de partie`]);
  if(calmEdge>0.15&&att.TAC<=70) bad.push(['Mal à l\'aise dans le chaos',`${(100*M.tacB).toFixed(1)} % de gaffes en position forcée contre ${(100*O.tacB).toFixed(1)} %`]);
  if(calmEdge<-0.15&&sub.POS<=70) bad.push(['Calme = danger','plus de gaffes que tes pairs quand rien n\'est forcé']);
  if(att.DEF<=68) bad.push(['Défense fragile',`${Math.round(100*M.resi)} % de positions perdues sauvées (${Math.round(100*O.resi)} %)`]);
  if(att.CON<=68) bad.push(['Victoires qui filent',`${Math.round(100*M.conv)} % de conversion (${Math.round(100*O.conv)} %)`]);
  return {att,sub,ovr,type,code,good,bad};
}
function renderStyleCard(st){
  const c=styleCard(st); const cl=v=>v>=80?'hi':v<=68?'lo':'';
  const A=[['RYT','rythme',c.att.RYT],['TAC','tactique',c.att.TAC],['PRÉ','préparation',c.att.PRE],['DÉF','défense',c.att.DEF],['CON','conversion',c.att.CON],['MEN','mental',c.att.MEN]];
  const S=[['Attaque tactique',c.sub.TATT],['Défense tactique',c.sub.TDEF],['Positionnel',c.sub.POS],['Activité',c.sub.ATQ],['Finale',c.sub.FIN],['Pendule',c.sub.PEN]];
  return `<div class="pcard"><div class="pc-top"><div class="pc-ovr"><b>${c.ovr}</b><span>${c.code}</span><small>${P.settings.user||''}</small></div><div class="pc-id"><div class="pc-type">${c.type}</div><div class="pc-sub">${st.n} parties · 75 = tes adversaires (${st.oppElo})</div></div></div>
  <div class="pc-att">${A.map(([k,l,v])=>`<div><span>${k} <i>${l}</i></span><b class="${cl(v)}">${v}</b></div>`).join('')}</div>
  <div class="pc-subs">${S.map(([l,v])=>`<span>${l} <b class="${cl(v)}">${v}</b></span>`).join('')}</div>
  <div class="pc-traits">${c.good.map(([t,d])=>`<span class="tr good" title="${d}">${t}</span>`).join('')}${c.bad.map(([t,d])=>`<span class="tr bad" title="${d}">${t}</span>`).join('')}</div>
  ${c.good.length+c.bad.length?`<details class="help"><summary>Détail des traits</summary>${[...c.good,...c.bad].map(([t,d])=>`<div><b>${t}</b> : ${d}.</div>`).join('')}</details>`:''}</div>`;
}
function renderStyleTable(st){
  const M=st.me,O=st.op, p=x=>(100*x).toFixed(1)+' %', s=x=>x.toFixed(1)+' s';
  const rows=[['Précision',M.acc.toFixed(1),O.acc.toFixed(1)],['Gaffes par partie',M.blG.toFixed(2),O.blG.toFixed(2)],['Gaffes en position forcée',p(M.tacB),p(O.tacB)],['Gaffes en position calme',p(M.posB),p(O.posB)],
    ['Occasions ratées / 100 coups',(100*M.off).toFixed(2),(100*O.off).toFixed(2)],['Tactiques laissées / 100 coups',(100*M.def).toFixed(2),(100*O.def).toFixed(2)],['Échecs donnés',p(M.chk),p(O.chk)],
    ['Temps par coup',s(M.t),s(O.t)],['Conversion (≥ 80 %)',p(M.conv),p(O.conv)],['Résilience (≤ 20 %)',p(M.resi),p(O.resi)],['Gaffes punies',p(M.pun),p(O.pun)],['Risque de gaffe après une erreur','×'+M.casc.toFixed(1),'×'+O.casc.toFixed(1)]];
  return `<div class="stbl"><div class="sth"><span></span><span>Toi</span><span>Pairs</span></div>${rows.map(r=>`<div><span>${r[0]}</span><span>${r[1]}</span><span>${r[2]}</span></div>`).join('')}</div>`;
}

/* ---------- Coups forcés : tes occasions ratées (échec ou prise qui s'imposait) ---------- */
let _forcedCache={key:'',list:[]};
function forcedFaults(){
  const G=Object.values(P.games).filter(g=>g.ev&&!P.ignored[g.id]).sort((a,b)=>b.t-a.t);
  const key=G.map(g=>g.id).join(','); if(_forcedCache.key===key) return _forcedCache.list;
  const out=[];
  for(const g of G){ const {F,M}=_replay(g); const ev=g.ev; const n=Math.min(M.length,ev.length-1);
    for(let i=(g.color==='w'?0:1);i<n;i+=2){ const {l,p0,p1}=_loss(g,M,i); if(l<10) continue;
      const bm=forcingMove(F[i],ev[i].b); if(!bm) continue; if(forcingMove(F[i+1],ev[i+1].b)) continue;
      const bef={cp:ev[i].c,mate:ev[i].m,best:ev[i].b,pv:ev[i].p&&ev[i].p.length?ev[i].p:[ev[i].b]}, aft={cp:ev[i+1].c,mate:ev[i+1].m,best:ev[i+1].b,pv:ev[i+1].p&&ev[i+1].p.length?ev[i+1].p:[ev[i+1].b].filter(Boolean)};
      try{ const Fx=buildFault(g,i,F[i],M[i],bef,aft,p0,p1,M); Fx.theme=bm.san.includes('+')?'Échec à jouer':'Prise à jouer'; out.push({key:'F:'+Fx.id,F:Fx,src:'forced',loss:l}); }catch(e){}
    } }
  _forcedCache={key,list:out}; return out;
}
