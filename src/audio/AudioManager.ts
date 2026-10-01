import { AUDIO_TRACKS, trackById } from './tracks';

/**
 * 계획서 13·16절 프롬프트 6: 제공된 음원만 연결하고, 브라우저가 막으면 무음으로 진행한다.
 *
 * - 음원 파일이 없거나 로드에 실패하면 조용히 무음이 된다(게임은 계속 진행).
 * - 재생 시작은 사용자의 클릭·키 입력 뒤에만 가능하므로 `unlock()`을 그때 부른다.
 * - 아직 잠겨 있으면 화면이 "소리 켜기" 버튼을 보여 준다.
 */
export type AudioStatus = 'locked' | 'ready' | 'silent';

/** 테스트에서 흉내 낼 수 있는 최소 오디오 요소. */
export interface AudioElementLike {
  src: string;
  volume: number;
  loop: boolean;
  preload: string;
  currentTime: number;
  play(): Promise<void> | void;
  pause(): void;
  addEventListener?(type: string, listener: () => void): void;
}

export type AudioFactory = (src: string) => AudioElementLike | null;

function defaultFactory(src: string): AudioElementLike | null {
  if (typeof Audio === 'undefined') return null;
  try {
    const element = new Audio();
    element.src = src;
    return element;
  } catch {
    return null;
  }
}

/** 효과음 하나당 동시에 울릴 수 있는 수. */
const SFX_VOICES = 3;

export class AudioManager {
  private readonly elements = new Map<string, AudioElementLike>();
  private readonly readyIds = new Set<string>();
  private volumeValue = 0.8;
  private unlocked = false;
  /** 자동재생 정책 등으로 재생이 막혔는지(막히면 "소리 켜기" 버튼을 계속 보여 준다). */
  private blocked = false;
  private currentBgmId: string | null = null;

  constructor(
    private readonly baseUrl: string = './',
    private readonly factory: AudioFactory = defaultFactory,
    /** 실제로 있는 음원 경로 목록. 주어지면 목록에 없는 트랙은 요청하지 않고 무음으로 둔다(404 방지). */
    private readonly availablePaths: ReadonlySet<string> | null = null,
  ) {}

  /** 음원 목록을 미리 만들어 둔다(실패한 항목은 무음으로 남는다). */
  preload(): void {
    const byPath = new Map<string, { element: AudioElementLike; ids: string[] }>();
    for (const track of AUDIO_TRACKS) {
      if (this.elements.has(track.id)) continue;
      if (this.availablePaths && !this.availablePaths.has(track.path)) continue;
      // 같은 파일을 여러 이름(예: ko·ko_bell)이 쓰면 요소 하나를 같이 쓴다.
      const shared = byPath.get(track.path);
      if (shared && (trackById(shared.ids[0])?.kind ?? 'sfx') === track.kind) {
        shared.ids.push(track.id);
        this.elements.set(track.id, shared.element);
        continue;
      }
      const element = this.factory(this.resolve(track.path));
      if (!element) continue;
      element.preload = 'auto';
      element.loop = track.kind === 'bgm';
      element.volume = this.volumeValue;
      const entry = { element, ids: [track.id] };
      byPath.set(track.path, entry);
      const markReady = () => {
        for (const id of entry.ids) this.readyIds.add(id);
      };
      try {
        element.addEventListener?.('canplaythrough', markReady);
        element.addEventListener?.('loadeddata', markReady);
      } catch {
        // 이벤트를 못 붙여도 재생 시도는 가능하다.
      }
      this.elements.set(track.id, element);
    }
  }

  get status(): AudioStatus {
    if (!this.unlocked || this.blocked) return 'locked';
    return this.readyIds.size > 0 ? 'ready' : 'silent';
  }

  /** 브라우저가 막아 아직 소리를 시작하지 못했는지(화면이 버튼을 보여 줄지 판단). */
  get needsUnlock(): boolean {
    return !this.unlocked || this.blocked;
  }

  get isUnlocked(): boolean {
    return this.unlocked && !this.blocked;
  }

  get hasSources(): boolean {
    return this.elements.size > 0;
  }

  /** 실제로 재생 가능한(로드가 끝난) 음원 수. 0이면 무음으로 진행한다. */
  get readySourceCount(): number {
    return this.readyIds.size;
  }

  get volume(): number {
    return this.volumeValue;
  }

  /** 사용자의 클릭·키 입력에서 부른다. 이미 잠겨 있었으면 대기 중인 BGM을 시작한다. */
  unlock(): void {
    this.unlocked = true;
    this.blocked = false;
    if (this.currentBgmId) this.playBgm(this.currentBgmId);
  }

  setVolume(value: number): void {
    this.volumeValue = Math.min(1, Math.max(0, value));
    for (const element of this.elements.values()) element.volume = this.volumeValue;
  }

  /** 같은 효과음이 겹쳐 울릴 수 있게 효과음마다 복제본을 몇 개 돌려 쓴다(연타 때 앞소리가 끊기지 않게). */
  private readonly sfxPool = new Map<string, { list: AudioElementLike[]; next: number }>();

  private sfxElement(id: string, base: AudioElementLike): AudioElementLike {
    let pool = this.sfxPool.get(id);
    if (!pool) {
      pool = { list: [base], next: 0 };
      const track = trackById(id);
      for (let i = 0; i < SFX_VOICES - 1 && track; i++) {
        const extra = this.factory(this.resolve(track.path));
        if (!extra) break;
        extra.preload = 'auto';
        extra.volume = this.volumeValue;
        pool.list.push(extra);
      }
      this.sfxPool.set(id, pool);
    }
    const element = pool.list[pool.next % pool.list.length];
    pool.next += 1;
    return element;
  }

  playSfx(id: string): void {
    if (!this.unlocked) return;
    const base = this.elements.get(id);
    if (!base || !this.readyIds.has(id)) return;
    const element = this.sfxElement(id, base);
    element.volume = this.volumeValue;
    try {
      element.currentTime = 0;
      void Promise.resolve(element.play()).catch(() => {
        this.blocked = true;
      });
    } catch {
      // 재생 실패는 게임 진행을 막지 않는다.
    }
  }

  playBgm(id: string): void {
    this.currentBgmId = id;
    if (!this.unlocked) return;
    const track = trackById(id);
    const element = this.elements.get(id);
    if (!track || track.kind !== 'bgm' || !element || !this.readyIds.has(id)) return;
    try {
      void Promise.resolve(element.play()).catch(() => {
        this.blocked = true;
      });
    } catch {
      // 자동재생 차단 등은 무시한다.
    }
  }

  stopBgm(): void {
    const id = this.currentBgmId;
    this.currentBgmId = null;
    if (!id) return;
    try {
      this.elements.get(id)?.pause();
    } catch {
      // 무시
    }
  }

  private resolve(path: string): string {
    return `${this.baseUrl}${path}`;
  }
}
