import { ACTIONS, createActionStates, type Action, type ActionStates } from './actions';
import {
  GAMEPAD_BUTTONS,
  GAMEPAD_DPAD,
  GAMEPAD_JOIN_BUTTON,
  STICK_AXIS,
  STICK_DEADZONE,
  buildKeyboardBindings,
  type KeyMapping,
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
  keyboard: KeyboardBinding;
  padIndex: number | null;
  readonly states: ActionStates;
  readonly held: HeldMap;
}

/** 진동을 지원하는 패드의 확장 API(표준 Gamepad 타입에 아직 없다). */
interface RumbleActuator {
  playEffect?: (
    type: 'dual-rumble',
    params: { duration: number; strongMagnitude: number; weakMagnitude: number },
  ) => Promise<unknown>;
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
  /** 설정의 키 재지정(없으면 기본 매핑). */
  private keyMapping: KeyMapping;
  /** 키 재지정 화면에서 다음 키 입력을 가로챌 때 쓴다. */
  private keyCapture: ((code: string) => void) | null = null;
  /** 화면 전환 직후 새 누름을 무시할 남은 틱 수. */
  private blockFrames = 0;

  constructor(
    private readonly win: Window = window,
    keyMapping: KeyMapping = {},
  ) {
    this.keyMapping = keyMapping;
    const bindings = buildKeyboardBindings(keyMapping);
    this.players = PLAYERS.map((index) => ({
      keyboard: bindings[index],
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

    if (this.blockFrames > 0) {
      // 막는 동안 들어온 새 누름은 버린다. held는 남겨 두어, 막기가 끝난 뒤에도
      // 계속 누르고 있던 키는 '새 누름'이 되지 않는다(다시 눌러야 한다).
      this.blockFrames -= 1;
      this.clearEdges();
    }
  }

  /**
   * 화면 전환 직후 frames 틱 동안 새 누름을 받지 않는다(디렉터 결정 2026-10-01: 약 0.3초).
   * 전투 끝에 연타하던 약공격(F)이 결과·선택 화면의 '확인'으로 바로 먹히지 않게 한다.
   */
  blockInput(frames: number): void {
    this.blockFrames = Math.max(this.blockFrames, frames);
    this.clearEdges();
  }

  get isInputBlocked(): boolean {
    return this.blockFrames > 0;
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

  // --- 키 재지정(계획서 2절 어른용 설정) ---

  /** 저장된 키 재지정을 즉시 반영한다. 다음 틱부터 새 매핑으로 읽는다. */
  setKeyMapping(mapping: KeyMapping): void {
    this.keyMapping = mapping;
    const bindings = buildKeyboardBindings(mapping);
    this.players.forEach((slot, index) => {
      slot.keyboard = bindings[index];
    });
  }

  get currentKeyMapping(): KeyMapping {
    return { ...this.keyMapping };
  }

  get isCapturingKey(): boolean {
    return this.keyCapture !== null;
  }

  /**
   * 다음 키 입력 하나를 재지정용으로 가로챈다.
   * 잡는 동안에는 그 키가 게임 동작으로 처리되지 않는다.
   */
  captureNextKey(onCapture: (code: string) => void): void {
    this.keyCapture = onCapture;
  }

  cancelKeyCapture(): void {
    this.keyCapture = null;
  }

  // --- 진동(계획서 2절 어른용 설정) ---

  /** 패드 진동. 미지원 패드·미참가 플레이어면 조용히 넘어간다. */
  rumble(player: PlayerIndex, strength = 0.6, durationMs = 120): void {
    const padIndex = this.players[player].padIndex;
    if (padIndex === null) return;
    try {
      if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return;
      const pad = navigator.getGamepads()[padIndex];
      const actuator = (pad as unknown as { vibrationActuator?: RumbleActuator } | null)
        ?.vibrationActuator;
      void actuator?.playEffect?.('dual-rumble', {
        duration: durationMs,
        strongMagnitude: strength,
        weakMagnitude: strength * 0.6,
      });
    } catch {
      // 진동 미지원 패드에서는 조용히 넘어간다(게임 진행에는 영향 없음).
    }
  }

  rumbleAll(strength = 0.6, durationMs = 120): void {
    this.rumble(0, strength, durationMs);
    this.rumble(1, strength, durationMs);
  }

  // --- 내부 ---

  /**
   * 패드 목록. 브라우저가 패드 사용을 막으면(다른 사이트 안에 끼워 연 화면의 권한 정책 등)
   * getGamepads가 예외를 던진다. 그 예외가 입력 갱신 전체를 멈추면 키보드까지 죽으므로
   * 여기서 삼키고 패드 없음으로 처리한다(jk 제보 2026-10-02 '패드가 안 됨').
   */
  private readPads(): (Gamepad | null)[] {
    try {
      if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return [];
      return Array.from(navigator.getGamepads() ?? []);
    } catch {
      if (!this.padBlockedWarned) {
        this.padBlockedWarned = true;
        console.warn('[input] 이 화면에서는 브라우저가 게임패드를 막았습니다. 게임 주소를 새 탭에서 직접 열어 주세요.');
      }
      this.padBlocked = true;
      return [];
    }
  }

  /** 브라우저가 패드를 막았는지(화면 안내용). */
  padBlocked = false;
  private padBlockedWarned = false;

  private assignJoiningPads(pads: (Gamepad | null)[]): void {
    for (let index = 0; index < pads.length; index++) {
      const pad = pads[index];
      if (!pad || !pad.connected) continue;
      if (this.players.some((slot) => slot.padIndex === index)) continue;
      // 참가: 얼굴 버튼 4개·Start 중 아무거나(표준 배치가 아닌 패드는 아래 버튼 번호가 다르다).
      const join = [GAMEPAD_JOIN_BUTTON, 1, 2, 3, 9].some((b) => pad.buttons[b]?.pressed);
      if (!join) continue;

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

    // 표준 배치가 아닌 패드(일부 블루투스·호환 패드)는 십자키를 '해트' 축 하나로 보낸다.
    const hat = pad.mapping !== 'standard' && pad.axes.length > HAT_AXIS ? pad.axes[HAT_AXIS] : null;
    for (const direction of DIRECTIONS) {
      if (pad.buttons[GAMEPAD_DPAD[direction]]?.pressed) {
        held[direction] = true;
      }
      if (hat !== null && hat !== undefined && hatHas(hat, direction)) held[direction] = true;
      // 또 다른 비표준 배치: 십자키를 축 6(좌우)·7(상하)로 보낸다.
      if (pad.mapping !== 'standard' && pad.axes.length >= 8) {
        const v = direction === 'left' || direction === 'right' ? pad.axes[6] : pad.axes[7];
        const sign = direction === 'left' || direction === 'up' ? -1 : 1;
        if ((v ?? 0) * sign > STICK_DEADZONE) held[direction] = true;
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
    // 재지정 대기 중이면 이 키를 게임 동작으로 쓰지 않고 잡는다.
    if (this.keyCapture) {
      const capture = this.keyCapture;
      this.keyCapture = null;
      event.preventDefault();
      capture(event.code);
      return;
    }
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

/** 해트 축 번호와 값(-1 위, 시계 방향으로 2/7씩, 1.28 이상은 손 뗌). */
const HAT_AXIS = 9;
function hatHas(value: number, direction: 'up' | 'down' | 'left' | 'right'): boolean {
  if (value > 1.1 || value < -1.1) return false;
  const step = Math.round((value + 1) / (2 / 7)); // 0=위 1=오른위 2=오른 3=오른아래 4=아래 5=왼아래 6=왼 7=왼위
  const dirs: Record<number, string[]> = { 0: ['up'], 1: ['up', 'right'], 2: ['right'], 3: ['down', 'right'], 4: ['down'], 5: ['down', 'left'], 6: ['left'], 7: ['up', 'left'] };
  return (dirs[step] ?? []).includes(direction);
}
