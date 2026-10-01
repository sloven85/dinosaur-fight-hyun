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

  private airAttackUsed = false;
  private bufferedAttack: AttackKind | null = null;
  private bufferFrames = 0;
  private inputLeft = false;
  private inputRight = false;
  private inputUp = false;
  private inputUpHeld = false;
  private inputDown = false;
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
      this.state === 'idle' || this.state === 'walk' || this.state === 'crouch' || this.state === 'jump'
    );
  }

  /** 계획서 2절: 지상 대기·이동에서만, 상대 반대 방향 입력 시 자동 가드. */
  isGuarding(opponent: Fighter): boolean {
    if (!this.onGround) return false;
    if (this.state !== 'idle' && this.state !== 'walk') return false;
    const awayIsLeft = this.x <= opponent.x;
    return awayIsLeft ? this.inputLeft : this.inputRight;
  }

  isMeterFull(): boolean {
    return this.meter >= MAX_METER;
  }

  /** 기술별 최대 도달 거리(중심에서 바깥쪽 끝까지, 디자인 px). CPU가 사거리를 판단할 때 쓴다. */
  reachOf(kind: AttackKind): number {
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
        this.hitstunFrames -= 1;
        if (this.hitstunFrames <= 0) this.state = this.onGround ? 'idle' : 'jump';
        break;
      case 'attack':
        this.advanceAttack();
        break;
      default:
        if (!this.tryStartAttack()) this.updateFreeMovement();
        break;
    }

    this.applyGravity();
    this.clampToArena();
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

    if (input.isPressed(player, 'special')) this.bufferAttack('special');
    else if (input.isPressed(player, 'heavy')) this.bufferAttack('heavy');
    else if (input.isPressed(player, 'light')) this.bufferAttack('light');
  }

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

    const move = this.moves[kind];
    this.attack = { move, attackId: nextAttackId++, frame: 0, hitTargets: new Set() };
    this.state = 'attack';
    this.bufferedAttack = null;
    if (kind === 'special') this.meter -= move.meterCost;
    if (!this.onGround) this.airAttackUsed = true;

    // 파키케팔로사우루스: 지상 강공격은 앞으로 뛰어들며 시작한다(도약 돌진).
    if (kind === 'heavy' && this.onGround && this.data.traits?.leapCharge) {
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
      this.attack = null;
      this.state = this.onGround ? 'idle' : 'jump';
    }
  }

  private updateFreeMovement(): void {
    const direction = (this.inputRight ? 1 : 0) - (this.inputLeft ? 1 : 0);
    const speed = BASE_MOVE_SPEED * this.data.speedScale * FIXED_DT;

    if (this.onGround) {
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
      if (this.state === 'jump') this.state = 'idle';
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
