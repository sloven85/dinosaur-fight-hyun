/**
 * 안킬로 special 재생 재현/검증 — rAF 캔버스 없이 엔진 상태만으로
 * "기술이 선언한 프레임 중 어디까지 실제로 도는가"와 "그 구간에 그려지는 클립 인덱스"를 잰다.
 *
 * 실행: npx vite-node scripts/anky-special-repro.ts
 */
import { readFileSync } from 'node:fs';
import { FIXED_DT, ROUND_INTRO_FRAMES } from '../src/core/constants';
import { Match } from '../src/combat/Match';
import { ScriptInput } from '../src/combat/ScriptInput';
import type { CharacterAssets } from '../src/rendering/CharacterAssets';
import type { RigData } from '../src/rendering/rig';
import { parseSpriteManifest, sampleFighter, SpriteClock } from '../src/rendering/pixel/SpeciesSprite';
import { moveTotalFrames, type AttackKind } from '../src/combat/types';

function assetsOf(id: string): CharacterAssets {
  const rig = JSON.parse(readFileSync(`public/assets/characters/${id}/rig.json`, 'utf8')) as RigData;
  return { id, rig, master: null, portrait: null, poses: {} };
}

const manifest = parseSpriteManifest(JSON.parse(readFileSync('dev-art/species/anky/manifest.json', 'utf8')));

function run(kind: AttackKind, counter: boolean): void {
  const match = new Match('versus', ['ankylosaurus', 'tyrannosaurus'], [assetsOf('ankylosaurus'), assetsOf('tyrannosaurus')]);
  const idle = new ScriptInput();
  for (let i = 0; i < ROUND_INTRO_FRAMES; i++) match.step(idle, FIXED_DT);
  match.p1.x = 700;
  match.p2.x = 700 + (match.p1.bodyWidth + match.p2.bodyWidth) / 2;
  match.p1.meter = 100;

  const move = match.p1.moves[kind];
  const clock = new SpriteClock();
  const input = new ScriptInput();
  input.press(0, kind);
  match.step(input, FIXED_DT);
  input.clearPressed();

  const seen = new Set<number>();
  let maxFrame = -1;
  let health0p2 = match.p2.health;
  let health0p1 = match.p1.health;
  const hits: string[] = [];
  let countered = false;
  for (let i = 0; i < 220; i++) {
    match.step(idle, FIXED_DT);
    if (counter && !countered && match.p1.attack) {
      match.p1.attack.frame = 20;
      countered = match.p1.tryCounter();
    }
    if (match.p2.health < health0p2) {
      hits.push(`상대HP−${health0p2 - match.p2.health}@f${match.p1.attack ? match.p1.attack.frame : -1}`);
      health0p2 = match.p2.health;
    }
    if (match.p1.health < health0p1) health0p1 = match.p1.health;
    if (match.p1.attack) {
      maxFrame = Math.max(maxFrame, match.p1.attack.frame);
      clock.step(match.p1, false);
      seen.add(sampleFighter(manifest, match.p1, clock).frame);
    }
  }
  const clip = manifest.clips[kind === 'heavy' ? 'strong' : kind];
  console.log(
    `${kind}${counter ? ' (반격 성공)' : ' (빈 휘두름)'}: 선언 ${moveTotalFrames(move)}f · 실제 최대 f${maxFrame} · `
    + `그린 클립 인덱스 [${[...seen].sort((a, b) => a - b).join(',')}] ${seen.size}/${clip.frames.length}장 · 피해 ${hits.join(' ') || '없음'}`,
  );
}

run('special', false);
run('special', true);
