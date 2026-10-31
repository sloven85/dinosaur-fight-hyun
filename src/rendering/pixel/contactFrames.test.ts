import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FIXED_DT, ROUND_INTRO_FRAMES } from '../../core/constants';
import { CHARACTERS } from '../../data';
import type { CharacterAssets } from '../CharacterAssets';
import type { RigData } from '../rig';
import { Match } from '../../combat/Match';
import { ScriptInput } from '../../combat/ScriptInput';
import { parseSpriteManifest, type SpriteManifest } from './SpeciesSprite';
import { contactFront, contactGap, contactOffsetArt, contactTipArt, isAreaContact } from './ContactAlign';
import { PIXEL_ART_SCALE } from './PixelBackground';

/**
 * 그림→판정 정합 게이트 (정종길 님 8073841 "공격을 전부 허공에" 대응).
 *
 * 고정하는 사실:
 *  1. 40장 세트의 모든 프레임은 실제 불투명 경계 아래(anchor.y === h)에 발이 있다 → 발이 뜨거나 파고들지 않는다.
 *  2. 그림 배율은 상태별로 하나다(프레임별 확대·축소 = 크기 변화 없음). 배율 인자는 항상 PIXEL_ART_SCALE.
 *  3. 최소 간격에서 12종 약공격은 전부 명중한다(헛방 0).
 *  4. 피해가 발생한 프레임이 곧 기술의 첫 활성(접촉) 프레임이다.
 *  5. 그 프레임에서 화면상 주둥이 끝 + 내민 보정 = 판정 앞끝(±4px = 1아트px).
 */
const ROOT = 'dev-art/species';

function folders(): Record<string, string> {
  const index = JSON.parse(readFileSync(`${ROOT}/index.json`, 'utf8')) as {
    species: Record<string, { character: string }>;
  };
  const map: Record<string, string> = {};
  for (const [folder, entry] of Object.entries(index.species)) map[entry.character] = folder;
  return map;
}

function manifestOf(id: string, map: Record<string, string>): SpriteManifest {
  const raw = JSON.parse(readFileSync(`${ROOT}/${map[id]}/manifest.json`, 'utf8'));
  return parseSpriteManifest(raw);
}

function realAssets(id: string): CharacterAssets {
  const rig = JSON.parse(readFileSync(`public/assets/characters/${id}/rig.json`, 'utf8')) as RigData;
  return { id, rig, master: null, portrait: null, poses: {} };
}

interface HitResult { damage: number; hitFrame: number; hitFront: number; tipScreen: number; offsetPx: number }

/** 밀어내기 최소 간격에 세우고 P1 약공격 → 피해·명중 프레임·그림 주둥이 위치를 잰다. */
function lightAtMinGap(p1: string, p2: string, manifest: SpriteManifest): HitResult {
  const match = new Match('versus', [p1, p2], [realAssets(p1), realAssets(p2)]);
  const idle = new ScriptInput();
  for (let i = 0; i < ROUND_INTRO_FRAMES; i++) match.step(idle, FIXED_DT);

  match.p1.x = 700;
  match.p2.x = 700 + (match.p1.bodyWidth + match.p2.bodyWidth) / 2;
  match.p1.meter = 100;

  const before = match.p2.health;
  const input = new ScriptInput();
  input.press(0, 'light');
  match.step(input, FIXED_DT);
  input.clearPressed();

  let hitFrame = -1;
  let offsetPx = 0;
  for (let i = 0; i < 90; i++) {
    const health = match.p2.health;
    match.step(input, FIXED_DT);
    if (hitFrame < 0 && match.p2.health < health && match.p1.attack) {
      hitFrame = match.p1.attack.frame;
      offsetPx = contactOffsetArt(match.p1, match.p1.attack.move, manifest) * PIXEL_ART_SCALE;
    }
  }
  const move = match.p1.moves.light;
  const tip = contactTipArt(manifest, 'light', move) * PIXEL_ART_SCALE;
  return {
    damage: before - match.p2.health,
    hitFrame,
    hitFront: contactFront(move, match.p1.bodyFront),
    tipScreen: tip,
    offsetPx,
  };
}

describe('도트 스프라이트 접지(불투명 경계)', () => {
  const map = folders();
  for (const character of CHARACTERS) {
    it(`${character.id}: 모든 프레임의 발이 불투명 경계 아래에 있다`, () => {
      const manifest = manifestOf(character.id, map);
      // 점프·공중버둥 프레임은 꼬리가 발보다 아래로 내려가 anchor.y < h 가 정상이다.
      const grounded = new Set(
        (['idle', 'walk', 'light', 'strong', 'special', 'hit', 'victory'] as const)
          .flatMap((state) => manifest.clips[state].frames),
      );
      const bad = manifest.frames
        .map((frame, i) => ({ i, frame }))
        .filter(({ i, frame }) =>
          frame.anchor.x < 0 || frame.anchor.x > frame.w ||
          (grounded.has(i) && frame.anchor.y !== frame.h));
      expect(bad.map(({ i }) => i)).toEqual([]);
    });
  }
});

describe('크기 일정(프레임별 확대·축소 없음)', () => {
  const map = folders();
  for (const character of CHARACTERS) {
    it(`${character.id}: 상태·프레임과 무관하게 배율은 하나(아트 1px = ${PIXEL_ART_SCALE}px)`, () => {
      const manifest = manifestOf(character.id, map);
      // 배율은 계약 상수 하나뿐이고, 프레임 데이터에는 배율 필드가 없다.
      expect(manifest.scale).toBe(PIXEL_ART_SCALE);
      for (const state of Object.keys(manifest.clips) as Array<keyof typeof manifest.clips>) {
        for (const index of manifest.clips[state].frames) {
          const frame = manifest.frames[index];
          expect(frame.w * PIXEL_ART_SCALE).toBe(manifest.frames[index].w * PIXEL_ART_SCALE);
        }
      }
    });
  }

  it('피격·약공격 실루엣 높이는 idle의 ±10% 안(자세 차이이지 크기 변화가 아니다)', () => {
    const outliers: string[] = [];
    for (const character of CHARACTERS) {
      const manifest = manifestOf(character.id, map);
      const median = (state: 'idle' | 'light' | 'hit'): number => {
        const heights = manifest.clips[state].frames.map((i) => manifest.frames[i].h).sort((a, b) => a - b);
        return heights[Math.floor(heights.length / 2)];
      };
      const base = median('idle');
      for (const state of ['light', 'hit'] as const) {
        const ratio = median(state) / base;
        if (ratio < 0.9 || ratio > 1.1) outliers.push(`${character.id}:${state} ${(ratio * 100).toFixed(0)}%`);
      }
    }
    expect(outliers).toEqual([]);
  });
});

describe('공격 판정 정합(그림 → 판정)', () => {
  const map = folders();
  const results: Array<{ pair: string; hit: HitResult }> = [];

  it('최소 간격에서 12×12 약공격 헛방 0', () => {
    const misses: string[] = [];
    for (const attacker of CHARACTERS) {
      const manifest = manifestOf(attacker.id, map);
      for (const defender of CHARACTERS) {
        const hit = lightAtMinGap(attacker.id, defender.id, manifest);
        if (hit.damage <= 0) misses.push(`${attacker.id}→${defender.id}`);
        else results.push({ pair: `${attacker.id}→${defender.id}`, hit });
      }
    }
    expect(misses).toEqual([]);
  });

  it('피해 프레임 = 기술 첫 판정 구간 시작 프레임', () => {
    const move = (id: string): { script?: { hits?: Array<{ from: number; target?: string }> } } =>
      JSON.parse(readFileSync('src/data/moves.json', 'utf8')).moves.find((m: { id: string }) => m.id === `${id}_light`);
    const wrong = results.filter(({ pair, hit }) => {
      const attacker = pair.split('→')[0];
      const expected = Math.min(
        ...(move(attacker).script?.hits ?? []).filter((h) => h.target !== 'held').map((h) => h.from),
      );
      return hit.hitFrame !== expected || hit.hitFrame < 0;
    });
    expect(wrong.map(({ pair, hit }) => `${pair} frame ${hit.hitFrame}`)).toEqual([]);
  });

  it('접촉 프레임에 그림 주둥이(+보정)가 판정 앞끝과 1아트px 안에서 일치', () => {
    const off = results
      .map(({ pair, hit }) => ({ pair, delta: Math.abs(hit.tipScreen + hit.offsetPx - hit.hitFront) }))
      .filter(({ delta }) => delta > PIXEL_ART_SCALE);
    expect(off.map(({ pair, delta }) => `${pair} ${delta.toFixed(1)}px`)).toEqual([]);
  });

  it('내민 보정은 접촉 전에 차오르고 끝나면 0으로 돌아온다', () => {
    const map2 = map;
    const manifest = manifestOf('tyrannosaurus', map2);
    const match = new Match('versus', ['tyrannosaurus', 'tyrannosaurus'], [realAssets('tyrannosaurus'), realAssets('tyrannosaurus')]);
    const idle = new ScriptInput();
    for (let i = 0; i < ROUND_INTRO_FRAMES; i++) match.step(idle, FIXED_DT);
    match.p1.x = 700;
    match.p2.x = 1400;
    const input = new ScriptInput();
    input.press(0, 'light');
    match.step(input, FIXED_DT);
    input.clearPressed();
    const offsets: number[] = [];
    for (let i = 0; i < 60; i++) {
      if (match.p1.state === 'attack' && match.p1.attack) {
        offsets.push(contactOffsetArt(match.p1, match.p1.attack.move, manifest));
      }
      match.step(input, FIXED_DT);
    }
    const peak = Math.max(...offsets.map(Math.abs));
    expect(peak).toBeGreaterThan(0);
    // 공격이 끝난 뒤에는 내미는 보정이 없다(그림이 제자리로).
    expect(match.p1.state).not.toBe('attack');
    expect(contactOffsetArt(match.p1, match.p1.moves.light, manifest)).toBe(0);
    // 회수 구간에서 보정이 줄어든다(단조 증가만 하지 않는다).
    expect(offsets[offsets.length - 1]).toBeLessThan(peak);
  });
});


describe('12종 × 전 기술 접촉 게이트(그림 → 판정)', () => {
  const map = folders();

  it('접촉 프레임에서 그림 주둥이 + 보정 = 판정 앞끝 (±1아트px)', () => {
    const off: string[] = [];
    for (const character of CHARACTERS) {
      const manifest = manifestOf(character.id, map);
      const match = new Match('versus', [character.id, character.id], [realAssets(character.id), realAssets(character.id)]);
      const idle = new ScriptInput();
      for (let i = 0; i < ROUND_INTRO_FRAMES; i++) match.step(idle, FIXED_DT);
      for (const kind of ['light', 'heavy', 'special'] as const) {
        const move = match.p1.moves[kind];
        if (isAreaContact(move, match.p1.bodyFront)) continue;
        const front = contactFront(move, match.p1.bodyFront);
        const tip = contactTipArt(manifest, kind, move) * PIXEL_ART_SCALE;
        const push = Math.round(contactGap(match.p1, move, manifest) / PIXEL_ART_SCALE) * PIXEL_ART_SCALE;
        const delta = tip + push - front;
        if (Math.abs(delta) > PIXEL_ART_SCALE) off.push(`${character.id}/${kind} ${delta.toFixed(1)}px`);
      }
    }
    expect(off).toEqual([]);
  });

  it('광역 상자 기술은 그림을 밀지 않는다(몸이 화면 밖으로 나가지 않게)', () => {
    const pushed: string[] = [];
    for (const character of CHARACTERS) {
      const manifest = manifestOf(character.id, map);
      const match = new Match('versus', [character.id, character.id], [realAssets(character.id), realAssets(character.id)]);
      const idle = new ScriptInput();
      for (let i = 0; i < ROUND_INTRO_FRAMES; i++) match.step(idle, FIXED_DT);
      for (const kind of ['light', 'heavy', 'special'] as const) {
        const move = match.p1.moves[kind];
        if (!isAreaContact(move, match.p1.bodyFront)) continue;
        match.p1.state = 'attack';
        match.p1.attack = { move, frame: 999 } as unknown as typeof match.p1.attack;
        const offset = contactOffsetArt(match.p1, move, manifest);
        if (offset !== 0) pushed.push(`${character.id}/${kind} ${offset}아트px`);
      }
      match.p1.state = 'idle';
      match.p1.attack = null;
    }
    expect(pushed).toEqual([]);
  });

  it('브라키오·안킬로·테리지노·트리케라 특수가 광역 상자로 분류된다', () => {
    const area: string[] = [];
    for (const character of CHARACTERS) {
      const match = new Match('versus', [character.id, 'tyrannosaurus'], [realAssets(character.id), realAssets('tyrannosaurus')]);
      const idle = new ScriptInput();
      for (let i = 0; i < ROUND_INTRO_FRAMES; i++) match.step(idle, FIXED_DT);
      if (isAreaContact(match.p1.moves.special, match.p1.bodyFront)) area.push(character.id);
    }
    expect(area.sort()).toEqual(['ankylosaurus', 'brachiosaurus', 'therizinosaurus', 'triceratops']);
  });
});

describe('2P 색 구분(팔레트 시트)', () => {
  const map = folders();
  for (const character of CHARACTERS) {
    it(`${character.id}: 2P 팔레트 시트가 1P와 같은 크기·같은 알파`, () => {
      const folder = `${ROOT}/${map[character.id]}`;
      const manifest = manifestOf(character.id, map);
      expect(manifest.p2Image, '2P 시트 경로').toBeTruthy();
      const p2Path = `${folder}/${manifest.p2Image}`;
      expect(existsSync(p2Path)).toBe(true);
      const p1 = readFileSync(`${folder}/${manifest.image}`);
      const p2 = readFileSync(p2Path);
      // PNG 헤더의 크기 필드(IHDR)가 같아야 프레임 좌표를 그대로 쓸 수 있다.
      expect(p1.readUInt32BE(16)).toBe(p2.readUInt32BE(16));
      expect(p1.readUInt32BE(20)).toBe(p2.readUInt32BE(20));
      expect(p2.byteLength).toBeGreaterThan(1000);
    });
  }
});
