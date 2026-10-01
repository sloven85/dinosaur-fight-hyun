import { DESIGN_HEIGHT, DESIGN_WIDTH, FIXED_DT, MAX_FRAME_DELTA } from './constants';
import { createSession } from './session';
import { createSettings, type SettingsStore } from './settings';
import { AudioManager } from '../audio/AudioManager';
import { InputManager } from '../input/InputManager';
import { AssetLoader } from '../rendering/AssetLoader';
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
  private readonly assets: AssetLoader;
  private readonly audio: AudioManager;
  private readonly settings: SettingsStore;
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

    // 저장된 설정이 없거나 저장소를 못 쓰면 기본값으로 시작한다.
    // 키 재지정을 InputManager 생성 시점에 반영해야 첫 화면부터 적용된다.
    this.settings = createSettings();
    this.input = new InputManager(window, this.settings.value.keyMapping);
    this.assets = new AssetLoader();
    this.audio = new AudioManager(this.assets.resolve(''));
    this.audio.setVolume(this.settings.value.volume);
    this.audio.preload();
    this.installAudioUnlock();
    this.scenes = new SceneManager(this.input, createSession(), this.assets, this.settings, this.audio);
    this.scenes.change(new TitleScene());
  }

  /**
   * 계획서 2절: 소리는 사용자의 클릭·키 입력 뒤에만 시작할 수 있다.
   * 첫 입력에서 자동으로 잠금을 풀고, 그래도 막히면 화면이 "소리 켜기" 버튼을 보여 준다.
   */
  private installAudioUnlock(): void {
    const unlock = (): void => this.audio.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
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
