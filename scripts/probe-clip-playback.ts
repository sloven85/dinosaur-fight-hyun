/**
 * 클립 재생 구간(clipSpans) 확인용 계측기 — 안킬로 특수(헛휘두름/반격) · 트리케라 강(잡기 성공/헛방).
 *
 * 싣는 값: 실제로 돈 마지막 프레임 · 그려진 클립 인덱스 · 피해 · 피해가 들어간 프레임.
 * 실행: npx vite-node scripts/probe-clip-playback.ts
 */
import { readFileSync } from 'node:fs';
import { FIXED_DT, ROUND_INTRO_FRAMES } from '../src/core/constants';
import { Match } from '../src/combat/Match';
import { ScriptInput } from '../src/combat/ScriptInput';
import type { CharacterAssets } from '../src/rendering/CharacterAssets';
import type { RigData } from '../src/rendering/rig';
import { parseSpriteManifest, sampleFighter, SpriteClock } from '../src/rendering/pixel/SpeciesSprite';
import type { AttackKind } from '../src/combat/types';

function assetsOf(id: string): CharacterAssets {
  const rig = JSON.parse(readFileSync(`public/assets/characters/${id}/rig.json`, 'utf8')) as RigData;
  return { id, rig, master: null, portrait: null, poses: {} };
}

const index = JSON.parse(readFileSync('dev-art/species/index.json', 'utf8')) as {
  species: Record<string, { character: string }>;
};
const folderOf = new Map(Object.entries(index.species).map(([f, e]) => [e.character, f]));

function probe(species: string, kind: AttackKind, opts: { gap: number; counter?: boolean }) {
  const folder = folderOf.get(species)!;
  const manifest = parseSpriteManifest(JSON.parse(readFileSync(`dev-art/species/${folder}/manifest.json`, 'utf8')));
  const match = newMatch(species);
  match.p1.x = 700;
  match.p2.x = 700 + opts.gap;
  match.p1.meter = 100;
  const clock = new SpriteClock();
  const press = new ScriptInput();
  press.press(0, kind);
  match.step(press, FIXED_DT);
  press.clearPressed();
  const drawn = new Set<number>();
  const hitFrames: number[] = [];
  let health = match.p2.health;
  let damage = 0;
  let maxFrame = -1;
  let countered = false;
  for (let i = 0; i < 260; i++) {
    match.step(new ScriptInput(), FIXED_DT);
    if (opts.counter && !countered && match.p1.attack) {
      match.p1.attack.frame = 20;
      countered = match.p1.tryCounter();
    }
    if (match.p2.health < health) {
      damage += health - match.p2.health;
      hitFrames.push(match.p1.attack?.frame ?? -1);
      health = match.p2.health;
    }
    if (!match.p1.attack) continue;
    maxFrame = Math.max(maxFrame, match.p1.attack.frame);
    clock.step(match.p1, false);
    drawn.add(sampleFighter(manifest, match.p1, clock).frame);
  }
  const state = kind === 'heavy' ? 'strong' : kind === 'special' ? 'special' : 'light';
  const clip = manifest.clips[state];
  const idx = [...drawn].map((f) => clip.frames.indexOf(f)).filter((i) => i >= 0).sort((a, b) => a - b);
  console.log(
    `${species} ${kind}${opts.counter ? ' (반격 성공)' : ''}: 마지막 f${maxFrame} · 클립 ${idx.length}/${clip.frames.length}장 `
    + `(인덱스 ${idx.join(',')}) · 피해 ${damage} @f${hitFrames.join(',') || '-'}`,
  );
}

function newMatch(species: string): Match {
  const m = new Match('versus', [species, 'tyrannosaurus'], [assetsOf(species), assetsOf('tyrannosaurus')]);
  const idle = new ScriptInput();
  for (let i = 0; i < ROUND_INTRO_FRAMES; i++) m.step(idle, FIXED_DT);
  return m;
}

probe('ankylosaurus', 'special', { gap: 400 });
probe('ankylosaurus', 'special', { gap: 400, counter: true });
probe('triceratops', 'heavy', { gap: 150 });
probe('triceratops', 'heavy', { gap: 900 });
probe('triceratops', 'heavy', { gap: 1500 });
probe('tyrannosaurus', 'heavy', { gap: 200 });
