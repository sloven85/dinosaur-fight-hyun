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
});
