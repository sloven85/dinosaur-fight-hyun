import { describe, expect, it } from 'vitest';
import {
  FIXED_DT,
  GLIDE_FALL_SPEED,
  GLIDE_MAX_FRAMES,
  LEAP_CHARGE_FRAMES,
} from '../core/constants';
import { Fighter } from './Fighter';
import { ScriptInput } from './ScriptInput';

/** 지상에 세워 둔 파이터로 이동 특성만 확인한다. */
function groundedFighter(id: string): Fighter {
  return new Fighter(0, id, 500, 1);
}

describe('도약 돌진 (파키케팔로사우루스)', () => {
  it('지상 강공격을 앞으로 뛰어들며 시작한다', () => {
    const fighter = groundedFighter('pachycephalosaurus');
    const input = new ScriptInput();
    const startX = fighter.x;

    input.press(0, 'heavy');
    fighter.step(input, FIXED_DT);

    expect(fighter.onGround).toBe(false);
    expect(fighter.vy).toBeLessThan(0);

    input.clearPressed();
    for (let i = 0; i < 10; i++) fighter.step(input, FIXED_DT);

    // 도약 전진분이 실제로 반영되어야 한다.
    expect(fighter.x).toBeGreaterThan(startX + 50);
  });

  it('도약 특성이 없는 캐릭터는 지상 강공격에서 뜨지 않는다', () => {
    const fighter = groundedFighter('tyrannosaurus');
    const input = new ScriptInput();

    input.press(0, 'heavy');
    fighter.step(input, FIXED_DT);

    expect(fighter.onGround).toBe(true);
    expect(fighter.vy).toBe(0);
  });

  it('도약 전진은 LEAP_CHARGE_FRAMES를 넘겨 지속되지 않는다', () => {
    const fighter = groundedFighter('pachycephalosaurus');
    const input = new ScriptInput();

    input.press(0, 'heavy');
    fighter.step(input, FIXED_DT);
    input.clearPressed();

    for (let i = 0; i < LEAP_CHARGE_FRAMES + 20; i++) fighter.step(input, FIXED_DT);

    // 착지 후에는 더 이상 앞으로 밀리지 않는다.
    const restX = fighter.x;
    for (let i = 0; i < 5; i++) fighter.step(input, FIXED_DT);
    expect(fighter.x).toBeCloseTo(restX, 5);
  });
});

describe('제한된 활공 (프테라노돈)', () => {
  /** 높이 띄운 뒤 위를 누른 채 하강시킨다. */
  function airborne(id: string): { fighter: Fighter; input: ScriptInput } {
    const fighter = new Fighter(0, id, 500, 1);
    fighter.onGround = false;
    fighter.y = -50000;
    fighter.vy = 0;
    fighter.glideFrames = GLIDE_MAX_FRAMES;
    const input = new ScriptInput();
    input.hold(0, 'up');
    return { fighter, input };
  }

  it('위를 누르면 하강 속도가 활공 상한으로 제한된다', () => {
    const { fighter, input } = airborne('pteranodon');

    for (let i = 0; i < 20; i++) fighter.step(input, FIXED_DT);

    expect(fighter.gliding).toBe(true);
    expect(fighter.vy).toBeLessThanOrEqual(GLIDE_FALL_SPEED + 1e-6);
    expect(fighter.glideFrames).toBeLessThan(GLIDE_MAX_FRAMES);
  });

  it('활공 예산을 다 쓰면 다시 정상 낙하한다', () => {
    const { fighter, input } = airborne('pteranodon');

    for (let i = 0; i < GLIDE_MAX_FRAMES; i++) fighter.step(input, FIXED_DT);
    expect(fighter.glideFrames).toBe(0);

    fighter.step(input, FIXED_DT);
    expect(fighter.gliding).toBe(false);
    expect(fighter.vy).toBeGreaterThan(GLIDE_FALL_SPEED);
  });

  it('활공 특성이 없는 캐릭터는 위를 눌러도 활공하지 않는다', () => {
    const { fighter, input } = airborne('tyrannosaurus');

    for (let i = 0; i < 20; i++) fighter.step(input, FIXED_DT);

    expect(fighter.gliding).toBe(false);
    expect(fighter.vy).toBeGreaterThan(GLIDE_FALL_SPEED);
  });

  it('착지하면 활공 예산이 회복된다', () => {
    const { fighter, input } = airborne('pteranodon');

    for (let i = 0; i < 20; i++) fighter.step(input, FIXED_DT);
    expect(fighter.glideFrames).toBeLessThan(GLIDE_MAX_FRAMES);

    fighter.y = 0;
    fighter.vy = 0;
    fighter.onGround = true;
    fighter.step(input, FIXED_DT);

    expect(fighter.glideFrames).toBe(GLIDE_MAX_FRAMES);
  });
});
