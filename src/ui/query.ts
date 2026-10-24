import { TRANSITION_MODES, type TransitionMode } from '../animation/config';

export interface QueryOptions {
  seed: number;
  /** Start this many seconds into the timeline (handy for sharing a moment). */
  at: number;
  paused: boolean;
  transition: TransitionMode;
  hud: boolean;
}

export const MAX_SEED = 2 ** 40;

function parseSeed(raw: string | null): number {
  if (raw === null || !/^\d+$/.test(raw.trim())) return 0;
  const n = Number(raw.trim());
  return Number.isSafeInteger(n) && n <= MAX_SEED ? n : 0;
}

/** Parse `?seed=n&at=s&paused=1&transition=hybrid&hud=0`; invalid values fall back to defaults. */
export function parseQuery(search: string): QueryOptions {
  const q = new URLSearchParams(search);
  const at = Number(q.get('at'));
  const transition = q.get('transition');
  const flag = (name: string, fallback: boolean) => {
    const v = q.get(name);
    if (v === null) return fallback;
    return v === '' || v === '1' || v === 'true';
  };
  return {
    seed: parseSeed(q.get('seed')),
    at: Number.isFinite(at) && at > 0 ? Math.min(at, 3600) : 0,
    paused: flag('paused', false),
    transition: (TRANSITION_MODES as readonly string[]).includes(transition ?? '')
      ? (transition as TransitionMode)
      : 'hybrid',
    hud: flag('hud', true),
  };
}

/** The same search string with `seed` replaced (other parameters are kept). */
export function withSeed(search: string, seed: number): string {
  const q = new URLSearchParams(search);
  q.set('seed', String(seed));
  q.delete('at');
  return `?${q.toString()}`;
}
