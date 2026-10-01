import type { AudioManager } from '../audio/AudioManager';
import { SCENE_INPUT_BLOCK_FRAMES } from '../core/constants';
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
    // 전환 직후 0.3초는 새 누름도 받지 않는다(확인·약공격이 같은 키라서).
    this.context.input.blockInput(SCENE_INPUT_BLOCK_FRAMES);
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
