/** Sons synthétisés (aucun fichier audio). */
import type { Move } from '../core/chess';
let ac: AudioContext | null = null; let enabled = true;
export const setSound = (on: boolean) => { enabled = on; };
/** À appeler sur un geste de l'utilisateur : les navigateurs bloquent le son avant. */
export function unlockAudio(): AudioContext | null {
  if (!ac) { try { ac = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)(); } catch { return null; } }
  if (ac.state === 'suspended') void ac.resume();
  return ac;
}
function tone(f: number, dur: number, type: OscillatorType = 'triangle', vol = 0.18, delay = 0) {
  const a = enabled ? unlockAudio() : null; if (!a) return; const t = a.currentTime + delay; const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}
function knock(vol = 0.5, delay = 0) {
  const a = enabled ? unlockAudio() : null; if (!a) return; const t = a.currentTime + delay; const n = a.createBufferSource(); const b = a.createBuffer(1, a.sampleRate * 0.06, a.sampleRate); const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
  n.buffer = b; const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; const g = a.createGain(); g.gain.value = vol;
  n.connect(f); f.connect(g); g.connect(a.destination); n.start(t);
}
export const SFX = {
  move: () => knock(0.55),
  capture: () => { knock(0.8); knock(0.45, 0.05); },
  check: () => { knock(0.6); tone(880, 0.12, 'sine', 0.08, 0.02); },
  castle: () => { knock(0.5); knock(0.5, 0.09); },
  bad: () => tone(196, 0.18, 'square', 0.06),
  done: () => [523, 659, 784].forEach((f, i) => tone(f, 0.16, 'sine', 0.07, i * 0.09)),
  forMove(m: Pick<Move, 'san' | 'flags' | 'captured'>) {
    if (m.san.includes('+') || m.san.includes('#')) SFX.check(); else if (m.flags.includes('k') || m.flags.includes('q')) SFX.castle(); else if (m.captured) SFX.capture(); else SFX.move();
  },
};
