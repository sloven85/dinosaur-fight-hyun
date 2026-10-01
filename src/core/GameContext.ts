import type { AudioManager } from '../audio/AudioManager';
import type { InputManager } from '../input/InputManager';
import type { AssetLoader } from '../rendering/AssetLoader';
import type { Scene } from '../scenes/Scene';
import type { Session } from './session';
import type { SettingsStore } from './settings';

/** 화면들이 공유하는 접근점. 화면은 이 객체로만 게임 상태를 바꾼다. */
export interface GameContext {
  readonly input: InputManager;
  readonly session: Session;
  readonly assets: AssetLoader;
  /** 계획서 13절 사운드. 음원이 없으면 무음으로 동작한다. */
  readonly audio: AudioManager;
  /** 계획서 2절 어른용 설정(난이도·도움 설정·저장). */
  readonly settings: SettingsStore;
  setScene(scene: Scene): void;
  /** 일시정지 요청(예: 대전 중 Esc). 실제 중단은 Game 루프가 처리한다. */
  requestPause(): void;
}
