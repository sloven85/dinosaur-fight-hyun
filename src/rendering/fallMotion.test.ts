import { describe, expect, it } from 'vitest';
import { airborneTilt, fallPose, flailPartAngles, MAX_BODY_TILT } from './fallMotion';

describe('넘어짐 연출(그림 뒤집기 대신 단계 동작)', () => {
  const total = 45;
  const phases = Array.from({ length: total + 1 }, (_, f) => fallPose(f, total, -1.2, 400));

  it('쓰러짐 → 쿵 → 버둥 → 벌떡 순서로 이어진다', () => {
    const order = phases.map((p) => p.phase).filter((p, i, a) => i === 0 || a[i - 1] !== p);
    expect(order).toEqual(['topple', 'impact', 'flail', 'getup']);
  });

  it('그림 통째 회전은 어느 단계에서도 ±15°를 넘지 않는다(거꾸로 뒤집기 금지)', () => {
    for (const start of [-3, -1.2, 0, 2]) {
      for (let f = 0; f <= total; f++) {
        expect(Math.abs(fallPose(f, total, start, 400).rot)).toBeLessThanOrEqual(MAX_BODY_TILT + 1e-9);
      }
    }
  });

  it('끝나면 똑바로 서고, 프레임 사이에 튀지 않는다', () => {
    expect(Math.abs(phases[total].rot)).toBeLessThan(0.02);
    expect(phases[total].sy).toBeGreaterThan(0.95);
    for (let i = 1; i < phases.length; i++) {
      expect(Math.abs(phases[i].rot - phases[i - 1].rot)).toBeLessThan(0.15);
    }
  });

  it('띄워진 동안 기울기도 ±15° 안', () => {
    for (let f = 0; f < 120; f++) expect(Math.abs(airborneTilt(f))).toBeLessThanOrEqual(MAX_BODY_TILT + 1e-9);
  });

  it('바닥에 닿을 때 납작해지고 버둥댈 때 머리 위 별이 뜬다', () => {
    expect(Math.min(...phases.filter((p) => p.phase === 'impact').map((p) => p.sy))).toBeLessThan(0.6);
    expect(phases.filter((p) => p.phase === 'flail').every((p) => p.dizzy)).toBe(true);
  });

  it('다리끼리는 반대 박자로 허우적댄다', () => {
    const a = flailPartAngles(['nearleg', 'farleg', 'neararm', 'jaw'], 3, 1);
    expect(Math.sign(a.nearleg)).not.toBe(Math.sign(a.farleg));
    expect(a.jaw).toBeGreaterThan(0);
  });
});
