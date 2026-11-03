import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Fighter } from '../../combat/Fighter';
import type { FighterState } from '../../combat/types';
import { drawSpriteFrame, parseSpriteManifest, spriteStateFor, type SpriteAssets } from './SpeciesSprite';
import { SPRITE_STATES } from './SpeciesSprite';

/**
 * "전신 1프레임 완성 그림" 규칙의 회귀 방어(jk 확정 2026-10-29).
 *
 * 1) 그리기는 프레임 한 장을 통째로, 정수배로만 옮긴다 — 자르기·합치기·회전·리샘플 없음.
 * 2) 어떤 전투 상태도 "파츠 렌더러로 넘긴다"로 빠지지 않는다.
 * 3) 도트 렌더 모듈은 부위 조립 코드(partRig/parts)를 아예 참조하지 않는다.
 */

/** 그리기 호출을 그대로 기록하는 가짜 2D 컨텍스트. */
function recordingContext(): {
  g: CanvasRenderingContext2D;
  calls: { name: string; args: unknown[] }[];
  state: { imageSmoothingEnabled: boolean };
} {
  const calls: { name: string; args: unknown[] }[] = [];
  const state = { imageSmoothingEnabled: true };
  const methods = new Proxy({} as Record<string, unknown>, {
    get: (_t, key: string) => (...args: unknown[]) => {
      calls.push({ name: key, args });
      if (key === 'save' || key === 'restore') return undefined;
      return undefined;
    },
    set: (_t, key: string, value: unknown) => {
      if (key === 'imageSmoothingEnabled') state.imageSmoothingEnabled = value === true;
      return true;
    },
  });
  return { g: methods as unknown as CanvasRenderingContext2D, calls, state };
}

const MANIFEST = parseSpriteManifest({
  version: 1, character: 'tyrannosaurus', folder: 'trex', name: '티라노사우루스',
  image: 'sheet.png', facing: 'right', scale: 4, cell: [502, 304], footY: 298, anchorX: 251,
  frames: [
    { x: 32, y: 16, w: 160, h: 110, anchor: { x: 80, y: 108 }, source: 'a.png' },
    { x: 224, y: 16, w: 162, h: 112, anchor: { x: 81, y: 110 }, source: 'b.png' },
  ],
  clips: Object.fromEntries(SPRITE_STATES.map((state) => [state, {
    frames: [0, 1], ticks: [6, 6], artMs: [100, 100], loop: state === 'idle' || state === 'walk',
    art: 'x', artLabel: 'x',
  }])),
});

const ASSETS = { manifest: MANIFEST, image: { width: 1024, height: 304 } } as unknown as SpriteAssets;

describe('프레임은 자르거나 합치지 않고 통째로만 그린다', () => {
  it('전신 프레임 한 장을 원본 사각형 그대로, 정수배로 한 번만 그린다', () => {
    const { g, calls, state } = recordingContext();
    const frame = MANIFEST.frames[1];
    drawSpriteFrame(g, ASSETS, frame, 640, 900, 1, 4);

    const draws = calls.filter((c) => c.name === 'drawImage');
    expect(draws).toHaveLength(1);
    const [, sx, sy, sw, sh, dx, dy, dw, dh] = draws[0].args as number[];
    // 원본 사각형 = manifest의 프레임 사각형 그대로(잘라내지 않는다).
    expect([sx, sy, sw, sh]).toEqual([frame.x, frame.y, frame.w, frame.h]);
    // 목적 크기 = 프레임 크기 × 정수 배율. 늘리거나 줄여 맞추지 않는다.
    expect([dw, dh]).toEqual([frame.w * 4, frame.h * 4]);
    // 등록점은 고정 anchor뿐 — 프레임마다 다시 맞추지 않는다.
    expect([dx, dy]).toEqual([-frame.anchor.x * 4, -frame.anchor.y * 4]);
    expect(state.imageSmoothingEnabled).toBe(false);
  });

  it('이동량은 정수 배율 격자에 맞고, 회전·기울이기·리샘플이 없다', () => {
    const { g, calls } = recordingContext();
    drawSpriteFrame(g, ASSETS, MANIFEST.frames[0], 637.4, 899.6, -1, 4);

    const translate = calls.find((c) => c.name === 'translate');
    expect(translate).toBeDefined();
    const [tx, ty] = translate!.args as number[];
    expect(tx % 4).toBe(0);
    expect(ty % 4).toBe(0);

    // 좌우 반전만 허용: scale(±1, 1).
    const scale = calls.find((c) => c.name === 'scale');
    expect(scale).toBeDefined();
    const [sx, sy] = scale!.args as number[];
    expect(Math.abs(sx)).toBe(1);
    expect(sy).toBe(1);

    for (const banned of ['rotate', 'transform', 'setTransform', 'filter']) {
      expect(calls.some((c) => c.name === banned)).toBe(false);
    }
  });
});

describe('어떤 전투 상태도 파츠 렌더러로 넘기지 않는다', () => {
  const STATES: FighterState[] = ['idle', 'walk', 'crouch', 'jump', 'attack', 'hit', 'down',
    'victory', 'held', 'fallen', 'stun', 'guard'];

  it.each(STATES)('%s 상태에도 전신 클립이 정해진다', (state) => {
    const fighter = {
      state, onGround: true, health: 100, player: 0, facing: 1, x: 0, y: 0,
      attack: state === 'attack' ? { move: { kind: 'light' }, attackId: 1, frame: 0 } : undefined,
      data: { id: 'tyrannosaurus' },
    } as unknown as Fighter;
    expect(SPRITE_STATES).toContain(spriteStateFor(fighter));
  });

  it('기술 데이터가 아직 없는 공격 프레임도 전신 그림을 고른다', () => {
    const fighter = { state: 'attack', onGround: true, health: 100, player: 0, facing: 1, x: 0, y: 0,
      attack: undefined, data: { id: 'tyrannosaurus' } } as unknown as Fighter;
    expect(spriteStateFor(fighter)).toBe('light');
  });
});

describe('도트 렌더 모듈은 부위 조립 코드를 참조하지 않는다', () => {
  const dir = join(process.cwd(), 'src', 'rendering', 'pixel');
  // PixelReview는 "기존 부위 렌더러 vs 도트"를 나란히 보여 주는 비교 전용 화면이라 예외다.
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'PixelReview.ts');

  it.each(files)('%s', (file) => {
    const source = readFileSync(join(dir, file), 'utf8');
    for (const banned of [/from '\.\.\/partRig'/, /from '\.\.\/CharacterAssets'/, /\bdrawParts\(/, /\brenderFighter\(/, /assets\.parts/, /\.parts\b/]) {
      expect(source).not.toMatch(banned);
    }
  });
});
