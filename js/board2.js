/* ---------- Échiquier v2 : glisser-déposer, animation, sons ----------
   Remplace buildBoard / render / tap / flash d'app.js (mêmes noms, mêmes appels). */
(function(){
/* --- sons (synthétisés, aucun fichier) --- */
let AC=null; const audio=()=>{ if(!AC){ try{ AC=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} } if(AC&&AC.state==='suspended') AC.resume(); return AC; };
function tone(f,dur,type,vol,delay){ const a=audio(); if(!a) return; const t=a.currentTime+(delay||0); const o=a.createOscillator(), g=a.createGain();
  o.type=type||'triangle'; o.frequency.setValueAtTime(f,t); g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(vol||0.18,t+0.008); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  o.connect(g); g.connect(a.destination); o.start(t); o.stop(t+dur+0.02); }
function knock(vol,delay){ const a=audio(); if(!a) return; const t=a.currentTime+(delay||0); const n=a.createBufferSource(); const b=a.createBuffer(1,a.sampleRate*0.06,a.sampleRate); const d=b.getChannelData(0);
  for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,3); n.buffer=b; const f=a.createBiquadFilter(); f.type='lowpass'; f.frequency.value=900; const g=a.createGain(); g.gain.value=vol||0.5;
  n.connect(f); f.connect(g); g.connect(a.destination); n.start(t); }
window.SFX={
  move(){ if(P.settings.sound===false) return; knock(0.55); },
  capture(){ if(P.settings.sound===false) return; knock(0.8); knock(0.45,0.05); },
  check(){ if(P.settings.sound===false) return; knock(0.6); tone(880,0.12,'sine',0.08,0.02); },
  castle(){ if(P.settings.sound===false) return; knock(0.5); knock(0.5,0.09); },
  bad(){ if(P.settings.sound===false) return; tone(196,0.18,'square',0.06); },
  good(){ if(P.settings.sound===false) return; tone(660,0.09,'sine',0.07); tone(990,0.12,'sine',0.06,0.07); },
  done(){ if(P.settings.sound===false) return; [523,659,784].forEach((f,i)=>tone(f,0.16,'sine',0.07,i*0.09)); }
};
function soundFor(m){ if(!m||!m.san) return; if(m.san.includes('+')||m.san.includes('#')) SFX.check(); else if(m.flags&&(m.flags.includes('k')||m.flags.includes('q'))) SFX.castle(); else if(m.captured) SFX.capture(); else SFX.move(); }

/* --- plateau --- */
let lastAnimated=null, dropNoAnim=false, drag=null;
window.buildBoard=function(){
  boardEl.innerHTML='';
  const ranks=orient==='w'?[8,7,6,5,4,3,2,1]:[1,2,3,4,5,6,7,8];
  const files=orient==='w'?[0,1,2,3,4,5,6,7]:[7,6,5,4,3,2,1,0];
  for(const r of ranks) for(const f of files){
    const sq=FILES[f]+r; const d=document.createElement('div');
    d.className='sq '+(((f+r)%2===1)?'d':'l'); d.dataset.sq=sq;
    if(r===ranks[7]) d.insertAdjacentHTML('beforeend',`<span class="co f">${FILES[f]}</span>`);
    if(f===files[0]) d.insertAdjacentHTML('beforeend',`<span class="co r">${r}</span>`);
    d.addEventListener('pointerdown',ev=>onDown(ev,sq));
    boardEl.appendChild(d);
  }
  lastAnimated=lastMove?lastMove.from+lastMove.to+game.fen():null;
};
window.render=function(){
  document.querySelectorAll('#board .sq').forEach(el=>{
    const sq=el.dataset.sq; el.querySelectorAll('img').forEach(i=>i.remove());
    el.classList.remove('sel','dot','cap','last','hint','dragfrom');
    const p=game.get(sq); if(p){ const img=document.createElement('img'); img.src=PIECE(p); img.draggable=false; el.appendChild(img); }
    if(lastMove&&(sq===lastMove.from||sq===lastMove.to)) el.classList.add('last');
  });
  if(selected){ const s=sqEl(selected); if(s) s.classList.add('sel'); legal.forEach(m=>{ const t=sqEl(m.to); if(t) t.classList.add(m.captured?'cap':'dot'); }); }
  /* animation + son du dernier coup, une seule fois par coup */
  const key=lastMove?lastMove.from+lastMove.to+game.fen():null;
  if(key&&key!==lastAnimated){ lastAnimated=key;
    if(!dropNoAnim) animate(lastMove.from,lastMove.to);
    if(lastMove.flags&&(lastMove.flags.includes('k')||lastMove.flags.includes('q'))){ const r=lastMove.color==='w'?'1':'8'; const k=lastMove.flags.includes('k'); if(!dropNoAnim||true) animate((k?'h':'a')+r,(k?'f':'d')+r); }
    soundFor(lastMove); }
  dropNoAnim=false;
};
function animate(from,to){
  const a=sqEl(from), b=sqEl(to); if(!a||!b) return; const img=b.querySelector('img'); if(!img) return;
  const ra=a.getBoundingClientRect(), rb=b.getBoundingClientRect(); const dx=ra.left-rb.left, dy=ra.top-rb.top; if(!dx&&!dy) return;
  img.style.transition='none'; img.style.transform=`translate(${dx}px,${dy}px)`; img.style.zIndex=5; void img.offsetWidth;
  img.style.transition='transform 150ms ease-out'; img.style.transform='translate(0,0)';
  setTimeout(()=>{ img.style.zIndex=''; },170);
}
window.flash=function(sq,cls){ const el=sqEl(sq); if(!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); if(cls==='bad') SFX.bad(); };

const mover=()=>(cur&&cur.free)?game.turn():orient;
function canMove(){ if(cur&&cur.free) return !(locked||!game); return !(locked||!game||!cur||cur.mode==='explore'||game.turn()!==orient); }
function select(sq){ selected=sq; legal=game.moves({square:sq,verbose:true}); }
function tryMove(to){ const m=legal.find(x=>x.to===to); if(!m) return false;
  let mv=m; if(m.flags.includes('p')){ mv=legal.find(x=>x.to===to&&x.promotion==='q')||m; } /* promotion : dame par défaut */
  selected=null; legal=[]; onUserMove(mv); return true; }
window.tap=function(sq){
  if(!canMove()) return; const p=game.get(sq);
  if(selected&&selected!==sq&&tryMove(sq)) return;
  if(p&&p.color===mover()&&selected!==sq) select(sq); else { selected=null; legal=[]; }
  render();
};
function onDown(ev,sq){
  if(ev.pointerType==='mouse'&&ev.button!==0) return;
  audio();
  if(!canMove()) return;
  const p=game.get(sq);
  if(selected&&selected!==sq&&legal.some(x=>x.to===sq)){ ev.preventDefault(); tryMove(sq); return; }
  if(!p||p.color!==mover()){ selected=null; legal=[]; render(); return; }
  ev.preventDefault();
  const wasSel=selected===sq; select(sq); render();
  const el=sqEl(sq); const img=el.querySelector('img'); if(!img) return;
  const r=el.getBoundingClientRect();
  const ghost=img.cloneNode(); ghost.className='ghost'; ghost.style.width=r.width+'px'; ghost.style.height=r.height+'px';
  document.body.appendChild(ghost); img.style.opacity='0.35';
  drag={from:sq,ghost,img,w:r.width,moved:false,wasSel,x0:ev.clientX,y0:ev.clientY};
  place(ev.clientX,ev.clientY);
  window.addEventListener('pointermove',onMoveP,{passive:false}); window.addEventListener('pointerup',onUp); window.addEventListener('pointercancel',onCancel);
}
function place(x,y){ if(!drag) return; drag.ghost.style.left=(x-drag.w/2)+'px'; drag.ghost.style.top=(y-drag.w/2)+'px'; }
function sqAt(x,y){ const el=document.elementsFromPoint(x,y).find(e=>e.classList&&e.classList.contains('sq')&&e.closest('#board')); return el?el.dataset.sq:null; }
function onMoveP(ev){ if(!drag) return; ev.preventDefault(); if(Math.hypot(ev.clientX-drag.x0,ev.clientY-drag.y0)>6) drag.moved=true; place(ev.clientX,ev.clientY);
  document.querySelectorAll('#board .sq.hover').forEach(e=>e.classList.remove('hover')); const s=sqAt(ev.clientX,ev.clientY); if(s&&legal.some(m=>m.to===s)) sqEl(s).classList.add('hover'); }
function end(){ window.removeEventListener('pointermove',onMoveP); window.removeEventListener('pointerup',onUp); window.removeEventListener('pointercancel',onCancel);
  if(drag){ drag.ghost.remove(); drag.img.style.opacity=''; } document.querySelectorAll('#board .sq.hover').forEach(e=>e.classList.remove('hover')); }
function onUp(ev){ const d=drag; end(); drag=null; if(!d) return;
  const to=sqAt(ev.clientX,ev.clientY);
  if(to&&to!==d.from&&legal.some(m=>m.to===to)){ dropNoAnim=true; tryMove(to); return; }
  if(to===d.from&&!d.moved&&d.wasSel){ selected=null; legal=[]; }
  render(); }
function onCancel(){ end(); drag=null; render(); }
})();
