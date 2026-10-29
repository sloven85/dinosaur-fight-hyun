import type { AssetLoader } from '../AssetLoader';

/**
 * 도트 배경 3레이어 재생기 (개발 비교판).
 *
 * 규격(jk 확정 2026-10-29): 아트 1px = 화면 4px. 캐릭터와 배경이 같은 격자를 쓴다.
 *  - 창(화면에 보이는 범위)은 아트 기준 480×270 = 1920×1080 ÷ 4.
 *  - 배경 레이어는 640×360 아트 px 그대로 4배로 그린다 → 2560×1440. 창보다 큰 것이 정상이다.
 *  - 창은 레이어 가운데를 보여 주고, 시차만큼 민다. 레이어가 창보다 넓으므로 남는
 *    여백(±(레이어-창)/2) 안에서만 움직여 화면에 빈 곳이 생기지 않는다.
 *  - 지면선 standLine(아트 행)을 캐릭터 발 높이에 맞춘다.
 *
 * 캐릭터를 줄여 배경에 맞추지 않는다. 배율이 어긋나면 배경 쪽을 고친다.
 */

/** 아트 1px = 화면 4px (고정). */
export const PIXEL_ART_SCALE = 4;
/** 창(아트 px). 1920×1080 화면 ÷ 4. */
export const PIXEL_VIEW_W = 480;
export const PIXEL_VIEW_H = 270;
/** 배경 레이어 원본(아트 px). 창보다 크다. */
export const PIXEL_LAYER_W = 640;
export const PIXEL_LAYER_H = 360;

/** 레이어 파일과 좌우 블리드 폭(원본 px). pad가 0이면 타일로 깐다. */
export interface PixelLayerRef { file: string; pad?: number }

export interface PixelStageLayers {
  stage: string;
  native: [number, number];
  /** 캐릭터가 서는 지면선(원본 행). 캐릭터 셀의 footY와 같은 값이어야 한다. */
  standLine: number;
  layers: { far: PixelLayerRef | string; mid: PixelLayerRef | string; ground: PixelLayerRef | string };
}

/** 문자열(파일 이름) 또는 {file, pad} 둘 다 받는다. */
export function layerRef(value: PixelLayerRef | string): PixelLayerRef {
  return typeof value === 'string' ? { file: value, pad: 0 } : { file: value.file, pad: value.pad ?? 0 };
}

const clampInt = (v: number): number => (Number.isFinite(v) ? Math.round(v) : 0);

/** 화면 폭이 창(480)의 정수배일 때만 k를 돌려준다. 아니면 도트 배경을 그리지 않는다(레터박스 원칙). */
export function pixelScaleFor(width: number): number | null {
  if (!Number.isFinite(width) || width <= 0 || width % PIXEL_VIEW_W !== 0) return null;
  const k = width / PIXEL_VIEW_W;
  return Number.isInteger(k) && k >= 1 && k <= 8 ? k : null;
}

/**
 * 블리드가 있는 레이어도, 없는 레이어도 같은 규칙으로 그린다: 레이어 한 장을 4배로 그리고
 * 창(화면) 가운데를 보여 준다. 시차만큼 민 dx는 레이어가 창보다 넓어서 생기는 여백
 * (±(레이어폭-화면폭)/2) 안으로 자른다 — 끝까지 밀어도 화면에 빈 곳이 생기지 않는다.
 * pad는 그림 자체에 여백이 있으면 그만큼 더 밀 수 있다는 표시일 뿐, 그리기 규칙은 하나다.
 */
export function drawCenteredLayer(
  g: CanvasRenderingContext2D,
  image: CanvasImageSource,
  k: number,
  dx: number,
  pad: number,
  top: number,
  width: number,
): void {
  const layerW = (PIXEL_LAYER_W + pad * 2) * k;
  const layerH = PIXEL_LAYER_H * k;
  if (layerW <= 0) return;
  // 레이어가 화면보다 좁으면(있을 수 없지만) 가로로 이어 붙인다.
  if (layerW < width) { drawTiledLayer(g, image, k, dx, top, width, layerW, layerH); return; }
  const slack = Math.round((layerW - width) / 2);
  const shift = Math.max(-slack, Math.min(slack, clampInt(dx)));
  // 그리기 원점을 배율 격자에 맞춘다 — 아트 픽셀 블록이 캐릭터와 같은 격자에 놓인다.
  const snapped = Math.round(shift / k) * k;
  g.drawImage(image, clampInt((width - layerW) / 2 + snapped), top, layerW, layerH);
}

/**
 * 레이어 하나를 가로 타일로 깐다(레이어가 화면보다 좁을 때의 안전망). dx는 시차로 밀린 양.
 * 픽셀이 반 자리에 걸리지 않도록 dx와 그리기 좌표를 모두 정수로 맞춘다.
 */
export function drawTiledLayer(
  g: CanvasRenderingContext2D,
  image: CanvasImageSource,
  k: number,
  dx: number,
  top: number,
  width: number,
  layerW = PIXEL_LAYER_W,
  layerH = PIXEL_LAYER_H,
): void {
  const tileW = layerW * k;
  const tileH = layerH * k;
  if (tileW <= 0) return;
  const shift = ((clampInt(dx) % tileW) + tileW) % tileW;
  // 딱 맞아떨어지면 왼쪽에 빈 타일을 한 장 더 깔지 않는다.
  const startX = shift === 0 ? 0 : shift - tileW;
  for (let x = startX; x < width; x += tileW) {
    g.drawImage(image, x, top, tileW, tileH);
  }
}

/**
 * 배경 3레이어를 읽어 그린다. 아트가 없으면 false를 돌려 호출부가 기존 배경으로 넘어간다.
 */
export class PixelBackground {
  private readonly images = new Map<string, CanvasImageSource>();
  private readonly specs = new Map<string, PixelStageLayers>();
  private readonly pending = new Set<string>();
  private disposed = false;

  constructor(private readonly loader: AssetLoader, private readonly root = 'dev-art/stages/') {}

  /** 이 무대의 도트 배경을 그릴 수 있으면 true. */
  render(
    g: CanvasRenderingContext2D,
    stage: string,
    groundY: number,
    focusX: number,
    width: number,
    height: number,
    parallax: { far: number; mid: number; ground: number },
  ): boolean {
    const k = pixelScaleFor(width);
    if (!k) return false;
    const spec = this.specs.get(stage);
    if (!spec) { this.ensure(stage); return false; }
    // 이미지는 '폴더/파일' 전체 경로로 보관한다 — 파일 이름만으로 찾으면 영원히 못 찾는다.
    const pathFor = (name: 'far' | 'mid' | 'ground'): string => `${this.root}${stage}/${layerRef(spec.layers[name]).file}`;
    const far = this.images.get(pathFor('far'));
    const mid = this.images.get(pathFor('mid'));
    const ground = this.images.get(pathFor('ground'));
    if (!far || !mid || !ground) { this.ensure(stage); return false; }

    // 지면선을 캐릭터 발 높이에 맞춘다. k=4면 레이어(1440)가 화면(1080)보다 커서 위가 잘린다 — 정상.
    // top도 배율 격자에 맞춘다(지면선 행이 격자에 걸쳐 있으면 아트 픽셀이 반 칸 어긋난다).
    const top = Math.round((groundY - spec.standLine * k) / k) * k;
    const center = width / 2;
    const offset = (coef: number): number => -clampInt((focusX - center) * coef);

    g.save();
    g.imageSmoothingEnabled = false;
    // 프레임 위쪽이 남으면(지면선 정렬 때문에 생기는 몇 px) 원경 첫 행으로 메운다.
    if (top > 0) {
      g.fillStyle = '#000';
      g.fillRect(0, 0, width, top);
    }
    for (const [ref, image, coef] of [
      [layerRef(spec.layers.far), far, parallax.far],
      [layerRef(spec.layers.mid), mid, parallax.mid],
      [layerRef(spec.layers.ground), ground, parallax.ground],
    ] as const) {
      drawCenteredLayer(g, image, k, offset(coef), ref.pad ?? 0, top, width);
    }
    g.restore();

    // 캐릭터가 배경에서 떠 보이지 않게 아주 옅게 눌러 준다(기존 배경과 같은 처리).
    g.fillStyle = 'rgba(20, 24, 30, 0.12)';
    g.fillRect(-60, -60, width + 120, height + 120);
    return true;
  }

  private ensure(stage: string): void {
    if (this.pending.has(stage) || this.disposed) return;
    this.pending.add(stage);
    void (async () => {
      try {
        const raw = await this.loader.loadJson<PixelStageLayers>(`${this.root}${stage}/layers.json`);
        if (!raw || !raw.layers || !Number.isFinite(raw.standLine)) throw new Error(`${stage} 배경 레이어 정보를 읽지 못했습니다.`);
        const loaded = await Promise.all(
          (['far', 'mid', 'ground'] as const).map(async (name) => {
            const path = `${this.root}${stage}/${layerRef(raw.layers[name]).file}`;
            const image = await this.loader.loadImage(path);
            return [path, image] as const;
          }),
        );
        if (loaded.some(([, image]) => !image)) throw new Error(`${stage} 배경 PNG를 읽지 못했습니다.`);
        if (this.disposed) return;
        for (const [path, image] of loaded) this.images.set(path, image as CanvasImageSource);
        this.specs.set(stage, raw);
      } catch {
        // 아트가 아직 없으면 기존 배경을 그대로 쓴다(콘솔만 남기지 않고 조용히 넘어간다).
      } finally {
        this.pending.delete(stage);
      }
    })();
  }

  dispose(): void {
    this.disposed = true;
    this.images.clear();
    this.specs.clear();
  }
}
