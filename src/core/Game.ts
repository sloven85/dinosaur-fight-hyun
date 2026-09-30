import { DESIGN_HEIGHT, DESIGN_WIDTH, FIXED_DT, MAX_FRAME_DELTA } from './constants';
import { SceneManager } from '../scenes/SceneManager';
import { TitleScene } from '../scenes/TitleScene';

/**
 * 게임 루프를 소유한다. 시뮬레이션은 FIXED_DT(60Hz)로 고정하고
 * 렌더링은 매 프레임 수행한다(계획서 14절).
 */
export class Game {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly scenes: SceneManager;
  private running = false;
  private accumulator = 0;
  private lastTime = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('2D 렌더링 컨텍스트를 만들 수 없습니다.');
    }
    this.ctx = ctx;
    this.canvas.width = DESIGN_WIDTH;
    this.canvas.height = DESIGN_HEIGHT;

    this.scenes = new SceneManager();
    this.scenes.change(new TitleScene());
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
  }

  private readonly frame = (now: number): void => {
    if (!this.running) return;

    const elapsed = Math.min((now - this.lastTime) / 1000, MAX_FRAME_DELTA);
    this.lastTime = now;

    this.accumulator += elapsed;
    while (this.accumulator >= FIXED_DT) {
      this.scenes.update(FIXED_DT);
      this.accumulator -= FIXED_DT;
    }

    this.scenes.render(this.ctx, DESIGN_WIDTH, DESIGN_HEIGHT);
    requestAnimationFrame(this.frame);
  };
}
