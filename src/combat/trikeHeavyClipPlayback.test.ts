import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FIXED_DT, ROUND_INTRO_FRAMES } from '../core/constants';
import { Match } from './Match';
import { ScriptInput } from './ScriptInput';
import type { CharacterAssets } from '../rendering/CharacterAssets';
import type { RigData } from '../rendering/rig';
import { moveTotalFrames } from './types';
import { parseSpriteManifest, sampleFighter, SpriteClock, type SpriteManifest } from '../rendering/pixel/SpeciesSprite';
import { clipSpanAt } from './moveScript';

/**
 * 트리케라톱스 강공격 클립 게이트 (마스터 2026-11-01 "end@70도 같은 방식으로 3/4장을 4/4장으로").
 *
 * 기술은 `frames:104` 를 선언하지만 잡기 성공은 f30으로, 끝은 `end@70` 에서 난다. 예전에는
 * 재생기가 클립을 104프레임에 걸쳐 나눠 그려서 실제로 도는 30~70 구간에 4장 중 2장만 나왔다.
 * `clipSpans` 로 30~70 구간에 클립 한 사이클을 걸어 4장이 모두 나오게 했다 — 기술 길이는 그대로다.
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

function heavyRun(gap: number): Run {
  const manifest = manifestOf('trike');
  const match = new Match('versus', ['triceratops', 'tyrannosaurus'], [assetsOf('triceratops'), assetsOf('tyrannosaurus')]);
  const idle = new ScriptInput();
  for (let i = 0; i < ROUND_INTRO_FRAMES; i++) match.step(idle, FIXED_DT);
  match.p1.x = 700;
  match.p2.x = 700 + gap;

  const clock = new SpriteClock();
  const press = new ScriptInput();
  press.press(0, 'heavy');
  match.step(press, FIXED_DT);
  press.clearPressed();

  const framesDrawn = new Set<number>();
  const hitFrames: number[] = [];
  let maxFrame = -1;
  let health = match.p2.health;
  let damage = 0;

  for (let i = 0; i < 220; i++) {
    match.step(idle, FIXED_DT);
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

  return { maxFrame, framesDrawn: [...framesDrawn].sort((a, b) => a - b), damage, hitFrames };
}

describe('트리케라톱스 강공격 클립', () => {
  it('잡기 성공 경로가 클립 4장을 모두 그린다', () => {
    const run = heavyRun(150);
    const manifest = manifestOf('trike');
    expect(run.framesDrawn).toEqual([...manifest.clips.strong.frames].sort((a, b) => a - b));
  });

  it('기술 길이는 늘지 않는다(end@70, 마지막 프레임 69)', () => {
    const run = heavyRun(150);
    expect(run.maxFrame).toBe(69);
  });

  it('던지기 피해는 f52 한 번뿐이다', () => {
    const run = heavyRun(150);
    expect(run.hitFrames).toEqual([52]);
    expect(run.damage).toBeGreaterThan(0);
  });

  it('클립 구간은 잡기 점프·헛방 구간을 각각 덮는다', () => {
    const script = JSON.parse(readFileSync('src/data/moves.json', 'utf8')).moves
      .find((m: { id: string }) => m.id === 'triceratops_heavy').script;
    expect(moveTotalFrames({ script } as never)).toBe(104);
    expect(clipSpanAt(script, 29)).toBeNull(); // 점프 전은 기술 전체 길이 기준
    expect(clipSpanAt(script, 30)).toEqual({ from: 30, to: 70 });
    expect(clipSpanAt(script, 70)).toEqual({ from: 30, to: 70 });
    expect(clipSpanAt(script, 80)).toEqual({ from: 71, to: 104 });
  });
});
