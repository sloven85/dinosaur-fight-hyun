import type { AudioManager } from '../audio/AudioManager';
import type { GameContext } from '../core/GameContext';
import type { Session } from '../core/session';
import type { SettingsStore } from '../core/settings';
import type { InputManager } from '../input/InputManager';
import type { AssetLoader } from '../rendering/AssetLoader';
import type { Scene } from './Scene';

/** 현재 화면 하나를 보관하고 전환을 관리한다(계획서 14절 GameState 흐름). */
export class SceneManager {
  private current: Scene | null = null;
  readonly context: GameContext;

  constructor(
    input: InputManager,
    session: Session,
    assets: AssetLoader,
    settings: SettingsStore,
    audio: AudioManager,
  ) {
    this.context = {
      input,
      session,
      assets,
      settings,
      audio,
      setScene: (scene) => this.change(scene),
      requestPause: () => input.requestPause('menu'),
    };
  }

  change(scene: Scene): void {
    this.current?.exit();
    this.current = scene;
    // 새 화면으로 눌림 엣지가 새지 않게 한다(계획서 16절 프롬프트 2 완료 기준).
    this.context.input.resetEdges();
    scene.enter(this.context);
  }

  update(dt: number): void {
    this.current?.update(dt, this.context);
  }

  render(g: CanvasRenderingContext2D, width: number, height: number): void {
    this.current?.render(g, width, height);
  }

  get pausable(): boolean {
    return this.current?.pausable === true;
  }
}
