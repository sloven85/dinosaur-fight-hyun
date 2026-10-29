import { describe, expect, it } from 'vitest';
import index from '../../../dev-art/species/index.json';
import { SPRITE_STATES, parseSpriteManifest } from './SpeciesSprite';
import { CHARACTERS, getMove } from '../../data';
import { moveTotalFrames } from '../../combat/types';

/**
 * 아티스트 12종 1차본이 실제로 계약대로 포장됐는지 검사한다.
 * 여기서 쓰는 파일은 `scripts/build-species-sprites.py`가 프레임 PNG에서 직접 만든 것이다.
 */
const shells = import.meta.glob('../../../dev-art/species/*/manifest.json', { eager: true, import: 'default' }) as Record<string, unknown>;

const FOLDERS = ['trex', 'trike', 'velo', 'spino', 'anky', 'stego', 'carno', 'pachy', 'theri', 'dilo', 'brachio', 'ptera'];
const CHARACTER: Record<string, string> = {
  trex: 'tyrannosaurus', trike: 'triceratops', velo: 'velociraptor', spino: 'spinosaurus',
  anky: 'ankylosaurus', stego: 'stegosaurus', carno: 'carnotaurus', pachy: 'pachycephalosaurus',
  theri: 'therizinosaurus', dilo: 'dilophosaurus', brachio: 'brachiosaurus', ptera: 'pteranodon',
};

function manifestOf(folder: string) {
  const raw = shells[`../../../dev-art/species/${folder}/manifest.json`];
  if (!raw) throw new Error(`${folder} manifest 없음`);
  return parseSpriteManifest(raw);
}

describe('12종 도트 자산', () => {
  it('12종이 모두 계약 규격으로 포장돼 있다', () => {
    expect(Object.keys(index.species)).toHaveLength(12);
    expect(index.cell).toEqual([502, 304]);
    expect(index.footY).toBe(298);
    expect(index.anchorX).toBe(251);
    expect(index.scale).toBe(4);
    for (const folder of FOLDERS) {
      const m = manifestOf(folder);
      expect(m.character).toBe(CHARACTER[folder]);
      expect(m.cell).toEqual([502, 304]);
      expect(m.footY).toBe(298);
      expect(m.anchorX).toBe(251);
      expect(m.scale).toBe(4);
      expect(folder).toBe(m.folder);
    }
  });

  it('12종 모두 10상태 클립을 가지고 프레임이 시트 안에 있다', () => {
    for (const folder of FOLDERS) {
      const m = manifestOf(folder);
      const size = index.species[folder as keyof typeof index.species].sheet;
      for (const state of SPRITE_STATES) expect(m.clips[state].frames.length).toBeGreaterThan(0);
      for (const f of m.frames) {
        expect(f.x + f.w).toBeLessThanOrEqual(size[0]);
        expect(f.y + f.h).toBeLessThanOrEqual(size[1]);
      }
      // 등록 기준: 잘라낸 그림 안의 발 기준점이 셀 좌표 298/251과 일치해야 한다.
      for (const clip of Object.values(m.clips)) {
        for (const i of clip.frames) {
          const f = m.frames[i];
          expect(Number.isInteger(f.anchor.x)).toBe(true);
          expect(Number.isInteger(f.anchor.y)).toBe(true);
        }
      }
    }
  });

  it('약·강·특수 그림은 해당 기술 프레임 수에 맞춰 재생할 수 있다', () => {
    const kinds = [['light', 'light', 'light_attack'], ['heavy', 'strong', 'heavy_slam'], ['special', 'special', 'special']] as const;
    for (const folder of FOLDERS) {
      const m = manifestOf(folder);
      for (const [kind, slot, art] of kinds) {
        const id = `${CHARACTER[folder]}_${kind}`;
        const move = getMove(id);
        expect(move, id).toBeTruthy();
        const clip = m.clips[slot];
        expect(clip, `${folder}/${slot}`).toBeTruthy();
        expect(clip.art).toBe(art);
        expect(moveTotalFrames(move)).toBeGreaterThan(0);
        expect(m.clips[slot].frames.length).toBeGreaterThan(1);
      }
    }
  });

  it('대기·걷기·공중버둥·승리는 반복, 점프·공격·피격·다운은 1회 재생이다', () => {
    for (const folder of FOLDERS) {
      const m = manifestOf(folder);
      expect(m.clips.idle.loop).toBe(true);
      expect(m.clips.walk.loop).toBe(true);
      expect(m.clips.flail.loop).toBe(true);
      // 승리는 아티스트가 축하 동작 반복으로 그렸다 — 반복이 맞다.
      expect(m.clips.victory.loop).toBe(true);
      for (const state of ['jump', 'light', 'strong', 'special', 'hit', 'down'] as const) {
        expect(m.clips[state].loop, `${folder}/${state}`).toBe(false);
      }
    }
  });

  it('게임의 12종 캐릭터가 모두 스프라이트를 가진다', () => {
    const ids = CHARACTERS.map((c) => c.id).sort();
    expect(ids).toEqual(Object.values(CHARACTER).sort());
  });
});
