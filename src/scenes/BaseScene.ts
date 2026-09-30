import type { GameContext } from '../core/GameContext';
import type { Scene } from './Scene';

/** context 보관과 update 진입을 공통화한 화면 기본 클래스. */
export abstract class BaseScene implements Scene {
  protected context!: GameContext;

  enter(context: GameContext): void {
    this.context = context;
  }

  exit(): void {}

  update(dt: number, context: GameContext): void {
    this.context = context;
    this.tick(dt);
  }

  protected abstract tick(dt: number): void;

  abstract render(g: CanvasRenderingContext2D, width: number, height: number): void;
}
