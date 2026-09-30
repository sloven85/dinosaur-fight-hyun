import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InputManager } from './InputManager';

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

    dispatch('keydown', 'Enter');
    dispatch('keyup', 'Enter');

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

    dispatch('keydown', 'Enter');
    dispatch('keyup', 'Enter');
    input.resetEdges();

    input.update();
    expect(input.isPressed(0, 'confirm')).toBe(false);
  });
});
