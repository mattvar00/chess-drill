/* Maia3 — Web Worker ONNX (adapté de CSSLab/maia-platform-frontend, GPL-3). Le modèle Maia3 est Apache-2.0. */
importScripts('ort.wasm.min.js');
ort.env.wasm.wasmPaths = self.location.href.replace(/[^/]*$/, '');
ort.env.wasm.numThreads = 1;                 // pas de COOP/COEP sur GitHub Pages → mono-thread

const DB='MaiaModels', STORE='models', KEY='maia3';
function openDB(){ return new Promise((res,rej)=>{ const r=indexedDB.open(DB,1); r.onerror=()=>rej(r.error); r.onsuccess=()=>res(r.result); r.onupgradeneeded=e=>{ const db=e.target.result; if(!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE,{keyPath:'id'}); }; }); }
async function getCached(url){ const db=await openDB(); const d=await new Promise((res,rej)=>{ const q=db.transaction([STORE],'readonly').objectStore(STORE).get(KEY); q.onsuccess=()=>res(q.result||null); q.onerror=()=>rej(q.error); }); if(!d) return null; return await d.data.arrayBuffer(); }
async function store(url,buf){ const db=await openDB(); await new Promise((res,rej)=>{ const q=db.transaction([STORE],'readwrite').objectStore(STORE).put({id:KEY,url,data:new Blob([buf]),ts:Date.now(),size:buf.byteLength}); q.onsuccess=()=>res(); q.onerror=()=>rej(q.error); }); }

let session=null;
self.onmessage=async e=>{
  const m=e.data;
  try{
    if(m.type==='init'){
      let buf=await getCached(m.url).catch(()=>null);
      if(!buf){
        postMessage({type:'status',status:'downloading'});
        const r=await fetch(m.url); if(!r.ok) throw new Error('modèle Maia : HTTP '+r.status);
        const total=+(r.headers.get('Content-Length')||0); const reader=r.body.getReader(); const chunks=[]; let got=0, last=0;
        while(true){ const {done,value}=await reader.read(); if(done) break; chunks.push(value); got+=value.length; if(total){ const p=Math.floor(100*got/total); if(p>=last+5){ postMessage({type:'progress',progress:p}); last=p; } } }
        const u=new Uint8Array(got); let o=0; for(const c of chunks){ u.set(c,o); o+=c.length; } buf=u.buffer;
        await store(m.url,buf).catch(()=>{});
      }
      postMessage({type:'status',status:'loading'});
      session=await ort.InferenceSession.create(buf);
      postMessage({type:'status',status:'ready'});
    } else if(m.type==='inference'){
      if(!session) throw new Error('Maia non initialisé');
      const n=m.batch;
      const feeds={ tokens:new ort.Tensor('float32',new Float32Array(m.tokens),[n,64,12]), elo_self:new ort.Tensor('float32',new Float32Array(m.eloSelf),[n]), elo_oppo:new ort.Tensor('float32',new Float32Array(m.eloOppo),[n]) };
      const r=await session.run(feeds);
      const lm=new Float32Array(r.logits_move.data), lv=new Float32Array(r.logits_value.data);
      postMessage({type:'result',id:m.id,lm:lm.buffer,lv:lv.buffer},[lm.buffer,lv.buffer]);
    }
  }catch(err){ postMessage({type:'error',id:m.id,message:err.message||String(err)}); }
};
