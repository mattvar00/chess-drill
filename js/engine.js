/* ---------- Moteur : Stockfish 18 lite (WASM, Web Worker) — notation des parties ---------- */
const ENGINE={w:null, ready:false, init:null, busy:false, cancel:false};
function engineInit(){
  if(ENGINE.init) return ENGINE.init;
  ENGINE.init=new Promise((res,rej)=>{
    try{ ENGINE.w=new Worker('js/engine/stockfish-18-lite-single.js'); }catch(e){ return rej(e); }
    const w=ENGINE.w; const t=setTimeout(()=>rej(new Error('moteur : délai dépassé')),60000);
    w.onerror=e=>rej(new Error('moteur : '+(e.message||'erreur de chargement')));
    w.onmessage=e=>{ const s=String(e.data);
      if(s==='uciok'){ w.postMessage('setoption name Hash value 32'); w.postMessage('isready'); }
      else if(s==='readyok'){ clearTimeout(t); ENGINE.ready=true; res(w); } };
    w.postMessage('uci');
  });
  return ENGINE.init;
}
/* évalue une position : renvoie {cp, mate, best, pv} du point de vue des Blancs */
function engineEval(fen, depth, movetime){
  return new Promise(res=>{
    const w=ENGINE.w; let last=null; const stm=fen.split(' ')[1];
    w.onmessage=e=>{ const s=String(e.data);
      if(s.startsWith('info ')&&s.includes(' score ')&&s.includes(' pv ')){
        const m=/ score (cp|mate) (-?\d+)/.exec(s); const pv=s.split(' pv ')[1].split(' ');
        let cp=null, mate=null; if(m[1]==='cp') cp=+m[2]; else mate=+m[2];
        if(stm==='b'){ if(cp!==null) cp=-cp; if(mate!==null) mate=-mate; }
        last={cp,mate,pv};
      } else if(s.startsWith('bestmove')){
        const best=s.split(' ')[1]; res({cp:last?last.cp:0, mate:last?last.mate:null, best:best==='(none)'?null:best, pv:last?last.pv.slice(0,6):[]});
      } };
    w.postMessage('position fen '+fen); w.postMessage(`go depth ${depth} movetime ${movetime}`);
  });
}

/* win% (formule Lichess) et perte */
const WP=(cp,mate)=>{ if(mate!==null&&mate!==undefined) return mate>0?100:0; const c=Math.max(-1500,Math.min(1500,cp)); return 50+50*(2/(1+Math.exp(-0.00368208*c))-1); };
function classify(loss){ return loss<2?'best':loss<5?'good':loss<10?'inacc':loss<20?'mistake':'blunder'; }
const CLASS_LABEL={best:'précis',good:'bon',inacc:'imprécision',mistake:'erreur',blunder:'gaffe'};

/* analyse d'une partie du cache : remplit g.ev (par position), g.st (stats) et extrait les fautes */
async function analyseGameEngine(g, onProgress){
  await engineInit();
  const depth=+(P.settings.depth||12), mt=+(P.settings.movetime||350);
  const c=new Chess(); const fens=[c.fen()], moves=[];
  for(const s of g.sans){ const m=c.move(s); if(!m) break; moves.push(m); fens.push(c.fen()); }
  const ev=[];
  for(let i=0;i<fens.length;i++){
    if(ENGINE.cancel) return false;
    const fen=fens[i]; const gameOver=(i===fens.length-1)&&(()=>{const t=new Chess(fen);return t.game_over();})();
    ev.push(gameOver?{cp:0,mate:null,best:null,pv:[],end:true}:await engineEval(fen,depth,mt));
    if(onProgress) onProgress(i+1,fens.length);
  }
  // notation de chaque coup
  const cls=[]; let lossSum=0, n=0; const cnt={blunder:0,mistake:0,inacc:0,good:0,best:0}; const faults=[];
  for(let i=0;i<moves.length;i++){
    const m=moves[i]; const mover=m.color; const before=ev[i], after=ev[i+1];
    const wb=WP(before.cp,before.mate), wa=WP(after.cp,after.mate);
    const wpB=mover==='w'?wb:100-wb, wpA=mover==='w'?wa:100-wa;      // du point de vue du joueur qui vient de jouer
    const uci=m.from+m.to+(m.promotion||'');
    let loss=Math.max(0,wpB-wpA); if(uci===before.best) loss=0;
    const k=classify(loss); cls.push(k);
    if(mover===g.color){ lossSum+=loss; n++; cnt[k]++;
      if(loss>=15 && before.best) faults.push(buildFault(g,i,fens[i],m,before,after,wpB,wpA,moves));
    }
  }
  const acc=n?Math.round(Math.max(0,Math.min(100,103.1668*Math.exp(-0.04354*(lossSum/n))-3.1669))):null;
  g.ev=ev.map(e=>({c:e.cp,m:e.mate,b:e.best,p:e.pv.slice(0,4)})); g.cls=cls;
  g.st={acc, loss:n?+(lossSum/n).toFixed(1):0, blunder:cnt.blunder, mistake:cnt.mistake, inacc:cnt.inacc, depth};
  P.gfaults[g.id]=faults.sort((a,b)=>(b.played.wp_before-b.played.wp_after)-(a.played.wp_before-a.played.wp_after)).slice(0,4);
  save(); return true;
}

/* construit une entrée "faute" compatible avec l'onglet Fautes */
function buildFault(g,i,fen,m,before,after,wpB,wpA,moves){
  const t=new Chess(fen); const bestM=t.move({from:before.best.slice(0,2),to:before.best.slice(2,4),promotion:before.best[4]});
  // suite (pv) en SAN
  let suite=''; if(bestM){ const afterBest=t.fen(); const pv=[]; const t2=new Chess(fen); for(const u of before.pv){ const mm=t2.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]}); if(!mm) break; pv.push(mm); } suite=sanLine(afterBest,pv.slice(1)); }
  t.undo();
  // réfutation : meilleure réponse adverse après le coup joué
  const t3=new Chess(fen); t3.move(m); let refut='', reply=null;
  if(after.best){ const pv=[]; const t4=new Chess(t3.fen()); for(const u of after.pv){ const mm=t4.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]}); if(!mm) break; pv.push(mm); } refut=sanLine(t3.fen(),pv); reply=pv[0]?pv[0].san:null; }
  // thème
  const oppReply=reply; let theme='Coup calme';
  if(bestM){
    if(bestM.san.includes('+')&&wpB-wpA>=15&&bestM.captured) theme='Capture gagnante ratée';
    else if(bestM.san.includes('+')||bestM.san.includes('#')) theme='Échec gagnant raté';
    else if(bestM.captured&&'nbrq'.includes(bestM.captured)) theme='Pièce à prendre';
    else if(bestM.captured) theme='Capture gagnante ratée';
  }
  if(oppReply){
    const r=new Chess(t3.fen()).move(oppReply);
    if(r&&r.captured){ if(r.to===m.to) theme='Pièce déposée en prise'; else if(isAttacked(fen,r.to,m.color==='w'?'b':'w')) theme='Pièce en prise oubliée'; else theme='Pièce mise en prise'; }
    else if(r&&(r.san.includes('+')||r.san.includes('#'))&&theme==='Coup calme') theme='Échec adverse ignoré';
  }
  const mat=material(fen,m.color); const nPieces=fen.split(' ')[0].replace(/[^nbrqNBRQ]/g,'').length;
  const phase=i<20?'ouverture':nPieces<=6?'finale':'milieu de partie';
  const score=e=>e.mate!==null&&e.mate!==undefined?(e.mate>0?'mat en '+e.mate:'mat en '+(-e.mate)+' contre toi'):((e.cp>=0?'+':'')+(e.cp/100).toFixed(1));
  const bestDesc=bestM?describe(bestM):'';
  return {id:`${g.id}:${i}`, fen, side:m.color, theme, opp:g.opp, date:new Date(g.t*1000).toISOString().slice(0,10).replace(/-/g,'.'), result:g.res, move_no:Math.floor(i/2)+1, phase, mat,
    best:{san:bestM?bestM.san:before.best, uci:before.best, score:score(m.color==='w'?before:{cp:-before.cp,mate:before.mate===null?null:-before.mate}), desc:bestDesc, suite, reply:suite?suite.split(' ')[0].replace(/^\d+\.+/,''):null},
    played:{san:m.san, uci:m.from+m.to+(m.promotion||''), score:score(m.color==='w'?after:{cp:-after.cp,mate:after.mate===null?null:-after.mate}), wp_before:+wpB.toFixed(1), wp_after:+wpA.toFixed(1), refut},
    second:null, opening:g.sans.slice(0,8).join(' '), game:g.id};
}
function isAttacked(fen, sq, byColor){
  // une case est attaquée si, le trait étant à byColor, un coup légal ou pseudo-légal y capture ; on triche : on place une dame adverse et on regarde
  const c=new Chess(fen); const parts=fen.split(' '); parts[1]=byColor; parts[3]='-'; const c2=new Chess(parts.join(' '));
  return c2.moves({verbose:true}).some(mv=>mv.to===sq&&mv.flags.includes('c'));
}
function material(fen,side){ const v={p:1,n:3,b:3,r:5,q:9}; let s=0; for(const ch of fen.split(' ')[0]){ const l=ch.toLowerCase(); if(v[l]) s+=(ch===ch.toUpperCase()?1:-1)*v[l]; } return side==='w'?s:-s; }
function sanLine(fen, moves){ const c=new Chess(fen); let out=[]; let n=parseInt(fen.split(' ')[5])||1; let w=fen.split(' ')[1]==='w';
  moves.forEach((m,i)=>{ if(w) out.push(n+'.'+m.san); else out.push((i===0?n+'...':'')+m.san); if(!w) n++; w=!w; }); return out.join(' '); }
const PIECE_FR={p:'pion',n:'cavalier',b:'fou',r:'tour',q:'dame',k:'roi'};
function describe(m){ const p=PIECE_FR[m.piece]; const art=p==='dame'||p==='tour'?'La ':'Le ';
  let s=art+p+(m.captured?` prend ${'nbrq'.includes(m.captured)?'un'+(m.captured==='q'?'e':'')+' '+PIECE_FR[m.captured]:'un pion'} en ${m.to}`:` va en ${m.to}`);
  if(m.san.includes('#')) s+=' : mat.'; else if(m.san.includes('+')) s+=' avec échec.'; else s+='.';
  return s; }

/* lot : analyse les N parties les plus récentes non analysées */
async function analyseBatch(ids, onProgress){
  ENGINE.cancel=false; ENGINE.busy=true; let done=0;
  try{ await engineInit(); }catch(e){ ENGINE.busy=false; throw e; }
  for(const id of ids){ const g=P.games[id]; if(!g||ENGINE.cancel) break;
    const ok=await analyseGameEngine(g,(i,n)=>onProgress&&onProgress(done,ids.length,i,n));
    if(!ok) break; done++; }
  ENGINE.busy=false; return done;
}
