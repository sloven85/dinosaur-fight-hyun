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
