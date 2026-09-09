/* ---------- progression (localStorage) + répétition espacée + export/import ---------- */
const KEY='drill_matt_v3';
const OLD_KEY='drill_matt_v2';
let P={br:{}, fault:{}, games:{}, gfaults:{}, ignored:{}, pref:{}, fixed:{}, settings:{user:'matt_chess00',depth:12,movetime:350}};
(function load(){
  try{
    let raw=localStorage.getItem(KEY);
    if(!raw){ raw=localStorage.getItem(OLD_KEY); }           // migration v2 → v3
    if(raw){ const o=JSON.parse(raw); P=Object.assign(P,o); P.br=P.br||{}; P.fault=P.fault||{}; P.games=P.games||{}; P.ignored=P.ignored||{}; P.gfaults=P.gfaults||{}; P.pref=P.pref||{}; P.fixed=P.fixed||{}; P.settings=Object.assign({user:'matt_chess00',depth:12,movetime:350},P.settings||{}); }
  }catch(e){}
})();
function save(){ try{ localStorage.setItem(KEY,JSON.stringify(P)); }catch(e){ console.warn('save failed',e); } }

function brState(id){ return P.br[id]||{clean:0,runs:0,last:0,due:0,ivl:0,ease:2.5,fails:0}; }
function isValid(id){ return brState(id).clean>=2; }
function isDue(id){ const s=brState(id); if(!isValid(id)) return false; return Date.now()>=(s.due||0); }
const daysAgo=t=>t?Math.floor((Date.now()-t)/864e5):999;
const daysUntil=t=>Math.max(0,Math.ceil((t-Date.now())/864e5));

/* SM-2 adapté : une branche = une carte. Qualité 5 si sans faute, 3 si 1 erreur, 0 sinon. */
function schedule(id, errs){
  const s=brState(id);
  s.runs=(s.runs||0)+1; s.last=Date.now();
  const q = errs===0?5 : errs===1?3 : 0;
  if(q===5){
    s.clean=(s.clean||0)+1;
    if(s.ivl===0) s.ivl=1; else if(s.ivl===1) s.ivl=3; else s.ivl=Math.round(s.ivl*s.ease);
    s.ease=Math.min(3, s.ease+0.1);
  } else if(q===3){                       // une seule erreur : on garde l'acquis, intervalle divisé par deux
    s.ivl=Math.max(1, Math.round(s.ivl*0.5)); s.ease=Math.max(1.3, s.ease-0.15);
  } else {
    s.clean=0; s.ivl=0; s.fails=(s.fails||0)+1; s.ease=Math.max(1.3,s.ease-0.2);
  }
  s.ivl=Math.min(s.ivl,60);
  s.due = s.ivl ? Date.now()+s.ivl*864e5 : Date.now();
  P.br[id]=s; save();
  return s;
}

/* poids d'une branche pour le tirage du drill : fautes récentes, déviations en partie, jamais vue */
function brWeight(id){
  const s=brState(id); let w=1;
  if(!s.runs) w+=2;
  if(!isValid(id)) w+=1.5;
  if(isDue(id)) w+=1.5;
  w += Math.min(3,(s.fails||0))*0.7;
  w += Math.min(4,(s.devs||0))*1.2;       // déviations détectées dans tes parties
  w += Math.min(4,(s.freq||0))*0.4;       // fréquence de la ligne dans tes parties
  if(s.prob!=null) w += Math.min(3, s.prob*20); // probabilité (Maia) de rencontrer la ligne
  return w;
}
function weightedPick(ids){
  const ws=ids.map(brWeight); const tot=ws.reduce((a,b)=>a+b,0); let r=Math.random()*tot;
  for(let i=0;i<ids.length;i++){ r-=ws[i]; if(r<=0) return ids[i]; }
  return ids[ids.length-1];
}

function sysPct(sy){ const n=sy.branches.length; const v=sy.branches.filter(b=>isValid(b.id)).length; const half=sy.branches.filter(b=>!isValid(b.id)&&brState(b.id).clean>=1).length; return Math.round(100*(v+0.5*half)/n); }
function blocPct(bl){ const all=bl.systemes.flatMap(s=>s.branches); const v=all.filter(b=>isValid(b.id)).length; return Math.round(100*v/all.length); }

/* export / import */
function exportProgress(){
  const blob=new Blob([JSON.stringify({v:3,exported:new Date().toISOString(),data:P},null,1)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=`drill-progress-${new Date().toISOString().slice(0,10)}.json`; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),2000);
}
function importProgress(file, cb){
  const r=new FileReader();
  r.onload=()=>{ try{
    const o=JSON.parse(r.result); const d=o.data||o;
    if(!d.br) throw new Error('format inconnu');
    // fusion : on garde la version la plus avancée par branche
    for(const id in d.br){ const a=P.br[id], b=d.br[id]; if(!a||(b.runs||0)>=(a.runs||0)) P.br[id]=b; }
    Object.assign(P.fault, d.fault||{}); Object.assign(P.games, d.games||{}); Object.assign(P.ignored, d.ignored||{}); Object.assign(P.gfaults, d.gfaults||{}); Object.assign(P.pref, d.pref||{}); Object.assign(P.fixed, d.fixed||{}); if(d.wood) P.wood=d.wood;
    P.settings=Object.assign(P.settings, d.settings||{});
    save(); cb(null, Object.keys(d.br).length);
  }catch(e){ cb(e); } };
  r.readAsText(file);
}
function resetProgress(){ P={br:{}, fault:{}, games:{}, gfaults:{}, ignored:{}, pref:{}, fixed:{}, settings:P.settings}; save(); }
