import type { Scene } from './Scene';

/** 현재 화면 하나를 보관하고 전환을 관리한다(계획서 14절 GameState 흐름). */
export class SceneManager {
  private current: Scene | null = null;

  change(scene: Scene): void {
    this.current?.exit();
    this.current = scene;
    this.current.enter();
  }

  update(dt: number): void {
    this.current?.update(dt);
  }

  render(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    this.current?.render(ctx, width, height);
  }
}
