/**
 * 동종 미러 표식 (jk 확정 2026-10-29, 마스터 값 조정 반영).
 *
 * 1P·2P가 같은 공룡이면 실루엣·포즈·판정·타점은 100% 같고 색만 다르게 간다.
 * 색만으로 구분하지 못하는 경우(색약)를 위해 발밑 접지 링과 머리 위 마커를 함께 그린다.
 * 두 표식은 **아트 격자(정수 배율)에만** 놓는다 — 반 픽셀·안티에일리어싱 없이 블록 단위.
 *
 * 값(마스터 확정): 링 72×10 아트px, 위쪽을 접지선에 맞추고 두 발 중앙.
 * 마커는 4×4 아트px, 1P 삼각 / 2P 다이아(모양으로도 구분).
 */

export const PLAYER_COLORS = { p1: '#2E6BFF', p2: '#E0453A' } as const;

/** 링 전체 폭(아트 px) = 발 폭×1.2. */
export const RING_W = 72;
/** 링 전체 높이(아트 px). */
export const RING_H = 10;
/** 머리 위 마커 한 변(아트 px). */
export const HEAD_MARKER_SIZE = 4;

export interface Box { left: number; top: number; right: number; bottom: number }

/** 4×4 아트px 도형. 비트는 왼쪽부터. */
const SHAPES = {
  /** 1P 삼각(쐐기) — 밑변이 아래, 오른쪽으로 기운 직각삼각. */
  triangle: ['0001', '0011', '0111', '1111'],
  /** 2P 다이아 — 위아래가 좁고 가운데가 넓은 마름모. */
  diamond: ['0110', '1111', '1111', '0110'],
} as const;

export type MarkerShape = keyof typeof SHAPES;

export function markerShapeFor(twoPlayer: boolean): MarkerShape {
  return twoPlayer ? 'diamond' : 'triangle';
}

/**
 * 발밑 접지 링. 아트 px 격자에서 타원 둘레를 찍어 계단형 픽셀 링을 만든다.
 * 열·행 양쪽에서 찍어 이웃한 점이 끊기지 않게 한다(안티에일리어싱 없음).
 * 링의 **위쪽**이 접지선에 닿도록 아래로 내려 그린다.
 */
export function drawGroundRing(g: CanvasRenderingContext2D, centerX: number, groundLine: number,
  color: string, scale: number): void {
  const snap = (v: number): number => Math.round(v / scale) * scale;
  const cx = snap(centerX);
  const cy = snap(groundLine) + (RING_H / 2) * scale;
  const rx = RING_W / 2;
  const ry = RING_H / 2;

  g.save();
  g.fillStyle = color;
  const put = (artX: number, artY: number): void => {
    g.fillRect(cx + artX * scale, cy + artY * scale, scale, scale);
  };
  for (let x = -rx; x <= rx; x++) {
    const t = x / rx;
    const y = Math.round(ry * Math.sqrt(Math.max(0, 1 - t * t)));
    put(x, y);
    put(x, -y);
  }
  for (let y = -ry; y <= ry; y++) {
    const t = y / ry;
    const x = Math.round(rx * Math.sqrt(Math.max(0, 1 - t * t)));
    put(x, y);
    put(-x, y);
  }
  g.restore();
}

/** 머리 위 4×4 아트px 마커. 실루엣 위쪽, 얼굴 쪽에 격자 단위로 띄운다. */
export function drawHeadMarker(g: CanvasRenderingContext2D, box: Box, facing: 1 | -1, color: string,
  scale: number, shape: MarkerShape): void {
  const size = HEAD_MARKER_SIZE;
  const gap = 2;
  const width = box.right - box.left;
  // 실루엣 중심은 꼬리 쪽으로 치우친다. 얼굴 쪽 띠의 중앙에 세운다.
  const headCenter = facing === 1 ? box.right - width * 0.28 : box.left + width * 0.28;
  const x = Math.round((headCenter / scale - size / 2)) * scale;
  const y = Math.round((box.top / scale - gap - size)) * scale;

  g.save();
  g.fillStyle = color;
  for (let row = 0; row < SHAPES[shape].length; row++) {
    const bits = SHAPES[shape][row];
    for (let col = 0; col < bits.length; col++) {
      if (bits[col] === '1') g.fillRect(x + col * scale, y + row * scale, scale, scale);
    }
  }
  g.restore();
}
