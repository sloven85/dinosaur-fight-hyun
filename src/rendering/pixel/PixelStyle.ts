/**
 * 도트 UI 공통 스타일 — 화면 전체를 같은 '도트 언어'로 그리기 위한 최소 팔레트·격자·글자.
 *
 * 원칙(jk 지시 2026-10-30 통합 빌드):
 *  - 화면마다 격자는 하나다. 메뉴·선택 화면은 아티스트 UI 원본(640×360) 1아트px = 화면 3px,
 *    전투 화면은 기존 계약대로 1아트px = 화면 4px. 한 화면 안에서 두 격자를 섞지 않는다.
 *  - 글자는 아트 해상도에서 1비트로 굽는다(안티에일리어싱 제거). 그래서 글자도 같은 격자 위에 있다.
 *  - 둥근 모서리·그라디언트·그림자는 쓰지 않는다. 판은 1px 테두리 + 2px 베벨로만 만든다.
 *  - 어떤 것도 '필터'로 도트처럼 보이게 하지 않는다. 처음부터 도트로 그린다.
 */
import type { AssetLoader } from '../AssetLoader';
import { pixelFaceFor } from './PixelFont';

/** 메뉴·선택 화면: 아티스트 UI 원본 640×360 → 1920×1080. */
export const DOT_K_UI = 3;
/** 전투 화면: 계약(2026-10-29) 480×270 창 → 1920×1080. */
export const DOT_K_BATTLE = 4;

/** 16색 제한 팔레트(아티스트 UI 보드에서 뽑은 톤). */
export const DOT = {
  ink: '#0a1512',
  deep: '#0e2420',
  shade: '#16332c',
  panel: '#1d3b33',
  panelTop: '#2b5546',
  stone: '#3f6b52',
  stoneLight: '#5f8f6a',
  moss: '#7fae72',
  parchment: '#e6d7a5',
  parchmentMid: '#cdbd8c',
  parchmentDark: '#a08a5c',
  gold: '#f2c14e',
  goldDark: '#b5842b',
  white: '#f6f1e2',
  dim: '#9fb9ae',
  p1: '#e0533f',
  p2: '#3f8fd0',
  hp: '#7ac74f',
  hpLow: '#d94f3d',
  hpBack: '#17251f',
} as const;

/** 정수 격자로 맞춘다(아트 px → 화면 px). */
export function snap(value: number, k: number): number {
  return Math.round(value / k) * k;
}

/** 아트 좌표계에서 그린다: 컨텍스트를 k배로 늘리고, 이후 좌표는 모두 '아트 px'이다. */
export function inDotGrid(
  g: CanvasRenderingContext2D,
  k: number,
  draw: (g: CanvasRenderingContext2D) => void,
): void {
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.imageSmoothingEnabled = false;
  g.scale(k, k);
  draw(g);
  g.restore();
}

/** 아트 좌표(=k배 스케일 상태)에서 채운 사각형. */
export function box(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  g.fillStyle = color;
  g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** 1px 테두리. */
export function outline(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void {
  box(g, x, y, w, 1, color);
  box(g, x, y + h - 1, w, 1, color);
  box(g, x, y, 1, h, color);
  box(g, x + w - 1, y, 1, h, color);
}

/** 도트 판: 어두운 바탕 + 위/왼쪽 밝은 베벨 + 아래/오른쪽 어두운 베벨. 둥근 모서리 없음. */
export function panel(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  options: { fill?: string; top?: string; side?: string; border?: string } = {},
): void {
  box(g, x, y, w, h, options.fill ?? DOT.panel);
  box(g, x, y, w, 2, options.top ?? DOT.panelTop);
  box(g, x, y, 2, h, options.top ?? DOT.panelTop);
  box(g, x, y + h - 2, w, 2, options.side ?? DOT.ink);
  box(g, x + w - 2, y + 2, 2, h - 2, options.side ?? DOT.ink);
  outline(g, x, y, w, h, options.border ?? DOT.ink);
}

/** 양피지 판(선택 카드·배너). */
export function parchment(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  box(g, x, y, w, h, DOT.parchment);
  box(g, x, y, w, 1, DOT.parchmentMid);
  box(g, x, y + h - 2, w, 2, DOT.parchmentDark);
  box(g, x + w - 2, y, 2, h, DOT.parchmentMid);
  outline(g, x, y, w, h, DOT.ink);
}

/** 2px 체커 디더(면을 어둡게 깔 때). 그라디언트 대신 쓴다. */
export function dither(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  step = 2,
): void {
  g.fillStyle = color;
  for (let yy = 0; yy < h; yy += step) {
    for (let xx = (yy / step) % 2 === 0 ? 0 : step; xx < w; xx += step * 2) {
      g.fillRect(Math.round(x + xx), Math.round(y + yy), Math.min(step, w - xx), 2);
    }
  }
}

/** 선택 표시용 커서(▶ 모양 픽셀). */
export function cursor(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  size = 2,
): void {
  box(g, x, y, size, size, color);
  for (let i = 1; i <= 3; i++) {
    box(g, x + i * size, y + i * size, size, size, color);
    box(g, x + i * size, y - i * size, size, size, color);
  }
}

// --- 글자: 아트 해상도에서 1비트로 굽는다(안티에일리어싱 없음) ---

export interface DotTextStyle {
  size?: number;
  color?: string;
  align?: 'left' | 'center' | 'right';
  /** 굵게 보이게 하고 싶을 때: 1px 오프셋으로 한 번 더 찍는다(그라디언트·그림자 없음). */
  weight?: 1 | 2;
}

interface BakedText {
  canvas: HTMLCanvasElement | null;
  width: number;
  height: number;
}

/**
 * 픽셀 글꼴 폴백 체인. Galmuri(9/11/14)가 이 게임의 도트 글꼴이고,
 * 글꼴이 늦게 와도 글자가 사라지지 않도록 시스템 한글 글꼴을 뒤에 둔다.
 */
const FONT_STACK = '"Galmuri11", "Galmuri9", "Galmuri14", "NanumSquare", "Noto Sans CJK KR", system-ui, sans-serif';
const baked = new Map<string, BakedText>();

function hasDocument(): boolean {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

/** 글꼴이 로드되면 이전(폴백 글꼴로 구운) 글자 캐시를 버린다. */
export function clearBakedText(): void {
  baked.clear();
}

/** 글자 폭(아트 px). 캔버스가 없는 테스트 환경에서는 글자당 픽셀크기만큼으로 어림한다. */
export function dotTextWidth(text: string, size: number): number {
  return bake(text, size).width;
}

/** 글자 높이(아트 px, 잉크 기준). */
export function dotTextHeight(text: string, size: number): number {
  return bake(text, size).height;
}

/**
 * 글자 하나를 1비트 비트맵으로 굽는다.
 *
 * - 글꼴은 Galmuri 픽셀 글꼴을 요청 크기에 가장 가까운 고유 크기(9/11/14 정수배)로 고른다.
 * - 알파 50% 이상만 남기고 색을 채운 뒤(안티에일리어싱 제거), 잉크 영역만 남기도록 잘라 낸다.
 *   그래야 textCenter 가 '글자 위/아래 여백'이 아니라 실제 잉크를 기준으로 가운데를 맞춘다.
 */
function bake(text: string, size: number, color = '#ffffff'): BakedText {
  const face = pixelFaceFor(size);
  const key = `${face.family}|${face.px}|${color}|${text}`;
  const hit = baked.get(key);
  if (hit) return hit;
  if (!hasDocument()) {
    const perChar = /[\u3131-\uD7A3]/.test(text) ? face.px : Math.round(face.px * 0.62);
    const fallback = { canvas: null, width: Math.max(1, text.length * perChar), height: face.ink };
    baked.set(key, fallback);
    return fallback;
  }
  const probe = document.createElement('canvas').getContext('2d');
  if (!probe) return { canvas: null, width: 0, height: size };
  const font = `${face.px}px ${FONT_STACK}`;
  probe.font = font;
  const m = probe.measureText(text);
  const left = Number.isFinite(m.actualBoundingBoxLeft) ? Math.ceil(m.actualBoundingBoxLeft) : 0;
  const right = Number.isFinite(m.actualBoundingBoxRight) ? Math.ceil(m.actualBoundingBoxRight) : Math.ceil(m.width);
  const asc = Number.isFinite(m.actualBoundingBoxAscent) ? Math.ceil(m.actualBoundingBoxAscent) : face.ink;
  const desc = Number.isFinite(m.actualBoundingBoxDescent) ? Math.ceil(m.actualBoundingBoxDescent) : 0;
  const pad = 1;
  const width = Math.max(1, right + left + pad * 2);
  const height = Math.max(1, asc + desc + pad * 2);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { canvas: null, width, height };
  ctx.font = font;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, left + pad, asc + pad);

  // 1비트로 만든다: 알파 50% 미만은 지우고, 남은 픽셀은 지정 색으로 채운다.
  const image = ctx.getImageData(0, 0, width, height);
  const rgb = parseHex(color);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (image.data[i + 3] >= 100) {
        image.data[i] = rgb[0];
        image.data[i + 1] = rgb[1];
        image.data[i + 2] = rgb[2];
        image.data[i + 3] = 255;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      } else {
        image.data[i + 3] = 0;
      }
    }
  }
  ctx.putImageData(image, 0, 0);
  if (maxX < 0) {
    // 공백뿐인 문자열: 잉크가 없으니 폭만 돌려준다.
    const blank = { canvas: null, width: Math.ceil(m.width), height: face.ink };
    baked.set(key, blank);
    return blank;
  }
  const inkW = maxX - minX + 1;
  const inkH = maxY - minY + 1;
  const trimmed = document.createElement('canvas');
  trimmed.width = inkW;
  trimmed.height = inkH;
  const tctx = trimmed.getContext('2d');
  if (!tctx) return { canvas: null, width: inkW, height: inkH };
  tctx.drawImage(canvas, minX, minY, inkW, inkH, 0, 0, inkW, inkH);
  const result = { canvas: trimmed, width: inkW, height: inkH };
  baked.set(key, result);
  return result;
}

function parseHex(color: string): [number, number, number] {
  const hex = color.replace('#', '');
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/**
 * 도트 글자. 좌표는 아트 px이고 (x, y)는 style.align 기준의 **글자 잉크 위쪽**이다.
 * 모든 위치를 정수 아트 px로 맞춰 반 픽셀 흐림을 만들지 않는다.
 */
export function text(
  g: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  style: DotTextStyle = {},
): void {
  const size = style.size ?? 12;
  const b = bake(value, size, style.color ?? DOT.white);
  if (b.width <= 0) return;
  const align = style.align ?? 'left';
  const left = align === 'center' ? x - b.width / 2 : align === 'right' ? x - b.width : x;
  const dx = Math.round(left);
  const dy = Math.round(y);
  if (!b.canvas) return;
  g.imageSmoothingEnabled = false;
  g.drawImage(b.canvas, dx, dy, b.width, b.height);
  if (style.weight === 2) g.drawImage(b.canvas, dx + 1, dy, b.width, b.height);
}

/** 가운데 정렬 글자(잉크 높이의 세로 중앙 기준). */
export function textCenter(
  g: CanvasRenderingContext2D,
  value: string,
  cx: number,
  cy: number,
  style: DotTextStyle = {},
): void {
  const b = bake(value, style.size ?? 12, style.color ?? DOT.white);
  text(g, value, cx, cy - Math.round(b.height / 2), { ...style, align: 'center' });
}

/** 여러 줄(줄바꿈 문자 기준). */
export function textLines(
  g: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  style: DotTextStyle = {},
  lineGap = 4,
): void {
  const size = style.size ?? 12;
  value.split('\n').forEach((line, i) => {
    text(g, line, x, y + i * (size + lineGap), style);
  });
}

// --- 아티스트 UI 보드 ---

export type UiBoard = 'title' | 'menu' | 'select' | 'stage';

const BOARD_PATH: Record<UiBoard, string> = {
  title: 'dev-art/ui/title_640x360.png',
  menu: 'dev-art/ui/menu_640x360.png',
  select: 'dev-art/ui/select_640x360.png',
  stage: 'dev-art/ui/stage_640x360.png',
};

const boardCache = new Map<UiBoard, HTMLImageElement | null>();
const boardPending = new Set<UiBoard>();

/** 보드 그림을 한 번만 받아 둔다(없으면 null → 절차적 도트 배경으로 대체). */
export function uiBoard(loader: AssetLoader, board: UiBoard): HTMLImageElement | null {
  const cached = boardCache.get(board);
  if (cached !== undefined) return cached;
  if (!boardPending.has(board)) {
    boardPending.add(board);
    void loader.loadImage(BOARD_PATH[board]).then((image) => {
      boardCache.set(board, image);
      boardPending.delete(board);
    }).catch(() => boardPending.delete(board));
  }
  return null;
}

/** 보드 한 장을 화면 전체에 1:1 아트 격자로 깐다(640×360 × 3 = 1920×1080). */
export function drawUiBoard(g: CanvasRenderingContext2D, image: CanvasImageSource): void {
  g.imageSmoothingEnabled = false;
  g.drawImage(image, 0, 0, 640, 360);
}
