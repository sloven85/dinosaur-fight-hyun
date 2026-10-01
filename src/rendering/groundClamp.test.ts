import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Fighter } from '../combat/Fighter';
import type { RigData } from './rig';
import { keepAboveGround, silhouetteCorners } from './FighterRenderer';

/** 2D 변환만 흉내 내는 가짜 컨텍스트(a b c d e f, 캔버스 표준 순서). */
function matrixContext(init: [number, number, number, number, number, number]) {
  let m = { a: init[0], b: init[1], c: init[2], d: init[3], e: init[4], f: init[5] };
  return {
    getTransform: () => ({ ...m }),
    setTransform: (a: number, b: number, c: number, d: number, e: number, f: number) => {
      m = { a, b, c, d, e, f };
    },
    get m() {
      return m;
    },
  };
}

function tyranno(): Fighter {
  const rig = JSON.parse(readFileSync('public/assets/characters/tyrannosaurus/rig.json', 'utf8')) as RigData;
  return new Fighter(0, 'tyrannosaurus', 900, 1, { id: 'tyrannosaurus', rig, master: null, portrait: null, poses: {} });
}

/** 발(0,0) 기준 실루엣이 이 변환에서 가장 낮게 닿는 캔버스 y. */
function lowest(f: Fighter, m: { b: number; d: number; f: number }): number {
  return Math.max(...silhouetteCorners(f).map(([x, y]) => m.b * x + m.d * y + m.f));
}

describe('몸이 바닥 아래로 파고들지 않는다', () => {
  const groundY = 900;

  it('누운 각도(다운 -1.25rad)로 돌린 실루엣을 바닥선 위로 올린다', () => {
    const f = tyranno();
    const t = -1.25;
    // translate(x, ground) → rotate(t) → translate(-0.35h, 0)
    const h = f.data.displayHeight;
    const cos = Math.cos(t);
    const sin = Math.sin(t);
    const g = matrixContext([cos, sin, -sin, cos, 900 + cos * -0.35 * h, groundY + sin * -0.35 * h]);
    expect(lowest(f, g.m)).toBeGreaterThan(groundY + 100); // 보정 전에는 크게 파고든다

    keepAboveGround(g as unknown as CanvasRenderingContext2D, f, groundY);
    expect(lowest(f, g.m)).toBeLessThanOrEqual(groundY + 0.5);
  });

  it('서 있는 자세는 건드리지 않는다', () => {
    const f = tyranno();
    const g = matrixContext([1, 0, 0, 1, 900, groundY]);
    keepAboveGround(g as unknown as CanvasRenderingContext2D, f, groundY);
    expect(g.m.f).toBe(groundY);
  });

  it('구르는 중 모든 각도에서 바닥선 아래로 내려가지 않는다', () => {
    const f = tyranno();
    for (let deg = 0; deg <= 360; deg += 15) {
      const t = (-deg * Math.PI) / 180;
      const g = matrixContext([Math.cos(t), Math.sin(t), -Math.sin(t), Math.cos(t), 900, groundY]);
      keepAboveGround(g as unknown as CanvasRenderingContext2D, f, groundY);
      expect(lowest(f, g.m)).toBeLessThanOrEqual(groundY + 0.5);
    }
  });
});
