import { describe, expect, it } from 'vitest';
import { MAX_SEED, parseQuery, withSeed } from '../src/ui/query';

describe('URL query', () => {
  it('reads ?seed=n', () => {
    expect(parseQuery('?seed=42').seed).toBe(42);
    expect(parseQuery('').seed).toBe(0);
  });

  it('rejects invalid seeds', () => {
    for (const s of ['-3', '1.5', 'abc', '1e3', String(MAX_SEED + 1)]) {
      expect(parseQuery(`?seed=${s}`).seed).toBe(0);
    }
  });

  it('reads optional flags with safe fallbacks', () => {
    const q = parseQuery('?seed=7&at=12.5&paused=1&cycle=zoom&transition=crossfade&hud=0');
    expect(q).toEqual({
      seed: 7,
      at: 12.5,
      paused: true,
      cycle: 'zoom',
      transition: 'crossfade',
      hud: false,
    });
    const d = parseQuery('?transition=nope&at=-4&cycle=spin');
    expect(d.transition).toBe('hybrid');
    expect(d.cycle).toBe('chaos');
    expect(d.at).toBe(0);
    expect(d.hud).toBe(true);
  });

  it('withSeed replaces the seed and keeps other parameters', () => {
    expect(withSeed('?seed=1&transition=morph&at=3', 2)).toBe('?seed=2&transition=morph');
  });
});
