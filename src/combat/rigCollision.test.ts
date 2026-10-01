import { describe, expect, it } from 'vitest';
import { ARENA_LEFT, ARENA_RIGHT, FIXED_DT } from '../core/constants';
import { getCharacter } from '../data';
import type { CharacterAssets } from '../rendering/CharacterAssets';
import { spriteScale } from '../rendering/rig';
import type { BoxData, RigData } from '../rendering/rig';
import { Fighter } from './Fighter';
import { ScriptInput } from './ScriptInput';

/**
 * f447bfc의 실제 티라노사우루스 rig.json 실측값(원본 캔버스 px).
 * 새 아트는 화면 키의 약 2.7배(슈퍼샘플)라서 실측 상자도 그만큼 크다.
 */
const TREX_BOX: BoxData = {
  minX: 113,
  minY: 130,
  maxX: 1966,
  maxY: 1279,
  w: 1854,
  h: 1150,
  cx: 1039.5,
  feet: 1279,
  fill: 0.27,
};

function rigWith(box: BoxData, rootX: number, rootY: number): RigData {
  const pose = { imagePath: 'x.png', rootX, rootY, usable: false, box: null };
  return {
    canvas: { width: 2048, height: 1536 },
    root: { x: rootX, y: rootY },
    master: { imagePath: 'master_side.png', usable: true, box },
    portrait: { imagePath: 'portrait.png', usable: true },
    poses: { heavy: pose, special: pose, hit: pose, down: pose, victory: pose },
    parts: { sheet: '', extractedDir: '', manualRiggingRequired: true, productionReady: false },
  };
}

function fighterWithRig(id: string, box: BoxData, rootX: number, rootY: number): Fighter {
  const assets: CharacterAssets = {
    id,
    rig: rigWith(box, rootX, rootY),
    master: null,
    portrait: null,
    poses: {},
  };
  return new Fighter(0, id, 620, 1, assets);
}

describe('새 아트(슈퍼샘플) 리그의 이동·판정 환산', () => {
  it('실측 상자가 커도 좌우로 정상 이동한다', () => {
    const fighter = fighterWithRig('tyrannosaurus', TREX_BOX, 1039.5, 1279);
    const input = new ScriptInput();
    input.hold(0, 'left');
    const startX = fighter.x;

    for (let i = 0; i < 30; i++) fighter.step(input, FIXED_DT);

    // 회귀: 실측 상자를 그대로 쓰면 x가 986.5에 고정되어 움직이지 않았다.
    expect(fighter.x).toBeLessThan(startX - 100);
    expect(fighter.x).toBeGreaterThanOrEqual(ARENA_LEFT);
  });

  it('반대쪽 끝까지 이동할 수 있다(이동 범위가 뒤집히지 않는다)', () => {
    const fighter = fighterWithRig('tyrannosaurus', TREX_BOX, 1039.5, 1279);
    const input = new ScriptInput();
    input.hold(0, 'right');

    for (let i = 0; i < 600; i++) fighter.step(input, FIXED_DT);

    expect(fighter.x).toBeGreaterThan(1200);
    expect(fighter.x).toBeLessThanOrEqual(ARENA_RIGHT);
  });

  it('몸통 판정이 렌더러와 같은 배율로 환산된다', () => {
    const character = getCharacter('tyrannosaurus');
    const fighter = fighterWithRig('tyrannosaurus', TREX_BOX, 1039.5, 1279);
    const scale = spriteScale(character.displayHeight, TREX_BOX);
    const box = fighter.hurtbox();

    // 실측 상자 폭을 화면 배율로 환산한 값과 일치해야 한다.
    expect(box.right - box.left).toBeCloseTo((TREX_BOX.maxX - TREX_BOX.minX) * scale, 3);
    // 화면 키(430px) 기준으로 타당한 크기여야 한다(기존 1854px처럼 화면을 덮지 않는다).
    expect(fighter.bodyHeight).toBeCloseTo(character.displayHeight, 3);
    expect(box.right - box.left).toBeLessThan(character.displayHeight * 2);
  });

  it('리그가 없는 캐릭터는 표시 높이 기반 임시 판정을 그대로 쓴다', () => {
    const character = getCharacter('tyrannosaurus');
    const fighter = new Fighter(0, 'tyrannosaurus', 620, 1);
    const box = fighter.hurtbox();

    expect(fighter.bodyHeight).toBeCloseTo(character.displayHeight, 3);
    expect(box.right - box.left).toBeCloseTo(character.displayHeight * 0.62, 3);
  });
});
