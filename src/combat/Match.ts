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
import type { GameMode } from '../core/session';
import type { PlayerIndex } from '../input/InputManager';
import { emptyAssets, type CharacterAssets } from '../rendering/CharacterAssets';
import { Fighter, NULL_INPUT, type FighterInput } from './Fighter';
import { rectsOverlap, type MoveData } from './types';

export type RoundPhase = 'intro' | 'fight' | 'roundOver' | 'matchOver';

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

  constructor(
    private readonly mode: GameMode,
    characterIds: [string, string],
    assets: [CharacterAssets, CharacterAssets] = [
      emptyAssets(characterIds[0]),
      emptyAssets(characterIds[1]),
    ],
  ) {
    this.fighters = [
      new Fighter(0, characterIds[0], START_X_P1, 1, assets[0]),
      new Fighter(1, characterIds[1], START_X_P2, -1, assets[1]),
    ];
  }

  /** 2P가 CPU인 경로에서는 입력을 주지 않는다. AIController는 프롬프트 5에서 붙인다. */
  private inputFor(player: PlayerIndex, input: FighterInput): FighterInput {
    if (this.mode === 'cpu' && player === 1) return NULL_INPUT;
    return input;
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
    this.p1.resetForRound(START_X_P1, 1);
    this.p2.resetForRound(START_X_P2, -1);
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
    const ratioP1 = this.p1.health / this.p1.data.baseHealth;
    const ratioP2 = this.p2.health / this.p2.data.baseHealth;
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
