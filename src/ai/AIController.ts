import type { Fighter, FighterInput } from '../combat/Fighter';
import type { AttackKind } from '../combat/types';
import type { CpuDifficulty } from '../core/settings';
import type { CpuStyle } from '../data';
import type { Action } from '../input/actions';
import type { PlayerIndex } from '../input/InputManager';

/**
 * 계획서 3절 "CPU 설계" + 19절 CPU 검수.
 *
 * - 사용자와 동일한 Action만 내보낸다(FighterInput). 전투 규칙은 Fighter·Match가 그대로 판정한다.
 * - 판단은 상대의 공개된 상태(위치·상태·체력·게이지)만 본다. 사용자 입력은 아예 받지 않으므로
 *   입력을 미리 읽거나 프레임 단위로 완벽하게 막을 수 없다.
 * - 게이지가 없으면 특수기를 누르지 않는다(무한 특수기 금지).
 */
export const DECISION_INTERVAL_MS: Record<CpuDifficulty, { min: number; max: number }> = {
  easy: { min: 400, max: 650 },
  normal: { min: 220, max: 400 },
};

/** 쉬움은 공격 뒤 실제로 쉬는 시간이 눈에 보여야 한다(계획서 19절). */
export const EASY_ATTACK_REST_MS = { min: 700, max: 1100 };
export const NORMAL_ATTACK_REST_MS = { min: 120, max: 260 };

/** 같은 특수기를 연달아 쓰지 않도록 두는 최소 간격(무한 특수기 금지). */
export const SPECIAL_COOLDOWN_MS = 1400;

interface StyleProfile {
  /** 멀 때 다가가려는 성향 0~1. */
  approach: number;
  /** 상대 공격·근접 시 가드를 고르는 확률 0~1. */
  guard: number;
  /** 주로 쓰는 공격. */
  prefer: AttackKind;
  /** 게이지가 찼을 때 특수기를 노리는 성향 0~1. */
  specialBias: number;
  /** 판단마다 점프를 섞는 확률. */
  jumpChance: number;
}

/** 계획서 19절 C1: 종 아키타입이 행동으로 드러나게 하는 성향표. */
export const STYLE_PROFILES: Record<CpuStyle, StyleProfile> = {
  balanced: { approach: 0.6, guard: 0.3, prefer: 'light', specialBias: 0.5, jumpChance: 0.05 },
  bruiser: { approach: 0.5, guard: 0.35, prefer: 'heavy', specialBias: 0.6, jumpChance: 0.03 },
  rusher: { approach: 0.9, guard: 0.2, prefer: 'heavy', specialBias: 0.5, jumpChance: 0.03 },
  rushdown: { approach: 1, guard: 0.15, prefer: 'light', specialBias: 0.4, jumpChance: 0.08 },
  counter: { approach: 0.25, guard: 0.65, prefer: 'heavy', specialBias: 0.5, jumpChance: 0.02 },
  zoning: { approach: 0.2, guard: 0.4, prefer: 'heavy', specialBias: 0.6, jumpChance: 0.03 },
  leaper: { approach: 0.85, guard: 0.2, prefer: 'heavy', specialBias: 0.5, jumpChance: 0.05 },
  trickster: { approach: 0.7, guard: 0.3, prefer: 'light', specialBias: 0.7, jumpChance: 0.14 },
};

/** 사거리 안일 때 공격을 고르는 기본 확률. */
const ATTACK_CHANCE: Record<CpuDifficulty, number> = { easy: 0.55, normal: 0.8 };
/** 이 거리 여유 안쪽이면 "사거리 안"으로 본다(디자인 px). */
const RANGE_MARGIN = 20;
/** 상대 공격에 반응해 가드를 고르는 판정에 더하는 여유(디자인 px). */
const GUARD_REACTION_MARGIN = 60;
/** 선호 공격을 쓰는 비율. 나머지는 다른 기본기로 섞는다. */
const PREFERRED_ATTACK_RATIO = 0.75;

export interface AiOptions {
  difficulty: CpuDifficulty;
  /** 도움 설정: 1 미만이면 CPU가 덜 공격하고 공격 뒤 더 쉰다. */
  attackFrequencyScale?: number;
  /** 테스트에서 고정 시퀀스를 넣기 위한 난수원. */
  random?: () => number;
}

export class AIController implements FighterInput {
  readonly player: PlayerIndex;
  readonly difficulty: CpuDifficulty;

  private readonly attackFrequencyScale: number;
  private readonly random: () => number;
  private readonly held = new Set<Action>();
  private readonly pressed = new Set<Action>();

  private decisionTimerMs = 0;
  private nextDecisionMs: number;
  private restMs = 0;
  private specialCooldownMs = 0;

  constructor(player: PlayerIndex, options: AiOptions) {
    this.player = player;
    this.difficulty = options.difficulty;
    this.attackFrequencyScale = options.attackFrequencyScale ?? 1;
    this.random = options.random ?? Math.random;
    this.nextDecisionMs = this.rollInterval();
  }

  /** 이번에 예약된 판단 간격(ms). 테스트·디버그용. */
  get scheduledIntervalMs(): number {
    return this.nextDecisionMs;
  }

  /** 남은 휴식 시간(ms). 테스트용. */
  get restRemainingMs(): number {
    return this.restMs;
  }

  /** 매 시뮬레이션 틱(60Hz)마다 호출한다. self는 CPU, opponent는 사람 쪽 파이터다. */
  update(self: Fighter, opponent: Fighter, dt: number): void {
    this.pressed.clear();

    const ms = dt * 1000;
    this.decisionTimerMs += ms;
    if (this.specialCooldownMs > 0) this.specialCooldownMs -= ms;
    if (this.restMs > 0) this.restMs -= ms;

    if (this.decisionTimerMs < this.nextDecisionMs) return;
    this.decisionTimerMs = 0;
    this.nextDecisionMs = this.rollInterval();
    this.decide(self, opponent);
  }

  /** 라운드가 바뀔 때 판단·입력 상태를 정확히 초기화한다. */
  reset(): void {
    this.held.clear();
    this.pressed.clear();
    this.decisionTimerMs = 0;
    this.nextDecisionMs = this.rollInterval();
    this.restMs = 0;
    this.specialCooldownMs = 0;
  }

  isHeld(_player: PlayerIndex, action: Action): boolean {
    return this.held.has(action);
  }

  isPressed(_player: PlayerIndex, action: Action): boolean {
    return this.pressed.has(action);
  }

  /** 판단 1회. 공개된 파이터 상태만 사용한다. */
  decide(self: Fighter, opponent: Fighter): void {
    this.held.clear();

    if (self.state === 'down' || self.state === 'victory') return;

    const toOpponent = opponent.x - self.x;
    const distance = Math.abs(toOpponent);
    const direction: 1 | -1 = toOpponent >= 0 ? 1 : -1;
    const profile = STYLE_PROFILES[self.data.cpuStyle] ?? STYLE_PROFILES.balanced;
    const attackRange = self.reachOf(profile.prefer) + opponent.bodyWidth / 2 + RANGE_MARGIN;

    // 상대가 공격 중이고 가까우면 가드를 고른다. 상대의 보이는 상태만 보고 판단한다.
    const guardReach = self.reachOf('heavy') + self.bodyWidth + GUARD_REACTION_MARGIN;
    if (opponent.state === 'attack' && distance <= guardReach && this.random() < profile.guard) {
      this.holdAway(direction);
      return;
    }

    if (distance > attackRange) {
      if (this.random() < profile.approach * this.approachScale()) this.holdToward(direction);
      else if (this.random() < profile.jumpChance) this.pressed.add('up');
      return;
    }

    // 사거리 안: 공격하거나, 견제하며 다음 기회를 본다.
    if (self.canAct() && this.restMs <= 0 && this.random() < this.attackChance()) {
      this.performAttack(self, profile);
      return;
    }

    if (this.random() < profile.guard) this.holdAway(direction);
    else if (this.random() < profile.approach) this.holdToward(direction);
  }

  private performAttack(self: Fighter, profile: StyleProfile): void {
    const kind = this.chooseAttack(self, profile);
    this.pressed.add(kind);
    this.restMs = this.rollRest();
    if (kind === 'special') this.specialCooldownMs = SPECIAL_COOLDOWN_MS;
  }

  private chooseAttack(self: Fighter, profile: StyleProfile): AttackKind {
    // 게이지가 100이 아니면 특수기를 누르지 않는다. 부족분은 Fighter가 아이콘 깜빡임으로 처리한다.
    if (self.isMeterFull() && this.specialCooldownMs <= 0 && this.random() < profile.specialBias) {
      return 'special';
    }
    if (this.random() < PREFERRED_ATTACK_RATIO) return profile.prefer;
    return profile.prefer === 'light' ? 'heavy' : 'light';
  }

  private attackChance(): number {
    return Math.max(0.05, Math.min(1, ATTACK_CHANCE[this.difficulty] * this.attackFrequencyScale));
  }

  /** 쉬움은 추격도 조금 줄인다(무리한 추격 감소). */
  private approachScale(): number {
    return this.difficulty === 'easy' ? 0.75 : 1;
  }

  private rollInterval(): number {
    const { min, max } = DECISION_INTERVAL_MS[this.difficulty];
    return min + this.random() * (max - min);
  }

  private rollRest(): number {
    const { min, max } = this.difficulty === 'easy' ? EASY_ATTACK_REST_MS : NORMAL_ATTACK_REST_MS;
    // 도움 설정(공격 빈도 감소)은 휴식도 그만큼 늘린다.
    const scale = this.attackFrequencyScale < 1 ? 1 / this.attackFrequencyScale : 1;
    return (min + this.random() * (max - min)) * scale;
  }

  private holdToward(direction: 1 | -1): void {
    this.held.add(direction === 1 ? 'right' : 'left');
  }

  private holdAway(direction: 1 | -1): void {
    this.held.add(direction === 1 ? 'left' : 'right');
  }
}
