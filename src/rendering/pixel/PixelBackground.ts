import type { AssetLoader } from '../AssetLoader';

/**
 * 도트 배경 3레이어 재생기 (개발 비교판).
 *
 * 규격(디렉터 확정 2026-10-29): 배경 원본 640×360, 화면은 640×360의 정수 k배.
 * 레이어는 원경·중경·지면 3장, 각 640×360, 지면선은 원본 행 standLine.
 * 캐릭터가 서는 지면선과 배경의 지면선을 같은 행으로 맞추고, 확대는 정수배만 한다.
 *
 * 레이어 폭이 화면보다 좁으므로 가로로 이어 붙여(타일) 그린다 — 시차 때문에 레이어가
 * 옆으로 밀려도 빈 곳이 생기지 않는다. 이음선 품질은 원본 그림의 몫이고,
 * 엔진은 이음선을 만들지도 감추지도 않는다.
 */

export const PIXEL_STAGE_NATIVE_W = 640;
export const PIXEL_STAGE_NATIVE_H = 360;

export interface PixelStageLayers {
  stage: string;
  native: [number, number];
  /** 캐릭터가 서는 지면선(원본 행). 캐릭터 셀의 footY와 같은 값이어야 한다. */
  standLine: number;
  layers: { far: string; mid: string; ground: string };
}

const clampInt = (v: number): number => (Number.isFinite(v) ? Math.round(v) : 0);

/** 화면 폭이 640의 정수배일 때만 k를 돌려준다. 아니면 도트 배경을 그리지 않는다(레터박스 원칙). */
export function pixelScaleFor(width: number): number | null {
  if (!Number.isFinite(width) || width <= 0 || width % PIXEL_STAGE_NATIVE_W !== 0) return null;
  const k = width / PIXEL_STAGE_NATIVE_W;
  return Number.isInteger(k) && k >= 1 && k <= 8 ? k : null;
}

/**
 * 레이어 하나를 가로 타일로 깐다. dx는 시차로 밀린 양(게임 px).
 * 픽셀이 반 자리에 걸리지 않도록 dx와 그리기 좌표를 모두 정수로 맞춘다.
 */
export function drawTiledLayer(
  g: CanvasRenderingContext2D,
  image: CanvasImageSource,
  k: number,
  dx: number,
  top: number,
  width: number,
): void {
  const tileW = PIXEL_STAGE_NATIVE_W * k;
  const tileH = PIXEL_STAGE_NATIVE_H * k;
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
    const far = this.images.get(spec.layers.far);
    const mid = this.images.get(spec.layers.mid);
    const ground = this.images.get(spec.layers.ground);
    if (!far || !mid || !ground) { this.ensure(stage); return false; }

    // 640×360 원본 프레임의 윗변을 어디에 둘 것인가: 배경 지면선을 캐릭터 발 높이에 맞춘다.
    const top = clampInt(groundY - spec.standLine * k);
    const center = width / 2;
    const offset = (coef: number): number => -clampInt((focusX - center) * coef);

    g.save();
    g.imageSmoothingEnabled = false;
    // 프레임 위쪽이 남으면(지면선 정렬 때문에 생기는 몇 px) 원경 첫 행으로 메운다.
    if (top > 0) {
      g.fillStyle = '#000';
      g.fillRect(0, 0, width, top);
    }
    drawTiledLayer(g, far, k, offset(parallax.far), top, width);
    drawTiledLayer(g, mid, k, offset(parallax.mid), top, width);
    drawTiledLayer(g, ground, k, offset(parallax.ground), top, width);
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
            const path = `${this.root}${stage}/${raw.layers[name]}`;
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
