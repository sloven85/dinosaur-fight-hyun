import { describe, expect, it } from 'vitest';
import { AudioManager } from '../audio/AudioManager';
import type { GameContext } from '../core/GameContext';
import { createSession } from '../core/session';
import { SettingsStore } from '../core/settings';
import type { AssetLoader } from '../rendering/AssetLoader';
import { EffectSystem } from '../rendering/effects';
import type { InputManager } from '../input/InputManager';
import { BattleScene } from './BattleScene';
import { CharacterSelectScene } from './CharacterSelectScene';
import { ModeScene } from './ModeScene';
import { ResultScene } from './ResultScene';
import { SettingsScene } from './SettingsScene';
import { StageSelectScene } from './StageSelectScene';
import { TitleScene } from './TitleScene';
import { VsScene } from './VsScene';

/** 그리기 호출을 모두 삼키는 가짜 2D 컨텍스트(렌더 경로가 예외 없이 도는지만 본다). */
function fakeContext(): CanvasRenderingContext2D {
  const target: Record<string, unknown> = {};
  return new Proxy(target, {
    get: (store, property) => {
      if (property in store) return store[property as string];
      // 그라디언트·패턴처럼 객체를 돌려주는 호출은 addColorStop 등을 가진 빈 객체로.
      if (typeof property === 'string' && /^create/.test(property)) return () => ({ addColorStop: () => {} });
      return () => {};
    },
    set: (store, property, value) => {
      store[property as string] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

function fakeInput(): InputManager {
  return {
    anyPressed: () => false,
    anyHeld: () => false,
    isPressed: () => false,
    isHeld: () => false,
    isReleased: () => false,
    padIndex: () => null,
    consumeDebugToggle: () => false,
    requestPause: () => {},
    resume: () => {},
    resetEdges: () => {},
    setKeyMapping: () => {},
    currentKeyMapping: {},
    captureNextKey: () => {},
    cancelKeyCapture: () => {},
    isCapturingKey: false,
    rumble: () => {},
    rumbleAll: () => {},
  } as unknown as InputManager;
}

/** 네트워크·이미지 없이 도는 가짜 에셋 로더. */
function fakeAssets(): AssetLoader {
  return {
    resolve: (path: string) => path,
    image: () => null,
    loadImage: async () => null,
    loadJson: async () => null,
    loadImages: async () => {},
    missingFiles: [],
  } as unknown as AssetLoader;
}

function makeContext(): GameContext {
  return {
    input: fakeInput(),
    session: createSession(),
    assets: fakeAssets(),
    audio: new AudioManager('./', () => null),
    settings: new SettingsStore(null),
    setScene: () => {},
    requestPause: () => {},
  };
}

const W = 1920;
const H = 1080;

describe('화면 렌더 스모크 (프롬프트 6)', () => {
  it('모든 화면이 예외 없이 그려진다', () => {
    const context = makeContext();
    const g = fakeContext();

    const scenes = [
      new TitleScene(),
      new ModeScene(),
      new CharacterSelectScene(),
      new StageSelectScene(),
      new VsScene(),
      new BattleScene(),
      new ResultScene(0),
      new SettingsScene(),
    ];

    for (const scene of scenes) {
      expect(() => {
        scene.enter(context);
        scene.render(g, W, H);
      }, `${scene.constructor.name} 렌더 실패`).not.toThrow();
    }
  });

  it('어른 설정의 키 재지정 화면도 그려진다', () => {
    const context = makeContext();
    const scene = new SettingsScene();
    scene.enter(context);
    (scene as unknown as { mode: string }).mode = 'keys';
    expect(() => scene.render(fakeContext(), W, H)).not.toThrow();
  });

  it('이펙트 시스템은 화면 좌표로 예외 없이 그려진다', () => {
    const effects = new EffectSystem(() => 0.5);
    effects.spawnHit(900, 700, { kind: 'special', direction: 1 });
    effects.spawnStars(900, 600, 6);
    expect(() => effects.render(fakeContext())).not.toThrow();
  });
});
