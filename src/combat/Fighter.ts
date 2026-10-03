import {
  ARENA_LEFT,
  ARENA_RIGHT,
  BASE_MOVE_SPEED,
  FIXED_DT,
  GLIDE_FALL_SPEED,
  GLIDE_MAX_FRAMES,
  GRAVITY,
  HITBOX_OVERSHOOT,
  INPUT_BUFFER_FRAMES,
  JUMP_VELOCITY,
  LEAP_CHARGE_FRAMES,
  LEAP_CHARGE_SPEED,
  LEAP_CHARGE_VELOCITY,
  MAX_METER,
  METER_PER_SECOND,
  SPECIAL_FLASH_FRAMES,
  START_METER,
} from '../core/constants';
import { getCharacter, getMove, type CharacterData } from '../data';
import type { Action } from '../input/actions';
import type { PlayerIndex } from '../input/InputManager';
import { emptyAssets, type CharacterAssets } from '../rendering/CharacterAssets';
import { spriteScale } from '../rendering/rig';
import { contactPilotMove } from './chargePilot';
import { expandedPilotMove } from './expandedPilot';
import { bitePilotMove, alignCloseBite } from './bitePilot';
import { newReaction, stepReaction, type Contact } from './partContact';
import {
  hasChannel,
  sampleChannel,
  sampleFace,
  sampleParts,
  type MoveScript,
} from './moveScript';
import {
  attackPhase,
  moveTotalFrames,
  type AttackInstance,
  type AttackKind,
  type FighterState,
  type MoveData,
  type Rect,
} from './types';

let nextAttackId = 1;

/** 몸통 판정 폭 비율(디자인 높이 대비). */
const BODY_WIDTH_RATIO = 0.62;
const CROUCH_HEIGHT_RATIO = 0.75;

/** 일어난 뒤 잠깐 무적(넘어뜨리기 후 바로 다시 맞지 않게). */
const GET_UP_INVULN_FRAMES = 30;
/** 잔상으로 남길 지난 프레임 수. */
const GHOST_LENGTH = 6;

/** 스크립트 기술이 정한 '보이는 모양'(판정과 무관). */
export interface ScriptVisual {
  rot: number;
  sx: number;
  sy: number;
  ghost: number;
  /** 보이는 모양만 땅 아래로(px). */
  sink: number;
  parts: Record<string, number> | null;
  /** 지금 켜진 덧그림(마스터 무대 좌표). */
  overlays: { sprite: string; rect: [number, number, number, number]; hideBody: boolean; flash: boolean }[];
}

/** 잔상 한 장. */
export interface GhostSnapshot {
  x: number;
  y: number;
  facing: 1 | -1;
  visual: ScriptVisual;
  alpha: number;
}

/** Fighter가 필요로 하는 입력 표면. CPU는 항상 false를 돌려주는 구현을 쓴다(프롬프트 5). */
export interface FighterInput {
  isHeld(player: PlayerIndex, action: Action): boolean;
  isPressed(player: PlayerIndex, action: Action): boolean;
}

export const NULL_INPUT: FighterInput = {
  isHeld: () => false,
  isPressed: () => false,
};

/**
 * 한 캐릭터의 전투 상태·물리·기술을 담는다.
 * 계획서 15절 상태(idle·walk·crouch·jump·attack·hit·down·victory)를 따른다.
 */
export class Fighter {
  readonly player: PlayerIndex;
  readonly data: CharacterData;
  readonly moves: Record<AttackKind, MoveData>;
  readonly assets: CharacterAssets;

  x: number;
  y = 0;
  vy = 0;
  onGround = true;
  facing: 1 | -1;
  state: FighterState = 'idle';
  partContacts = false;
  poseTime = 0;
  reaction = newReaction();
  lastContact: Contact | null = null;

  health: number;
  /** 이번 경기의 최대 체력. 도움 설정(1P 1.5배)이 걸리면 baseHealth보다 커진다. */
  maxHealth: number;
  meter = START_METER;
  roundWins = 0;

  attack: AttackInstance | null = null;
  hitstunFrames = 0;
  hitstopFrames = 0;
  invulnFrames = 0;
  specialFlashFrames = 0;
  consecutiveHits = 0;

  kbFrames = 0;
  kbPerFrame = 0;

  /** 동일 캐릭터 대전에서 2P에 보조색을 적용할지. Match가 정한다(계획서 4절). */
  useAlternatePalette = false;
  /** 이번에 뜬 뒤 남은 활공 프레임. 착지하면 회복된다(프테라노돈). */
  glideFrames = GLIDE_MAX_FRAMES;
  /** 이번 틱에 활공 중이었는지(렌더링·테스트용). */
  gliding = false;
  /** 이번 틱에 착지했는지(프롬프트 6 착지 먼지 연출용). */
  landedThisStep = false;

  // --- 기술 스크립트(잡기·띄우기·넘어뜨리기·기절) ---
  /** 상대(Match가 연결). 돌진 거리 계산에 쓴다. */
  opponent: Fighter | null = null;
  /** 다단히트를 '연속 피격 1회'로 세기 위한 마지막 공격 id. */
  lastCountedAttackId = -1;
  /** 내가 붙잡고 있는 상대. */
  holding: Fighter | null = null;
  /** 나를 붙잡고 있는 상대. */
  heldBy: Fighter | null = null;
  /** 붙잡힌 동안 보이는 기울기(라디안). */
  heldRot = 0;
  biteAnchor: { part: string; x: number; y: number; dx: number; dy: number } | null = null;
  /** 띄워졌을 때 가로 속도(px/초). */
  vx = 0;
  /** 착지하면 넘어질 프레임(띄우기·던지기 후). */
  pendingKnockdown = 0;
  fallenFrames = 0;
  /** 이번 넘어짐의 전체 프레임(연출 단계 계산용). */
  fallenTotal = 0;
  /** 넘어지기 시작할 때의 몸 회전(공중에서 뒤로 돌던 각도, 라디안). 연출 전용. */
  fallStartAngle = 0;
  /** 띄워져 날아가는 동안의 경과 프레임(0 = 날아가는 중 아님). 연출 전용. */
  airTumble = 0;
  stunFrames = 0;
  /** 막은 직후 반동 남은 프레임. */
  guardFrames = 0;
  /** 스크립트 기술의 보이는 모양. 스크립트 기술이 아니면 null. */
  scriptVisual: ScriptVisual | null = null;
  /** 잔상(오래된 것부터). */
  ghosts: GhostSnapshot[] = [];

  private airAttackUsed = false;
  private bufferedAttack: AttackKind | null = null;
  private bufferFrames = 0;
  private inputLeft = false;
  private inputRight = false;
  private inputUp = false;
  private inputUpHeld = false;
  private inputDown = false;
  /** 대시(jk 요청 2026-10-02): 같은 방향을 두 번 누르면 앞 대시 / 뒤 백스텝. */
  dashFrames = 0;
  dashDir: 1 | -1 = 1;
  /** 방금 대시가 앞(상대 쪽)인지. 연출(잔상·먼지)용. */
  dashForward = true;
  private lastTapDir: -1 | 0 | 1 = 0;
  private lastTapAge = 999;
  private prevLeftHeld = false;
  private prevRightHeld = false;
  /** 도약 돌진 전진 잔여 프레임과 프레임당 이동량. */
  private leapFrames = 0;
  private leapPerFrame = 0;

  constructor(
    player: PlayerIndex,
    characterId: string,
    x: number,
    facing: 1 | -1,
    assets: CharacterAssets = emptyAssets(characterId),
  ) {
    this.player = player;
    this.data = getCharacter(characterId);
    this.assets = assets;
    this.x = x;
    this.facing = facing;
    this.maxHealth = this.data.baseHealth;
    this.health = this.maxHealth;
    this.moves = {
      light: getMove(this.data.moves.light),
      heavy: getMove(this.data.moves.heavy),
      special: getMove(this.data.moves.special),
    };
  }

  // --- 판정 상자 ---
  groundOffset = 0;

  /** Terminal poses must never inherit an attack, hold, guard, or recoil deformation. */
  finishRound(state: 'down' | 'victory'): void {
    this.groundOffset = 0;
    this.releaseHold();
    this.heldBy = null; this.biteAnchor = null; this.heldRot = 0;
    this.attack = null; this.scriptVisual = null; this.ghosts = [];
    this.reaction = newReaction(); this.lastContact = null;
    this.hitstunFrames = this.hitstopFrames = this.invulnFrames = this.specialFlashFrames = 0;
    this.kbFrames = this.kbPerFrame = this.vx = this.vy = 0;
    this.pendingKnockdown = this.fallenFrames = this.fallenTotal = this.airTumble = this.stunFrames = this.guardFrames = 0;
    this.fallStartAngle = 0; this.dashFrames = this.leapFrames = this.leapPerFrame = 0;
    this.bufferedAttack = null; this.bufferFrames = 0;
    this.inputLeft = this.inputRight = this.inputUp = this.inputUpHeld = this.inputDown = false;
    this.gliding = false; this.poseTime = 0;
    this.y = Math.min(0, this.y); this.onGround = this.y === 0;
    this.state = state;
  }

  /** Continue gravity after combat stops; no input or attacks run during this descent. */
  settleAfterRound(dt: number): void {
    if (this.state !== 'down' && this.state !== 'victory') return;
    if (this.onGround) { this.y = 0; this.vy = 0; return; }
    this.vy += GRAVITY * dt;
    this.y = Math.min(0, this.y + this.vy * dt);
    if (this.y === 0) { this.onGround = true; this.vy = 0; this.landedThisStep = true; }
  }

  private get masterBox() {
    const rig = this.assets.rig;
    if (!rig || !rig.master.usable || !rig.master.box) return null;
    return { box: rig.master.box, rootX: rig.root.x, rootY: rig.root.y };
  }

  /**
   * 리그 실측 상자를 화면(디자인 px) 기준으로 환산한 값.
   * 새 아트는 화면 키의 약 2.7배(슈퍼샘플)로 그려져 있어, 실측 상자를 그대로 쓰면
   * 판정·이동 범위가 실제 화면 크기의 2.7배가 된다. 렌더러와 같은 배율로 환산해 쓴다.
   */
  private get displayBox(): {
    w: number;
    h: number;
    left: number;
    right: number;
    top: number;
    bottom: number;
  } | null {
    const master = this.masterBox;
    if (!master) return null;
    const scale = spriteScale(this.data.displayHeight, master.box);
    const { box, rootX, rootY } = master;
    return {
      w: box.w * scale,
      h: box.h * scale,
      left: (box.minX - rootX) * scale,
      right: (box.maxX - rootX) * scale,
      top: (box.minY - rootY) * scale,
      bottom: (box.maxY - rootY) * scale,
    };
  }

  get bodyWidth(): number {
    const box = this.displayBox;
    return box ? box.w : this.data.displayHeight * BODY_WIDTH_RATIO;
  }

  get bodyHeight(): number {
    const box = this.displayBox;
    const base = box ? box.h : this.data.displayHeight;
    return base * (this.state === 'crouch' ? CROUCH_HEIGHT_RATIO : 1);
  }

  /**
   * 몸통 판정. 리그의 실측 마스터 경계를 화면 크기로 환산해 쓴다(계획서 3절).
   * 리그가 없으면 표시 높이 기반 임시 판정으로 대체한다.
   */
  hurtbox(): Rect {
    const box = this.displayBox;
    if (!box) {
      const halfW = this.bodyWidth / 2;
      return {
        left: this.x - halfW,
        right: this.x + halfW,
        top: this.y - this.bodyHeight,
        bottom: this.y,
      };
    }

    const crouch = this.state === 'crouch' ? CROUCH_HEIGHT_RATIO : 1;
    const left = box.left;
    const right = box.right;
    const top = box.top * crouch;
    const bottom = box.bottom;

    return this.facing === 1
      ? { left: this.x + left, right: this.x + right, top: this.y + top, bottom: this.y + bottom }
      : { left: this.x - right, right: this.x - left, top: this.y + top, bottom: this.y + bottom };
  }

  /** 판정 프레임에만 켜지는 공격 상자. 렌더링과 분리되어 있다(계획서 16절 프롬프트 2). */
  activeHitboxes(): Rect[] {
    if (this.state !== 'attack' || !this.attack) return [];
    const { move, frame } = this.attack;
    if (move.script) return [];
    if (attackPhase(move, frame) !== 'active') return [];

    const shift = this.hitboxShift(move);
    const boxes: Rect[] = [];
    for (const hitbox of move.hitboxes) {
      if (frame < hitbox.startFrame || frame > hitbox.endFrame) continue;
      const top = this.y + hitbox.y;
      const bottom = top + hitbox.height;
      const x = hitbox.x + shift;
      const left = this.facing === 1 ? this.x + x : this.x - x - hitbox.width;
      boxes.push({ left, right: left + hitbox.width, top, bottom });
    }
    return boxes;
  }

  // --- 규칙 판정 ---

  canAct(): boolean {
    return (
      this.state === 'idle' ||
      this.state === 'walk' ||
      this.state === 'crouch' ||
      this.state === 'jump' ||
      this.state === 'guard'
    );
  }

  /**
   * 방어(마스터 결정 2026-10-01, jk 요청): 땅에서 뒤 또는 아래를 누르고 있으면 막는다.
   * 4세도 쓰도록 버튼을 늘리지 않는다. 잡기는 Match에서 방어를 무시한다.
   */
  isGuarding(opponent: Fighter, level: 'high' | 'mid' | 'low' = 'mid'): boolean {
    if (!this.onGround) return false;
    if (this.state !== 'idle' && this.state !== 'walk' && this.state !== 'crouch' && this.state !== 'guard') return false;
    const stance = this.guardKind(opponent);
    if (stance === null) return false;
    // 상단은 서서, 하단은 앉아서만 막는다. 중단은 둘 다. 도움 설정(4세)은 어느 쪽으로 막아도 다 막는다.
    if (this.guardAll || level === 'mid') return true;
    return level === 'high' ? stance === 'stand' : stance === 'crouch';
  }

  /** 라운드 시작 등장 자세를 보여 줄지(Match가 intro 앞부분에만 켠다, 연출 전용). */
  entrancePose = false;

  /** 도움 설정: 높이와 상관없이 막는다(Match가 1P에만 켠다). */
  guardAll = false;
  /** 막은 순간의 자세(반동 동안 유지). */
  private guardHeldKind: 'stand' | 'crouch' = 'stand';

  /**
   * 지금 방어 자세: 뒤를 누르면 서서 막기, 아래(또는 아래+뒤)를 누르면 앉아 막기. 없으면 null.
   * 막는 반동 중에는 막은 자세를 유지한다(상대가 몸을 통과해 왕복해도 방어가 풀리지 않게).
   */
  guardKind(opponent: Fighter): 'stand' | 'crouch' | null {
    if (this.state === 'guard') return this.guardHeldKind;
    const awayIsLeft = this.x <= opponent.x;
    const back = awayIsLeft ? this.inputLeft : this.inputRight;
    if (this.inputDown) return 'crouch';
    return back ? 'stand' : null;
  }

  /** 지금 방어 자세를 보여 줄지(뒤·아래를 누르고 서 있음). 연출용. */
  get guardStance(): boolean {
    if (!this.onGround || !this.opponent) return false;
    if (this.state === 'guard') return true;
    if (this.state !== 'idle' && this.state !== 'walk' && this.state !== 'crouch') return false;
    return this.isGuarding(this.opponent);
  }

  /** 앉아 막는 중인지(연출: 더 낮게 웅크리고 방패도 아래로). */
  get guardCrouching(): boolean {
    return this.guardStance && !!this.opponent && this.guardKind(this.opponent) === 'crouch';
  }

  isMeterFull(): boolean {
    return this.meter >= MAX_METER;
  }

  /** 기술별 최대 도달 거리(중심에서 바깥쪽 끝까지, 디자인 px). CPU가 사거리를 판단할 때 쓴다. */
  reachOf(kind: AttackKind): number {
    const script = this.moves[kind].script;
    if (script) return this.bodyFront + script.reach;
    return this.bodyFront + HITBOX_OVERSHOOT[kind];
  }

  /**
   * 몸 앞끝(중심에서 얼굴 쪽 바깥 경계, 디자인 px). 새 아트 비율을 따라가도록
   * 기술 판정 상자의 가로 위치는 이 값을 기준으로 잡는다(마스터 결정 2026-10-01).
   */
  get bodyFront(): number {
    const box = this.displayBox;
    return box ? box.right : this.bodyWidth / 2;
  }

  /** moves.json의 가장 앞 상자 끝을 '몸 앞끝 + 초과분'에 맞추는 가로 이동량. */
  private hitboxShift(move: MoveData): number {
    let dataFront = 0;
    for (const hitbox of move.hitboxes) dataFront = Math.max(dataFront, hitbox.x + hitbox.width);
    return this.bodyFront + HITBOX_OVERSHOOT[move.kind] - dataFront;
  }

  /**
   * 계획서 2절 도움 설정: 최대 체력을 baseHealth의 배수로 다시 잡는다.
   * 라운드가 시작될 때마다 resetForRound가 이 값을 기준으로 체력을 채운다.
   */
  setMaxHealthMultiplier(multiplier: number): void {
    this.maxHealth = Math.round(this.data.baseHealth * multiplier);
    this.health = this.maxHealth;
  }

  // --- 진행 ---

  step(input: FighterInput, dt: number): void {
    this.landedThisStep = false;
    if (this.state === 'down' || this.state === 'victory') return;

    if (this.hitstopFrames > 0) {
      this.hitstopFrames -= 1;
      return;
    }

    this.updateGhosts();
    this.poseTime += dt;
    stepReaction(this.reaction, dt);

    // 붙잡힌 동안 위치는 잡은 쪽(Match)이 정한다.
    if (this.state === 'held') {
      this.readInput(input);
      return;
    }

    if (this.invulnFrames > 0) this.invulnFrames -= 1;
    if (this.specialFlashFrames > 0) this.specialFlashFrames -= 1;

    this.readInput(input);
    this.tickBuffer();

    if (this.kbFrames > 0) {
      this.x += this.kbPerFrame;
      this.kbFrames -= 1;
    }

    // 도약 돌진 전진분. 넉백과 별개로 적용한다.
    if (this.leapFrames > 0) {
      this.x += this.leapPerFrame;
      this.leapFrames -= 1;
    }

    this.meter = Math.min(MAX_METER, this.meter + METER_PER_SECOND * dt);

    switch (this.state) {
      case 'hit':
        if (!this.onGround) {
          // 띄워진 동안은 착지할 때까지 경직이 이어진다. 넘어질 예정이면 뒤로 돌며 날아간다.
          this.x += this.vx * dt;
          // 연출용 공중 경과(렌더러가 ±15° 안의 젖힘·허우적으로 바꾼다).
          this.airTumble += 1;
          break;
        }
        this.hitstunFrames -= 1;
        if (this.hitstunFrames <= 0) this.state = 'idle';
        break;
      case 'fallen':
        this.fallenFrames -= 1;
        if (this.fallenFrames <= 0) {
          this.state = 'idle';
          this.landedThisStep = true;
          this.invulnFrames = Math.max(this.invulnFrames, GET_UP_INVULN_FRAMES);
        }
        break;
      case 'stun':
        this.stunFrames -= 1;
        if (this.stunFrames <= 0) this.state = 'idle';
        break;
      case 'guard':
        this.guardFrames -= 1;
        if (this.guardFrames <= 0) this.state = 'idle';
        break;
      case 'attack':
        this.advanceAttack();
        break;
      default:
        if (!this.tryStartAttack()) this.updateFreeMovement();
        break;
    }

    if (!this.scriptOwnsHeight()) this.applyGravity();
    this.clampToArena();
  }

  /** 지금 스크립트 기술이 높이(y)를 직접 정하는지. */
  private scriptOwnsHeight(): boolean {
    const script = this.attack?.move.script;
    return this.state === 'attack' && !!script && hasChannel(script, 'y');
  }

  /** 스크립트 기술 진행 중이면 그 데이터. */
  get activeScript(): MoveScript | null {
    return this.state === 'attack' ? this.attack?.move.script ?? null : null;
  }

  /**
   * 스크립트 키프레임으로 위치·방향·보이는 모양을 맞춘다.
   * Match가 잡기 성공/실패로 프레임을 건너뛴 뒤에도 다시 부른다.
   */
  applyScriptFrame(): void {
    const script = this.activeScript;
    const run = this.attack?.script;
    if (!script || !run || !this.attack) return;
    const f = this.attack.frame;
    const forward =
      sampleChannel(script, 'x', f) +
      sampleChannel(script, 'xr', f) * run.dashDistance +
      sampleChannel(script, 'xw', f) * run.wallDistance +
      sampleChannel(script, 'xo', f) * run.opponentGap;
    this.x = run.startX + run.startFacing * forward;
    if (hasChannel(script, 'y')) {
      this.y = Math.min(0, run.startY + sampleChannel(script, 'y', f));
      this.onGround = this.y >= 0;
      this.vy = 0;
    }
    this.facing = (run.startFacing * sampleFace(script, f)) as 1 | -1;
    this.scriptVisual = {
      rot: sampleChannel(script, 'rot', f),
      sx: sampleChannel(script, 'sx', f),
      sy: sampleChannel(script, 'sy', f),
      ghost: sampleChannel(script, 'ghost', f),
      sink: sampleChannel(script, 'sink', f),
      parts: sampleParts(script, f),
      overlays: (script.overlays ?? [])
        .filter((o) => f >= o.from && f <= o.to)
        .map((o) => ({ sprite: o.sprite, rect: o.rect, hideBody: !!o.hideBody, flash: !!o.flash })),
    };
  }

  /** 땅속·순간이동 중이라 맞지 않는지. */
  isIntangible(): boolean {
    const script = this.activeScript;
    return !!script && sampleChannel(script, 'intang', this.attack?.frame ?? 0) >= 0.5;
  }

  /** 반격 자세 구간이면 성공 프레임으로 건너뛰고 true. */
  tryCounter(): boolean {
    const script = this.activeScript;
    const run = this.attack?.script;
    const counter = script?.counter;
    if (!script || !run || !counter || run.countered || !this.attack) return false;
    const f = this.attack.frame;
    if (f < counter.from || f > counter.to) return false;
    run.countered = true;
    this.attack.frame = counter.success;
    this.applyScriptFrame();
    return true;
  }

  /** 잡은 상대의 위치(몸 앞끝 기준)와 기울기. */
  holdOffset(): { x: number; y: number; rot: number } {
    const script = this.activeScript;
    const f = this.attack?.frame ?? 0;
    if (!script) return { x: 0, y: 0, rot: 0 };
    return {
      x: sampleChannel(script, 'holdX', f),
      y: sampleChannel(script, 'holdY', f),
      rot: sampleChannel(script, 'holdRot', f),
    };
  }

  /** 잡기를 풀어 준다(던지기·피격·라운드 종료). 붙잡힌 쪽은 공중이면 떨어진다. */
  releaseHold(): void {
    const target = this.holding;
    this.holding = null;
    if (!target) return;
    target.heldBy = null;
    target.biteAnchor = null;
    target.heldRot = 0;
    if (target.state === 'held') {
      target.state = 'hit';
      target.hitstunFrames = Math.max(target.hitstunFrames, 12);
      target.onGround = target.y >= 0;
      target.vy = 0;
    }
  }

  /** 띄우기: 공중으로 날리고, 착지하면 knockdown 프레임 동안 눕힌다. */
  launch(vx: number, vy: number, knockdown: number): void {
    this.state = 'hit';
    this.attack = null;
    this.vx = vx;
    this.vy = vy;
    this.onGround = false;
    this.y = Math.min(this.y, -1);
    this.hitstunFrames = Math.max(this.hitstunFrames, 10);
    this.pendingKnockdown = knockdown;
    this.airTumble = 0;
  }

  knockDown(frames: number): void {
    this.state = 'fallen';
    this.attack = null;
    this.vx = 0;
    this.fallenFrames = frames;
    this.fallenTotal = frames;
    this.fallStartAngle = this.airTumble > 0 ? -0.2 : 0;
    this.airTumble = 0;
    this.pendingKnockdown = 0;
    this.landedThisStep = true;
  }

  /** 막았을 때: 짧은 반동(움직일 수 없음). 반동 중에도 계속 막는다. */
  guardRecoil(frames: number): void {
    if (this.opponent && this.state !== 'guard') this.guardHeldKind = this.guardKind(this.opponent) ?? 'stand';
    this.state = 'guard';
    this.attack = null;
    this.scriptVisual = null;
    this.guardFrames = Math.max(this.guardFrames, frames);
  }

  stun(frames: number): void {
    this.state = 'stun';
    this.attack = null;
    this.stunFrames = frames;
  }

  private updateGhosts(): void {
    for (const ghost of this.ghosts) ghost.alpha -= 0.12;
    this.ghosts = this.ghosts.filter((ghost) => ghost.alpha > 0.02);
    const visual = this.scriptVisual;
    if (this.state === 'attack' && visual && visual.ghost > 0.01) {
      this.ghosts.push({ x: this.x, y: this.y, facing: this.facing, visual: { ...visual }, alpha: 0.55 * visual.ghost });
      if (this.ghosts.length > GHOST_LENGTH) this.ghosts.shift();
    } else if (this.dashFrames > 0 && this.dashFrames % 2 === 0) {
      // 대시 잔상: 몸 그대로 옅게.
      this.ghosts.push({ x: this.x, y: this.y, facing: this.facing, visual: { rot: this.dashForward ? 0.08 : -0.06, sx: 1.06, sy: 0.95, ghost: 1, sink: 0, parts: null, overlays: [] }, alpha: 0.4 });
      if (this.ghosts.length > GHOST_LENGTH) this.ghosts.shift();
    }
  }

  /** 스프라이트 실측 폭을 고려해 화면 밖으로 나가지 않게 한다(계획서 2절: 양끝을 통과하지 않는다). */
  clampToArena(): void {
    const box = this.displayBox;
    if (!box) {
      this.x = clamp(this.x, ARENA_LEFT, ARENA_RIGHT);
      return;
    }
    const minX = this.facing === 1 ? ARENA_LEFT - box.left : ARENA_LEFT + box.right;
    const maxX = this.facing === 1 ? ARENA_RIGHT - box.right : ARENA_RIGHT + box.left;
    this.x = Math.min(Math.max(this.x, minX), Math.max(minX, maxX));
  }

  resetForRound(x: number, facing: 1 | -1): void {
    this.biteAnchor = null;
    this.reaction = newReaction();
    this.lastContact = null;
    this.poseTime = 0;
    this.x = x;
    this.y = 0;
    this.vy = 0;
    this.onGround = true;
    this.facing = facing;
    this.state = 'idle';
    this.health = this.maxHealth;
    this.meter = START_METER;
    this.attack = null;
    this.hitstunFrames = 0;
    this.hitstopFrames = 0;
    this.invulnFrames = 0;
    this.specialFlashFrames = 0;
    this.consecutiveHits = 0;
    this.kbFrames = 0;
    this.kbPerFrame = 0;
    this.leapFrames = 0;
    this.leapPerFrame = 0;
    this.glideFrames = GLIDE_MAX_FRAMES;
    this.gliding = false;
    this.landedThisStep = false;
    this.airAttackUsed = false;
    this.bufferedAttack = null;
    this.bufferFrames = 0;
    this.holding = null;
    this.heldBy = null;
    this.heldRot = 0;
    this.vx = 0;
    this.pendingKnockdown = 0;
    this.fallenFrames = 0;
    this.fallenTotal = 0;
    this.fallStartAngle = 0;
    this.airTumble = 0;
    this.stunFrames = 0;
    this.guardFrames = 0;
    this.dashFrames = 0;
    this.scriptVisual = null;
    this.ghosts = [];
  }

  resetRoundWins(): void {
    this.roundWins = 0;
  }

  /** 계획서 3절: 준비 → 판정 → 회복. */
  currentPhase(): ReturnType<typeof attackPhase> | null {
    return this.attack ? attackPhase(this.attack.move, this.attack.frame) : null;
  }

  // --- 내부 ---

  private readInput(input: FighterInput): void {
    const player = this.player;
    this.inputLeft = input.isHeld(player, 'left');
    this.inputRight = input.isHeld(player, 'right');
    this.inputUp = input.isPressed(player, 'up');
    this.inputUpHeld = input.isHeld(player, 'up');
    this.inputDown = input.isHeld(player, 'down');
    this.readDashTap();

    if (input.isPressed(player, 'special')) this.bufferAttack('special');
    else if (input.isPressed(player, 'heavy')) this.bufferAttack('heavy');
    else if (input.isPressed(player, 'light')) this.bufferAttack('light');
  }

  /** 좌·우를 새로 누른 순간을 기록하고, 같은 방향을 DASH_TAP_WINDOW 안에 두 번 누르면 대시를 시작한다. */
  private readDashTap(): void {
    const tapLeft = this.inputLeft && !this.prevLeftHeld;
    const tapRight = this.inputRight && !this.prevRightHeld;
    this.prevLeftHeld = this.inputLeft;
    this.prevRightHeld = this.inputRight;
    this.lastTapAge += 1;
    const tap: -1 | 0 | 1 = tapRight ? 1 : tapLeft ? -1 : 0;
    if (tap === 0) return;
    if (tap === this.lastTapDir && this.lastTapAge <= DASH_TAP_WINDOW) {
      this.lastTapDir = 0;
      this.startDash(tap);
      return;
    }
    this.lastTapDir = tap;
    this.lastTapAge = 0;
  }

  private startDash(dir: 1 | -1): void {
    if (!this.onGround || this.dashFrames > 0) return;
    if (this.state !== 'idle' && this.state !== 'walk') return;
    const toward = this.opponent ? Math.sign(this.opponent.x - this.x) || this.facing : this.facing;
    this.dashForward = dir === toward;
    this.dashDir = dir;
    this.dashFrames = this.dashForward ? DASH_FRAMES : BACKSTEP_FRAMES;
    this.dashTotal = this.dashFrames;
  }

  dashTotal = DASH_FRAMES;

  private bufferAttack(kind: AttackKind): void {
    this.bufferedAttack = kind;
    this.bufferFrames = INPUT_BUFFER_FRAMES;
  }

  private tickBuffer(): void {
    if (this.bufferedAttack === null) return;
    this.bufferFrames -= 1;
    if (this.bufferFrames <= 0) this.bufferedAttack = null;
  }

  private tryStartAttack(): boolean {
    if (!this.canAct() || this.bufferedAttack === null) return false;

    const kind = this.bufferedAttack;
    if (!this.onGround && kind !== 'light') return false;
    if (!this.onGround && this.airAttackUsed) return false;

    if (kind === 'special' && !this.isMeterFull()) {
      // 계획서 2절: 게이지가 부족하면 발동하지 않고 아이콘만 짧게 깜빡인다.
      this.specialFlashFrames = SPECIAL_FLASH_FRAMES;
      this.bufferedAttack = null;
      return false;
    }

    let move = this.partContacts ? expandedPilotMove(contactPilotMove(this.moves[kind])) : this.moves[kind];
    if (this.partContacts && this.assets.parts?.rig.parts.backing) {
      move = alignCloseBite(bitePilotMove(move), this.opponent ? Math.abs(this.opponent.x-this.x) : 540);
    }
    // 대시 중 공격: 대시는 끝내고 남은 기세는 기술 내딛기에 맡긴다.
    this.dashFrames = 0;
    this.attack = { move, attackId: nextAttackId++, frame: 0, hitTargets: new Set() };
    if (move.script) {
      const opp = this.opponent;
      const gap = opp ? Math.abs(opp.x - this.x) : 400;
      // xr=1: 상대 몸을 지나 바로 뒤까지(왕복 공격). 너무 멀거나 가까우면 자른다.
      const dash = opp ? gap + opp.bodyWidth / 2 + this.bodyFront * 0.6 : 500;
      const wall =
        (this.facing === 1 ? ARENA_RIGHT - this.x : this.x - ARENA_LEFT) -
        this.bodyFront -
        (opp ? opp.bodyWidth : 0);
      this.attack.script = {
        startX: this.x,
        startY: this.y,
        startFacing: this.facing,
        dashDistance: Math.max(260, Math.min(900, dash)),
        wallDistance: Math.max(0, wall),
        opponentGap: opp ? (opp.x - this.x) * this.facing : 400,
        countered: false,
        fired: new Set(),
        landed: new Set(),
        grabbed: false,
        grabResolved: false,
      };
      this.applyScriptFrame();
    }
    this.state = 'attack';
    this.bufferedAttack = null;
    if (kind === 'special') this.meter -= move.meterCost;
    if (!this.onGround) this.airAttackUsed = true;

    // 파키케팔로사우루스: 지상 강공격은 앞으로 뛰어들며 시작한다(도약 돌진).
    if (kind === 'heavy' && this.onGround && this.data.traits?.leapCharge && !move.script) {
      this.vy = LEAP_CHARGE_VELOCITY;
      this.onGround = false;
      this.airAttackUsed = true;
      this.leapFrames = LEAP_CHARGE_FRAMES;
      this.leapPerFrame = this.facing * LEAP_CHARGE_SPEED * FIXED_DT;
    }
    return true;
  }

  private advanceAttack(): void {
    if (!this.attack) {
      this.state = this.onGround ? 'idle' : 'jump';
      return;
    }
    this.attack.frame += 1;
    if (this.attack.frame >= moveTotalFrames(this.attack.move)) {
      this.endAttack();
      return;
    }
    if (this.attack.move.script) this.applyScriptFrame();
  }

  /** 기술을 끝낸다(스크립트 'end' 사건 포함). 잡고 있으면 놓는다. */
  endAttack(): void {
    this.releaseHold();
    this.attack = null;
    this.scriptVisual = null;
    this.state = this.onGround ? 'idle' : 'jump';
  }

  private updateFreeMovement(): void {
    const direction = (this.inputRight ? 1 : 0) - (this.inputLeft ? 1 : 0);
    const speed = BASE_MOVE_SPEED * this.data.speedScale * FIXED_DT;

    if (this.onGround) {
      if (this.dashFrames > 0) {
        // 대시: 처음엔 빠르게, 끝으로 갈수록 감속. 대시 중에도 공격·점프로 바로 이어갈 수 있다.
        const t = this.dashFrames / this.dashTotal;
        const mult = this.dashForward ? DASH_SPEED_MULT : BACKSTEP_SPEED_MULT;
        this.x += this.dashDir * BASE_MOVE_SPEED * mult * (0.35 + 0.65 * t) * FIXED_DT;
        this.dashFrames -= 1;
        this.state = 'walk';
        if (this.inputUp) {
          this.dashFrames = 0;
          this.vy = JUMP_VELOCITY;
          this.onGround = false;
          this.state = 'jump';
          this.airAttackUsed = false;
        }
        return;
      }
      if (this.inputDown) {
        this.state = 'crouch';
        return;
      }
      this.state = direction === 0 ? 'idle' : 'walk';
      this.x += direction * speed;

      if (this.inputUp) {
        this.vy = JUMP_VELOCITY;
        this.onGround = false;
        this.state = 'jump';
        this.airAttackUsed = false;
      }
      return;
    }

    this.state = 'jump';
    this.x += direction * speed;
  }

  private applyGravity(): void {
    if (this.onGround) {
      // 착지하면 활공 프레임을 회복한다.
      this.glideFrames = GLIDE_MAX_FRAMES;
      this.gliding = false;
      return;
    }

    this.vy += GRAVITY * FIXED_DT;

    // 프테라노돈: 공중에서 위를 누르고 있으면 제한된 프레임 동안 천천히 하강한다.
    if (this.data.traits?.glide && this.glideFrames > 0 && this.inputUpHeld && this.vy > 0) {
      this.gliding = true;
      this.glideFrames -= 1;
      this.vy = Math.min(this.vy, GLIDE_FALL_SPEED);
    } else {
      this.gliding = false;
    }

    this.y += this.vy * FIXED_DT;
    if (this.y >= 0) {
      this.y = 0;
      this.vy = 0;
      this.onGround = true;
      this.landedThisStep = true;
      this.vx = 0;
      if (this.state === 'jump') this.state = 'idle';
      if (this.state === 'hit' && this.pendingKnockdown > 0) this.knockDown(this.pendingKnockdown);
    }
  }
}

/** 대시 입력 간격(프레임, 약 0.23초)·길이·속도 배율. 4세도 되도록 간격은 넉넉하게. */
const DASH_TAP_WINDOW = 14;
const DASH_FRAMES = 18;
const DASH_SPEED_MULT = 4;
const BACKSTEP_FRAMES = 12;
const BACKSTEP_SPEED_MULT = 2.6;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
