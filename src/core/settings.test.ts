import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  SettingsStore,
  sanitizeSettings,
  type SettingsStorage,
} from './settings';

class FakeStorage implements SettingsStorage {
  readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

/** 저장이 항상 실패하는 저장소(사생활 보호 모드·용량 초과 등). */
class ThrowingStorage implements SettingsStorage {
  getItem(): string | null {
    return null;
  }
  setItem(): void {
    throw new Error('저장 실패');
  }
}

describe('설정 기본값', () => {
  it('저장소가 없으면 기본값으로 시작한다', () => {
    const store = new SettingsStore(null);
    expect(store.value).toEqual(DEFAULT_SETTINGS);
    expect(store.difficulty).toBe('easy');
    expect(store.assist).toBe(false);
  });

  it('난이도·도움 설정을 바꾸고 다시 읽으면 그대로 남는다', () => {
    const storage = new FakeStorage();
    const first = new SettingsStore(storage);
    first.update({ cpuDifficulty: 'normal', assist: true, volume: 0.3 });
    first.update({ keyMapping: { light: ['KeyF'] } });

    const second = new SettingsStore(storage);
    expect(second.difficulty).toBe('normal');
    expect(second.assist).toBe(true);
    expect(second.value.volume).toBeCloseTo(0.3, 5);
    expect(second.value.keyMapping.light).toEqual(['KeyF']);
  });

  it('토글은 값을 뒤집고 저장한다', () => {
    const store = new SettingsStore(new FakeStorage());
    expect(store.toggleAssist()).toBe(true);
    expect(store.toggleAssist()).toBe(false);
    expect(store.cycleDifficulty()).toBe('normal');
    expect(store.cycleDifficulty()).toBe('easy');
  });
});

describe('깨진 저장값 처리', () => {
  it('JSON이 깨져 있어도 기본값으로 시작하고 예외를 던지지 않는다', () => {
    const storage = new FakeStorage();
    storage.setItem(SETTINGS_STORAGE_KEY, '{ this is not json');

    expect(() => new SettingsStore(storage)).not.toThrow();
    expect(new SettingsStore(storage).value).toEqual(DEFAULT_SETTINGS);
  });

  it('필드별로 잘못된 값은 기본값으로 되돌린다', () => {
    const sanitized = sanitizeSettings({
      cpuDifficulty: 'hard',
      assist: 'yes',
      volume: 42,
      screenShake: 'nope',
      keyMapping: { light: 'KeyF', heavy: ['KeyG', 3] },
    });

    expect(sanitized.cpuDifficulty).toBe('easy');
    expect(sanitized.assist).toBe(false);
    expect(sanitized.volume).toBe(1);
    expect(sanitized.screenShake).toBe(true);
    expect(sanitized.keyMapping).toEqual({ heavy: ['KeyG'] });
  });
});

describe('저장 실패 대응 (프롬프트 5)', () => {
  it('저장이 실패해도 예외 없이 이번 판 값을 유지한다', () => {
    const store = new SettingsStore(new ThrowingStorage());

    expect(() => store.update({ assist: true })).not.toThrow();
    expect(store.assist).toBe(true);
    expect(() => store.cycleDifficulty()).not.toThrow();
    expect(store.difficulty).toBe('normal');
  });
});
