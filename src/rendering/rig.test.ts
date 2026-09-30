import { describe, expect, it } from 'vitest';
import { spriteScale, type BoxData } from './rig';

function box(h: number): BoxData {
  return { minX: 0, minY: 0, maxX: 100, maxY: h, w: 100, h, cx: 50, feet: h, fill: 0.2 };
}

describe('원본 아트 배율(계획서 11절 슈퍼샘플)', () => {
  it('실루엣 높이를 캐릭터 화면 키로 나눈 배율을 돌려준다', () => {
    expect(spriteScale(322, box(864))).toBeCloseTo(0.3727, 3);
    expect(spriteScale(430, box(1150))).toBeCloseTo(0.3739, 3);
    expect(spriteScale(330, box(734))).toBeCloseTo(0.4496, 3);
  });

  it('실측값이 없으면 배율 1로 그린다', () => {
    expect(spriteScale(430, null)).toBe(1);
    expect(spriteScale(430, undefined)).toBe(1);
    expect(spriteScale(430, box(0))).toBe(1);
    expect(spriteScale(0, box(500))).toBe(1);
  });
});
