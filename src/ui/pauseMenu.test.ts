import { describe, expect, it } from 'vitest';
import { PauseMenu, type PauseMenuInput } from './pauseMenu';

const none: PauseMenuInput = { up: false, down: false, confirm: false, cancel: false, pause: false };
const press = (key: keyof PauseMenuInput): PauseMenuInput => ({ ...none, [key]: true });

describe('대전 일시정지 메뉴', () => {
  it('첫 항목 계속하기를 확인하면 바로 계속한다', () => {
    const menu = new PauseMenu();
    expect(menu.update(press('confirm'))).toBe('resume');
  });

  it('일시정지·취소 버튼을 다시 누르면 계속한다', () => {
    expect(new PauseMenu().update(press('pause'))).toBe('resume');
    expect(new PauseMenu().update(press('cancel'))).toBe('resume');
  });

  it('캐릭터 다시 고르기는 "예"를 골라야만 나간다', () => {
    const menu = new PauseMenu();
    menu.update(press('down'));
    expect(menu.update(press('confirm'))).toBeNull();
    expect(menu.confirming).toBe('characterSelect');
    // 기본은 "아니오" → 확인하면 메뉴로 돌아온다.
    expect(menu.update(press('confirm'))).toBeNull();
    expect(menu.confirming).toBeNull();

    menu.update(press('confirm'));
    menu.update(press('down')); // 예
    expect(menu.update(press('confirm'))).toBe('characterSelect');
  });

  it('메인 화면으로도 확인 후 나가고, 확인 중 취소하면 메뉴로 돌아온다', () => {
    const menu = new PauseMenu();
    menu.update(press('up')); // 위로 감아 마지막 항목
    menu.update(press('confirm'));
    expect(menu.confirming).toBe('title');
    expect(menu.update(press('cancel'))).toBeNull();
    expect(menu.confirming).toBeNull();

    menu.update(press('confirm'));
    menu.update(press('up'));
    expect(menu.update(press('confirm'))).toBe('title');
  });
});
