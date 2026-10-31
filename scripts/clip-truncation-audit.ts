/**
 * 스크립트 `end` 사건이 자기 클립을 잘라먹는 기술 감사 — 종·기술별로
 * "선언 프레임 / 실제로 돈 마지막 프레임 / 그려진 클립 인덱스"를 잰다.
 *
 * 실행: npx vite-node scripts/clip-truncation-audit.ts
 */
import { readFileSync } from 'node:fs';
import { FIXED_DT, ROUND_INTRO_FRAMES } from '../src/core/constants';
import { Match } from '../src/combat/Match';
import { ScriptInput } from '../src/combat/ScriptInput';
import type { CharacterAssets } from '../src/rendering/CharacterAssets';
import type { RigData } from '../src/rendering/rig';
import { parseSpriteManifest, sampleFighter, SpriteClock, parseSpriteManifest as parse2 } from '../src/rendering/pixel/SpeciesSprite';
import { moveTotalFrames, type AttackKind } from '../src/combat/types';
import { readdirSync } from 'node:fs';

function assetsOf(id: string): CharacterAssets {
  const rig = JSON.parse(readFileSync(`public/assets/characters/${id}/rig.json`, 'utf8')) as RigData;
  return { id, rig, master: null, portrait: null, poses: {} };
}

const index = JSON.parse(readFileSync('dev-art/species/index.json', 'utf8')) as {
  species: Record<string, { character: string }>;
};
const folderOf = new Map(Object.entries(index.species).map(([f, e]) => [e.character, f]));

const moves = JSON.parse(readFileSync('src/data/moves.json', 'utf8')).moves as {
  id: string; kind: AttackKind; script?: { frames: number; events?: { type: string }[] };
}[];

for (const move of moves) {
  const events = move.script?.events ?? [];
  if (!events.some((e) => e.type === 'end')) continue;
  const species = move.id.split('_')[0];
  const folder = folderOf.get(species);
  if (!folder) continue;
  const manifest = parse2(JSON.parse(readFileSync(`dev-art/species/${folder}/manifest.json`, 'utf8')));
  const match = new Match('versus', [species, 'tyrannosaurus'], [assetsOf(species), assetsOf('tyrannosaurus')]);
  const idle = new ScriptInput();
  for (let i = 0; i < ROUND_INTRO_FRAMES; i++) match.step(idle, FIXED_DT);
  match.p1.x = 700;
  match.p2.x = 900;
  match.p1.meter = 100;
  const clock = new SpriteClock();
  const press = new ScriptInput();
  press.press(0, move.kind);
  match.step(press, FIXED_DT);
  press.clearPressed();
  const drawn = new Set<number>();
  let maxFrame = -1;
  for (let i = 0; i < 260; i++) {
    match.step(idle, FIXED_DT);
    if (!match.p1.attack) continue;
    maxFrame = Math.max(maxFrame, match.p1.attack.frame);
    clock.step(match.p1, false);
    drawn.add(sampleFighter(manifest, match.p1, clock).frame);
  }
  const state = move.kind === 'heavy' ? 'strong' : move.kind;
  const clip = manifest.clips[state as 'strong' | 'special' | 'light'];
  const idx = [...drawn].map((f) => clip.frames.indexOf(f)).filter((i) => i >= 0).sort((a, b) => a - b);
  console.log(
    `${move.id}: 선언 ${moveTotalFrames(move)}f · 실제 마지막 f${maxFrame} · 클립 ${idx.length}/${clip.frames.length}장 `
    + `(빠진 인덱스 ${clip.frames.map((_, i) => i).filter((i) => !idx.includes(i)).join(',') || '없음'})`,
  );
}
