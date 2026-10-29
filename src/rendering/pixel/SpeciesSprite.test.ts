import { describe, expect, it } from 'vitest';
import {
  ART_CLIPS, SPRITE_STATES, STATE_LABELS, SpriteClock, clipTicks, parseSpriteManifest,
  sampleFighter, sampleSpriteClip, spriteStateFor,
} from './SpeciesSprite';
import type { Fighter } from '../../combat/Fighter';
import { getMove } from '../../data';

const contract = { version: 1, character: 'tyrannosaurus', folder: 'trex', name: '티라노사우루스',
  image: 'sheet.png', facing: 'right', scale: 4, cell: [502, 304], footY: 298, anchorX: 251 };

function clip(frames: number[], ticks: number[], loop: boolean, artMs = ticks.map(t => t * 1000 / 60)) {
  return { frames, ticks, artMs, loop, art: 'x', artLabel: 'x' };
}

/** 계약을 만족하는 최소 manifest. 프레임은 2개. */
function manifest() {
  const clips: Record<string, unknown> = {};
  for (const state of SPRITE_STATES) {
    const loop = state === 'idle' || state === 'walk';
    clips[state] = clip(loop ? [0, 1, 0, 1] : [0, 1], loop ? [6, 6, 6, 6] : [6, 6], loop);
  }
  return {
    ...contract,
    frames: [
      { x: 0, y: 0, w: 160, h: 110, anchor: { x: 80, y: 108 }, source: 'a.png' },
      { x: 160, y: 0, w: 162, h: 112, anchor: { x: 81, y: 110 }, source: 'b.png' },
    ],
    clips,
  };
}

function fighter(patch: Partial<Fighter>): Fighter {
  return { state: 'idle', onGround: true, health: 100, player: 0, facing: 1, x: 0, y: 0,
    attack: undefined, data: { id: 'tyrannosaurus' }, ...patch } as unknown as Fighter;
}

describe('도트 계약(셀 502×304 · 발 y=298 · 기준 x=251 · ×4)', () => {
  it('규격을 그대로 읽는다', () => {
    const m = parseSpriteManifest(manifest());
    expect(m.cell).toEqual([502, 304]);
    expect(m.footY).toBe(298);
    expect(m.anchorX).toBe(251);
  });

  it('캐릭터 배율은 캔버스 k에서 오고, manifest의 scale은 참고값이다', () => {
    expect(parseSpriteManifest({ ...manifest(), scale: 3 }).scale).toBe(3);
    expect(parseSpriteManifest({ ...manifest(), scale: 4 }).scale).toBe(4);
  });

  it.each([
    ['footY', 300], ['anchorX', 250], ['cell', [500, 304]],
  ])('계약과 다른 %s=%s는 재생하지 않는다', (key, value) => {
    const raw = { ...manifest(), [key]: value };
    expect(() => parseSpriteManifest(raw)).toThrow(/계약/);
  });

  it('10상태가 모두 있어야 한다', () => {
    const raw = manifest();
    delete (raw.clips as Record<string, unknown>).flail;
    expect(() => parseSpriteManifest(raw)).toThrow(/공중버둥/);
  });

  it('프레임/틱 길이가 다른 클립은 거부한다', () => {
    const raw = manifest();
    (raw.clips as Record<string, { ticks: number[] }>).idle.ticks = [6, 6, 6];
    expect(() => parseSpriteManifest(raw)).toThrow(/프레임\/지속시간/);
  });

  it('시트 밖을 가리키는 프레임은 거부한다', () => {
    const raw = manifest();
    (raw.clips as Record<string, { frames: number[] }>).idle.frames = [0, 2, 0, 1];
    expect(() => parseSpriteManifest(raw)).toThrow(/없는 프레임/);
  });
});

describe('상태 → 클립 매핑', () => {
  it('10상태가 아티스트 클립과 1:1로 붙는다', () => {
    expect(ART_CLIPS).toEqual({
      idle: 'idle', walk: 'walk', jump: 'jump', light: 'light_attack', strong: 'heavy_slam',
      special: 'special', hit: 'hit', flail: 'flail', down: 'down', victory: 'victory',
    });
    expect(SPRITE_STATES).toHaveLength(10);
    expect(Object.keys(STATE_LABELS).sort()).toEqual([...SPRITE_STATES].sort());
  });

  it('전투 상태가 계약대로 클립에 대응한다', () => {
    const light = { move: { kind: 'light' } } as unknown as Fighter['attack'];
    const heavy = { move: { kind: 'heavy' } } as unknown as Fighter['attack'];
    const special = { move: { kind: 'special' } } as unknown as Fighter['attack'];
    expect(spriteStateFor(fighter({ state: 'idle' }))).toBe('idle');
    expect(spriteStateFor(fighter({ state: 'crouch' }))).toBe('idle');
    expect(spriteStateFor(fighter({ state: 'guard' }))).toBe('idle');
    expect(spriteStateFor(fighter({ state: 'walk' }))).toBe('walk');
    expect(spriteStateFor(fighter({ state: 'jump', onGround: false }))).toBe('jump');
    expect(spriteStateFor(fighter({ state: 'jump', onGround: true }))).toBe('idle');
    expect(spriteStateFor(fighter({ state: 'attack', attack: light }))).toBe('light');
    expect(spriteStateFor(fighter({ state: 'attack', attack: heavy }))).toBe('strong');
    expect(spriteStateFor(fighter({ state: 'attack', attack: special }))).toBe('special');
    expect(spriteStateFor(fighter({ state: 'attack', attack: undefined }))).toBeNull();
    expect(spriteStateFor(fighter({ state: 'hit', onGround: true }))).toBe('hit');
    expect(spriteStateFor(fighter({ state: 'hit', onGround: false }))).toBe('flail');
    expect(spriteStateFor(fighter({ state: 'held' }))).toBe('flail');
    expect(spriteStateFor(fighter({ state: 'fallen' }))).toBe('flail');
    expect(spriteStateFor(fighter({ state: 'down' }))).toBe('down');
    expect(spriteStateFor(fighter({ state: 'victory' }))).toBe('victory');
  });
});

describe('재생', () => {
  it('반복 클립은 전체 길이로 되돌아간다', () => {
    const m = parseSpriteManifest(manifest());
    expect(sampleSpriteClip(m, 'idle', 0).step).toBe(0);
    expect(sampleSpriteClip(m, 'idle', 6).step).toBe(1);
    expect(sampleSpriteClip(m, 'idle', 12).step).toBe(2);
    expect(sampleSpriteClip(m, 'idle', 24).step).toBe(0);
  });

  it('일회 클립은 마지막 그림에서 멈춘다', () => {
    const m = parseSpriteManifest(manifest());
    expect(sampleSpriteClip(m, 'hit', 0).step).toBe(0);
    expect(sampleSpriteClip(m, 'hit', 6).step).toBe(1);
    expect(sampleSpriteClip(m, 'hit', 999).step).toBe(1);
  });

  it('공격 그림은 기술 프레임 수에 맞춰 늘어난다', () => {
    const m = parseSpriteManifest(manifest());
    // artMs [100, 100] → 10틱 안에 0 → 1
    expect(sampleSpriteClip(m, 'light', 0, 10).step).toBe(0);
    expect(sampleSpriteClip(m, 'light', 5, 10).step).toBe(1);
    expect(sampleSpriteClip(m, 'light', 9, 10).step).toBe(1);
  });

  it('실제 약공격 길이와 그림이 같은 틱에 시작·종료한다', () => {
    const m = parseSpriteManifest(manifest());
    const move = getMove('tyrannosaurus_light');
    const total = move.script?.frames ?? 30;
    expect(sampleSpriteClip(m, 'light', 0, total).step).toBe(0);
    expect(sampleSpriteClip(m, 'light', total - 1, total).step).toBe(1);
    expect(clipTicks(m.clips.light)).toBe(12);
  });

  it('시계는 상태가 바뀌면 처음부터, 피격은 HP가 줄면 다시 시작한다', () => {
    const clock = new SpriteClock();
    const walking = fighter({ state: 'walk' });
    clock.step(walking, false); clock.step(walking, false);
    expect(clock.read(walking).tick).toBe(1);
    const hit = fighter({ state: 'hit', health: 100 });
    clock.step(hit, false);
    expect(clock.read(hit).tick).toBe(0);
    clock.step(hit, false); clock.step(hit, false);
    expect(clock.read(hit).tick).toBe(2);
    // 같은 피격이 한 번 더 들어와 HP가 줄면 다시 0부터.
    clock.step(fighter({ state: 'hit', health: 90 }), false);
    expect(clock.read(fighter({ state: 'hit', health: 90 })).tick).toBe(0);
  });

  it('정지(hitstop) 동안은 시계가 멈춘다', () => {
    const clock = new SpriteClock();
    const f = fighter({ state: 'walk' });
    clock.step(f, false);
    clock.step(f, true);
    clock.step(f, true);
    expect(clock.read(f).tick).toBe(0);
  });

  it('sampleFighter는 공격 중 기술 프레임을 그대로 쓴다', () => {
    const m = parseSpriteManifest(manifest());
    const clock = new SpriteClock();
    const attacker = fighter({ state: 'attack', attack: { move: getMove('tyrannosaurus_light'), attackId: 1, frame: 15 } as Fighter['attack'] });
    clock.step(attacker, false);
    expect(sampleFighter(m, attacker, clock)?.step).toBe(1);
  });
});
