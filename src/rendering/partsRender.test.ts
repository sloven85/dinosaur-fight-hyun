import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Fighter } from '../combat/Fighter';
import type { CharacterAssets } from './CharacterAssets';
import { renderFighter } from './FighterRenderer';
import type { PartMotionsData, PartRigData } from './partRig';
import type { RigData } from './rig';

const BASE = 'public/assets/characters/tyrannosaurus';
const json = <T,>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T;

/** drawImage에 넘어온 그림만 기록하는 가짜 2D 컨텍스트. */
function recordingContext(): { g: CanvasRenderingContext2D; drawn: unknown[] } {
  const drawn: unknown[] = [];
  const store: Record<string, unknown> = {
    drawImage: (image: unknown) => drawn.push(image),
  };
  const g = new Proxy(store, {
    get: (s, k) => (k in s ? s[k as string] : () => {}),
    set: (s, k, v) => ((s[k as string] = v), true),
  }) as unknown as CanvasRenderingContext2D;
  return { g, drawn };
}

function assets(): CharacterAssets {
  const rig = json<RigData>(`${BASE}/rig.json`);
  const partRig = json<PartRigData>(`${BASE}/parts/rig/rig.json`);
  const images = Object.fromEntries(partRig.drawOrder.map((n) => [n, { part: n, width: 1, height: 1 }]));
  return {
    id: 'tyrannosaurus',
    rig,
    master: { master: true, width: 2048, height: 1536 } as unknown as HTMLImageElement,
    portrait: null,
    poses: { heavy: { pose: 'heavy' } as unknown as HTMLImageElement, hit: { pose: 'hit' } as unknown as HTMLImageElement },
    parts: {
      rig: partRig,
      motions: json<PartMotionsData>(`${BASE}/parts/rig/attack_motions.json`),
      images: images as unknown as Record<string, HTMLImageElement>,
    },
  };
}

describe('파츠 리그 렌더링 통합', () => {
  it('공격 중에는 전용 포즈 PNG 대신 파츠 9장을 그린다(동작 한 벌만)', () => {
    const f = new Fighter(0, 'tyrannosaurus', 600, 1, assets());
    f.state = 'attack';
    f.attack = { move: f.moves.heavy, attackId: 1, frame: f.moves.heavy.startupFrames + 1, hitTargets: new Set() };
    const { g, drawn } = recordingContext();
    renderFighter(g, f, 900, 0);
    const parts = drawn.filter((d) => (d as { part?: string }).part);
    expect(parts).toHaveLength(9);
    expect(drawn.some((d) => (d as { pose?: string }).pose)).toBe(false);
    expect(drawn.some((d) => (d as { master?: boolean }).master)).toBe(false);
  });

  it('피격은 지금처럼 전용 포즈 PNG를 쓴다', () => {
    const f = new Fighter(0, 'tyrannosaurus', 600, 1, assets());
    f.state = 'hit';
    const { g, drawn } = recordingContext();
    renderFighter(g, f, 900, 0);
    expect(drawn).toEqual([{ pose: 'hit' }]);
  });

  it('파츠가 없는 종(11종)은 기존 한 장 그림 경로 그대로다', () => {
    const a = { ...assets(), parts: null };
    const f = new Fighter(0, 'tyrannosaurus', 600, 1, a);
    const { g, drawn } = recordingContext();
    renderFighter(g, f, 900, 0);
    expect(drawn).toHaveLength(1);
    expect((drawn[0] as { master?: boolean }).master).toBe(true);
  });

  it('스크립트 기술 중에는 스크립트의 파츠 각도로 파츠를 그린다', () => {
    const f = new Fighter(0, 'tyrannosaurus', 600, 1, assets());
    f.state = 'attack';
    f.attack = { move: f.moves.heavy, attackId: 1, frame: 12, hitTargets: new Set() };
    f.scriptVisual = { rot: 0.1, sx: 1.1, sy: 0.9, ghost: 1, sink: 0, parts: { head: -14, jaw: 24 }, overlays: [] };
    const { g, drawn } = recordingContext();
    renderFighter(g, f, 900, 0);
    // 본체 9파츠(잔상 착색은 DOM 캔버스가 필요해 헤드리스 크롬 캡처로 따로 확인).
    expect(drawn.filter((d) => (d as { part?: string }).part)).toHaveLength(9);
  });

  it('잡힘·넘어짐·기절 상태도 예외 없이 그린다', () => {
    for (const state of ['held', 'fallen', 'stun'] as const) {
      const f = new Fighter(0, 'tyrannosaurus', 600, 1, assets());
      f.state = state;
      const { g, drawn } = recordingContext();
      renderFighter(g, f, 900, 0);
      expect(drawn.length).toBeGreaterThan(0);
    }
  });
});

describe('맞는 쪽 자세(마스터 판정: 뒤집기 금지·버둥·다운 슬롯)', () => {
  /** 회전을 기록하는 가짜 컨텍스트. */
  function rotationContext() {
    const rotations: number[] = [];
    const drawn: unknown[] = [];
    const store: Record<string, unknown> = {
      rotate: (r: number) => rotations.push(r),
      drawImage: (image: unknown) => drawn.push(image),
    };
    const g = new Proxy(store, {
      get: (s, k) => (k in s ? s[k as string] : () => {}),
      set: (s, k, v) => ((s[k as string] = v), true),
    }) as unknown as CanvasRenderingContext2D;
    return { g, rotations, drawn };
  }

  it('띄워짐·잡힘·넘어짐·다운 어느 상태에서도 그림 회전이 ±15°를 넘지 않는다', () => {
    const limit = (15 * Math.PI) / 180 + 1e-9;
    for (const state of ['hit', 'held', 'fallen', 'down'] as const) {
      for (let frame = 0; frame < 60; frame += 3) {
        const f = new Fighter(0, 'tyrannosaurus', 600, 1, { ...assets(), poses: {} });
        f.state = state;
        f.airTumble = state === 'hit' ? frame + 1 : 0;
        f.fallenTotal = 60;
        f.fallenFrames = 60 - frame;
        f.heldRot = 0.6;
        const { g, rotations } = rotationContext();
        renderFighter(g, f, 900, frame / 60);
        for (const r of rotations) expect(Math.abs(r)).toBeLessThanOrEqual(limit);
      }
    }
  });

  it('파츠 종은 띄워짐·잡힘 때 파츠로 버둥댄다(전용 그림이 오기 전)', () => {
    for (const state of ['held', 'hit'] as const) {
      const f = new Fighter(0, 'tyrannosaurus', 600, 1, { ...assets(), poses: {} });
      f.state = state;
      f.airTumble = state === 'hit' ? 10 : 0;
      const { g, drawn } = rotationContext();
      renderFighter(g, f, 900, 0.3);
      expect(drawn.filter((d) => (d as { part?: string }).part)).toHaveLength(9);
    }
  });

  it("전용 '버둥'·'다운' 그림이 있으면 그 그림을 쓴다", () => {
    const base = assets();
    const rig = JSON.parse(JSON.stringify(base.rig)) as RigData;
    const entry = { imagePath: 'x.png', rootX: 1024, rootY: 1280, usable: true, box: null };
    rig.poses.airborne = entry;
    rig.poses.down = entry;
    const a = {
      ...base,
      rig,
      poses: { airborne: { pose: 'airborne' } as unknown as HTMLImageElement, down: { pose: 'down' } as unknown as HTMLImageElement },
    };
    const air = new Fighter(0, 'tyrannosaurus', 600, 1, a);
    air.state = 'held';
    let rec = rotationContext();
    renderFighter(rec.g, air, 900, 0);
    expect(rec.drawn).toContainEqual({ pose: 'airborne' });

    const down = new Fighter(0, 'tyrannosaurus', 600, 1, a);
    down.state = 'fallen';
    down.fallenTotal = 50;
    down.fallenFrames = 30;
    rec = rotationContext();
    renderFighter(rec.g, down, 900, 0);
    expect(rec.drawn).toContainEqual({ pose: 'down' });
  });
});
