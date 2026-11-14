/** Sons synthétisés (aucun fichier audio). */
import type { Move } from '../core/chess';
let ac: AudioContext | null = null; let enabled = true;
export const setSound = (on: boolean) => { enabled = on; };

/**
 * Jeux de sons pour les coups. « sfx », « piano » et « nes » : fichiers de Lichess (AGPLv3+, voir public/sound/LICENSE.md).
 * « bois » : synthèse maison. « perso » : tes propres fichiers, gardés sur cet appareil seulement.
 */
export const SOUND_SETS = [['sfx', 'Lichess, effets'], ['piano', 'Lichess, piano'], ['nes', 'Lichess, 8 bits'], ['bois', 'Bois (synthèse)'], ['perso', 'Tes fichiers']] as const;
export type SoundSet = typeof SOUND_SETS[number][0];
const PERSO = 'cd_sound_';
let set: SoundSet = 'sfx';
const bufs = new Map<string, AudioBuffer | null>();
/** Fichier perso (adresse « data: ») pour « Move » ou « Capture », ou vide. */
export const persoSound = (k: 'Move' | 'Capture') => { try { return localStorage.getItem(PERSO + k) || ''; } catch { return ''; } };
export function setPersoSound(k: 'Move' | 'Capture', dataUrl: string) { try { if (dataUrl) localStorage.setItem(PERSO + k, dataUrl); else localStorage.removeItem(PERSO + k); } catch { /* stockage plein ou bloqué */ } bufs.delete('perso' + k); preload(); }
export function setSoundSet(s: string) { set = (SOUND_SETS.some(x => x[0] === s) ? s : 'sfx') as SoundSet; preload(); }
function preload() {
  const a = ac; if (!a || set === 'bois') return;
  for (const k of ['Move', 'Capture', 'Check'] as const) {
    const id = set + k; if (bufs.has(id)) continue; bufs.set(id, null);
    const url = set === 'perso' ? (k === 'Check' ? persoSound('Move') : persoSound(k)) : `./sound/${set}/${k}.mp3`; if (!url) continue;
    fetch(url).then(r => r.arrayBuffer()).then(b => a.decodeAudioData(b)).then(d => { bufs.set(id, d); }).catch(() => { bufs.delete(id); });
  }
}
/** Joue un son du jeu choisi ; renvoie false s'il n'est pas (encore) chargé, pour se rabattre sur la synthèse. */
function sample(k: 'Move' | 'Capture' | 'Check', vol = 1): boolean {
  if (set === 'bois') return false; const a = enabled ? unlockAudio() : null; if (!a) return true;
  const b = bufs.get(set + k) ?? (k === 'Check' ? bufs.get(set + 'Move') : null); if (!b) { preload(); return false; }
  const src = a.createBufferSource(), g = a.createGain(); src.buffer = b; g.gain.value = vol; src.connect(g); g.connect(a.destination); src.start(); return true;
}
/** À appeler sur un geste de l'utilisateur : les navigateurs bloquent le son avant. */
export function unlockAudio(): AudioContext | null {
  if (!ac) { try { ac = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)(); } catch { return null; } }
  if (ac.state === 'suspended') void ac.resume();
  if (!bufs.size) preload();
  return ac;
}
function tone(f: number, dur: number, type: OscillatorType = 'triangle', vol = 0.18, delay = 0) {
  const a = enabled ? unlockAudio() : null; if (!a) return; const t = a.currentTime + delay; const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}
/**
 * Pièce posée sur un plateau : un « toc » de bois très court. Synthèse modale : quelques résonances (sinusoïdes)
 * qui s'éteignent en quelques millisecondes, plus une attaque de bruit d'une milliseconde. Pas de grave : l'énergie
 * reste entre 300 Hz et 1 kHz pour un coup, plus haut et un peu plus long pour une prise, comme sur les sites d'échecs.
 */
let click: AudioBuffer | null = null;
function tock(modes: readonly (readonly [number, number, number])[], vol = 0.5, delay = 0, attack = 0.25) {
  const a = enabled ? unlockAudio() : null; if (!a) return; const t = a.currentTime + delay;
  const out = a.createGain(); out.gain.value = vol; out.connect(a.destination);
  for (const [f, decay, g] of modes) {   // fréquence (Hz), extinction (s), poids
    const o = a.createOscillator(), og = a.createGain(); o.type = 'sine'; o.frequency.value = f;
    og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(g, t + 0.0015); og.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(og); og.connect(out); o.start(t); o.stop(t + decay + 0.01);
  }
  if (!click) { click = a.createBuffer(1, Math.floor(a.sampleRate * 0.004), a.sampleRate); const d = click.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2); }
  const n = a.createBufferSource(), hp = a.createBiquadFilter(), ng = a.createGain(); n.buffer = click; hp.type = 'bandpass'; hp.frequency.value = 2200; hp.Q.value = 0.8; ng.gain.value = attack;
  n.connect(hp); hp.connect(ng); ng.connect(out); n.start(t);
}
const MOVE = [[560, 0.022, 0.9], [830, 0.016, 0.6], [1240, 0.010, 0.35], [380, 0.018, 0.25]] as const;
const TAKE = [[1350, 0.045, 0.8], [1880, 0.035, 0.55], [2650, 0.025, 0.3], [900, 0.03, 0.35]] as const;
export const SFX = {
  move: () => { if (!sample('Move')) tock(MOVE, 1.5); },
  capture: () => { if (!sample('Capture')) { tock(TAKE, 0.65, 0, 0.4); tock(MOVE, 0.7, 0.012); } },
  check: () => { if (!sample('Check')) { tock(MOVE, 1.5); tone(988, 0.1, 'sine', 0.05, 0.03); } },
  castle: () => { if (!sample('Move')) { tock(MOVE, 1.4); tock(MOVE, 1.2, 0.09); } },
  bad: () => { tone(220, 0.14, 'triangle', 0.07); tone(196, 0.16, 'triangle', 0.06, 0.08); },
  done: () => [523, 659, 784].forEach((f, i) => tone(f, 0.16, 'sine', 0.07, i * 0.09)),
  forMove(m: Pick<Move, 'san' | 'flags' | 'captured'>) {
    if (m.san.includes('+') || m.san.includes('#')) SFX.check(); else if (m.flags.includes('k') || m.flags.includes('q')) SFX.castle(); else if (m.captured) SFX.capture(); else SFX.move();
  },
};
