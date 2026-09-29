/* ---------- synchronisation entre appareils via un gist privé GitHub ---------- */
const SYNC_KEY='drill_sync', SYNC_FILE='chess-drill.json', SYNC_DESC='chess-drill-sync (ne pas supprimer)';
let SYNC=(()=>{ try{ return JSON.parse(localStorage.getItem(SYNC_KEY))||{}; }catch(e){ return {}; } })();
const syncSave=()=>{ try{ localStorage.setItem(SYNC_KEY,JSON.stringify(SYNC)); }catch(e){} };
const syncOn=()=>!!SYNC.token;
async function gh(path,opt={}){
  const r=await fetch('https://api.github.com'+path,Object.assign({},opt,{headers:Object.assign({'Authorization':'Bearer '+SYNC.token,'Accept':'application/vnd.github+json'},opt.body?{'Content-Type':'application/json'}:{})}));
  if(r.status===401||r.status===403) throw new Error('token refusé (il faut la permission Gists : Read and write)');
  if(!r.ok) throw new Error('GitHub '+r.status); return r.status===204?null:r.json();
}
function syncPayload(){ const d={br:P.br,fault:P.fault,games:P.games,gfaults:P.gfaults,ignored:P.ignored,pref:P.pref,fixed:P.fixed,wood:P.wood||[],maia:P.maia||null,
    settings:{user:P.settings.user,myElo:P.settings.myElo,oppElo:P.settings.oppElo,maiaElo:P.settings.maiaElo,dayLimit:P.settings.dayLimit}};
  return JSON.stringify({v:1,ts:Date.now(),data:d}); }
/* fusion : on ne perd jamais une analyse ni une progression */
function syncMerge(d){ if(!d) return 0; let n=0;
  for(const id in d.games||{}){ const a=P.games[id], b=d.games[id]; if(!a||(!a.ev&&b.ev)||(a.ev&&b.ev&&!a.st&&b.st)){ P.games[id]=b; n++; } }
  for(const id in d.br||{}){ const a=P.br[id], b=d.br[id]; if(!a||(b.last||0)>(a.last||0)){ P.br[id]=b; n++; } }
  for(const k in d.fault||{}){ const a=P.fault[k], b=d.fault[k]; if(!a||(b.done&&!a.done)){ P.fault[k]=b; n++; } }
  for(const k in d.gfaults||{}) if(!P.gfaults[k]){ P.gfaults[k]=d.gfaults[k]; n++; }
  ['ignored','pref','fixed'].forEach(f=>{ for(const k in d[f]||{}) if(P[f][k]===undefined){ P[f][k]=d[f][k]; n++; } });
  const seen=new Set((P.wood||[]).map(c=>c.date)); (d.wood||[]).forEach(c=>{ if(!seen.has(c.date)){ (P.wood=P.wood||[]).push(c); n++; } }); if(P.wood) P.wood.sort((a,b)=>a.date-b.date);
  if(d.maia&&(!P.maia||d.maia.ts>P.maia.ts)){ P.maia=d.maia; n++; }
  if(d.settings) for(const k in d.settings) if(d.settings[k]!=null&&P.settings[k]==null) P.settings[k]=d.settings[k];
  return n; }
async function syncFindGist(){ if(SYNC.gist) return SYNC.gist;
  for(let page=1;page<=3;page++){ const L=await gh(`/gists?per_page=100&page=${page}`); const g=L.find(x=>x.description===SYNC_DESC&&x.files[SYNC_FILE]); if(g){ SYNC.gist=g.id; syncSave(); return g.id; } if(L.length<100) break; }
  return null; }
async function syncPull(){ if(!syncOn()) return 0; const id=await syncFindGist(); if(!id) return 0;
  const g=await gh('/gists/'+id); const f=g.files[SYNC_FILE]; if(!f) return 0;
  const txt=f.truncated?await (await fetch(f.raw_url)).text():f.content; const o=JSON.parse(txt);
  _savingFromSync=true; const n=syncMerge(o.data); if(n){ recomputeBranchStats(); _origSave(); } _savingFromSync=false;
  SYNC.lastPull=Date.now(); syncSave(); return n; }
let _pushT=null, _pushing=false, _savingFromSync=false;
async function syncPush(){ if(!syncOn()||_pushing) return; _pushing=true; clearTimeout(_pushT);
  try{ await syncPull(); const body={description:SYNC_DESC,files:{[SYNC_FILE]:{content:syncPayload()}}};
    if(SYNC.gist) await gh('/gists/'+SYNC.gist,{method:'PATCH',body:JSON.stringify(body)});
    else { const g=await gh('/gists',{method:'POST',body:JSON.stringify(Object.assign(body,{public:false}))}); SYNC.gist=g.id; }
    SYNC.lastPush=Date.now(); SYNC.err=null; }catch(e){ SYNC.err=e.message; }
  syncSave(); _pushing=false; }
function syncSchedule(){ if(!syncOn()||_savingFromSync) return; clearTimeout(_pushT); _pushT=setTimeout(syncPush,15000); }
/* toute sauvegarde locale programme un envoi (regroupé toutes les 15 s) */
const _origSave=save; save=function(){ _origSave(); syncSchedule(); };
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='hidden'&&_pushT){ clearTimeout(_pushT); syncPush(); } });
window.addEventListener('load',async()=>{ if(!syncOn()) return; try{ const n=await syncPull(); if(n&&navTop()&&navTop().s!=='board') renderNav(); }catch(e){ SYNC.err=e.message; syncSave(); } });

function syncSection(){
  const on=syncOn(); const t=x=>x?new Date(x).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'jamais';
  return `<div class="intro"><b>Synchronisation ordi ↔ téléphone.</b> ${on?`Active. Dernier envoi ${t(SYNC.lastPush)}, dernière réception ${t(SYNC.lastPull)}.${SYNC.err?` <span class="warn">Erreur : ${SYNC.err}</span>`:''}`:`Tes données sont stockées dans un gist privé de ton compte GitHub. Crée un token sur <b>github.com/settings/personal-access-tokens/new</b> : expiration longue (1 an), <i>Repository access : Public repositories</i>, <i>Account permissions → Gists : Read and write</i>. Colle-le ici, puis fais pareil sur ton autre appareil avec le même token.`}</div>
  ${on?`<div class="sysbar"><button id="syNow">Synchroniser maintenant</button><button id="syOff" class="sec">Déconnecter</button></div>`:`<div class="fetch"><input id="syTok" placeholder="github_pat_…" autocapitalize="off" autocorrect="off"><button id="syOn" class="pri">Connecter</button></div>`}`;
}
function bindSync(h,rerender){
  const on=$('#syOn'); if(on) on.onclick=async()=>{ SYNC={token:$('#syTok').value.trim()}; syncSave(); $('#sMsg').textContent='Connexion…';
    try{ const n=await syncPull(); await syncPush(); rerender(); $('#sMsg').textContent=`Synchronisé${n?` · ${n} éléments récupérés`:''}.`; }catch(e){ SYNC={}; syncSave(); rerender(); $('#sMsg').textContent='Échec : '+e.message; } };
  const nw=$('#syNow'); if(nw) nw.onclick=async()=>{ $('#sMsg').textContent='Synchronisation…'; await syncPush(); rerender(); $('#sMsg').textContent=SYNC.err?'Erreur : '+SYNC.err:'Synchronisé.'; };
  const off=$('#syOff'); if(off) off.onclick=()=>{ if(confirm('Déconnecter la synchronisation sur cet appareil ? Tes données restent ici et dans le gist.')){ SYNC={}; syncSave(); rerender(); } };
}
