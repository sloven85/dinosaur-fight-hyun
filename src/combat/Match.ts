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
import { rectsOverlap, type AttackKind, type MoveData, type Rect } from './types';
import type { HitParams, ProjectileSpec, ScriptBox } from './moveScript';

/** 날아가는 그림(골판·물결·충격파). 판정은 Match가, 그림은 BattleScene이 맡는다. */
export interface Projectile {
  owner: PlayerIndex;
  kind: AttackKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  rotation: number;
  spin: number | null;
  life: number;
  /** 나온 뒤 지난 시간(초). 커지기·사라지기 연출용. */
  age: number;
  /** 쏜 기술의 공격 id(소나기 여러 장을 연속 피격 1회로 센다). */
  attackId: number;
  /** 이미 맞혔는지(관통 투사체). */
  spent: boolean;
  readonly spec: ProjectileSpec;
  facing: 1 | -1;
}

export type RoundPhase = 'intro' | 'fight' | 'roundOver' | 'matchOver';

/**
 * 프롬프트 6 연출용 사건. Match는 "무슨 일이 있었는지"만 남기고,
 * 화면(BattleScene)이 이벤트를 소비해 먼지·별·충격파·진동·소리를 낸다.
 * 이벤트는 보이는 연출 전용이라 전투 수치에 영향을 주지 않는다.
 */
export interface MatchEvent {
  /** fx = 기술 스크립트가 낸 화면 연출(흔들림·먼지·충격파·물보라·번쩍). stun = 기절 시작. */
  type: 'hit' | 'guard' | 'ko' | 'fx' | 'stun';
  fx?: 'shake' | 'dust' | 'shockwave' | 'splash' | 'flash' | 'slash' | 'feathers';
  strength?: number;
  /** 사건이 일어난 위치(화면 x, 지면 기준 y). */
  x: number;
  y: number;
  direction: 1 | -1;
  kind: AttackKind;
  player: PlayerIndex;
}

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
  /** 아직 화면이 소비하지 않은 연출 이벤트. */
  private events: MatchEvent[] = [];
  /** 지금 날아가는 투사체. */
  projectiles: Projectile[] = [];

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
    this.fighters[0].opponent = this.fighters[1];
    this.fighters[1].opponent = this.fighters[0];
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

  /** 이번 틱에 쌓인 연출 이벤트를 돌려주고 비운다(화면이 매 프레임 소비). */
  consumeEvents(): MatchEvent[] {
    if (this.events.length === 0) return [];
    const events = this.events;
    this.events = [];
    return events;
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
        this.updateHeld();
        this.updateFacing();
        this.separate();
        this.resolveScripts();
        this.updateHeld();
        this.stepProjectiles(dt);
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
    this.projectiles = [];
    // 라운드가 바뀌면 CPU 판단·휴식·특수기 쿨다운도 정확히 초기화한다.
    this.cpu?.reset();
  }

  private endRound(winner: PlayerIndex | null): void {
    this.phase = 'roundOver';
    this.phaseFrames = 0;
    this.roundWinner = winner;
    this.roundWasDraw = winner === null;

    this.projectiles = [];
    for (const fighter of this.fighters) {
      fighter.releaseHold();
      fighter.attack = null;
      fighter.scriptVisual = null;
      fighter.ghosts = [];
      fighter.hitstunFrames = 0;
      fighter.kbFrames = 0;
      fighter.kbPerFrame = 0;
    }

    if (winner === null) {
      // 무승부는 승수를 올리지 않고 재라운드한다(계획서 2절).
      this.p1.state = 'down';
      this.p2.state = 'down';
      this.pushKoEvent(this.p1);
      this.pushKoEvent(this.p2);
    } else {
      this.fighters[winner].roundWins += 1;
      this.fighters[winner].state = 'victory';
      const loser = this.fighters[1 - winner];
      loser.state = 'down';
      // 프롬프트 6: KO 뒤 쓰러진 캐릭터에 별이 돈다.
      this.pushKoEvent(loser);
    }
  }

  private pushKoEvent(fighter: Fighter): void {
    this.events.push({
      type: 'ko',
      x: fighter.x,
      y: fighter.y - fighter.bodyHeight * 0.4,
      direction: fighter.facing,
      kind: 'heavy',
      player: fighter.player,
    });
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
    const free = (f: Fighter): boolean => f.state !== 'attack' && f.state !== 'held';
    if (free(a)) a.facing = a.x < b.x ? 1 : -1;
    if (free(b)) b.facing = b.x < a.x ? 1 : -1;
  }

  /** 몸통이 겹치지 않게 밀어낸다. 상대 몸통을 통과하지 않는다. */
  private separate(): void {
    const [a, b] = this.fighters;
    // 잡기 중이거나 상대를 통과하는 기술(왕복)은 밀어내지 않는다.
    if (a.holding || b.holding || a.activeScript?.passThrough || b.activeScript?.passThrough) return;
    if (a.isIntangible() || b.isIntangible()) return;
    // 넘어진 상대는 넘어갈 수 있다(쓰러진 위로 지나가기).
    if (a.state === 'fallen' || b.state === 'fallen') return;
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
      if (defender.state === 'held' || defender.state === 'fallen') continue;
      if (defender.isIntangible()) continue;

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

  /** 맞는 쪽이 반격 자세면 피해 없이 반격으로 넘어간다(안킬로 철벽 반격). */
  private counterHit(attacker: Fighter, defender: Fighter): boolean {
    if (!defender.tryCounter()) return false;
    attacker.hitstopFrames = 10;
    defender.hitstopFrames = 10;
    // 반격이 맞는 방향을 보도록 돌려 세운다.
    this.pushFx(defender, 'flash', 1.5);
    this.events.push({ type: 'guard', x: (attacker.x + defender.x) / 2, y: defender.y - defender.bodyHeight * 0.55, direction: defender.facing, kind: 'special', player: defender.player });
    return true;
  }

  private applyHit({ attacker, defender, move, guarded }: HitEvent): void {
    const direction: 1 | -1 = defender.x >= attacker.x ? 1 : -1;
    if (this.counterHit(attacker, defender)) return;

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
      defender.releaseHold();
      defender.state = 'hit';
      defender.hitstunFrames = move.hitstunFrames;
      defender.attack = null;
      defender.scriptVisual = null;
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

    // 연출용 이벤트(피해와 무관). 맞은 지점은 두 몸통 사이, 가슴 높이로 잡는다.
    this.events.push({
      type: guarded ? 'guard' : 'hit',
      x: (attacker.x + defender.x) / 2,
      y: defender.y - defender.bodyHeight * 0.55,
      direction,
      kind: move.kind,
      player: defender.player,
    });
  }

  // --- 기술 스크립트(잡기·다단히트·투사체·던지기·위치 바꾸기) ---

  /** 잡힌 쪽을 잡은 쪽 입 앞(스크립트 hold 키)에 붙인다. */
  private updateHeld(): void {
    for (const holder of this.fighters) {
      const target = holder.holding;
      if (!target) continue;
      if (holder.state !== 'attack') {
        holder.releaseHold();
        continue;
      }
      const hold = holder.holdOffset();
      target.x = holder.x + holder.facing * (holder.bodyFront + hold.x);
      target.y = Math.min(0, holder.y + hold.y);
      target.onGround = target.y >= 0;
      target.vy = 0;
      target.facing = (-holder.facing) as 1 | -1;
      target.heldRot = hold.rot;
    }
  }

  private scriptBoxRect(fighter: Fighter, box: ScriptBox): Rect {
    const origin = box.anchor === 'center' ? 0 : fighter.bodyFront;
    const near = origin + box.x;
    const left = fighter.facing === 1 ? fighter.x + near : fighter.x - near - box.w;
    const top = fighter.y + box.y;
    return { left, right: left + box.w, top, bottom: top + box.h };
  }

  /** 디버그 표시용: 지금 프레임에 켜진 스크립트 판정 상자. */
  scriptHitboxes(fighter: Fighter): Rect[] {
    const script = fighter.activeScript;
    const frame = fighter.attack?.frame ?? -1;
    if (!script) return [];
    const boxes: Rect[] = [];
    for (const hit of script.hits ?? []) {
      if (hit.box && frame >= hit.from && frame <= hit.to) boxes.push(this.scriptBoxRect(fighter, hit.box));
    }
    const grab = script.grab;
    if (grab && frame >= grab.from && frame <= grab.to) boxes.push(this.scriptBoxRect(fighter, grab.box));
    return boxes;
  }

  private canBeTouched(defender: Fighter, otg = false): boolean {
    return (
      defender.invulnFrames <= 0 &&
      !defender.isIntangible() &&
      defender.state !== 'down' &&
      defender.state !== 'victory' &&
      (otg || defender.state !== 'fallen')
    );
  }

  private resolveScripts(): void {
    for (const attacker of this.fighters) {
      const attack = attacker.attack;
      const script = attacker.activeScript;
      const run = attack?.script;
      if (!attack || !script || !run) continue;
      if (attacker.hitstopFrames > 0) continue;
      const defender = this.opponentOf(attacker);
      const f = attack.frame;

      // 잡기: 구간 안에 닿으면 붙잡고 성공 경로로, 끝까지 못 잡으면 헛방 경로로.
      const grab = script.grab;
      if (grab && !run.grabResolved && f >= grab.from && f <= grab.to) {
        const touch =
          this.canBeTouched(defender) &&
          defender.state !== 'held' &&
          rectsOverlap(this.scriptBoxRect(attacker, grab.box), defender.hurtbox());
        if (touch) {
          run.grabResolved = true;
          run.grabbed = true;
          defender.releaseHold();
          defender.attack = null;
          defender.scriptVisual = null;
          defender.state = 'held';
          defender.heldBy = attacker;
          attacker.holding = defender;
          if (grab.success !== undefined) attack.frame = grab.success;
          attacker.applyScriptFrame();
          this.updateHeld();
          this.pushFx(attacker, 'dust', 1);
          continue;
        }
        if (f === grab.to) {
          run.grabResolved = true;
          attack.frame = grab.miss;
          attacker.applyScriptFrame();
          continue;
        }
      }

      // 다단히트: 판정마다 한 번씩.
      (script.hits ?? []).forEach((hit, index) => {
        if (run.landed.has(index) || f < hit.from || f > hit.to) return;
        if (hit.target === 'held') {
          if (attacker.holding === defender) {
            run.landed.add(index);
            this.applyDamage(attacker, defender, hit, attack.move.kind, false, attacker.facing, true);
          }
          return;
        }
        if (!hit.box || !this.canBeTouched(defender, hit.otg) || defender.state === 'held') return;
        if (hit.groundOnly && !defender.onGround) return;
        if (!rectsOverlap(this.scriptBoxRect(attacker, hit.box), defender.hurtbox())) return;
        run.landed.add(index);
        const guarded = !hit.unguardable && defender.isGuarding(attacker);
        // 밀려나는 방향은 '공격자에게서 멀어지는 쪽'(뒤돌아 꼬리로 칠 때도 맞다).
        const away: 1 | -1 = defender.x >= attacker.x ? 1 : -1;
        this.applyDamage(attacker, defender, hit, attack.move.kind, guarded, away, false);
      });

      // 사건: 해당 프레임에 한 번.
      (script.events ?? []).forEach((event, index) => {
        if (event.f !== f || run.fired.has(index)) return;
        run.fired.add(index);
        switch (event.type) {
          case 'projectile':
            this.projectiles.push({
              owner: attacker.player,
              kind: attack.move.kind,
              // 방향은 기술 시작 방향 기준(뒤돌아 꼬리 휘두르는 중에도 상대 쪽으로 쏜다).
              x:
                event.at === 'opponent'
                  ? defender.x + run.startFacing * event.x
                  : attacker.x + run.startFacing * (attacker.bodyFront + event.x),
              y: event.at === 'opponent' ? event.y : attacker.y + event.y,
              vx: run.startFacing * event.vx,
              vy: event.vy ?? 0,
              gravity: event.gravity ?? 0,
              rotation: 0,
              spin: event.spin ?? null,
              life: event.life,
              age: 0,
              attackId: attack.attackId,
              spent: false,
              spec: event,
              facing: run.startFacing,
            });
            break;
          case 'throw': {
            const target = attacker.holding;
            if (!target) break;
            attacker.releaseHold();
            if (event.behind) {
              target.x = attacker.x - attacker.facing * (attacker.bodyWidth * 0.5);
            }
            const dir = event.behind ? -attacker.facing : attacker.facing;
            target.health = Math.max(0, target.health - Math.round(event.damage * attacker.data.damageScale));
            target.launch(dir * event.vx, event.vy, event.knockdown);
            attacker.meter = Math.min(MAX_METER, attacker.meter + METER_ON_HIT);
            this.pushHitEvent(attacker, target, attack.move.kind, false, dir as 1 | -1);
            break;
          }
          case 'swap': {
            const ax = attacker.x;
            attacker.x = defender.x;
            defender.x = ax;
            break;
          }
          case 'fx':
            this.pushFx(attacker, event.fx, event.strength ?? 1, event.x, event.y);
            break;
          case 'end':
            attacker.endAttack();
            break;
        }
      });
    }
  }

  private pushFx(
    fighter: Fighter,
    fx: NonNullable<MatchEvent['fx']>,
    strength: number,
    x = 0,
    y = 0,
  ): void {
    this.events.push({
      type: 'fx',
      fx,
      strength,
      x: fighter.x + fighter.facing * (fighter.bodyFront + x),
      y: fighter.y + y,
      direction: fighter.facing,
      kind: fighter.attack?.move.kind ?? 'heavy',
      player: fighter.player,
    });
  }

  private stepProjectiles(dt: number): void {
    const alive: Projectile[] = [];
    for (const p of this.projectiles) {
      p.life -= dt;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation = p.spin === null ? Math.atan2(p.vy, Math.abs(p.vx)) : p.rotation + p.spin * dt;
      p.age += dt;
      if (p.life <= 0 || p.x < -400 || p.x > 2320 || p.y > 0) {
        if (p.y > 0) this.events.push({ type: 'fx', fx: 'dust', strength: 0.8, x: p.x, y: 0, direction: p.facing, kind: p.kind, player: p.owner });
        continue;
      }
      const target = this.fighters[1 - p.owner];
      const owner = this.fighters[p.owner];
      const grow = 1 + (p.spec.grow ?? 0) * p.age;
      const box: Rect = {
        left: p.x - (p.spec.w * grow) / 2,
        right: p.x + (p.spec.w * grow) / 2,
        top: p.y - (p.spec.h * grow) / 2,
        bottom: p.y + (p.spec.h * grow) / 2,
      };
      if (
        !p.spec.harmless &&
        !p.spent &&
        this.canBeTouched(target, p.spec.otg) &&
        target.state !== 'held' &&
        !(p.spec.groundOnly && !target.onGround) &&
        rectsOverlap(box, target.hurtbox())
      ) {
        const guarded = !p.spec.unguardable && target.isGuarding(owner);
        this.applyDamage(owner, target, p.spec, p.kind, guarded, p.facing, false, p.x, p.attackId);
        if (!p.spec.pierce) continue;
        p.spent = true;
      }
      alive.push(p);
    }
    this.projectiles = alive;
  }

  /**
   * 피해·경직·넉백·띄우기·넘어뜨리기·기절 공통 처리(스크립트·투사체).
   * held=true면 잡힌 채로 맞는 타격이라 경직·넉백 없이 피해와 멈칫만 준다.
   */
  private applyDamage(
    attacker: Fighter,
    defender: Fighter,
    hit: HitParams,
    moveKind: AttackKind,
    guarded: boolean,
    direction: 1 | -1,
    held: boolean,
    atX?: number,
    sourceAttackId?: number,
  ): void {
    if (!held && this.counterHit(attacker, defender)) return;
    let damage = hit.damage * attacker.data.damageScale;
    if (guarded) damage *= moveKind === 'special' ? GUARD_DAMAGE_SPECIAL_RATIO : 0;
    damage = Math.round(damage);

    if (defender.state === 'fallen') {
      // 넘어진 상대를 덮치기(otg): 넘어진 채로 피해와 멈칫만 받는다.
      defender.health = Math.max(0, defender.health - damage);
      defender.fallenFrames = Math.max(defender.fallenFrames, 24);
      attacker.hitstopFrames = hit.hitstop;
      defender.hitstopFrames = hit.hitstop;
      this.pushHitEvent(attacker, defender, hit.fx ?? moveKind, false, direction, atX);
      return;
    }
    if (guarded) {
      defender.health = Math.max(GUARD_MIN_HEALTH, defender.health - damage);
      defender.kbPerFrame = (direction * hit.knockback * GUARD_KNOCKBACK_RATIO) / KNOCKBACK_FRAMES;
      defender.kbFrames = KNOCKBACK_FRAMES;
    } else {
      defender.health = Math.max(0, defender.health - damage);
      attacker.meter = Math.min(MAX_METER, attacker.meter + METER_ON_HIT);
      defender.meter = Math.min(MAX_METER, defender.meter + METER_ON_HIT_TAKEN);
      if (!held) {
        defender.releaseHold();
        defender.attack = null;
        defender.scriptVisual = null;
        if (hit.launch) {
          defender.launch(direction * hit.launch.vx, hit.launch.vy, hit.knockdown ?? 0);
        } else if (hit.knockdown) {
          defender.knockDown(hit.knockdown);
        } else if (hit.stun) {
          defender.stun(hit.stun);
          this.events.push({ type: 'stun', x: defender.x, y: defender.y - defender.bodyHeight, direction, kind: moveKind, player: defender.player });
        } else {
          defender.state = 'hit';
          defender.hitstunFrames = hit.hitstun;
        }
        defender.kbPerFrame = (direction * hit.knockback) / KNOCKBACK_FRAMES;
        defender.kbFrames = hit.launch ? 0 : KNOCKBACK_FRAMES;
      }
      // 다단히트 기술은 한 기술을 '연속 피격 1회'로 센다(왕복 5연타가 보호 무적에 끊기지 않게).
      const attackId = sourceAttackId ?? attacker.attack?.attackId ?? -1;
      if (defender.lastCountedAttackId !== attackId || attackId === -1) {
        defender.lastCountedAttackId = attackId;
        attacker.consecutiveHits = 0;
        defender.consecutiveHits += 1;
        if (defender.consecutiveHits >= CONSECUTIVE_HIT_LIMIT && !held) {
          defender.invulnFrames = HIT_INVULN_FRAMES;
          defender.consecutiveHits = 0;
        }
      }
    }

    attacker.hitstopFrames = hit.hitstop;
    defender.hitstopFrames = hit.hitstop;
    this.pushHitEvent(attacker, defender, hit.fx ?? moveKind, guarded, direction, atX);
  }

  private pushHitEvent(
    attacker: Fighter,
    defender: Fighter,
    kind: AttackKind,
    guarded: boolean,
    direction: 1 | -1,
    atX?: number,
  ): void {
    this.events.push({
      type: guarded ? 'guard' : 'hit',
      x: atX ?? (attacker.x + defender.x) / 2,
      y: defender.y - defender.bodyHeight * 0.55,
      direction,
      kind,
      player: defender.player,
    });
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
