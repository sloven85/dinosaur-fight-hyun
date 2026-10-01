import { describe, expect, it } from 'vitest';
import { KEYBOARD_BINDINGS, bindingKeyFor, buildKeyboardBindings, keyCodeLabel } from './bindings';

describe('키 재지정 매핑 (프롬프트 6)', () => {
  it('저장 키는 플레이어 번호와 동작을 합쳐 만든다', () => {
    expect(bindingKeyFor(0, 'light')).toBe('1.light');
    expect(bindingKeyFor(1, 'confirm')).toBe('2.confirm');
  });

  it('재지정이 없으면 기본 매핑을 그대로 쓴다', () => {
    const [p1, p2] = buildKeyboardBindings({});
    expect(p1.light).toEqual(KEYBOARD_BINDINGS[0].light);
    expect(p2.confirm).toEqual(KEYBOARD_BINDINGS[1].confirm);
  });

  it('한 플레이어의 한 동작만 새 키로 바꾼다', () => {
    const [p1, p2] = buildKeyboardBindings({ '1.light': ['KeyQ'] });
    expect(p1.light).toEqual(['KeyQ']);
    expect(p1.heavy).toEqual(KEYBOARD_BINDINGS[0].heavy);
    expect(p2.light).toEqual(KEYBOARD_BINDINGS[1].light);
  });

  it('2P 매핑은 1P에 영향을 주지 않는다', () => {
    const [p1, p2] = buildKeyboardBindings({ '2.confirm': ['Space'] });
    expect(p2.confirm).toEqual(['Space']);
    expect(p1.confirm).toEqual(KEYBOARD_BINDINGS[0].confirm);
  });

  it('빈 배열 재지정은 무시하고 기본값을 쓴다', () => {
    const [p1] = buildKeyboardBindings({ '1.light': [] });
    expect(p1.light).toEqual(KEYBOARD_BINDINGS[0].light);
  });
});

describe('키 이름 표시', () => {
  it('자주 쓰는 키를 읽기 쉬운 이름으로 바꾼다', () => {
    expect(keyCodeLabel('KeyF')).toBe('F');
    expect(keyCodeLabel('ShiftRight')).toBe('오른쪽 Shift');
    expect(keyCodeLabel('ControlRight')).toBe('오른쪽 Ctrl');
    expect(keyCodeLabel('ArrowLeft')).toBe('←');
    expect(keyCodeLabel('NumpadEnter')).toBe('Num Enter');
    expect(keyCodeLabel('Escape')).toBe('Esc');
  });
});
