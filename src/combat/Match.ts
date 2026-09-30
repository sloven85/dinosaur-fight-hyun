import {
  CONSECUTIVE_HIT_LIMIT,
  GUARD_DAMAGE_SPECIAL_RATIO,
  GUARD_KNOCKBACK_RATIO,
  GUARD_MIN_HEALTH,
  HIT_INVULN_FRAMES,
  KNOCKBACK_FRAMES,
  MAX_METER,
  MAX_ROUNDS,
  METER_ON_HIT,
  METER_ON_HIT_TAKEN,
  ROUND_INTRO_FRAMES,
  ROUND_OVER_FRAMES,
  ROUND_SECONDS,
  ROUNDS_TO_WIN,
  SIMULATION_HZ,
  START_X_P1,
  START_X_P2,
} from '../core/constants';
import { AIController } from '../ai/AIController';
import {
  ASSIST_CPU_ATTACK_FREQUENCY_SCALE,
  P1_ASSIST_HEALTH_MULTIPLIER,
  type CpuDifficulty,
} from '../core/settings';
import type { GameMode } from '../core/session';
import type { PlayerIndex } from '../input/InputManager';
import { emptyAssets, type CharacterAssets } from '../rendering/CharacterAssets';
import { Fighter, NULL_INPUT, type FighterInput } from './Fighter';
import { rectsOverlap, type MoveData } from './types';

export type RoundPhase = 'intro' | 'fight' | 'roundOver' | 'matchOver';

/** 계획서 16절 프롬프트 5: 난이도·도움 설정·테스트용 난수원. */
export interface MatchOptions {
  difficulty?: CpuDifficulty;
  assist?: boolean;
  random?: () => number;
}

interface HitEvent {
  attacker: Fighter;
  defender: Fighter;
  move: MoveData;
  guarded: boolean;
}

/**
 * 한 경기(45초 라운드 · 2라운드 선승)를 진행한다.
 * 계획서 2~3절: 자동 가드, 게이지, 넉백, 피격 경직, 동시 타격 해결 후 KO 판정, 무승부 재라운드.
 */
export class Match {
  readonly fighters: [Fighter, Fighter];

  phase: RoundPhase = 'intro';
  phaseFrames = 0;
  roundNumber = 1;
  timerFrames = ROUND_SECONDS * SIMULATION_HZ;
  roundWinner: PlayerIndex | null = null;
  matchWinner: PlayerIndex | null = null;
  /** 이번 라운드가 무승부였는지(연출 표시용). */
  roundWasDraw = false;
  /** 두 플레이어가 같은 캐릭터인지(계획서 4절: 동일 캐릭터 대전 허용, 2P 보조색). */
  readonly mirrorMatch: boolean;
  /** 고른 CPU 난이도. */
  readonly difficulty: CpuDifficulty;
  /** 도움 설정이 실제로 켜져 있는지(1인 대전에서만 적용). */
  readonly assistActive: boolean;

  private readonly cpu: AIController | null;

  constructor(
    private readonly mode: GameMode,
    characterIds: [string, string],
    assets: [CharacterAssets, CharacterAssets] = [
      emptyAssets(characterIds[0]),
      emptyAssets(characterIds[1]),
    ],
    options: MatchOptions = {},
  ) {
    this.mirrorMatch = characterIds[0] === characterIds[1];
    this.difficulty = options.difficulty ?? 'easy';
    // 계획서 2절: 도움 설정은 1P 체력 1.5배 + CPU 공격 빈도 감소. 기본값은 꺼짐.
    this.assistActive = this.mode === 'cpu' && options.assist === true;

    this.fighters = [
      new Fighter(0, characterIds[0], START_X_P1, 1, assets[0]),
      new Fighter(1, characterIds[1], START_X_P2, -1, assets[1]),
    ];
    // 동일 캐릭터일 때만 2P에 보조색을 적용해 구분한다.
    this.fighters[1].useAlternatePalette = this.mirrorMatch;

    this.cpu =
      this.mode === 'cpu'
        ? new AIController(1, {
            difficulty: this.difficulty,
            attackFrequencyScale: this.assistActive ? ASSIST_CPU_ATTACK_FREQUENCY_SCALE : 1,
            random: options.random,
          })
        : null;

    this.applyAssistHealth();
  }

  /** CPU 컨트롤러(1인 대전에서만 존재). 테스트·디버그용. */
  get cpuController(): AIController | null {
    return this.cpu;
  }

  /** 2P가 CPU인 경로에서는 사람 입력 대신 AIController의 Action을 쓴다(프롬프트 5). */
  private inputFor(player: PlayerIndex, input: FighterInput): FighterInput {
    if (this.mode === 'cpu' && player === 1) return this.cpu ?? NULL_INPUT;
    return input;
  }

  /** 도움 설정이 켜져 있으면 1P 최대 체력을 1.5배로 잡는다. */
  private applyAssistHealth(): void {
    if (this.assistActive) {
      this.fighters[0].setMaxHealthMultiplier(P1_ASSIST_HEALTH_MULTIPLIER);
    }
  }

  get p1(): Fighter {
    return this.fighters[0];
  }

  get p2(): Fighter {
    return this.fighters[1];
  }

  get timeLeftSeconds(): number {
    return Math.max(0, Math.ceil(this.timerFrames / SIMULATION_HZ));
  }

  step(input: FighterInput, dt: number): void {
    this.phaseFrames += 1;

    switch (this.phase) {
      case 'intro':
        if (this.phaseFrames >= ROUND_INTRO_FRAMES) {
          this.phase = 'fight';
          this.phaseFrames = 0;
        }
        break;

      case 'fight':
        // CPU는 이번 틱의 공개 상태를 보고 Action을 정한 뒤, 사람과 같은 경로로 step한다.
        this.cpu?.update(this.p2, this.p1, dt);
        for (const fighter of this.fighters) {
          fighter.step(this.inputFor(fighter.player, input), dt);
        }
        this.updateFacing();
        this.separate();
        this.resolveHits();
        this.timerFrames -= 1;
        if (this.checkKnockouts()) break;
        if (this.timerFrames <= 0) this.resolveTimeout();
        break;

      case 'roundOver':
        if (this.phaseFrames >= ROUND_OVER_FRAMES) this.advanceAfterRound();
        break;

      case 'matchOver':
        break;
    }
  }

  // --- 라운드 진행 ---

  private startRound(): void {
    this.phase = 'intro';
    this.phaseFrames = 0;
    this.roundWinner = null;
    this.roundWasDraw = false;
    this.timerFrames = ROUND_SECONDS * SIMULATION_HZ;
    this.applyAssistHealth();
    this.p1.resetForRound(START_X_P1, 1);
    this.p2.resetForRound(START_X_P2, -1);
    this.p2.useAlternatePalette = this.mirrorMatch;
    // 라운드가 바뀌면 CPU 판단·휴식·특수기 쿨다운도 정확히 초기화한다.
    this.cpu?.reset();
  }

  private endRound(winner: PlayerIndex | null): void {
    this.phase = 'roundOver';
    this.phaseFrames = 0;
    this.roundWinner = winner;
    this.roundWasDraw = winner === null;

    for (const fighter of this.fighters) {
      fighter.attack = null;
      fighter.hitstunFrames = 0;
      fighter.kbFrames = 0;
      fighter.kbPerFrame = 0;
    }

    if (winner === null) {
      // 무승부는 승수를 올리지 않고 재라운드한다(계획서 2절).
      this.p1.state = 'down';
      this.p2.state = 'down';
    } else {
      this.fighters[winner].roundWins += 1;
      this.fighters[winner].state = 'victory';
      this.fighters[1 - winner].state = 'down';
    }
  }

  private advanceAfterRound(): void {
    if (this.p1.roundWins >= ROUNDS_TO_WIN) {
      this.matchWinner = 0;
      this.phase = 'matchOver';
      return;
    }
    if (this.p2.roundWins >= ROUNDS_TO_WIN) {
      this.matchWinner = 1;
      this.phase = 'matchOver';
      return;
    }
    if (this.roundNumber >= MAX_ROUNDS) {
      this.matchWinner = null;
      this.phase = 'matchOver';
      return;
    }
    this.roundNumber += 1;
    this.startRound();
  }

  // --- 판정 ---

  private updateFacing(): void {
    const [a, b] = this.fighters;
    if (a.x === b.x) return;
    if (a.state !== 'attack') a.facing = a.x < b.x ? 1 : -1;
    if (b.state !== 'attack') b.facing = b.x < a.x ? 1 : -1;
  }

  /** 몸통이 겹치지 않게 밀어낸다. 상대 몸통을 통과하지 않는다. */
  private separate(): void {
    const [a, b] = this.fighters;
    const minGap = (a.bodyWidth + b.bodyWidth) / 2;
    const gap = Math.abs(a.x - b.x);
    if (gap >= minGap) return;

    const push = (minGap - gap) / 2;
    if (a.x <= b.x) {
      a.x -= push;
      b.x += push;
    } else {
      a.x += push;
      b.x -= push;
    }
    a.clampToArena();
    b.clampToArena();
  }

  /** 동일 틱의 양쪽 타격을 모아 함께 해결한다(계획서 16절 프롬프트 2). */
  private resolveHits(): void {
    const events: HitEvent[] = [];

    for (const attacker of this.fighters) {
      if (attacker.state !== 'attack' || !attacker.attack) continue;
      const defender = this.opponentOf(attacker);
      if (attacker.attack.hitTargets.has(defender.player)) continue;
      if (defender.invulnFrames > 0) continue;
      if (defender.state === 'down' || defender.state === 'victory') continue;

      const hitboxes = attacker.activeHitboxes();
      if (hitboxes.length === 0) continue;
      const hurtbox = defender.hurtbox();
      if (!hitboxes.some((box) => rectsOverlap(box, hurtbox))) continue;

      attacker.attack.hitTargets.add(defender.player);
      events.push({
        attacker,
        defender,
        move: attacker.attack.move,
        guarded: defender.isGuarding(attacker),
      });
    }

    for (const event of events) this.applyHit(event);
  }

  private applyHit({ attacker, defender, move, guarded }: HitEvent): void {
    const direction: 1 | -1 = defender.x >= attacker.x ? 1 : -1;

    let damage = move.damage * attacker.data.damageScale;
    if (guarded) {
      damage *= move.kind === 'special' ? GUARD_DAMAGE_SPECIAL_RATIO : 0;
    }
    damage = Math.round(damage);

    if (guarded) {
      // 가드: 약·강 피해 0, 특수기 20%. 체력은 1 아래로 내려가지 않는다.
      defender.health = Math.max(GUARD_MIN_HEALTH, defender.health - damage);
      defender.kbPerFrame = (direction * move.knockback * GUARD_KNOCKBACK_RATIO) / KNOCKBACK_FRAMES;
      defender.kbFrames = KNOCKBACK_FRAMES;
    } else {
      defender.health = Math.max(0, defender.health - damage);
      defender.state = 'hit';
      defender.hitstunFrames = move.hitstunFrames;
      defender.attack = null;
      defender.kbPerFrame = (direction * move.knockback) / KNOCKBACK_FRAMES;
      defender.kbFrames = KNOCKBACK_FRAMES;

      attacker.meter = Math.min(MAX_METER, attacker.meter + METER_ON_HIT);
      defender.meter = Math.min(MAX_METER, defender.meter + METER_ON_HIT_TAKEN);
      attacker.consecutiveHits = 0;

      defender.consecutiveHits += 1;
      if (defender.consecutiveHits >= CONSECUTIVE_HIT_LIMIT) {
        defender.invulnFrames = HIT_INVULN_FRAMES;
        defender.consecutiveHits = 0;
      }
    }

    // 타격 정지는 양측에 동일 적용한다.
    attacker.hitstopFrames = move.hitstopFrames;
    defender.hitstopFrames = move.hitstopFrames;
  }

  private checkKnockouts(): boolean {
    const fallen = this.fighters.filter((fighter) => fighter.health <= 0);
    if (fallen.length === 0) return false;
    if (fallen.length === 2) {
      this.endRound(null);
    } else {
      this.endRound(fallen[0].player === 0 ? 1 : 0);
    }
    return true;
  }

  /** 계획서 2절: 시간 종료 시 절대 체력이 아닌 남은 체력 비율을 비교한다. */
  private resolveTimeout(): void {
    // 도움 설정으로 최대 체력이 달라져도 공정하게 비교한다.
    const ratioP1 = this.p1.health / this.p1.maxHealth;
    const ratioP2 = this.p2.health / this.p2.maxHealth;
    if (Math.abs(ratioP1 - ratioP2) < 1e-6) {
      this.endRound(null);
    } else {
      this.endRound(ratioP1 > ratioP2 ? 0 : 1);
    }
  }

  private opponentOf(fighter: Fighter): Fighter {
    return fighter.player === 0 ? this.p2 : this.p1;
  }
}
