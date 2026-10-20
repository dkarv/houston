import { describe, expect, it } from 'vitest';
import { SessionStore } from '../src/sessions';

function clock(start = 0) {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

describe('SessionStore', () => {
  it('creates sessions with a six-digit code and a Houston token', () => {
    const store = new SessionStore();
    const session = store.create();
    expect(session.code).toMatch(/^\d{6}$/);
    expect(store.resolve(session.houstonToken)?.role).toBe('houston');
  });

  it('lets Apollo join once and releases the code', () => {
    const store = new SessionStore();
    const session = store.create();
    const joined = store.join(session.code);
    if (typeof joined === 'string') throw new Error(joined);
    expect(store.resolve(joined.token)?.role).toBe('apollo');
    expect(store.join(session.code)).toBe('not_found');
  });

  it('expires unjoined codes after the join window', () => {
    const time = clock();
    const store = new SessionStore({ joinWindowMs: 1000, now: time.now });
    const session = store.create();
    time.advance(1001);
    expect(store.join(session.code)).toBe('not_found');
    expect(store.prune()).toEqual([session.id]);
    expect(store.resolve(session.houstonToken)).toBeNull();
  });

  it('ends joined sessions after the maximum lifetime', () => {
    const time = clock();
    const store = new SessionStore({ joinWindowMs: 1000, maxLifetimeMs: 5000, now: time.now });
    const session = store.create();
    store.join(session.code);
    time.advance(2000);
    expect(store.prune()).toEqual([]);
    time.advance(4000);
    expect(store.resolve(session.houstonToken)).toBeNull();
    expect(store.prune()).toEqual([session.id]);
  });
});
