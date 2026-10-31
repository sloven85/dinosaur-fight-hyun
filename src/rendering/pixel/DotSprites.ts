/**
 * 도트 스프라이트/초상 공급원 (메뉴·선택·VS·결과·HUD 공용).
 *
 * - 그림은 아티스트가 그린 프레임을 1:1(아트 px = 아트 px)로 옮긴다. 확대·축소·모자이크 없음.
 * - 2P 팔레트 시트가 있으면 미러전 2P는 그 시트에서 그린다(같은 좌표·같은 크기).
 * - 시트는 요청한 캐릭터만 그때 받는다. 준비 전에는 false/null을 돌려주고 호출부가 대체 그림을 그린다.
 */
import type { AssetLoader } from '../AssetLoader';

type SpriteState = 'idle' | 'walk' | 'jump' | 'light' | 'strong' | 'special' | 'hit' | 'flail' | 'down' | 'victory';

interface IndexEntry { character: string }
interface IndexData { species: Record<string, IndexEntry> }
interface ManifestFrame { x: number; y: number; w: number; h: number; anchor: { x: number; y: number } }
interface ManifestData {
  image: string;
  p2Image?: string;
  frames: ManifestFrame[];
  clips: Record<SpriteState, { frames: number[] }>;
}

export interface DotPortrait {
  image: CanvasImageSource;
  sx: number; sy: number; sw: number; sh: number;
}

export interface DotSpritesApi {
  request(characterId: string): void;
  portrait(characterId: string, alternatePalette?: boolean, size?: number): DotPortrait | null;
  drawPortrait(g: CanvasRenderingContext2D, characterId: string, x: number, y: number, size: number, alternatePalette?: boolean): boolean;
  drawState(
    g: CanvasRenderingContext2D, characterId: string, state: SpriteState, step: number,
    x: number, footY: number, facing: 1 | -1, alternatePalette?: boolean,
  ): boolean;
  has(characterId: string): boolean;
}

/** 초상 상자(아트 px). 머리가 잘리지 않는 크기(보드 슬롯 49px보다 조금 크게 그린다). */
export const PORTRAIT_SIZE = 66;
const ROOT = 'dev-art/species/';

let shared: DotSpritesApi | null = null;

/** 화면들이 같은 시트와 같은 로딩을 공유한다(중복 요청 없음). */
export function dotSprites(loader: AssetLoader): DotSpritesApi {
  if (!shared) shared = new DotSpriteSet(loader);
  return shared;
}

/** 테스트용: 공유 인스턴스를 비운다. */
export function resetDotSprites(): void {
  shared = null;
}

class DotSpriteSet implements DotSpritesApi {
  private index: Record<string, string> | null = null;
  private indexPending: Promise<void> | null = null;
  private readonly manifests = new Map<string, ManifestData | null>();
  private readonly sheets = new Map<string, HTMLImageElement | null>();
  private readonly p2Sheets = new Map<string, HTMLImageElement | null>();
  private readonly requested = new Set<string>();

  constructor(private readonly loader: AssetLoader) {}

  private async ensureIndex(): Promise<void> {
    if (this.index) return;
    if (!this.indexPending) {
      this.indexPending = (async () => {
        const raw = await this.loader.loadJson<IndexData>(`${ROOT}index.json`);
        const map: Record<string, string> = {};
        for (const [folder, entry] of Object.entries(raw?.species ?? {})) map[entry.character] = folder;
        this.index = map;
      })().catch(() => { this.index = {}; });
    }
    await this.indexPending;
  }

  request(characterId: string): void {
    if (this.requested.has(characterId)) return;
    this.requested.add(characterId);
    void this.load(characterId);
  }

  private async load(characterId: string): Promise<void> {
    await this.ensureIndex();
    const folder = this.index?.[characterId];
    if (!folder) { this.manifests.set(characterId, null); return; }
    const manifest = await this.loader.loadJson<ManifestData>(`${ROOT}${folder}/manifest.json`);
    if (!manifest) { this.manifests.set(characterId, null); return; }
    this.manifests.set(characterId, manifest);
    this.sheets.set(characterId, await this.loader.loadImage(`${ROOT}${folder}/${manifest.image}`));
    if (manifest.p2Image) {
      this.p2Sheets.set(characterId, await this.loader.loadImage(`${ROOT}${folder}/${manifest.p2Image}`));
    }
  }

  has(characterId: string): boolean {
    return !!this.sheets.get(characterId);
  }

  private sheet(characterId: string, alternatePalette: boolean): HTMLImageElement | null {
    return (alternatePalette ? this.p2Sheets.get(characterId) ?? this.sheets.get(characterId) : this.sheets.get(characterId)) ?? null;
  }

  portrait(characterId: string, alternatePalette = false, size = PORTRAIT_SIZE): DotPortrait | null {
    const manifest = this.manifests.get(characterId);
    if (!manifest) { this.request(characterId); return null; }
    const image = this.sheet(characterId, alternatePalette);
    const frame = manifest.frames[manifest.clips.idle.frames[0]];
    if (!image || !frame) return null;
    // 머리는 앞쪽(오른쪽)·위쪽. 상자를 프레임 안으로 밀어 넣는다(1:1 그대로, 확대 없음).
    // 자르는 크기는 **요청한 상자 크기**를 따른다: 66 으로 잘라 놓고 36 상자에 가운데만 클립하면
    // 머리가 아니라 목·턱만 남는다(HUD 초상 결함 2026-10-31).
    const sw = Math.min(size, frame.w);
    const sh = Math.min(size, Math.round(frame.h * 0.78), frame.h);
    const sx = clamp(frame.x + frame.w - sw, frame.x, frame.x + frame.w - sw);
    const sy = clamp(frame.y + Math.round(frame.h * 0.02), frame.y, frame.y + frame.h - sh);
    return { image, sx, sy, sw, sh };
  }

  drawPortrait(g: CanvasRenderingContext2D, characterId: string, x: number, y: number, size: number, alternatePalette = false): boolean {
    const portrait = this.portrait(characterId, alternatePalette, size);
    if (!portrait) return false;
    g.save();
    g.imageSmoothingEnabled = false;
    // 초상이 상자보다 크면 상자 밖으로 넘치지 않게 자른다(확대·축소 없음).
    g.beginPath();
    g.rect(Math.round(x), Math.round(y), size, size);
    g.clip();
    const ox = Math.round(x + (size - portrait.sw) / 2);
    const oy = Math.round(y + (size - portrait.sh) / 2);
    g.drawImage(portrait.image, portrait.sx, portrait.sy, portrait.sw, portrait.sh, ox, oy, portrait.sw, portrait.sh);
    g.restore();
    return true;
  }

  /** 상태 클립의 n번째 그림을 발 기준으로 1:1로 그린다. */
  drawState(
    g: CanvasRenderingContext2D, characterId: string, state: SpriteState, step: number,
    x: number, footY: number, facing: 1 | -1, alternatePalette = false,
  ): boolean {
    const manifest = this.manifests.get(characterId);
    if (!manifest) { this.request(characterId); return false; }
    const image = this.sheet(characterId, alternatePalette);
    const clip = manifest.clips[state] ?? manifest.clips.idle;
    if (!image || !clip || clip.frames.length === 0) return false;
    const index = clip.frames[((step % clip.frames.length) + clip.frames.length) % clip.frames.length];
    const frame = manifest.frames[index];
    if (!frame) return false;
    g.save();
    g.imageSmoothingEnabled = false;
    g.translate(Math.round(x), Math.round(footY));
    g.scale(facing, 1);
    g.drawImage(
      image, frame.x, frame.y, frame.w, frame.h,
      -frame.anchor.x, -frame.anchor.y, frame.w, frame.h,
    );
    g.restore();
    return true;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
