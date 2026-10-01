import { ASSET_VERSION } from 'virtual:asset-version';

/**
 * 이미지·JSON 에셋을 경로 기준으로 캐시하며 로드한다(계획서 14절 AssetLoader).
 * 없는 파일은 조용히 기록만 하고 임시 표시로 대체할 수 있게 null을 돌려준다.
 */
export class AssetLoader {
  private readonly images = new Map<string, HTMLImageElement>();
  private readonly pending = new Map<string, Promise<HTMLImageElement | null>>();
  private readonly failed = new Set<string>();

  constructor(private readonly baseUrl: string = import.meta.env.BASE_URL) {}

  resolve(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  /**
   * 캐시 무효화용 버전 쿼리를 붙인 실제 요청 URL.
   * 프리뷰/엣지가 같은 경로의 이미지를 1년간 캐시하므로, 파일 내용이 바뀌면
   * 버전(vite.config.ts가 주입)이 바뀌어 새 URL로 받아 온다.
   */
  private assetUrl(path: string): string {
    const separator = path.includes('?') ? '&' : '?';
    return `${this.resolve(path)}${separator}v=${ASSET_VERSION}`;
  }

  image(path: string): HTMLImageElement | null {
    return this.images.get(path) ?? null;
  }

  loadImage(path: string): Promise<HTMLImageElement | null> {
    const cached = this.images.get(path);
    if (cached) return Promise.resolve(cached);

    const inflight = this.pending.get(path);
    if (inflight) return inflight;

    const promise = new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        this.images.set(path, img);
        this.pending.delete(path);
        resolve(img);
      };
      img.onerror = () => {
        this.failed.add(path);
        this.pending.delete(path);
        console.warn(`[assets] 이미지를 불러오지 못했습니다: ${path}`);
        resolve(null);
      };
      img.src = this.assetUrl(path);
    });

    this.pending.set(path, promise);
    return promise;
  }

  async loadJson<T>(path: string): Promise<T | null> {
    try {
      const response = await fetch(this.assetUrl(path));
      if (!response.ok) throw new Error(`${response.status}`);
      return (await response.json()) as T;
    } catch (error) {
      this.failed.add(path);
      console.warn(`[assets] JSON을 불러오지 못했습니다: ${path}`, error);
      return null;
    }
  }

  async loadImages(paths: readonly string[]): Promise<void> {
    await Promise.all(paths.map((path) => this.loadImage(path)));
  }

  get missingFiles(): string[] {
    return [...this.failed].sort();
  }
}
