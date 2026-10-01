import { describe, expect, it } from 'vitest';
import { FIXED_DT, ROUND_INTRO_FRAMES, ROUND_SECONDS, SIMULATION_HZ } from '../core/constants';
import { Match, type MatchEvent } from './Match';
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
    // 옛 단타 기술이 남아 있지 않아(12종 전부 스크립트) 판정 상자 1개짜리 약공격(트리케라 뿔 찌르기)으로 확인한다.
    const match = new Match('versus', ['triceratops', 'tyrannosaurus']);
    fighting(match);
    placeClose(match);

    const before = match.p2.health;
    const input = new ScriptInput();
    input.press(0, 'light');
    match.step(input, FIXED_DT);
    input.clearPressed();

    // 공격이 끝날 때까지 넉넉히 진행한다.
    advance(match, input, 40);

    expect(before - match.p2.health).toBe(Math.round(10 * match.p1.data.damageScale));
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

describe('1인 대전 CPU와 도움 설정 (프롬프트 5)', () => {
  it('1인 대전에서만 CPU 컨트롤러가 생기고, 2P가 스스로 움직인다', () => {
    const cpuMatch = new Match('cpu', ['tyrannosaurus', 'triceratops'], undefined, {
      difficulty: 'easy',
      random: () => 0,
    });
    const versusMatch = new Match('versus', ['tyrannosaurus', 'triceratops']);

    expect(cpuMatch.cpuController).not.toBeNull();
    expect(versusMatch.cpuController).toBeNull();

    fighting(cpuMatch);
    const startX = cpuMatch.p2.x;
    advance(cpuMatch, new ScriptInput(), 40);

    // 2P는 사람 입력 없이도 CPU 판단으로 접근한다.
    expect(cpuMatch.p2.x).not.toBe(startX);
  });

  it('도움 설정은 1인 대전에서만 적용된다', () => {
    const cpuMatch = new Match('cpu', ['tyrannosaurus', 'triceratops'], undefined, { assist: true });
    expect(cpuMatch.assistActive).toBe(true);
    expect(cpuMatch.p1.maxHealth).toBe(Math.round(cpuMatch.p1.data.baseHealth * 1.5));
    expect(cpuMatch.p1.health).toBe(cpuMatch.p1.maxHealth);

    const versusMatch = new Match('versus', ['tyrannosaurus', 'triceratops'], undefined, {
      assist: true,
    });
    expect(versusMatch.assistActive).toBe(false);
    expect(versusMatch.p1.maxHealth).toBe(versusMatch.p1.data.baseHealth);
  });

  it('도움 설정 기본값은 꺼짐이다', () => {
    const match = new Match('cpu', ['tyrannosaurus', 'triceratops']);
    expect(match.assistActive).toBe(false);
    expect(match.p1.maxHealth).toBe(match.p1.data.baseHealth);
    expect(match.difficulty).toBe('easy');
  });

  it('다음 라운드에서도 1P 최대 체력과 시작 체력이 유지된다', () => {
    const match = new Match('cpu', ['tyrannosaurus', 'triceratops'], undefined, { assist: true });
    fighting(match);
    const boosted = match.p1.maxHealth;

    match.p1.health = 0;
    match.step(new ScriptInput(), FIXED_DT);
    advance(match, new ScriptInput(), 200);

    expect(match.roundNumber).toBeGreaterThan(1);
    expect(match.p1.maxHealth).toBe(boosted);
    expect(match.p1.health).toBe(boosted);
  });

  it('시간 종료는 도움 설정으로 달라진 최대 체력 비율로 판정한다', () => {
    const match = new Match('cpu', ['tyrannosaurus', 'triceratops'], undefined, { assist: true });
    fighting(match);

    // 양쪽 모두 자기 최대 체력의 50% → 무승부. (절대 체력으로 비교하면 1P가 이긴다.)
    match.p1.health = match.p1.maxHealth * 0.5;
    match.p2.health = match.p2.maxHealth * 0.5;
    match.timerFrames = 1;
    match.step(new ScriptInput(), FIXED_DT);

    expect(match.phase).toBe('roundOver');
    expect(match.roundWinner).toBeNull();
  });
});

/** 공격을 내지르며 이벤트를 모은다. */
function attackUntilEvent(match: Match, input: ScriptInput, frames: number): MatchEvent[] {
  const events: MatchEvent[] = [];
  for (let i = 0; i < frames; i++) {
    match.step(input, FIXED_DT);
    input.clearPressed();
    events.push(...match.consumeEvents());
    if (events.length > 0) break;
  }
  return events;
}

describe('연출 이벤트 (프롬프트 6)', () => {
  it('명중하면 공격 종류가 담긴 hit 이벤트를 남기고 한 번만 소비된다', () => {
    const match = new Match('versus', ['tyrannosaurus', 'triceratops']);
    fighting(match);
    match.consumeEvents();
    placeClose(match);

    const input = new ScriptInput();
    input.press(0, 'light');
    const events = attackUntilEvent(match, input, 30);

    const hit = events.find((event) => event.type === 'hit');
    expect(hit).toBeDefined();
    expect(hit?.kind).toBe('light');
    expect(hit?.player).toBe(1);
    expect(match.consumeEvents()).toEqual([]);
  });

  it('가드된 공격은 guard 이벤트로 구분된다', () => {
    const match = new Match('versus', ['tyrannosaurus', 'triceratops']);
    fighting(match);
    match.consumeEvents();
    placeClose(match);

    const input = new ScriptInput();
    input.hold(1, 'right'); // 2P가 바깥(오른쪽)을 눌러 자동 가드
    input.press(0, 'light');
    const events = attackUntilEvent(match, input, 30);

    expect(events.some((event) => event.type === 'guard')).toBe(true);
  });

  it('특수기는 kind가 special인 이벤트를 남긴다', () => {
    const match = new Match('versus', ['tyrannosaurus', 'triceratops']);
    fighting(match);
    match.consumeEvents();
    placeClose(match);
    match.p1.meter = 100;

    const input = new ScriptInput();
    input.press(0, 'special');
    const events = attackUntilEvent(match, input, 60);

    const hit = events.find((event) => event.type === 'hit');
    expect(hit?.kind).toBe('special');
  });

  it('KO되면 별 연출용 ko 이벤트를 남긴다', () => {
    const match = new Match('versus', ['tyrannosaurus', 'triceratops']);
    fighting(match);
    match.consumeEvents();

    match.p2.health = 0;
    match.step(new ScriptInput(), FIXED_DT);

    const events = match.consumeEvents();
    expect(match.phase).toBe('roundOver');
    expect(events.some((event) => event.type === 'ko' && event.player === 1)).toBe(true);
  });

  it('강공격은 양측에 타격 정지 프레임을 남긴다', () => {
    // 강공격이 모두 스크립트 기술로 바뀌어, 단타 강공격(카르노 순간 들이받기)으로 확인한다.
    const match = new Match('versus', ['carnotaurus', 'tyrannosaurus']);
    fighting(match);
    match.consumeEvents();
    placeClose(match);

    const input = new ScriptInput();
    input.press(0, 'heavy');
    const events: MatchEvent[] = [];
    for (let i = 0; i < 40 && !events.some((e) => e.type === 'hit'); i++) {
      match.step(input, FIXED_DT);
      input.clearPressed();
      events.push(...match.consumeEvents());
    }

    expect(events.some((event) => event.type === 'hit')).toBe(true);
    expect(match.p1.hitstopFrames).toBeGreaterThan(0);
    expect(match.p2.hitstopFrames).toBeGreaterThan(0);
  });
});
