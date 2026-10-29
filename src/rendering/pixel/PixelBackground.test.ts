import { describe, expect, it } from 'vitest';
import { PIXEL_STAGE_NATIVE_H, PIXEL_STAGE_NATIVE_W, drawTiledLayer, pixelScaleFor } from './PixelBackground';

describe('도트 배경: 640×360의 정수 k배만', () => {
  it('화면 폭이 640의 정수배일 때만 확대한다', () => {
    expect(pixelScaleFor(1920)).toBe(3);
    expect(pixelScaleFor(2560)).toBe(4);
    expect(pixelScaleFor(1280)).toBe(2);
    expect(pixelScaleFor(640)).toBe(1);
  });

  it('정수가 아니면 그리지 않는다(레터박스 원칙, 아트 리사이즈 금지)', () => {
    expect(pixelScaleFor(1366)).toBeNull();
    expect(pixelScaleFor(1600)).toBeNull();
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

describe('레이어 가로 타일', () => {
  const img = {} as CanvasImageSource;

  it('시차가 0이면 화면 폭을 정확히 덮는다', () => {
    const { ctx, calls } = fakeCtx();
    drawTiledLayer(ctx, img, 3, 0, 0, 1920);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual([0, 0, PIXEL_STAGE_NATIVE_W * 3, PIXEL_STAGE_NATIVE_H * 3]);
  });

  it('밀린 만큼 타일을 더 깔고, 모든 좌표가 정수다', () => {
    const { ctx, calls } = fakeCtx();
    drawTiledLayer(ctx, img, 3, -270, 6, 1920);
    expect(calls.length).toBeGreaterThan(1);
    const first = calls[0][0];
    const last = calls[calls.length - 1][0];
    expect(first).toBeLessThanOrEqual(0);
    expect(last + PIXEL_STAGE_NATIVE_W * 3).toBeGreaterThanOrEqual(1920);
    for (const call of calls) for (const v of call) expect(Number.isInteger(v)).toBe(true);
    expect(new Set(calls.map((c) => c[1]))).toEqual(new Set([6]));
  });

  it('음수 방향으로 밀어도 오른쪽 끝까지 덮는다', () => {
    const { ctx, calls } = fakeCtx();
    drawTiledLayer(ctx, img, 3, 270, 6, 1920);
    expect(Math.min(...calls.map((c) => c[0]))).toBeLessThanOrEqual(0);
    expect(Math.max(...calls.map((c) => c[0] + PIXEL_STAGE_NATIVE_W * 3))).toBeGreaterThanOrEqual(1920);
  });
});
