/* ---------- période globale + mise à jour en un bouton ---------- */
const PERIODS=[[7,'7 jours'],[30,'30 jours'],[90,'3 mois']];
function periodDays(){ return +(P.settings.period||P.settings.profDays||30); }
function inPeriod(g){ return g.t>=Date.now()/1000-periodDays()*86400; }
function filterBar(){
  const d=periodDays(), f=P.settings.tcFilter||'all';
  return `<div class="fbar"><div class="chips">${PERIODS.map(([k,l])=>`<button data-per="${k}" class="${d===k?'on':''}">${l}</button>`).join('')}</div><div class="chips">${Object.keys(TC_LABEL).map(k=>`<button data-tc="${k}" class="${f===k?'on':''}">${TC_LABEL[k]}</button>`).join('')}</div></div>`;
}
function bindFilterBar(h,rerender){
  h.querySelectorAll('.fbar button[data-per]').forEach(b=>b.onclick=()=>{ P.settings.period=+b.dataset.per; save(); rerender(); });
  h.querySelectorAll('.fbar button[data-tc]').forEach(b=>b.onclick=()=>{ P.settings.tcFilter=b.dataset.tc; save(); recomputeBranchStats(); rerender(); });
}
function monthsForPeriod(days){ const out=[]; const now=new Date(); const start=new Date(Date.now()-days*864e5); let d=new Date(now.getFullYear(),now.getMonth(),1);
  while(d>=new Date(start.getFullYear(),start.getMonth(),1)){ out.push([d.getFullYear(),d.getMonth()+1]); d=new Date(d.getFullYear(),d.getMonth()-1,1); } return out; }
function pendingAnalysis(){ return Object.values(P.games).filter(g=>!g.st&&!P.ignored[g.id]&&inPeriod(g)&&tcOk(g)).sort((a,b)=>b.t-a.t); }

/* état partagé : la mise à jour continue même si on change d'écran */
const UPD={running:false,phase:'',done:0,tot:0,msg:'',sub:''};
function updPaint(){ const box=document.getElementById('updBox'); if(box) box.outerHTML=updBox(); bindUpdBox(); }
function updBox(){
  const user=P.settings.user||''; const pend=pendingAnalysis().length; const last=P.settings.lastSync?new Date(P.settings.lastSync):null;
  if(UPD.running){ const pct=UPD.tot?Math.round(100*UPD.done/UPD.tot):0;
    return `<div id="updBox" class="updbox"><div class="prog2"><b style="width:${pct}%"></b><span>${UPD.msg}</span></div>${UPD.sub?`<div class="why">${UPD.sub}</div>`:''}<button id="updStop" class="sec">Arrêter</button></div>`; }
  return `<div id="updBox" class="updbox"><button id="updGo" class="pri big">${user?'Mettre à jour':'Choisis ton pseudo dans ⚙'}</button><div class="why">${UPD.msg||`${last?`Dernière mise à jour le ${last.toLocaleDateString('fr-FR')}`:'Jamais mis à jour'}${pend?` · ${pend} partie${pend>1?'s':''} à analyser`:''}`}. Récupère les parties de la période et les analyse toutes au moteur.</div></div>`;
}
function bindUpdBox(){ const g=document.getElementById('updGo'); if(g) g.onclick=()=>{ if(!P.settings.user){ go({s:'settings'}); return; } updateAll(); };
  const s=document.getElementById('updStop'); if(s) s.onclick=()=>{ UPD.stop=true; ENGINE.cancel=true; UPD.msg='Arrêt…'; updPaint(); }; }
async function updateAll(){
  if(UPD.running) return; Object.assign(UPD,{running:true,stop:false,done:0,tot:0,msg:'Récupération des parties…',sub:''}); updPaint();
  const user=P.settings.user; let added=0;
  try{
    for(const [y,m] of monthsForPeriod(periodDays())){ if(UPD.stop) break; UPD.msg=`chess.com · ${String(m).padStart(2,'0')}/${y}…`; updPaint();
      const games=await fetchMonth(user,y,m,n=>{ UPD.msg=`chess.com ne répond pas, nouvel essai (${n}/5)…`; updPaint(); }); added+=ingestGames(games,user); }
    P.settings.lastSync=Date.now(); save();
    const ids=pendingAnalysis().map(g=>g.id); UPD.tot=ids.length;
    if(ids.length&&!UPD.stop){ UPD.msg=`Chargement du moteur…`; updPaint(); const t0=Date.now();
      await analyseBatch(ids,(done,tot,i,np)=>{ UPD.done=done+(np?i/np:0); const el=(Date.now()-t0)/1000; const eta=UPD.done>0.3?Math.round(el/UPD.done*(tot-UPD.done)/60):null;
        UPD.msg=`Analyse ${Math.min(tot,done+1)}/${tot}`; UPD.sub=eta!=null?`environ ${eta<1?'moins d\'une':eta} minute${eta>1?'s':''} restante${eta>1?'s':''} · garde l'écran allumé`:'garde l\'écran allumé'; updPaint(); }); }
    const left=pendingAnalysis().length;
    UPD.msg=`${added} nouvelle${added>1?'s':''} partie${added>1?'s':''}${UPD.tot?` · ${UPD.tot-left} analysée${UPD.tot-left>1?'s':''}`:''}${left?` · ${left} restante${left>1?'s':''}`:''}`;
  }catch(e){ UPD.msg='Erreur : '+e.message; }
  UPD.running=false; UPD.sub=''; if(typeof syncPush==='function') syncPush();
  if(navTop()&&navTop().s!=='board') renderNav(); else updPaint();
}
