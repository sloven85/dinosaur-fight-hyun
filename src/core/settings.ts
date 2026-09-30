/**
 * 계획서 2절 "어른용 설정" + 16절 프롬프트 5의 저장 요구.
 *
 * 저장 대상: CPU 난이도, 어린이 도움 설정, 음량, 화면 흔들림, 패드 진동, 키 재지정.
 * localStorage를 못 쓰거나 저장이 실패해도 예외를 밖으로 던지지 않는다(게임은 계속 진행).
 */

export type CpuDifficulty = 'easy' | 'normal';

export interface GameSettings {
  cpuDifficulty: CpuDifficulty;
  /** 어린이 도움 설정: 1P 체력 1.5배 + CPU 공격 빈도 감소. 기본값 꺼짐. */
  assist: boolean;
  /** 0~1 */
  volume: number;
  screenShake: boolean;
  vibration: boolean;
  /** 키 재지정. 비어 있으면 bindings.ts의 기본 매핑을 쓴다. */
  keyMapping: Record<string, string[]>;
}

/** 계획서 2절: 도움 설정의 1P 체력 배율. */
export const P1_ASSIST_HEALTH_MULTIPLIER = 1.5;
/** 계획서 2절: 도움 설정의 CPU 공격 빈도 감소 배율. */
export const ASSIST_CPU_ATTACK_FREQUENCY_SCALE = 0.55;

export const DEFAULT_SETTINGS: GameSettings = {
  cpuDifficulty: 'easy',
  assist: false,
  volume: 0.8,
  screenShake: true,
  vibration: true,
  keyMapping: {},
};

const STORAGE_KEY = 'dino-fighters.settings.v1';

/** localStorage와 같은 최소 인터페이스. 테스트에서 가짜 저장소를 넣는다. */
export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function sanitizeKeyMapping(raw: unknown): Record<string, string[]> {
  if (!raw || typeof raw !== 'object') return {};
  const result: Record<string, string[]> = {};
  for (const [action, codes] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(codes)) continue;
    const valid = codes.filter((code): code is string => typeof code === 'string');
    if (valid.length > 0) result[action] = valid;
  }
  return result;
}

/** 저장된 값이 깨져 있어도 필드별로 기본값으로 되돌린다. */
export function sanitizeSettings(raw: unknown): GameSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS, keyMapping: {} };
  const value = raw as Record<string, unknown>;

  return {
    cpuDifficulty:
      value.cpuDifficulty === 'normal' || value.cpuDifficulty === 'easy'
        ? value.cpuDifficulty
        : DEFAULT_SETTINGS.cpuDifficulty,
    assist: typeof value.assist === 'boolean' ? value.assist : DEFAULT_SETTINGS.assist,
    volume: clamp01(
      typeof value.volume === 'number' && Number.isFinite(value.volume)
        ? value.volume
        : DEFAULT_SETTINGS.volume,
    ),
    screenShake:
      typeof value.screenShake === 'boolean' ? value.screenShake : DEFAULT_SETTINGS.screenShake,
    vibration: typeof value.vibration === 'boolean' ? value.vibration : DEFAULT_SETTINGS.vibration,
    keyMapping: sanitizeKeyMapping(value.keyMapping),
  };
}

/** 브라우저 저장소를 안전하게 얻는다. 접근이 막혀 있으면 null(=메모리만 사용). */
export function safeLocalStorage(): SettingsStorage | null {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return null;
    const probe = '__dino_settings_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

/**
 * 설정 하나를 보관하고 저장한다. 값은 항상 검증된 형태로 유지된다.
 */
export class SettingsStore {
  private data: GameSettings;

  constructor(private readonly storage: SettingsStorage | null = safeLocalStorage()) {
    this.data = this.load();
  }

  get value(): GameSettings {
    return { ...this.data, keyMapping: { ...this.data.keyMapping } };
  }

  get difficulty(): CpuDifficulty {
    return this.data.cpuDifficulty;
  }

  get assist(): boolean {
    return this.data.assist;
  }

  update(patch: Partial<GameSettings>): GameSettings {
    this.data = sanitizeSettings({ ...this.data, ...patch });
    this.persist();
    return this.value;
  }

  toggleAssist(): boolean {
    return this.update({ assist: !this.data.assist }).assist;
  }

  cycleDifficulty(): CpuDifficulty {
    const next: CpuDifficulty = this.data.cpuDifficulty === 'easy' ? 'normal' : 'easy';
    return this.update({ cpuDifficulty: next }).cpuDifficulty;
  }

  private load(): GameSettings {
    if (!this.storage) return { ...DEFAULT_SETTINGS, keyMapping: {} };
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS, keyMapping: {} };
      return sanitizeSettings(JSON.parse(raw));
    } catch (error) {
      console.warn('[settings] 저장된 설정을 읽지 못했습니다. 기본값으로 시작합니다.', error);
      return { ...DEFAULT_SETTINGS, keyMapping: {} };
    }
  }

  /** 저장 실패는 게임 진행을 막지 않는다(계획서 16절 프롬프트 5). */
  private persist(): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (error) {
      console.warn('[settings] 설정을 저장하지 못했습니다. 이번 판은 그대로 진행합니다.', error);
    }
  }
}

export function createSettings(storage: SettingsStorage | null = safeLocalStorage()): SettingsStore {
  return new SettingsStore(storage);
}

export const SETTINGS_STORAGE_KEY = STORAGE_KEY;
