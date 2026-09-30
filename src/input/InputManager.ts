import { ACTIONS, createActionStates, type Action, type ActionStates } from './actions';
import {
  GAMEPAD_BUTTONS,
  GAMEPAD_DPAD,
  GAMEPAD_JOIN_BUTTON,
  KEYBOARD_BINDINGS,
  STICK_AXIS,
  STICK_DEADZONE,
  type KeyboardBinding,
} from './bindings';

export const PLAYER_COUNT = 2;
export type PlayerIndex = 0 | 1;
export const PLAYERS: readonly PlayerIndex[] = [0, 1];

/** 일시정지 사유. 계획서 1절: 연결 해제·포커스 이탈 시 즉시 일시정지. */
export type PauseReason = 'gamepad-disconnected' | 'focus-lost' | 'menu';

const DIRECTIONS = ['left', 'right', 'up', 'down'] as const;

/** 브라우저 기본 동작(스크롤 등)을 막을 키. */
const PREVENT_DEFAULT_CODES = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
  'Tab',
  'F3',
]);

/** 개발용 판정 상자 표시 토글 키. */
const DEBUG_TOGGLE_CODE = 'F3';

type HeldMap = Record<Action, boolean>;

function createHeldMap(): HeldMap {
  const held = {} as HeldMap;
  for (const action of ACTIONS) held[action] = false;
  return held;
}

interface PlayerSlot {
  readonly keyboard: KeyboardBinding;
  padIndex: number | null;
  readonly states: ActionStates;
  readonly held: HeldMap;
}

/**
 * 키보드·게임패드 입력을 플레이어별 공통 Action으로 변환한다(계획서 14절).
 * 표준 매핑과 사용자 매핑을 분리하기 위해 바인딩은 bindings.ts에 둔다.
 */
export class InputManager {
  private readonly players: PlayerSlot[];
  private readonly keys = new Set<string>();
  /**
   * 이번 틱 사이에 눌렸다가 뗀 키(짧은 탭)를 한 틱 동안 살려 둔다.
   * 키보드 이벤트는 즉시 들어오지만 판정은 60Hz 틱마다 하므로, 아주 짧은 탭이
   * 두 틱 사이에 끼면 통째로 사라질 수 있다. 4세가 빠르게 누르는 경우를 위해 보관한다.
   */
  private pendingPresses = new Set<string>();
  private pause: PauseReason | null = null;
  private debugTogglePressed = false;

  constructor(private readonly win: Window = window) {
    this.players = PLAYERS.map((index) => ({
      keyboard: KEYBOARD_BINDINGS[index],
      padIndex: null,
      states: createActionStates(),
      held: createHeldMap(),
    }));

    win.addEventListener('keydown', this.onKeyDown);
    win.addEventListener('keyup', this.onKeyUp);
    win.addEventListener('blur', this.onWindowBlur);
    win.addEventListener('gamepaddisconnected', this.onGamepadDisconnected);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  dispose(): void {
    this.win.removeEventListener('keydown', this.onKeyDown);
    this.win.removeEventListener('keyup', this.onKeyUp);
    this.win.removeEventListener('blur', this.onWindowBlur);
    this.win.removeEventListener('gamepaddisconnected', this.onGamepadDisconnected);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  /** 매 시뮬레이션 틱(60Hz)마다 호출한다. */
  update(): void {
    const pads = this.readPads();
    this.assignJoiningPads(pads);

    // 이번 틱에만 유효한 짧은 탭을 먼저 꺼내 둔다.
    const tapped = this.pendingPresses;
    this.pendingPresses = new Set();

    for (const player of PLAYERS) {
      const slot = this.players[player];
      const next = createHeldMap();
      this.applyKeyboard(slot, next, tapped);
      if (slot.padIndex !== null) {
        this.applyGamepad(next, pads[slot.padIndex] ?? null);
      }
      this.commit(slot, next);
    }
  }

  // --- 조회 ---

  get isPaused(): boolean {
    return this.pause !== null;
  }

  get pauseReason(): PauseReason | null {
    return this.pause;
  }

  state(player: PlayerIndex): ActionStates {
    return this.players[player].states;
  }

  isHeld(player: PlayerIndex, action: Action): boolean {
    return this.players[player].states[action].held;
  }

  isPressed(player: PlayerIndex, action: Action): boolean {
    return this.players[player].states[action].pressed;
  }

  isReleased(player: PlayerIndex, action: Action): boolean {
    return this.players[player].states[action].released;
  }

  anyPressed(action: Action): boolean {
    return this.players.some((slot) => slot.states[action].pressed);
  }

  anyHeld(action: Action): boolean {
    return this.players.some((slot) => slot.states[action].held);
  }

  padIndex(player: PlayerIndex): number | null {
    return this.players[player].padIndex;
  }

  get connectedPadCount(): number {
    return this.readPads().filter((pad) => pad !== null && pad.connected).length;
  }

  // --- 일시정지 ---

  requestPause(reason: PauseReason): void {
    this.pause = reason;
    this.clearEdges();
  }

  resume(): void {
    this.pause = null;
    this.clearEdges();
  }

  /** 화면 전환 시 눌림/뗌 엣지를 비워 새 화면으로 입력이 새지 않게 한다. */
  resetEdges(): void {
    this.clearEdges();
  }

  /** 개발용 판정 상자 토글(F3). 한 번 소비하면 다시 false가 된다. */
  consumeDebugToggle(): boolean {
    const pressed = this.debugTogglePressed;
    this.debugTogglePressed = false;
    return pressed;
  }

  // --- 내부 ---

  private readPads(): (Gamepad | null)[] {
    if (typeof navigator.getGamepads !== 'function') return [];
    return Array.from(navigator.getGamepads());
  }

  private assignJoiningPads(pads: (Gamepad | null)[]): void {
    for (let index = 0; index < pads.length; index++) {
      const pad = pads[index];
      if (!pad || !pad.connected) continue;
      if (this.players.some((slot) => slot.padIndex === index)) continue;
      if (!pad.buttons[GAMEPAD_JOIN_BUTTON]?.pressed) continue;

      const free = this.players.findIndex((slot) => slot.padIndex === null);
      if (free === -1) continue;
      this.players[free].padIndex = index;
    }
  }

  private applyKeyboard(slot: PlayerSlot, held: HeldMap, tapped: ReadonlySet<string>): void {
    for (const action of ACTIONS) {
      const codes = slot.keyboard[action];
      if (codes.some((code) => this.keys.has(code) || tapped.has(code))) {
        held[action] = true;
      }
    }
  }

  private applyGamepad(held: HeldMap, pad: Gamepad | null): void {
    if (!pad) return;

    for (const action of ACTIONS) {
      const button = GAMEPAD_BUTTONS[action];
      if (button !== undefined && pad.buttons[button]?.pressed) {
        held[action] = true;
      }
    }

    for (const direction of DIRECTIONS) {
      if (pad.buttons[GAMEPAD_DPAD[direction]]?.pressed) {
        held[direction] = true;
      }
      const { axis, sign } = STICK_AXIS[direction];
      const value = pad.axes[axis] ?? 0;
      if (sign * value > STICK_DEADZONE) {
        held[direction] = true;
      }
    }
  }

  private commit(slot: PlayerSlot, next: HeldMap): void {
    for (const action of ACTIONS) {
      const state = slot.states[action];
      const previous = slot.held[action];
      const current = next[action];
      state.pressed = current && !previous;
      state.released = !current && previous;
      state.held = current;
      slot.held[action] = current;
    }
  }

  /** 눌림/뗌 엣지만 지운다. held는 유지해 같은 입력이 곧바로 재발동하지 않게 한다. */
  private clearEdges(): void {
    this.pendingPresses.clear();
    for (const slot of this.players) {
      for (const action of ACTIONS) {
        slot.states[action].pressed = false;
        slot.states[action].released = false;
      }
    }
  }

  private clearSlot(slot: PlayerSlot): void {
    for (const action of ACTIONS) {
      const state = slot.states[action];
      state.held = false;
      state.pressed = false;
      state.released = false;
      slot.held[action] = false;
    }
  }

  /** 포커스 이탈·패드 해제 시 눌린 키 상태를 모두 비운다(계획서 1절). */
  private clearAll(): void {
    this.keys.clear();
    this.pendingPresses.clear();
    for (const slot of this.players) this.clearSlot(slot);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === DEBUG_TOGGLE_CODE) this.debugTogglePressed = true;
    if (PREVENT_DEFAULT_CODES.has(event.code)) event.preventDefault();
    // 자동 반복(꾹 누름)은 새 누름이 아니므로 보관하지 않는다.
    if (!this.keys.has(event.code)) this.pendingPresses.add(event.code);
    this.keys.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private readonly onWindowBlur = (): void => {
    this.pause = 'focus-lost';
    this.clearAll();
  };

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') {
      this.pause = 'focus-lost';
      this.clearAll();
    }
  };

  private readonly onGamepadDisconnected = (event: GamepadEvent): void => {
    const index = event.gamepad.index;
    const slot = this.players.find((player) => player.padIndex === index);
    if (!slot) return;
    slot.padIndex = null;
    this.clearSlot(slot);
    this.pause = 'gamepad-disconnected';
  };
}
