import { describe, expect, it } from 'vitest';
import { FIXED_DT, ROUND_INTRO_FRAMES, ROUND_SECONDS, SIMULATION_HZ } from '../core/constants';
import { Match } from './Match';
import { ScriptInput } from './ScriptInput';

/** 인트로를 건너뛰고 대전이 시작된 상태로 만든다. */
function fighting(match: Match): void {
  for (let i = 0; i < ROUND_INTRO_FRAMES; i++) match.step(new ScriptInput(), FIXED_DT);
}

function advance(match: Match, input: ScriptInput, frames: number): void {
  for (let i = 0; i < frames; i++) {
    match.step(input, FIXED_DT);
    input.clearPressed();
  }
}

/** 두 파이터를 사거리 안에 붙여 둔다(매 틱 밀어내기가 다시 벌리므로 매번 재설정). */
function placeClose(match: Match): void {
  match.p1.x = 700;
  match.p2.x = 800;
}

describe('동일 캐릭터 대전과 2P 보조색', () => {
  it('같은 캐릭터를 고르면 2P에만 보조색을 적용한다', () => {
    const match = new Match('versus', ['tyrannosaurus', 'tyrannosaurus']);

    expect(match.mirrorMatch).toBe(true);
    expect(match.p1.useAlternatePalette).toBe(false);
    expect(match.p2.useAlternatePalette).toBe(true);
  });

  it('다른 캐릭터끼리는 보조색을 쓰지 않는다', () => {
    const match = new Match('versus', ['tyrannosaurus', 'triceratops']);

    expect(match.mirrorMatch).toBe(false);
    expect(match.p2.useAlternatePalette).toBe(false);
  });

  it('2P 보조색은 다음 라운드에도 유지된다', () => {
    const match = new Match('versus', ['velociraptor', 'velociraptor']);
    fighting(match);

    match.p1.health = 0;
    match.step(new ScriptInput(), FIXED_DT);
    expect(match.phase).toBe('roundOver');

    advance(match, new ScriptInput(), 200);
    expect(match.roundNumber).toBeGreaterThan(1);
    expect(match.p2.useAlternatePalette).toBe(true);
  });
});

describe('전투 규칙', () => {
  it('공격 1회는 같은 상대에게 한 번만 피해를 준다', () => {
    const match = new Match('versus', ['tyrannosaurus', 'triceratops']);
    fighting(match);
    placeClose(match);

    const before = match.p2.health;
    const input = new ScriptInput();
    input.press(0, 'light');
    match.step(input, FIXED_DT);
    input.clearPressed();

    // 공격이 끝날 때까지 넉넉히 진행한다.
    advance(match, input, 40);

    expect(before - match.p2.health).toBe(10);
  });

  it('새 공격은 다시 피해를 줄 수 있다', () => {
    const match = new Match('versus', ['tyrannosaurus', 'triceratops']);
    fighting(match);
    placeClose(match);

    const input = new ScriptInput();
    input.press(0, 'light');
    match.step(input, FIXED_DT);
    input.clearPressed();
    advance(match, input, 40);

    const afterFirst = match.p2.health;
    placeClose(match);
    input.press(0, 'light');
    match.step(input, FIXED_DT);
    input.clearPressed();
    advance(match, input, 40);

    expect(match.p2.health).toBeLessThan(afterFirst);
  });

  it('가드하면 약공격 피해가 0이다', () => {
    const match = new Match('versus', ['tyrannosaurus', 'triceratops']);
    fighting(match);
    placeClose(match);

    const before = match.p2.health;
    const input = new ScriptInput();
    // 2P는 1P보다 오른쪽에 있으므로 오른쪽(바깥)을 눌러야 가드가 된다.
    input.hold(1, 'right');
    input.press(0, 'light');
    match.step(input, FIXED_DT);
    input.clearPressed();
    advance(match, input, 40);

    expect(match.p2.health).toBe(before);
  });

  it('시간 종료는 남은 체력 비율로 판정한다', () => {
    const match = new Match('versus', ['tyrannosaurus', 'triceratops']);
    fighting(match);

    // 1P는 50%, 2P는 100%가 남게 만든다.
    match.p1.health = match.p1.data.baseHealth * 0.5;
    match.p2.health = match.p2.data.baseHealth;
    match.timerFrames = 1;
    match.step(new ScriptInput(), FIXED_DT);

    expect(match.phase).toBe('roundOver');
    expect(match.roundWinner).toBe(1);
  });

  it('라운드 시작 시 체력·게이지·타이머가 초기화된다', () => {
    const match = new Match('versus', ['tyrannosaurus', 'triceratops']);
    fighting(match);

    match.p1.meter = 100;
    match.p1.health = 10;
    match.timerFrames = 100;

    match.p1.health = 0;
    match.step(new ScriptInput(), FIXED_DT);
    advance(match, new ScriptInput(), 200);

    expect(match.phase).toBe('intro');
    expect(match.p1.health).toBe(match.p1.data.baseHealth);
    expect(match.p1.meter).toBe(50);
    expect(match.timerFrames).toBe(ROUND_SECONDS * SIMULATION_HZ);
  });
});
