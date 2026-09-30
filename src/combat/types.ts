export type AttackKind = 'light' | 'heavy' | 'special';

export type AttackPhase = 'startup' | 'active' | 'recovery';

/** 계획서 15절 전투 상태. */
export type FighterState =
  | 'idle'
  | 'walk'
  | 'crouch'
  | 'jump'
  | 'attack'
  | 'hit'
  | 'down'
  | 'victory';

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface HitboxData {
  /** 공격 시작(0프레임) 기준으로 판정이 켜지는 프레임. */
  startFrame: number;
  endFrame: number;
  /** 정면 기준 x 오프셋(캐릭터 중심에서 바깥쪽). */
  x: number;
  /** 지면 기준 y 오프셋(위로 갈수록 음수). */
  y: number;
  width: number;
  height: number;
}

/** 계획서 15절 move 데이터. */
export interface MoveData {
  id: string;
  kind: AttackKind;
  name: string;
  startupFrames: number;
  activeFrames: number;
  recoveryFrames: number;
  damage: number;
  knockback: number;
  hitstunFrames: number;
  hitstopFrames: number;
  meterCost: number;
  hitboxes: HitboxData[];
}

/** 공격 1회분. attackId로 같은 공격이 같은 상대를 두 번 때리지 않게 한다(계획서 3절). */
export interface AttackInstance {
  readonly move: MoveData;
  readonly attackId: number;
  frame: number;
  readonly hitTargets: Set<number>;
}

export function attackPhase(move: MoveData, frame: number): AttackPhase {
  if (frame < move.startupFrames) return 'startup';
  if (frame < move.startupFrames + move.activeFrames) return 'active';
  return 'recovery';
}

export function moveTotalFrames(move: MoveData): number {
  return move.startupFrames + move.activeFrames + move.recoveryFrames;
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}
