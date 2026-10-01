import { describe, expect, it } from 'vitest';
import { EffectSystem } from './effects';

/** 재현 가능한 가짜 난수원. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

describe('타격 연출 (프롬프트 6)', () => {
  it('맞은 지점에 파티클이 생기고 수명이 끝나면 모두 사라진다', () => {
    const effects = new EffectSystem(seeded(1));
    effects.spawnHit(100, 200, { kind: 'light' });
    expect(effects.count).toBeGreaterThan(0);

    for (let i = 0; i < 120; i++) effects.update(1 / 60);
    expect(effects.count).toBe(0);
  });

  it('특수기는 충격파를 포함해 약공격보다 큰 연출을 만든다', () => {
    const light = new EffectSystem(seeded(2));
    light.spawnHit(0, 0, { kind: 'light' });
    const special = new EffectSystem(seeded(2));
    special.spawnHit(0, 0, { kind: 'special' });

    expect(special.count).toBeGreaterThan(light.count);
  });

  it('가드 연출도 파티클을 만들지만 피해 연출과 구분된다', () => {
    const guarded = new EffectSystem(seeded(3));
    guarded.spawnHit(0, 0, { guarded: true });
    expect(guarded.count).toBeGreaterThan(0);

    const hit = new EffectSystem(seeded(3));
    hit.spawnHit(0, 0, { kind: 'special' });
    expect(guarded.count).not.toBe(hit.count);
  });

  it('KO 별 연출을 따로 만들 수 있다', () => {
    const effects = new EffectSystem(seeded(4));
    effects.spawnStars(500, 300, 7);
    expect(effects.count).toBe(7);
  });

  it('연출은 체력·피해 상태를 갖지 않는다(전투에 영향 없음)', () => {
    const effects = new EffectSystem(seeded(5));
    effects.spawnHit(10, 20, { kind: 'heavy' });
    expect('health' in effects).toBe(false);
    expect('damage' in effects).toBe(false);
  });

  it('파티클이 상한을 넘지 않는다', () => {
    const effects = new EffectSystem(seeded(6));
    for (let i = 0; i < 200; i++) effects.spawnDust(0, 0, 10, 1);
    expect(effects.count).toBeLessThanOrEqual(420);
  });

  it('clear는 모든 연출을 지운다', () => {
    const effects = new EffectSystem(seeded(7));
    effects.spawnHit(0, 0, { kind: 'special' });
    effects.clear();
    expect(effects.count).toBe(0);
  });
});
