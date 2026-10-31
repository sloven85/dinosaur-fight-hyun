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
 * 안킬로 특수기 '철벽 반격' 재생 게이트 (게임 제작 마스터 8244623 — "f0~f3만 나오고 f4·f5가 빠진 채 서기로").
 *
 * 원인은 그림이 아니라 스크립트였다: 기술이 `frames:146` 을 선언했는데 97프레임에 `end` 사건이 있어
 * 클립 6장 중 f4·f5(98~146 구간)가 그려질 구간이 잘렸다. 함께 잘려 있던 후속타(109~116)는
 * 반격 성공 실행에서만 들어가도록 `onCounter` 로 잠갔다.
 *
 * 고정하는 사실:
 *  1. 헛휘두름(반격 실패)도 선언 프레임을 끝까지 돈다 → 클립 6장이 모두 그려진다.
 *  2. 헛휘두름 피해는 땅 강타 1회뿐 — 후속타·궤적·충격 연출은 반격 성공에서만 터진다.
 *  3. 반격 성공은 success(100)로 건너뛰고 후속타가 f109에 들어간다(기존 동작 불변).
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
  it('헛휘두름도 클립 6장을 끝까지 그린다', () => {
    const run = specialRun(false);
    // 선언한 146프레임을 실제로 돌았다(예전에는 f96에서 끝나 f4·f5가 잘렸다).
    expect(run.maxFrame).toBeGreaterThan(140);
    expect(run.framesDrawn).toEqual([22, 23, 24, 25, 26, 27]);
  });

  it('헛휘두름 피해는 땅 강타 1회(후속타 없음)', () => {
    const run = specialRun(false);
    expect(run.hitFrames).toHaveLength(1);
    expect(run.hitFrames[0]).toBeGreaterThanOrEqual(80);
    expect(run.hitFrames[0]).toBeLessThanOrEqual(84);
  });

  it('반격 성공은 후속타가 f109에 들어간다', () => {
    const run = specialRun(true);
    expect(run.hitFrames).toHaveLength(1);
    expect(run.hitFrames[0]).toBeGreaterThanOrEqual(109);
    expect(run.hitFrames[0]).toBeLessThanOrEqual(116);
    expect(run.damage).toBeGreaterThan(specialRun(false).damage);
  });
});
