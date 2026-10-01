import type { Action } from './actions';
import type { PlayerIndex } from './InputManager';

export type ActionBinding<T> = Partial<Record<Action, T>>;

export type KeyboardBinding = Record<Action, readonly string[]>;

/** 키 재지정 저장 형식. 키는 `bindingKeyFor(player, action)`(예: "1.light"). */
export type KeyMapping = Record<string, readonly string[]>;

/** 설정에 저장하는 키 재지정 키(플레이어 1 기준 번호 + 동작). */
export function bindingKeyFor(player: PlayerIndex, action: Action): string {
  return `${player + 1}.${action}`;
}

/**
 * 키보드 배치(jk 요청·디렉터 확정 A안, 2026-10-01).
 * 두 사람이 키보드 하나를 나눠 쓸 때 각자 손이 놓인 쪽에서 모든 버튼을 누를 수 있게 한다.
 *
 * 1P(왼쪽): 이동 A D W S · 약/강/특수 F G H · 확인 F · 취소 G · 일시정지 1 / 2
 * 2P(오른쪽): 이동 ← → ↑ ↓ · 약/강/특수 J K L · 확인 J · 취소 K · 일시정지 9 / 0
 * Esc: 누구나 쓰는 공용 일시정지.
 *
 * 확인·취소가 약·강공격과 같은 키지만 메뉴 화면과 전투 화면이 나뉘어 있어 충돌하지 않는다.
 * 대신 화면이 바뀐 직후에는 SceneManager가 입력을 잠깐 막아, 전투 끝에 연타하던 키가
 * 다음 화면의 '확인'으로 먹히지 않게 한다. 코드값은 KeyboardEvent.code 기준이다.
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
    confirm: ['KeyF'],
    cancel: ['KeyG'],
    pause: ['Digit1', 'Digit2', 'Escape'],
  },
  {
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    up: ['ArrowUp'],
    down: ['ArrowDown'],
    light: ['KeyJ'],
    heavy: ['KeyK'],
    special: ['KeyL'],
    confirm: ['KeyJ'],
    cancel: ['KeyK'],
    pause: ['Digit9', 'Digit0'],
  },
];

/** 설정 화면에서 보여 주는 동작 이름. */
export const ACTION_LABELS: Record<Action, string> = {
  left: '왼쪽',
  right: '오른쪽',
  up: '위(점프)',
  down: '아래(웅크리기)',
  light: '약공격',
  heavy: '강공격',
  special: '특수기',
  confirm: '확인',
  cancel: '뒤로',
  pause: '일시정지',
};

/**
 * 기본 키보드 매핑에 사용자 재지정(설정)을 덮어써 실제 사용할 매핑을 만든다.
 * 재지정이 없는 동작은 기본값을 그대로 쓴다.
 */
export function buildKeyboardBindings(
  mapping: KeyMapping | undefined,
): readonly [KeyboardBinding, KeyboardBinding] {
  return [0, 1].map((player) => {
    const base = KEYBOARD_BINDINGS[player];
    const result = {} as Record<Action, readonly string[]>;
    for (const action of Object.keys(base) as Action[]) {
      const override = mapping?.[bindingKeyFor(player as PlayerIndex, action)];
      result[action] = override && override.length > 0 ? [...override] : base[action];
    }
    return result;
  }) as unknown as readonly [KeyboardBinding, KeyboardBinding];
}

/** 화면에 보여 줄 키 이름(예: KeyF → F, ShiftRight → 오른쪽 Shift). */
export function keyCodeLabel(code: string): string {
  const special: Record<string, string> = {
    ShiftRight: '오른쪽 Shift',
    ControlRight: '오른쪽 Ctrl',
    NumpadEnter: 'Num Enter',
    Escape: 'Esc',
    ArrowLeft: '←',
    ArrowRight: '→',
    ArrowUp: '↑',
    ArrowDown: '↓',
    Space: 'Space',
  };
  if (special[code]) return special[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}

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
