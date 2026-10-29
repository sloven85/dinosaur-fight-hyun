/**
 * 동종 미러 표식 (jk 확정 2026-10-29).
 *
 * 1P·2P가 같은 공룡이면 실루엣·포즈·판정·타점은 100% 같고 색만 다르게 간다.
 * 색만으로 구분하지 못하는 경우(색약)를 위해 발밑 접지 링과 머리 위 마커를 함께 그린다.
 * 두 표식은 **아트 격자(정수 배율)에만** 놓는다 — 반 픽셀·안티에일리어싱 없이 블록 단위.
 */

export const PLAYER_COLORS = { p1: '#2E6BFF', p2: '#E0453A' } as const;

/** 머리 위 마커 한 변(아트 px). */
export const HEAD_MARKER_SIZE = 4;
/** 발밑 접지 링의 세로 반지름(아트 px). */
export const RING_RADIUS_Y = 6;
/** 머리 마커를 앞쪽 끝에서 안쪽으로 들이는 비율(실루엣 전체 폭 기준). */
const HEAD_INSET = 0.28;

export interface Box { left: number; top: number; right: number; bottom: number }

/**
 * 발밑 접지 링. 아트 px 격자에서 타원 둘레를 찍어 계단형 픽셀 링을 만든다.
 * 열·행 양쪽에서 찍어 이웃한 점이 끊기지 않게 한다(안티에일리어싱 없음).
 */
export function drawGroundRing(g: CanvasRenderingContext2D, centerX: number, baseLine: number, halfWidth: number,
  color: string, scale: number): void {
  const snap = (v: number): number => Math.round(v / scale) * scale;
  const cx = snap(centerX);
  const cy = snap(baseLine);
  const rx = Math.max(2, Math.round(halfWidth / scale));
  const ry = RING_RADIUS_Y;

  g.save();
  g.fillStyle = color;
  const put = (artX: number, artY: number): void => {
    g.fillRect(cx + artX * scale, cy + artY * scale, scale, scale);
  };
  // 열 방향(가로로 촘촘) — 위/아래 두 점
  for (let x = -rx; x <= rx; x++) {
    const t = x / rx;
    const y = Math.round(ry * Math.sqrt(Math.max(0, 1 - t * t)));
    put(x, y);
    put(x, -y);
  }
  // 행 방향(세로로 촘촘) — 좌/우 두 점
  for (let y = -ry; y <= ry; y++) {
    const t = y / ry;
    const x = Math.round(rx * Math.sqrt(Math.max(0, 1 - t * t)));
    put(x, y);
    put(-x, y);
  }
  g.restore();
}

/** 머리 위 4아트px 마커. 실루엣 위쪽, 얼굴 쪽에 격자 단위로 띄운다. */
export function drawHeadMarker(g: CanvasRenderingContext2D, box: Box, facing: 1 | -1, color: string,
  scale: number): void {
  const size = HEAD_MARKER_SIZE * scale;
  const gap = 2 * scale;
  const width = box.right - box.left;
  // 실루엣 중심은 꼬리 쪽으로 치우친다. 얼굴 쪽 띠의 중앙에 세운다.
  const headCenter = facing === 1 ? box.right - width * HEAD_INSET : box.left + width * HEAD_INSET;
  const x = Math.round((headCenter - size / 2) / scale) * scale;
  const y = Math.round((box.top - gap - size) / scale) * scale;
  g.save();
  g.fillStyle = color;
  g.fillRect(x, y, size, size);
  g.restore();
}
