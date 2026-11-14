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
/**
 * Pièce posée sur un plateau en bois : un claquement très court (bruit filtré sur quelques résonances du bois)
 * et un petit choc grave. `pitch` décale les résonances (une prise sonne un peu plus sec).
 */
let noise: AudioBuffer | null = null;
function wood(vol = 0.5, delay = 0, pitch = 1) {
  const a = enabled ? unlockAudio() : null; if (!a) return; const t = a.currentTime + delay;
  if (!noise) { noise = a.createBuffer(1, Math.floor(a.sampleRate * 0.12), a.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const out = a.createGain(); out.gain.value = vol * 1.8; out.connect(a.destination);
  // claquement : le bruit passe par trois résonances étroites, chacune s'éteint vite
  const src = a.createBufferSource(); src.buffer = noise;
  const env = a.createGain(); env.gain.setValueAtTime(1, t); env.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  src.connect(env);
  for (const [f, q, g] of [[720, 9, 0.9], [1650, 12, 0.6], [3300, 14, 0.25]] as const) {
    const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * pitch; bp.Q.value = q;
    const gg = a.createGain(); gg.gain.value = g * 3; env.connect(bp); bp.connect(gg); gg.connect(out);
  }
  src.start(t); src.stop(t + 0.07);
  // choc : une note grave qui tombe en quelques millisecondes
  const o = a.createOscillator(), og = a.createGain(); o.type = 'sine';
  o.frequency.setValueAtTime(190 * pitch, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.06);
  og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.5, t + 0.003); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
  o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.1);
}
export const SFX = {
  move: () => wood(0.5),
  capture: () => { wood(0.6, 0, 1.15); wood(0.35, 0.045, 0.95); },
  check: () => { wood(0.55); tone(988, 0.1, 'sine', 0.05, 0.03); },
  castle: () => { wood(0.45); wood(0.45, 0.1, 1.05); },
  bad: () => { tone(220, 0.14, 'triangle', 0.07); tone(196, 0.16, 'triangle', 0.06, 0.08); },
  done: () => [523, 659, 784].forEach((f, i) => tone(f, 0.16, 'sine', 0.07, i * 0.09)),
  forMove(m: Pick<Move, 'san' | 'flags' | 'captured'>) {
    if (m.san.includes('+') || m.san.includes('#')) SFX.check(); else if (m.flags.includes('k') || m.flags.includes('q')) SFX.castle(); else if (m.captured) SFX.capture(); else SFX.move();
  },
};
