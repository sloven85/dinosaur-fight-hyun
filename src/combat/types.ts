import type { MoveScript, ScriptRuntime } from './moveScript';

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
  | 'victory'
  /** 상대에게 붙잡힘(잡기). 위치는 잡은 쪽이 정한다. */
  | 'held'
  /** 넘어져 누워 있음(KO 아님). 일어나면 잠깐 무적. */
  | 'fallen'
  /** 짧은 기절(머리 위 별). */
  | 'stun'
  /** 막은 직후 반동(방패 불꽃). 짧게 뒤로 밀리고 움직일 수 없다. */
  | 'guard';

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
  /** 있으면 키프레임 기술 스크립트로 움직이고 판정한다(디렉터 결정 2026-10-01). */
  script?: MoveScript;
}

/** 공격 1회분. attackId로 같은 공격이 같은 상대를 두 번 때리지 않게 한다(계획서 3절). */
export interface AttackInstance {
  readonly move: MoveData;
  readonly attackId: number;
  frame: number;
  readonly hitTargets: Set<number>;
  /** 스크립트 기술의 진행 상태. */
  script?: ScriptRuntime;
}

export function attackPhase(move: MoveData, frame: number): AttackPhase {
  if (frame < move.startupFrames) return 'startup';
  if (frame < move.startupFrames + move.activeFrames) return 'active';
  return 'recovery';
}

export function moveTotalFrames(move: MoveData): number {
  if (move.script) return move.script.frames;
  return move.startupFrames + move.activeFrames + move.recoveryFrames;
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}
