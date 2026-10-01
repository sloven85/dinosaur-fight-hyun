import { describe, expect, it } from 'vitest';
import { fallPose, flailPartAngles } from './fallMotion';

describe('넘어짐 연출(그림 뒤집기 대신 단계 동작)', () => {
  const total = 45;
  const phases = Array.from({ length: total + 1 }, (_, f) => fallPose(f, total, -1.2, 400));

  it('쓰러짐 → 쿵 → 버둥 → 벌떡 순서로 이어진다', () => {
    const order = phases.map((p) => p.phase).filter((p, i, a) => i === 0 || a[i - 1] !== p);
    expect(order).toEqual(['topple', 'impact', 'flail', 'getup']);
  });

  it('공중에서 돌던 각도에서 이어서 넘어가고(튐 없음), 끝나면 똑바로 선다', () => {
    expect(phases[0].rot).toBeCloseTo(-1.2, 5);
    const end = phases[total].rot;
    expect(Math.abs(Math.cos(end) - 1)).toBeLessThan(0.02);
    for (let i = 1; i < phases.length; i++) {
      expect(Math.abs(phases[i].rot - phases[i - 1].rot)).toBeLessThan(0.75);
    }
  });

  it('바닥에 닿을 때 납작해지고 버둥댈 때 머리 위 별이 뜬다', () => {
    expect(Math.min(...phases.filter((p) => p.phase === 'impact').map((p) => p.sy))).toBeLessThan(0.85);
    expect(phases.filter((p) => p.phase === 'flail').every((p) => p.dizzy)).toBe(true);
  });

  it('다리끼리는 반대 박자로 허우적댄다', () => {
    const a = flailPartAngles(['nearleg', 'farleg', 'neararm', 'jaw'], 3, 1);
    expect(Math.sign(a.nearleg)).not.toBe(Math.sign(a.farleg));
    expect(a.jaw).toBeGreaterThan(0);
  });
});
