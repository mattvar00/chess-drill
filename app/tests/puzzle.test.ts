import { describe, expect, it } from 'vitest';
import { puzzleLine } from '../src/core/puzzle';

describe('puzzleLine', () => {
  it('s’arrête sur le mat', () => {
    // mat du couloir : Re8#
    const r = puzzleLine('6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1', 'w', ['Re8#']);
    expect(r).toEqual({ sans: ['Re8#'], gain: 0, mate: true });
  });
  it('joue la fourchette jusqu’à la prise de la dame', () => {
    // Cc7+ fourchette roi et dame, le roi bouge, Cxa8 prend la tour… ici la dame en a8
    const r = puzzleLine('q3k3/8/8/3N4/8/8/8/4K3 w - - 0 1', 'w', ['Nc7+', 'Kd7', 'Nxa8', 'Kc6']);
    expect(r.sans).toEqual(['Nc7+', 'Kd7', 'Nxa8']);
    expect(r.gain).toBe(9);
  });
  it('un coup calme se résout en un coup', () => {
    const r = puzzleLine('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', 'w', ['e4', 'Kd7', 'Kd2']);
    expect(r.sans).toEqual(['e4']);
  });
  it('ne s’arrête pas sur une prise qui est reprise', () => {
    // Txd5 cxd5 : échange, rien de gagné ; la ligne continue jusqu'au vrai gain
    const r = puzzleLine('3qk3/8/2p5/3n4/8/8/8/3RK3 w - - 0 1', 'w', ['Rxd5', 'cxd5']);
    expect(r.sans).toEqual(['Rxd5']);
    expect(r.gain).toBeLessThan(2);
  });
});
