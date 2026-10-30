import { DESIGN_HEIGHT, DESIGN_WIDTH, FIXED_DT, MAX_FRAME_DELTA } from './constants';
import { createSession } from './session';
import { createSettings, type SettingsStore } from './settings';
import { AudioManager } from '../audio/AudioManager';
import { AUDIO_FILES } from 'virtual:asset-version';
import { InputManager } from '../input/InputManager';
import { AssetLoader } from '../rendering/AssetLoader';
import { SceneManager } from '../scenes/SceneManager';
import { TitleScene } from '../scenes/TitleScene';
import { renderPauseMenu, renderPauseOverlay } from '../ui/PauseOverlay';
import { PauseMenu } from '../ui/pauseMenu';
import { CharacterSelectScene } from '../scenes/CharacterSelectScene';
import { dotUiEnabled } from '../rendering/pixel/pilotFlag';
import { drawPauseScreen } from '../rendering/pixel/PixelScreens';
import { PAUSE_ITEMS } from '../ui/pauseMenu';

/**
 * 게임 루프를 소유한다. 시뮬레이션은 FIXED_DT(60Hz)로 고정하고
 * 렌더링은 매 프레임 수행한다(계획서 14절).
 * 일시정지는 전투 상태와 별도의 상위 플래그로 관리한다(계획서 15절).
 */
/** 일시정지 이유 문구(도트 오버레이용). */
function pauseReasonText(reason: string | null): string {
  if (reason === 'gamepad-disconnected') return '게임패드 연결이 끊어졌습니다';
  if (reason === 'focus-lost') return '창이 활성 상태가 아닙니다';
  return '';
}

export class Game {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly input: InputManager;
  private readonly assets: AssetLoader;
  private readonly audio: AudioManager;
  private readonly settings: SettingsStore;
  private readonly scenes: SceneManager;
  private readonly pauseMenu = new PauseMenu();
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
    this.audio = new AudioManager(this.assets.resolve(''), undefined, new Set(AUDIO_FILES));
    this.audio.setVolume(this.settings.value.volume);
    this.audio.preload();
    this.audio.warmSfx();
    this.installAudioUnlock();
    this.scenes = new SceneManager(this.input, createSession(), this.assets, this.settings, this.audio);
    this.scenes.change(new TitleScene());
    if ((import.meta.env as Record<string, string | undefined>).VITE_DOT_PILOT === '1') {
      // 파일럿 배포 표식: 지금 화면이 최종본이 아니라는 사실을 항상 보이게 둔다.
      const badge = document.createElement('div');
      badge.textContent = '도트 통합 빌드 · 화면 전체 도트 · 파일럿';
      badge.style.cssText = 'position:fixed;top:10px;left:10px;z-index:30;color:#fff;background:#B3261E;'
        + 'padding:8px 12px;border-radius:6px;font:600 14px/1.3 system-ui;letter-spacing:.2px';
      document.body.append(badge);
    } else if (import.meta.env.DEV && new URLSearchParams(location.search).get('pixelPilot') !== '1') {
      const pilot = document.createElement('a');
      pilot.href = '?pixelPilot=1';
      pilot.textContent = '개발용 티라노 도트 비교판 열기';
      pilot.style.cssText = 'position:fixed;top:8px;left:8px;z-index:10;color:white;background:#152536;padding:10px';
      document.body.append(pilot);
      const review = document.createElement('a');
      review.href = 'pixel-review.html'; review.textContent = 'v2 동일 입력 A/B 검수 · 영상 기록';
      review.style.cssText = 'position:fixed;top:8px;left:290px;z-index:10;color:white;background:#152536;padding:10px';
      document.body.append(review);
      const stage = document.createElement('a');
      stage.href = '?pixelStage=1'; stage.textContent = '개발용 12종 도트 스프라이트 비교판';
      stage.style.cssText = 'position:fixed;top:8px;left:610px;z-index:10;color:white;background:#1c3a52;padding:10px';
      document.body.append(stage);
    }
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
      if (dotUiEnabled(import.meta.env.DEV, typeof location === 'undefined' ? '' : location.search)) {
        // 도트 화면의 일시정지: 같은 격자·같은 팔레트로 다시 그린다(벡터 오버레이 없음).
        const confirming = this.pauseMenu.confirming
          ? PAUSE_ITEMS.find((item) => item.choice === this.pauseMenu.confirming)?.label ?? null
          : null;
        drawPauseScreen(this.ctx, {
          loader: this.assets,
          items: this.scenes.pausable
            ? PAUSE_ITEMS.map((item) => item.label)
            : ['계속하기'],
          index: this.scenes.pausable ? this.pauseMenu.index : 0,
          title: '일시정지',
          detail: pauseReasonText(this.input.pauseReason),
          confirming,
          confirmIndex: this.pauseMenu.confirmIndex,
        });
      } else if (this.scenes.pausable) {
        renderPauseMenu(this.ctx, DESIGN_WIDTH, DESIGN_HEIGHT, this.input.pauseReason, this.pauseMenu);
      } else {
        renderPauseOverlay(this.ctx, DESIGN_WIDTH, DESIGN_HEIGHT, this.input.pauseReason);
      }
    }

    requestAnimationFrame(this.frame);
  };

  private step(dt: number): void {
    this.input.update();

    if (this.input.isPaused) {
      if (this.scenes.pausable) {
        // 대전 중: 계속하기 / 캐릭터 다시 고르기 / 메인 화면으로(나가기는 한 번 더 확인).
        this.handlePauseMenu();
      } else if (this.input.anyPressed('confirm') || this.input.anyPressed('pause')) {
        // 메뉴 화면: 연결 해제·포커스 이탈은 확인 버튼으로 재개한다(계획서 1절).
        this.input.resume();
      }
      return;
    }

    if (this.scenes.pausable && this.input.anyPressed('pause')) {
      this.pauseMenu.reset();
      this.input.requestPause('menu');
      return;
    }

    this.scenes.update(dt);
  }

  private handlePauseMenu(): void {
    const input = this.input;
    const choice = this.pauseMenu.update({
      up: input.anyPressed('up'),
      down: input.anyPressed('down'),
      confirm: input.anyPressed('confirm'),
      cancel: input.anyPressed('cancel'),
      pause: input.anyPressed('pause'),
    });
    if (!choice) return;
    if (choice === 'characterSelect') this.scenes.change(new CharacterSelectScene());
    else if (choice === 'title') this.scenes.change(new TitleScene());
    this.pauseMenu.reset();
    this.input.resume();
  }
}
