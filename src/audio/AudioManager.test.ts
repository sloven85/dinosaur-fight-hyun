import { describe, expect, it } from 'vitest';
import { AudioManager, type AudioElementLike } from './AudioManager';
import { AUDIO_TRACKS } from './tracks';

class FakeAudio implements AudioElementLike {
  src: string;
  volume = 1;
  loop = false;
  preload = '';
  currentTime = 0;
  playCalls = 0;
  pauseCalls = 0;
  playResult: Promise<void> = Promise.resolve();
  private readonly listeners = new Map<string, Set<() => void>>();

  constructor(src: string) {
    this.src = src;
  }

  play(): Promise<void> {
    this.playCalls += 1;
    return this.playResult;
  }

  pause(): void {
    this.pauseCalls += 1;
  }

  addEventListener(type: string, listener: () => void): void {
    const set = this.listeners.get(type) ?? new Set<() => void>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  emit(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
}

function collectFactory(): { created: FakeAudio[]; factory: (src: string) => FakeAudio } {
  const created: FakeAudio[] = [];
  const factory = (src: string): FakeAudio => {
    const element = new FakeAudio(src);
    created.push(element);
    return element;
  };
  return { created, factory };
}

describe('사운드 매니저 (프롬프트 6)', () => {
  it('음원이 없으면(null 팩토리) 무음으로 진행하고 예외를 던지지 않는다', () => {
    const audio = new AudioManager('./', () => null);
    audio.preload();
    expect(audio.hasSources).toBe(false);
    expect(audio.status).toBe('locked');

    audio.unlock();
    expect(audio.status).toBe('silent');
    expect(() => audio.playSfx('light')).not.toThrow();
  });

  it('음원 목록마다 요소를 만들고 로드 전에는 재생하지 않는다', () => {
    const { created, factory } = collectFactory();
    const audio = new AudioManager('./', factory);
    audio.preload();

    expect(created).toHaveLength(AUDIO_TRACKS.length);
    audio.unlock();
    // 아직 loadeddata가 없으므로 무음 상태다.
    expect(audio.status).toBe('silent');
    audio.playSfx('light');
    expect(created[0].playCalls).toBe(0);
  });

  it('음원이 준비되면 재생하고, 음량 설정이 모든 요소에 적용된다', () => {
    const { created, factory } = collectFactory();
    const audio = new AudioManager('./', factory);
    audio.preload();
    audio.setVolume(0.4);
    audio.unlock();

    const light = created[AUDIO_TRACKS.findIndex((track) => track.id === 'light')];
    light.emit('loadeddata');

    expect(audio.status).toBe('ready');
    expect(audio.readySourceCount).toBe(1);
    audio.playSfx('light');
    expect(light.playCalls).toBe(1);
    expect(light.volume).toBeCloseTo(0.4, 5);
    expect(created[0].volume).toBeCloseTo(0.4, 5);
  });

  it('재생이 막히면 소리 켜기 버튼이 다시 필요해진다', async () => {
    const { created, factory } = collectFactory();
    const audio = new AudioManager('./', factory);
    audio.preload();
    audio.unlock();

    const light = created[AUDIO_TRACKS.findIndex((track) => track.id === 'light')];
    light.emit('canplaythrough');
    light.playResult = Promise.reject(new Error('자동재생 차단'));
    audio.playSfx('light');

    await Promise.resolve();
    await Promise.resolve();
    expect(audio.needsUnlock).toBe(true);
    expect(audio.status).toBe('locked');
  });

  it('BGM은 잠금 상태에서 예약됐다가 unlock 때 재생된다', () => {
    const { created, factory } = collectFactory();
    const audio = new AudioManager('./', factory);
    audio.preload();

    const battle = created[AUDIO_TRACKS.findIndex((track) => track.id === 'battle')];
    battle.emit('loadeddata');

    audio.playBgm('battle'); // 아직 잠김 → 예약만
    expect(battle.playCalls).toBe(0);

    audio.unlock();
    expect(battle.playCalls).toBe(1);
    expect(battle.loop).toBe(true);
  });
});
