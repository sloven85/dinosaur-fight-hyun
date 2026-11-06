import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FIXED_DT, ROUND_INTRO_FRAMES } from '../core/constants';
import { Match } from './Match';
import { ScriptInput } from './ScriptInput';
import type { CharacterAssets } from '../rendering/CharacterAssets';
import type { RigData } from '../rendering/rig';
import { moveTotalFrames } from './types';
import { parseSpriteManifest, sampleFighter, SpriteClock, type SpriteManifest } from '../rendering/pixel/SpeciesSprite';

/**
 * 안킬로 특수기 '철벽 반격' 재생 게이트.
 *
 * 진단 이력: 첫 수정(8244623)은 `end@97` 을 지워 클립 6장을 살렸지만 **헛휘두름 경직이 97f→146f**
 * (1.62s→2.43s)로 늘었다. 마스터 판정(2026-11-01)은 "총 길이는 97f를 넘기지 말고 6장은 모두 보이게"다.
 *
 * 지금 계약:
 *  - 헛휘두름은 f96에서 끝난다(97프레임 = 기존 길이). 그림은 `clipSpans: [0,97]` 로 6장을 고르게 재생.
 *  - 접촉 프레임(80)·피해·사거리·게이트 표 값은 그대로다.
 *  - 반격 성공은 success(100)로 건너뛰고 후속타가 f109에 들어간다(기존 동작 불변).
 */
const ROOT = 'dev-art/species';

function manifestOf(folder: string): SpriteManifest {
  return parseSpriteManifest(JSON.parse(readFileSync(`${ROOT}/${folder}/manifest.json`, 'utf8')));
}

function assetsOf(id: string): CharacterAssets {
  const rig = JSON.parse(readFileSync(`public/assets/characters/${id}/rig.json`, 'utf8')) as RigData;
  return { id, rig, master: null, portrait: null, poses: {} };
}

interface Run {
  maxFrame: number;
  framesDrawn: number[];
  damage: number;
  hitFrames: number[];
}

function specialRun(counter: boolean): Run {
  const manifest = manifestOf('anky');
  const match = new Match('versus', ['ankylosaurus', 'tyrannosaurus'], [assetsOf('ankylosaurus'), assetsOf('tyrannosaurus')]);
  const idle = new ScriptInput();
  for (let i = 0; i < ROUND_INTRO_FRAMES; i++) match.step(idle, FIXED_DT);
  match.p1.x = 700;
  match.p2.x = 700 + (match.p1.bodyWidth + match.p2.bodyWidth) / 2;
  match.p1.meter = 100;

  const clock = new SpriteClock();
  const press = new ScriptInput();
  press.press(0, 'special');
  match.step(press, FIXED_DT);
  press.clearPressed();

  const framesDrawn = new Set<number>();
  const hitFrames: number[] = [];
  let maxFrame = -1;
  let health = match.p2.health;
  let countered = false;
  let damage = 0;

  for (let i = 0; i < 220; i++) {
    match.step(idle, FIXED_DT);
    if (counter && !countered && match.p1.attack) {
      match.p1.attack.frame = 20;
      countered = match.p1.tryCounter();
    }
    if (match.p2.health < health) {
      damage += health - match.p2.health;
      hitFrames.push(match.p1.attack ? match.p1.attack.frame : -1);
      health = match.p2.health;
    }
    if (!match.p1.attack) continue;
    maxFrame = Math.max(maxFrame, match.p1.attack.frame);
    clock.step(match.p1, false);
    framesDrawn.add(sampleFighter(manifest, match.p1, clock).frame);
  }

  const move = match.p1.moves.special;
  expect(move.script?.frames).toBe(146);
  expect(moveTotalFrames(move)).toBe(146);
  return { maxFrame, framesDrawn: [...framesDrawn].sort((a, b) => a - b), damage, hitFrames };
}

describe('안킬로 특수기 재생', () => {
  it('헛휘두름은 97프레임에서 끝나고 클립 전장을 모두 그린다', () => {
    const run = specialRun(false);
    // 기존 길이(97f)를 넘지 않는다: 마지막으로 돈 프레임이 96(0부터 셈).
    expect(run.maxFrame).toBe(96);
    // 2026-11-06 공격 시트 재제작으로 클립이 4→8칸이 됐다. 계약은 "클립 전장이 다 보인다"이므로
    // 인덱스를 하드코딩하지 않고 manifest의 클립 프레임과 직접 맞춘다.
    const manifest = manifestOf('anky');
    expect(run.framesDrawn).toEqual([...manifest.clips.special.frames].sort((a, b) => a - b));
  });

  it('헛휘두름 피해는 땅 강타 1회(후속타 없음)', () => {
    const run = specialRun(false);
    expect(run.hitFrames).toHaveLength(1);
    expect(run.hitFrames[0]).toBeGreaterThanOrEqual(80);
    expect(run.hitFrames[0]).toBeLessThanOrEqual(84);
    expect(run.damage).toBe(7);
  });

  it('반격 성공은 후속타가 f109에 들어간다', () => {
    const run = specialRun(true);
    expect(run.hitFrames).toHaveLength(1);
    expect(run.hitFrames[0]).toBeGreaterThanOrEqual(109);
    expect(run.hitFrames[0]).toBeLessThanOrEqual(116);
    expect(run.damage).toBeGreaterThan(specialRun(false).damage);
  });
});
