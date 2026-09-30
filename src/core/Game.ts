import { DESIGN_HEIGHT, DESIGN_WIDTH, FIXED_DT, MAX_FRAME_DELTA } from './constants';
import { createSession } from './session';
import { InputManager } from '../input/InputManager';
import { SceneManager } from '../scenes/SceneManager';
import { TitleScene } from '../scenes/TitleScene';
import { renderPauseOverlay } from '../ui/PauseOverlay';

/**
 * 게임 루프를 소유한다. 시뮬레이션은 FIXED_DT(60Hz)로 고정하고
 * 렌더링은 매 프레임 수행한다(계획서 14절).
 * 일시정지는 전투 상태와 별도의 상위 플래그로 관리한다(계획서 15절).
 */
export class Game {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly input: InputManager;
  private readonly scenes: SceneManager;
  private running = false;
  private accumulator = 0;
  private lastTime = 0;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('2D 렌더링 컨텍스트를 만들 수 없습니다.');
    }
    this.ctx = ctx;
    canvas.width = DESIGN_WIDTH;
    canvas.height = DESIGN_HEIGHT;

    this.input = new InputManager();
    this.scenes = new SceneManager(this.input, createSession());
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
      this.step(FIXED_DT);
      this.accumulator -= FIXED_DT;
    }

    this.scenes.render(this.ctx, DESIGN_WIDTH, DESIGN_HEIGHT);
    if (this.input.isPaused) {
      renderPauseOverlay(this.ctx, DESIGN_WIDTH, DESIGN_HEIGHT, this.input.pauseReason);
    }

    requestAnimationFrame(this.frame);
  };

  private step(dt: number): void {
    this.input.update();

    if (this.input.isPaused) {
      // 연결 해제·포커스 이탈·메뉴 일시정지 모두 확인 버튼으로 재개한다(계획서 1절).
      if (this.input.anyPressed('confirm') || this.input.anyPressed('pause')) {
        this.input.resume();
      }
      return;
    }

    if (this.scenes.pausable && this.input.anyPressed('pause')) {
      this.input.requestPause('menu');
      return;
    }

    this.scenes.update(dt);
  }
}
