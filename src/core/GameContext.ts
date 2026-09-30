import type { InputManager } from '../input/InputManager';
import type { AssetLoader } from '../rendering/AssetLoader';
import type { Scene } from '../scenes/Scene';
import type { Session } from './session';

/** 화면들이 공유하는 접근점. 화면은 이 객체로만 게임 상태를 바꾼다. */
export interface GameContext {
  readonly input: InputManager;
  readonly session: Session;
  readonly assets: AssetLoader;
  setScene(scene: Scene): void;
  /** 일시정지 요청(예: 대전 중 Esc). 실제 중단은 Game 루프가 처리한다. */
  requestPause(): void;
}
