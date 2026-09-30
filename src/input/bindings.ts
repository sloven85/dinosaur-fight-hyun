import type { Action } from './actions';

export type ActionBinding<T> = Partial<Record<Action, T>>;

export type KeyboardBinding = Record<Action, readonly string[]>;

/**
 * 계획서 1절 "권장 버튼 배치"의 키보드 열.
 * 1P: A D / W S / F G H / Enter / Esc
 * 2P: ← → / ↑ ↓ / J K L / Enter / Esc
 * 코드값은 KeyboardEvent.code 기준이다.
 */
export const KEYBOARD_BINDINGS: readonly [KeyboardBinding, KeyboardBinding] = [
  {
    left: ['KeyA'],
    right: ['KeyD'],
    up: ['KeyW'],
    down: ['KeyS'],
    light: ['KeyF'],
    heavy: ['KeyG'],
    special: ['KeyH'],
    confirm: ['Enter'],
    cancel: ['Escape'],
    pause: ['Escape'],
  },
  {
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    up: ['ArrowUp'],
    down: ['ArrowDown'],
    light: ['KeyJ'],
    heavy: ['KeyK'],
    special: ['KeyL'],
    confirm: ['Enter'],
    cancel: ['Escape'],
    pause: ['Escape'],
  },
];

/**
 * 표준 게임패드 매핑(W3C)의 버튼 index. 계획서 1절 "패드 기준" 열.
 * 아래쪽 얼굴 버튼(index 0)이 확인 겸 참가 버튼이다.
 */
export const GAMEPAD_BUTTONS: ActionBinding<number> = {
  confirm: 0, // 아래쪽 얼굴 버튼
  cancel: 1, // 오른쪽 얼굴 버튼
  special: 1, // 오른쪽 얼굴 버튼 (전투에서 특수기)
  light: 2, // 왼쪽 얼굴 버튼
  heavy: 3, // 위쪽 얼굴 버튼
  pause: 9, // Start
};

/** 십자 방향키 버튼 index. */
export const GAMEPAD_DPAD: Record<'up' | 'down' | 'left' | 'right', number> = {
  up: 12,
  down: 13,
  left: 14,
  right: 15,
};

/** 왼쪽 스틱 축과 방향 부호. */
export const STICK_AXIS: Record<'left' | 'right' | 'up' | 'down', { axis: number; sign: 1 | -1 }> = {
  left: { axis: 0, sign: -1 },
  right: { axis: 0, sign: 1 },
  up: { axis: 1, sign: -1 },
  down: { axis: 1, sign: 1 },
};

export const STICK_DEADZONE = 0.5;

/** 패드 참가 버튼. 계획서 1절: 참가 버튼을 누른 순서대로 1P·2P를 배정한다. */
export const GAMEPAD_JOIN_BUTTON = 0;
