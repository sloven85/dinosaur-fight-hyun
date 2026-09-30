import type { GameContext } from '../core/GameContext';
import type { Session } from '../core/session';
import type { InputManager } from '../input/InputManager';
import type { Scene } from './Scene';

/** 현재 화면 하나를 보관하고 전환을 관리한다(계획서 14절 GameState 흐름). */
export class SceneManager {
  private current: Scene | null = null;
  readonly context: GameContext;

  constructor(input: InputManager, session: Session) {
    this.context = {
      input,
      session,
      setScene: (scene) => this.change(scene),
      requestPause: () => input.requestPause('menu'),
    };
  }

  change(scene: Scene): void {
    this.current?.exit();
    this.current = scene;
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
