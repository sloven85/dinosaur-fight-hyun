import { describe, expect, it } from 'vitest';
import { Fighter } from '../combat/Fighter';
import { FIXED_DT } from '../core/constants';
import type { PlayerIndex } from '../input/InputManager';
import {
  AIController,
  DECISION_INTERVAL_MS,
  EASY_ATTACK_REST_MS,
  SPECIAL_COOLDOWN_MS,
  STYLE_PROFILES,
} from './AIController';

function fighter(id: string, x: number, facing: 1 | -1, player: PlayerIndex = 0): Fighter {
  return new Fighter(player, id, x, facing);
}

/** 같은 난수값만 돌려주는 스텁. 판단을 결정적으로 만든다. */
function fixedRandom(value: number): () => number {
  return () => value;
}

/** 틱마다 AI를 돌리며, 공격 버튼이 눌린 틱 번호를 모은다. */
function runAi(
  ai: AIController,
  self: Fighter,
  opponent: Fighter,
  ticks: number,
  action: 'light' | 'heavy' | 'special' = 'heavy',
): number[] {
  const presses: number[] = [];
  for (let i = 0; i < ticks; i++) {
    ai.update(self, opponent, FIXED_DT);
    if (ai.isPressed(1, action)) presses.push(i);
  }
  return presses;
}

function msBetweenTicks(from: number, to: number): number {
  return (to - from) * FIXED_DT * 1000;
}

describe('CPU 판단 간격 (계획서 19절)', () => {
  it('쉬움은 400~650ms, 보통은 220~400ms 안에서 다음 판단을 예약한다', () => {
    for (const difficulty of ['easy', 'normal'] as const) {
      const { min, max } = DECISION_INTERVAL_MS[difficulty];
      for (const value of [0, 0.5, 0.999999]) {
        const ai = new AIController(1, { difficulty, random: fixedRandom(value) });
        expect(ai.scheduledIntervalMs).toBeGreaterThanOrEqual(min);
        expect(ai.scheduledIntervalMs).toBeLessThanOrEqual(max);
      }
    }
  });

  it('쉬움은 최소 간격(400ms) 전에는 판단하지 않는다', () => {
    const ai = new AIController(1, { difficulty: 'easy', random: fixedRandom(0) });
    const self = fighter('tyrannosaurus', 1000, -1, 1);
    const opponent = fighter('tyrannosaurus', 400, 1);

    for (let i = 0; i < 23; i++) ai.update(self, opponent, FIXED_DT);
    expect(ai.isHeld(1, 'left')).toBe(false);

    ai.update(self, opponent, FIXED_DT);
    expect(ai.isHeld(1, 'left')).toBe(true);
  });
});

describe('쉬움의 휴식과 공격 빈도', () => {
  it('쉬움은 공격 뒤 700ms 이상 다시 공격하지 않는다', () => {
    const ai = new AIController(1, { difficulty: 'easy', random: fixedRandom(0) });
    const self = fighter('tyrannosaurus', 1000, -1, 1);
    const opponent = fighter('tyrannosaurus', 950, 1);

    const presses = runAi(ai, self, opponent, 400);

    expect(presses.length).toBeGreaterThan(1);
    for (let i = 1; i < presses.length; i++) {
      expect(msBetweenTicks(presses[i - 1], presses[i])).toBeGreaterThanOrEqual(
        EASY_ATTACK_REST_MS.min - 1e-6,
      );
    }
  });

  it('도움 설정(공격 빈도 감소)은 같은 시간에 CPU 공격 횟수를 줄인다', () => {
    const normal = new AIController(1, { difficulty: 'easy', random: fixedRandom(0) });
    const assisted = new AIController(1, {
      difficulty: 'easy',
      random: fixedRandom(0),
      attackFrequencyScale: 0.5,
    });
    const self = fighter('tyrannosaurus', 1000, -1, 1);
    const opponent = fighter('tyrannosaurus', 950, 1);

    const normalPresses = runAi(normal, self, opponent, 300);
    const assistedPresses = runAi(assisted, self, opponent, 300);

    expect(normalPresses.length).toBeGreaterThan(0);
    expect(assistedPresses.length).toBeLessThan(normalPresses.length);
  });
});

describe('게이지 규칙 (무한 특수기 금지)', () => {
  it('게이지가 100이 아니면 특수기를 누르지 않는다', () => {
    const ai = new AIController(1, { difficulty: 'normal', random: fixedRandom(0) });
    const self = fighter('tyrannosaurus', 1000, -1, 1);
    const opponent = fighter('tyrannosaurus', 950, 1);
    self.meter = 99;

    const presses = runAi(ai, self, opponent, 600, 'special');
    expect(presses).toEqual([]);
  });

  it('게이지가 차면 특수기를 쓰되 쿨다운 안에서 연발하지 않는다', () => {
    const ai = new AIController(1, { difficulty: 'normal', random: fixedRandom(0) });
    const self = fighter('tyrannosaurus', 1000, -1, 1);
    const opponent = fighter('tyrannosaurus', 950, 1);
    self.meter = 100;

    const presses = runAi(ai, self, opponent, 600, 'special');

    expect(presses.length).toBeGreaterThan(0);
    for (let i = 1; i < presses.length; i++) {
      expect(msBetweenTicks(presses[i - 1], presses[i])).toBeGreaterThanOrEqual(
        SPECIAL_COOLDOWN_MS - 1e-6,
      );
    }
  });
});

describe('공개 상태만 보고 판단한다 (입력 예측 없음)', () => {
  it('상대가 실제로 공격 상태일 때만 가드를 고른다', () => {
    const ai = new AIController(1, { difficulty: 'normal', random: fixedRandom(0.6) });
    const self = fighter('ankylosaurus', 1000, -1, 1);
    const opponent = fighter('tyrannosaurus', 900, 1);

    // 상대가 아직 공격을 시작하지 않았으면(입력만 눌린 상태) 가드를 고르지 않는다.
    opponent.state = 'idle';
    ai.decide(self, opponent);
    const guardedWhileIdle = ai.isHeld(1, 'right');

    // 상대가 공격 상태가 되면 가드를 고른다.
    opponent.state = 'attack';
    ai.decide(self, opponent);
    const guardedWhileAttacking = ai.isHeld(1, 'right');

    expect(guardedWhileIdle).toBe(false);
    expect(guardedWhileAttacking).toBe(true);
  });
});

describe('종 아키타입이 CPU 행동에 드러난다 (C1)', () => {
  it('빠른 종(벨로키랍토르)은 다가가고, 버티는 종(안킬로)은 자리를 지킨다', () => {
    const opponent = fighter('tyrannosaurus', 1600, 1);
    const raptor = fighter('velociraptor', 200, 1, 1);
    const anky = fighter('ankylosaurus', 200, 1, 1);

    const raptorAi = new AIController(1, { difficulty: 'normal', random: fixedRandom(0.5) });
    const ankyAi = new AIController(1, { difficulty: 'normal', random: fixedRandom(0.5) });

    raptorAi.decide(raptor, opponent);
    ankyAi.decide(anky, opponent);

    expect(raptorAi.isHeld(1, 'right')).toBe(true);
    expect(ankyAi.isHeld(1, 'right')).toBe(false);
    expect(ankyAi.isHeld(1, 'left')).toBe(false);
  });

  it('성향표가 종류마다 다르다 — 견제형은 강공격, 스피드형은 약공격', () => {
    expect(STYLE_PROFILES.rushdown.prefer).toBe('light');
    expect(STYLE_PROFILES.zoning.prefer).toBe('heavy');
    expect(STYLE_PROFILES.counter.prefer).toBe('heavy');
    expect(STYLE_PROFILES.counter.guard).toBeGreaterThan(STYLE_PROFILES.rushdown.guard);
    expect(STYLE_PROFILES.rushdown.approach).toBeGreaterThan(STYLE_PROFILES.counter.approach);
  });

  it('견제형은 사거리 안에서 강공격을 고른다', () => {
    const ai = new AIController(1, { difficulty: 'normal', random: fixedRandom(0.5) });
    const self = fighter('brachiosaurus', 1000, -1, 1);
    const opponent = fighter('tyrannosaurus', 900, 1);

    ai.decide(self, opponent);

    expect(ai.isPressed(1, 'heavy')).toBe(true);
  });

  it('도약형(파키)은 강공격을 골라 도약 돌진이 나가게 한다', () => {
    const ai = new AIController(1, { difficulty: 'normal', random: fixedRandom(0.5) });
    const self = fighter('pachycephalosaurus', 1000, -1, 1);
    const opponent = fighter('tyrannosaurus', 900, 1);

    ai.decide(self, opponent);

    expect(ai.isPressed(1, 'heavy')).toBe(true);
  });
});

describe('라운드 초기화', () => {
  it('reset은 입력·휴식·판단 타이머를 비운다', () => {
    const ai = new AIController(1, { difficulty: 'normal', random: fixedRandom(0.4) });
    const self = fighter('tyrannosaurus', 200, 1, 1);
    const opponent = fighter('tyrannosaurus', 1600, 1);

    ai.decide(self, opponent);
    expect(ai.isHeld(1, 'right')).toBe(true);

    ai.reset();

    expect(ai.isHeld(1, 'right')).toBe(false);
    expect(ai.isHeld(1, 'left')).toBe(false);
    expect(ai.restRemainingMs).toBe(0);
    expect(ai.scheduledIntervalMs).toBeGreaterThanOrEqual(DECISION_INTERVAL_MS.normal.min);
  });
});
