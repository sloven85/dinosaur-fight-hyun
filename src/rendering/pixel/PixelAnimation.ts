import type { Fighter } from '../../combat/Fighter';
import { moveTotalFrames, type MoveData } from '../../combat/types';

export const PIXEL_CLIPS = ['idle', 'walk', 'bite', 'hit', 'down'] as const;
export type PixelClipName = typeof PIXEL_CLIPS[number];

/** All coordinates are source pixels; all durations are simulation ticks (60 Hz). */
export interface PixelFrame {
  x: number; y: number; w: number; h: number;
  /** Foot/root registration, relative to the cropped frame (not the sheet). */
  anchor: { x: number; y: number };
}
export interface PixelClip {
  loop: boolean;
  sequence: { frame: number; ticks: number }[];
}
export interface PixelManifest {
  version: 1;
  character: 'tyrannosaurus';
  image: string;
  facing: 'right' | 'left';
  /** One fixed integer scale across every state; no per-frame fit or rotation. */
  scale: number;
  frames: PixelFrame[];
  clips: Record<PixelClipName, PixelClip>;
  /** Sheet frame IDs for the two light-bite contact windows, in hit order. */
  biteContactFrames: [number, number];
  /** Unmodified artist timing for the explicitly separate observation viewport only. */
  sourceClips?: Record<PixelClipName, { loop: boolean; sequence: { frame: number; ms: number }[] }>;
}
export interface PixelAssets { manifest: PixelManifest; image: HTMLImageElement }
export interface PixelSample { clip: PixelClipName; frame: number; tick: number }

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const integer = (v: unknown, min: number, max = 16384): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/** Reject malformed/unbounded input before it ever reaches drawImage or the clock. */
export function parsePixelManifest(raw: unknown): PixelManifest {
  if (!object(raw) || raw.version !== 1 || raw.character !== 'tyrannosaurus' ||
      typeof raw.image !== 'string' || !/^[\w./-]+\.png$/i.test(raw.image) || raw.image.includes('..') || raw.image.startsWith('/') ||
      !['left', 'right'].includes(String(raw.facing)) || !integer(raw.scale, 1, 8) ||
      !Array.isArray(raw.frames) || raw.frames.length < 1 || raw.frames.length > 256 || !object(raw.clips)) {
    throw new Error('도트 manifest의 버전·종·PNG 경로·배율·프레임을 확인하세요.');
  }
  for (const f of raw.frames) {
    if (!object(f) || !integer(f.x, 0) || !integer(f.y, 0) || !integer(f.w, 1) || !integer(f.h, 1) ||
        !object(f.anchor) || !integer(f.anchor.x, 0, f.w) || !integer(f.anchor.y, 0, f.h)) {
      throw new Error('프레임 좌표와 발 기준은 프레임 안의 정수 픽셀이어야 합니다.');
    }
  }
  for (const name of PIXEL_CLIPS) {
    const clip = raw.clips[name];
    if (!object(clip) || clip.loop !== (name === 'idle' || name === 'walk') ||
        !Array.isArray(clip.sequence) || clip.sequence.length < 1 || clip.sequence.length > 256 ||
        clip.sequence.some(s => !object(s) || !integer(s.frame, 0, (raw.frames as unknown[]).length - 1) || !integer(s.ticks, 1, 600))) {
      throw new Error(`${name}: 순서·지속시간·반복 설정이 올바르지 않습니다.`);
    }
  }
  if (!Array.isArray(raw.biteContactFrames) || raw.biteContactFrames.length !== 2 ||
      raw.biteContactFrames.some(f => !integer(f, 0, (raw.frames as unknown[]).length - 1))) {
    throw new Error('두 물기 접촉 프레임 ID가 필요합니다.');
  }
  if (raw.sourceClips !== undefined) {
    if (!object(raw.sourceClips)) throw new Error('원본 시간 클립 형식 오류');
    for (const name of PIXEL_CLIPS) {
      const clip = raw.sourceClips[name];
      if (!object(clip) || clip.loop !== (name === 'idle' || name === 'walk') || !Array.isArray(clip.sequence) ||
          !clip.sequence.length || clip.sequence.length > 256 || clip.sequence.some(s =>
            !object(s) || !integer(s.frame, 0, (raw.frames as unknown[]).length - 1) ||
            typeof s.ms !== 'number' || !Number.isFinite(s.ms) || s.ms <= 0 || s.ms > 10000)) {
        throw new Error(`${name}: 원본 시간 순서 오류`);
      }
    }
  }
  return raw as unknown as PixelManifest;
}

export function sampleSourceClip(manifest: PixelManifest, name: PixelClipName, ms: number): PixelSample {
  const clip = manifest.sourceClips?.[name];
  if (!clip) return samplePixelClip(manifest, name, ms * 60 / 1000);
  const total = clip.sequence.reduce((sum, s) => sum + s.ms, 0);
  const safeMs = Number.isFinite(ms) ? Math.max(0, ms) : 0;
  let time = clip.loop ? safeMs % total : Math.min(safeMs, total - 0.001);
  for (const step of clip.sequence) {
    if (time < step.ms) return { clip: name, frame: step.frame, tick: safeMs * 60 / 1000 };
    time -= step.ms;
  }
  throw new Error('원본 시간 클립 오류');
}

export function clipDuration(clip: PixelClip): number {
  return clip.sequence.reduce((n, step) => n + step.ticks, 0);
}

export function samplePixelClip(manifest: PixelManifest, name: PixelClipName, tick: number): PixelSample {
  const clip = manifest.clips[name];
  const duration = clipDuration(clip);
  const safeTick = Number.isFinite(tick) ? Math.max(0, Math.floor(tick)) : 0;
  let remaining = clip.loop ? safeTick % duration : Math.min(safeTick, duration - 1);
  for (const step of clip.sequence) {
    if (remaining < step.ticks) return { clip: name, frame: step.frame, tick: safeTick };
    remaining -= step.ticks;
  }
  throw new Error('검증되지 않은 빈 도트 애니메이션');
}

/** Bind art timing to the shipped light-bite script, never move damage to fit the art. */
export function validateBiteTiming(manifest: PixelManifest, move: MoveData): void {
  const hits = move.script?.hits ?? [];
  if (hits.length !== 2 || clipDuration(manifest.clips.bite) !== moveTotalFrames(move)) {
    throw new Error('물기 길이는 기존 약공격 전체 시간과 같아야 합니다.');
  }
  hits.forEach((hit, index) => {
    for (let tick = hit.from; tick <= hit.to; tick++) {
      if (samplePixelClip(manifest, 'bite', tick).frame !== manifest.biteContactFrames[index]) {
        throw new Error(`물기 접촉 ${index + 1}: 기존 판정 ${hit.from}~${hit.to}틱에 접촉 그림이 필요합니다.`);
      }
    }
  });
}

export function validatePixelImage(manifest: PixelManifest, image: HTMLImageElement): void {
  if (!image.naturalWidth || !image.naturalHeight || manifest.frames.some(f =>
    f.x + f.w > image.naturalWidth || f.y + f.h > image.naturalHeight)) {
    throw new Error('PNG가 준비되지 않았거나 프레임이 시트 경계를 벗어납니다.');
  }
}

/** Only these five authored states are supported. Others explicitly keep the legacy renderer. */
export function pixelClipFor(fighter: Fighter): PixelClipName | null {
  if (fighter.data.id !== 'tyrannosaurus') return null;
  if (fighter.state === 'attack') return fighter.attack?.move.id === 'tyrannosaurus_light' ? 'bite' : null;
  if (fighter.state === 'idle' || fighter.state === 'walk' || fighter.state === 'hit') return fighter.state;
  if (fighter.state === 'down' || fighter.state === 'fallen') return 'down';
  return null;
}

/** One clock per fighter. Update after Match.step; frozen means it was stopped BEFORE that step. */
export class PixelAnimator {
  private key = '';
  private age = 0;
  private health: number | null = null;
  reset(): void { this.key = ''; this.age = 0; this.health = null; }
  step(fighter: Fighter, frozen: boolean): void {
    const key = `${fighter.state}:${fighter.attack?.attackId ?? 0}`;
    const hitAgain = fighter.state === 'hit' && this.health !== null && fighter.health < this.health;
    if (key !== this.key || hitAgain) { this.key = key; this.age = 0; }
    else if (!frozen) this.age++;
    this.health = fighter.health;
  }
  sample(manifest: PixelManifest, fighter: Fighter): PixelSample | null {
    const clip = pixelClipFor(fighter);
    return clip ? samplePixelClip(manifest, clip, clip === 'bite' ? fighter.attack!.frame : this.age) : null;
  }
}

/** Nearest-neighbor, integer game-pixel scaling and registration; never a procedural dinosaur. */
export function drawPixelSample(g: CanvasRenderingContext2D, assets: PixelAssets, sample: PixelSample,
  x: number, y: number, facing: 1 | -1): boolean {
  const { image, manifest } = assets;
  const frame = manifest.frames[sample.frame];
  if (!frame || !image.naturalWidth || !image.naturalHeight) return false;
  g.save();
  g.imageSmoothingEnabled = false;
  g.translate(Math.round(x), Math.round(y));
  g.scale(facing * (manifest.facing === 'right' ? 1 : -1), 1);
  const scale = manifest.scale;
  g.drawImage(image, frame.x, frame.y, frame.w, frame.h,
    -frame.anchor.x * scale, -frame.anchor.y * scale, frame.w * scale, frame.h * scale);
  g.restore();
  return true;
}
