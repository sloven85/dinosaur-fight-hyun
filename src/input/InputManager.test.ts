import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InputManager } from './InputManager';
import { KEYBOARD_BINDINGS } from './bindings';

interface KeyLike {
  code: string;
  preventDefault(): void;
}

type Handler = (event: KeyLike) => void;

/** 키보드 이벤트만 흉내 내는 최소 window. */
function createFakeWindow() {
  const handlers = new Map<string, Set<Handler>>();
  const win = {
    addEventListener: (type: string, handler: Handler) => {
      const set = handlers.get(type) ?? new Set<Handler>();
      set.add(handler);
      handlers.set(type, set);
    },
    removeEventListener: (type: string, handler: Handler) => {
      handlers.get(type)?.delete(handler);
    },
  } as unknown as Window;

  const dispatch = (type: string, code: string): void => {
    for (const handler of handlers.get(type) ?? []) {
      handler({ code, preventDefault: () => {} });
    }
  };

  return { win, dispatch };
}

let restoreDocument: (() => void) | null = null;

beforeEach(() => {
  const original = (globalThis as { document?: unknown }).document;
  (globalThis as { document?: unknown }).document = {
    addEventListener: () => {},
    removeEventListener: () => {},
    visibilityState: 'visible',
  };
  restoreDocument = () => {
    (globalThis as { document?: unknown }).document = original;
  };
});

afterEach(() => {
  restoreDocument?.();
  restoreDocument = null;
});

describe('입력 엣지 처리', () => {
  it('두 틱 사이에 눌렸다 뗀 짧은 탭도 한 번은 전달한다', () => {
    const { win, dispatch } = createFakeWindow();
    const input = new InputManager(win);

    dispatch('keydown', 'KeyF');
    dispatch('keyup', 'KeyF');

    input.update();
    expect(input.isPressed(0, 'confirm')).toBe(true);

    input.update();
    expect(input.isPressed(0, 'confirm')).toBe(false);
  });

  it('꾹 누르면 새 누름은 한 번만 발생하고 held는 유지된다', () => {
    const { win, dispatch } = createFakeWindow();
    const input = new InputManager(win);

    dispatch('keydown', 'KeyF');
    input.update();
    expect(input.isPressed(0, 'light')).toBe(true);
    expect(input.isHeld(0, 'light')).toBe(true);

    input.update();
    expect(input.isPressed(0, 'light')).toBe(false);
    expect(input.isHeld(0, 'light')).toBe(true);

    dispatch('keyup', 'KeyF');
    input.update();
    expect(input.isHeld(0, 'light')).toBe(false);
  });

  it('화면 전환(resetEdges)은 아직 처리되지 않은 탭을 버린다', () => {
    const { win, dispatch } = createFakeWindow();
    const input = new InputManager(win);

    dispatch('keydown', 'KeyF');
    dispatch('keyup', 'KeyF');
    input.resetEdges();

    input.update();
    expect(input.isPressed(0, 'confirm')).toBe(false);
  });
});

describe('키보드 2인 확인 키 분리', () => {
  it('1P 확인(F)은 2P를 확정하지 않는다', () => {
    const { win, dispatch } = createFakeWindow();
    const input = new InputManager(win);

    dispatch('keydown', 'KeyF');
    input.update();

    expect(input.isPressed(0, 'confirm')).toBe(true);
    expect(input.isPressed(1, 'confirm')).toBe(false);
  });

  it('2P 확인(J)은 1P를 확정하지 않는다', () => {
    const { win, dispatch } = createFakeWindow();
    const input = new InputManager(win);

    dispatch('keydown', 'KeyJ');
    input.update();

    expect(input.isPressed(1, 'confirm')).toBe(true);
    expect(input.isPressed(0, 'confirm')).toBe(false);
  });

  it('확인·취소·일시정지 키는 두 플레이어가 겹치지 않는다', () => {
    const [p1, p2] = KEYBOARD_BINDINGS;
    for (const action of ['confirm', 'cancel', 'pause'] as const) {
      const shared = p1[action].filter((code) => p2[action].includes(code));
      expect(shared, `${action} 키가 두 플레이어에 겹칩니다`).toEqual([]);
    }
  });
});

describe('키 재지정 실제 반영 (프롬프트 6)', () => {
  it('생성 시 넘긴 재지정을 바로 쓴다', () => {
    const { win, dispatch } = createFakeWindow();
    const input = new InputManager(win, { '1.light': ['KeyQ'] });

    dispatch('keydown', 'KeyQ');
    input.update();
    expect(input.isPressed(0, 'light')).toBe(true);

    // 기본 키(KeyF)는 더 이상 1P 약공격이 아니다.
    dispatch('keyup', 'KeyQ');
    input.update();
    dispatch('keydown', 'KeyF');
    input.update();
    expect(input.isPressed(0, 'light')).toBe(false);
  });

  it('setKeyMapping으로 실행 중에도 바꿀 수 있다', () => {
    const { win, dispatch } = createFakeWindow();
    const input = new InputManager(win);

    input.setKeyMapping({ '1.light': ['KeyQ'] });
    expect(input.currentKeyMapping['1.light']).toEqual(['KeyQ']);

    dispatch('keydown', 'KeyQ');
    input.update();
    expect(input.isPressed(0, 'light')).toBe(true);
  });

  it('키 입력 대기 중에는 그 키를 게임 동작으로 쓰지 않는다', () => {
    const { win, dispatch } = createFakeWindow();
    const input = new InputManager(win);

    let captured: string | null = null;
    input.captureNextKey((code) => {
      captured = code;
    });
    expect(input.isCapturingKey).toBe(true);

    dispatch('keydown', 'KeyF');
    input.update();

    expect(captured).toBe('KeyF');
    expect(input.isCapturingKey).toBe(false);
    expect(input.isPressed(0, 'light')).toBe(false);
  });

  it('패드가 없어도 진동 요청은 예외를 던지지 않는다', () => {
    const { win } = createFakeWindow();
    const input = new InputManager(win);
    expect(() => input.rumbleAll()).not.toThrow();
  });
});

describe('조작 A안 (디렉터 확정 2026-10-01)', () => {
  it('확인·취소·일시정지가 각자 손 쪽 키에 몰려 있다', () => {
    const [p1, p2] = KEYBOARD_BINDINGS;
    expect(p1.confirm).toEqual(['KeyF']);
    expect(p1.cancel).toEqual(['KeyG']);
    expect(p1.pause).toEqual(expect.arrayContaining(['Digit1', 'Digit2', 'Escape']));
    expect(p2.confirm).toEqual(['KeyJ']);
    expect(p2.cancel).toEqual(['KeyK']);
    expect(p2.pause).toEqual(expect.arrayContaining(['Digit9', 'Digit0']));
  });

  it('화면 전환 직후 막는 동안의 새 누름은 무시하고, 꾹 누른 키는 다시 눌러야 받는다', () => {
    const { win, dispatch } = createFakeWindow();
    const input = new InputManager(win);

    // 전투 끝에 F를 연타하던 중 화면이 바뀐다.
    dispatch('keydown', 'KeyF');
    input.blockInput(3);
    for (let i = 0; i < 3; i++) {
      input.update();
      expect(input.isPressed(0, 'confirm')).toBe(false);
    }
    // 막기가 끝나도 계속 누르고 있던 F는 새 누름이 아니다.
    input.update();
    expect(input.isPressed(0, 'confirm')).toBe(false);

    // 떼었다가 다시 누르면 확인으로 받는다.
    dispatch('keyup', 'KeyF');
    input.update();
    dispatch('keydown', 'KeyF');
    input.update();
    expect(input.isPressed(0, 'confirm')).toBe(true);
  });

  it('막는 중 눌렀다 뗀 짧은 탭도 버린다', () => {
    const { win, dispatch } = createFakeWindow();
    const input = new InputManager(win);
    input.blockInput(2);
    dispatch('keydown', 'KeyJ');
    dispatch('keyup', 'KeyJ');
    input.update();
    input.update();
    input.update();
    expect(input.isPressed(1, 'confirm')).toBe(false);
  });
});

/** 가짜 패드(표준 배치). 버튼 17개·축 4개. */
function fakePad(index: number, mapping = 'standard', axes = 4) {
  return {
    index,
    id: `Fake Pad ${index}`,
    connected: true,
    mapping,
    timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    axes: Array.from({ length: axes }, () => 0),
  };
}

describe('게임패드 회귀(jk 제보 2026-10-02)', () => {
  let pads: ReturnType<typeof fakePad>[] = [];
  let restoreNav: (() => void) | null = null;
  beforeEach(() => {
    pads = [fakePad(0), fakePad(1)];
    const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => pads }, configurable: true });
    restoreNav = () => {
      if (original) Object.defineProperty(globalThis, 'navigator', original);
    };
  });
  afterEach(() => restoreNav?.());

  const press = (p: number, b: number, v = true) => {
    pads[p].buttons[b].pressed = v;
    pads[p].buttons[b].value = v ? 1 : 0;
  };

  it('아래 버튼으로 1P·2P 순서대로 참가하고, 버튼·십자키·스틱이 동작한다', () => {
    const { win } = createFakeWindow();
    const input = new InputManager(win);
    press(0, 0);
    input.update();
    expect(input.padIndex(0)).toBe(0);
    expect(input.isPressed(0, 'confirm')).toBe(true);
    press(0, 0, false);
    press(1, 0);
    input.update();
    expect(input.padIndex(1)).toBe(1);
    press(1, 0, false);

    press(0, 2); // 왼쪽 얼굴 = 약
    press(1, 3); // 위쪽 얼굴 = 강
    pads[0].axes[0] = 1; // 왼쪽 스틱 오른쪽
    press(1, 13); // 2P 십자키 아래
    input.update();
    expect(input.isPressed(0, 'light')).toBe(true);
    expect(input.isPressed(1, 'heavy')).toBe(true);
    expect(input.isHeld(0, 'right')).toBe(true);
    expect(input.isHeld(1, 'down')).toBe(true);
    expect(input.isHeld(0, 'down')).toBe(false);
  });

  it('특수(오른쪽 얼굴 버튼)와 일시정지(Start)', () => {
    const { win } = createFakeWindow();
    const input = new InputManager(win);
    press(0, 0);
    input.update();
    press(0, 0, false);
    input.update();
    press(0, 1);
    press(0, 9);
    input.update();
    expect(input.isPressed(0, 'special')).toBe(true);
    expect(input.isPressed(0, 'pause')).toBe(true);
  });

  it('십자키 두 번 탭이 press 엣지 두 번으로 들어온다(대시 입력)', () => {
    const { win } = createFakeWindow();
    const input = new InputManager(win);
    press(0, 0);
    input.update();
    press(0, 0, false);
    input.update();
    const edges: boolean[] = [];
    for (const v of [true, false, true, false]) {
      press(0, 15, v);
      input.update();
      edges.push(input.isPressed(0, 'right'));
    }
    expect(edges).toEqual([true, false, true, false]);
  });

  it('비표준 배치: 해트 축(9)·축 6/7 십자키, 아무 얼굴 버튼으로 참가', () => {
    pads = [fakePad(0, '', 10)];
    const { win } = createFakeWindow();
    const input = new InputManager(win);
    press(0, 2);
    input.update();
    expect(input.padIndex(0)).toBe(0);
    pads[0].axes[9] = -1 + (2 / 7) * 2; // 오른쪽
    input.update();
    expect(input.isHeld(0, 'right')).toBe(true);
    pads[0].axes[9] = 3.28; // 손 뗌
    pads[0].axes[7] = 1; // 축 7 아래
    input.update();
    expect(input.isHeld(0, 'right')).toBe(false);
    expect(input.isHeld(0, 'down')).toBe(true);
  });

  it('브라우저가 패드를 막아 getGamepads가 예외를 던져도 키보드 입력은 계속 된다', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        getGamepads: () => {
          throw new Error('SecurityError');
        },
      },
      configurable: true,
    });
    const { win, dispatch } = createFakeWindow();
    const input = new InputManager(win);
    dispatch('keydown', 'KeyF');
    expect(() => input.update()).not.toThrow();
    expect(input.isPressed(0, 'light')).toBe(true);
    expect(input.padBlocked).toBe(true);
  });
});
