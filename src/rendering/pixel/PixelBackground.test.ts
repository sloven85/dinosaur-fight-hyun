import { describe, expect, it } from 'vitest';
import {
  PIXEL_LAYER_H, PIXEL_LAYER_W, PIXEL_VIEW_W, PixelBackground, drawCenteredLayer, drawTiledLayer, pixelScaleFor,
} from './PixelBackground';

// jk 확정 2026-10-29: 아트 1px = 화면 4px. 창은 480×270 아트 px(1920×1080 ÷ 4),
// 배경 레이어는 640×360 아트 px를 그대로 4배로 그려 창보다 크게 나온다.
describe('도트 배율: 아트 1px = 화면 4px', () => {
  it('1920×1080 화면의 배율은 4다(캐릭터·배경 공통)', () => {
    expect(pixelScaleFor(1920)).toBe(4);
    expect(PIXEL_VIEW_W * 4).toBe(1920);
  });

  it('창(480)의 정수배 화면만 확대한다', () => {
    expect(pixelScaleFor(960)).toBe(2);
    expect(pixelScaleFor(1440)).toBe(3);
    expect(pixelScaleFor(480)).toBe(1);
  });

  it('정수가 아니면 그리지 않는다(레터박스 원칙, 아트 리사이즈 금지)', () => {
    expect(pixelScaleFor(1366)).toBeNull();
    expect(pixelScaleFor(1600)).toBeNull();
    expect(pixelScaleFor(1280)).toBeNull();
    expect(pixelScaleFor(0)).toBeNull();
    expect(pixelScaleFor(Number.NaN)).toBeNull();
  });
});

/** drawImage만 기록하는 가짜 컨텍스트. 좌표가 정수인지, 화면이 다 덮이는지 본다. */
function fakeCtx() {
  const calls: number[][] = [];
  const ctx = {
    imageSmoothingEnabled: true,
    save() {}, restore() {},
    drawImage(_img: unknown, x: number, y: number, w: number, h: number) { calls.push([x, y, w, h]); },
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

describe('레이어는 창 가운데를 보여 준다(레이어가 창보다 크다)', () => {
  const img = {} as CanvasImageSource;

  it('시차 0이면 레이어를 가운데 맞춰 한 장만 그린다', () => {
    const { ctx, calls } = fakeCtx();
    drawCenteredLayer(ctx, img, 4, 0, 0, -292, 1920);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual([-320, -292, PIXEL_LAYER_W * 4, PIXEL_LAYER_H * 4]);
    expect(calls[0][0] + calls[0][2]).toBe(1920 + 320);
  });

  it('시차만큼 밀되 여백 안에서만 민다(빈 곳 없음)', () => {
    const { ctx, calls } = fakeCtx();
    drawCenteredLayer(ctx, img, 4, 270, 0, -292, 1920);
    // 270은 배율 격자(4)로 반올림돼 272 → -320 + 272
    expect(calls[0][0]).toBe(-48);
    // 그리기 원점은 항상 4의 배수(아트 픽셀 블록이 캐릭터와 같은 격자)
    expect(Math.abs(calls[0][0] % 4)).toBe(0);
    const far = fakeCtx();
    // 지면 시차 최대(270)보다 크게 밀어도 잘린다.
    drawCenteredLayer(far.ctx, img, 4, 5000, 0, -292, 1920);
    expect(Math.abs(far.calls[0][0])).toBe(0);
    const back = fakeCtx();
    drawCenteredLayer(back.ctx, img, 4, -5000, 0, -292, 1920);
    expect(back.calls[0][0]).toBe(-640);
    for (const call of calls) for (const v of call) expect(Number.isInteger(v)).toBe(true);
  });

  it('블리드 pad가 있으면 그만큼 더 밀 수 있다', () => {
    const { ctx, calls } = fakeCtx();
    drawCenteredLayer(ctx, img, 4, 0, 96, -292, 1920);
    expect(calls[0][2]).toBe((PIXEL_LAYER_W + 192) * 4);
    expect(calls[0][0]).toBe(Math.round((1920 - (PIXEL_LAYER_W + 192) * 4) / 2));
  });

  it('레이어가 화면보다 좁을 때만 가로 타일로 깐다', () => {
    const { ctx, calls } = fakeCtx();
    drawCenteredLayer(ctx, img, 1, 0, 0, 0, 1920);
    expect(calls.length).toBeGreaterThan(1);
    expect(Math.min(...calls.map((c) => c[0]))).toBeLessThanOrEqual(0);
    expect(Math.max(...calls.map((c) => c[0] + c[2]))).toBeGreaterThanOrEqual(1920);
  });
});

describe('레이어 가로 타일', () => {
  const img = {} as CanvasImageSource;

  it('시차가 0이면 왼쪽부터 정확히 깐다', () => {
    const { ctx, calls } = fakeCtx();
    drawTiledLayer(ctx, img, 4, 0, 0, 5120);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual([0, 0, PIXEL_LAYER_W * 4, PIXEL_LAYER_H * 4]);
  });

  it('밀린 만큼 타일을 더 깔고, 모든 좌표가 정수다', () => {
    const { ctx, calls } = fakeCtx();
    drawTiledLayer(ctx, img, 4, -270, 6, 6400);
    expect(calls.length).toBeGreaterThan(1);
    expect(calls[0][0]).toBeLessThanOrEqual(0);
    expect(calls[calls.length - 1][0] + PIXEL_LAYER_W * 4).toBeGreaterThanOrEqual(6400);
    for (const call of calls) for (const v of call) expect(Number.isInteger(v)).toBe(true);
    expect(new Set(calls.map((c) => c[1]))).toEqual(new Set([6]));
  });
});

/** 배경 로더를 흉내 낸다: layers.json과 PNG 3장을 즉시 돌려준다. */
function fakeLoader() {
  const images = new Map<string, unknown>();
  return {
    images,
    loadJson: async (path: string) => {
      if (!path.endsWith('layers.json')) return null;
      return {
        stage: 'jungle', native: [640, 360], standLine: 298,
        layers: {
          far: { file: 'far.png', pad: 160 }, mid: { file: 'mid.png', pad: 48 }, ground: { file: 'ground.png', pad: 96 },
        },
      };
    },
    loadImage: async (path: string) => {
      const image = { path, width: 960, height: 360 };
      images.set(path, image);
      return image;
    },
  };
}

/** drawImage를 기록하고 이미지 자리도 채우는 가짜 컨텍스트. */
function recordingCtx() {
  const calls: { image: unknown; x: number; y: number; w: number; h: number }[] = [];
  const ctx = {
    imageSmoothingEnabled: true,
    fillStyle: '',
    save() {}, restore() {}, fillRect() {},
    drawImage(image: unknown, x: number, y: number, w: number, h: number) { calls.push({ image, x, y, w, h }); },
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

describe('배경 레이어 로딩(회귀: 파일 이름으로 찾다 항상 실패하던 문제)', () => {
  it('로드가 끝나면 3레이어를 실제로 그리고 true를 돌려준다', async () => {
    const loader = fakeLoader();
    const bg = new PixelBackground(loader as never);
    const { ctx, calls } = recordingCtx();
    const args = [ctx, 'jungle', 900, 960, 1920, 1080, { far: 0.04, mid: 0.14, ground: 0.3 }] as const;

    expect(bg.render(...args)).toBe(false); // 첫 프레임: 로딩 시작
    await new Promise((r) => setTimeout(r, 0));
    expect(bg.render(...args)).toBe(true);  // 두 번째 프레임: 실제로 그린다
    expect(calls).toHaveLength(3);
    for (const call of calls) {
      expect((call.image as { path: string }).path).toContain('jungle/');
      expect(Math.abs(call.x % 4)).toBe(0);
      expect(call.y).toBe(900 - 298 * 4);
      expect(call.h).toBe(360 * 4);
    }
  });
});
