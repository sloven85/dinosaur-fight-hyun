/**
 * 픽셀 글꼴 크기 계약 검증.
 *
 * Galmuri 는 em(upm) 1000/1200/1500 에 글리프 상자를 900/1100/1400 으로 그린다.
 * 따라서 캔버스 글꼴 크기는 upm/100(=10/12/15px)이어야 1단위=0.01px 격자가 화면 픽셀과 맞는다.
 * 이 비율이 어긋나면(예: 11px 로 그리면) 스트로크가 반 픽셀에 걸려 묵→무, 본→븐 처럼 획이 사라진다
 * — 2026-10-31 캡처로 확인한 글자 깨짐의 원인이었다.
 */
import { describe, expect, it } from 'vitest';
import { PIXEL_FONT_FILES, pixelFaceFor } from './PixelFont';

const UPM: Record<string, number> = { Galmuri9: 1000, Galmuri11: 1200, Galmuri14: 1500 };

describe('픽셀 글꼴 크기', () => {
  it('글꼴 크기는 항상 upm/100 이고, 잉크 높이는 (글꼴 크기 - 1)px 다', () => {
    for (const size of [8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 22, 24, 28, 34]) {
      const face = pixelFaceFor(size);
      const base = UPM[face.family] / 100;
      expect(face.px % base, `size ${size} → ${face.family} @${face.px}px`).toBe(0);
      // 정수배(k)에서 잉크 높이는 글꼴 상자(1100/1200em 등)만큼: px - k.
      const k = face.px / base;
      expect(face.ink).toBe(face.px - k);
    }
  });

  it('요청 크기가 커지면 고른 글꼴의 잉크 높이도 줄지 않는다', () => {
    let prev = 0;
    for (let size = 6; size <= 40; size++) {
      const { ink } = pixelFaceFor(size);
      expect(ink).toBeGreaterThanOrEqual(prev);
      prev = ink;
    }
  });

  it('세 가지 Galmuri 서브셋만 쓴다(다른 글꼴은 폴백일 뿐)', () => {
    expect(PIXEL_FONT_FILES.map((f) => f.family)).toEqual(['Galmuri9', 'Galmuri11', 'Galmuri14']);
    expect(PIXEL_FONT_FILES.every((f) => f.file.endsWith('.woff2'))).toBe(true);
  });
});
