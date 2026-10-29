import type { Fighter } from '../../combat/Fighter';
import { moveTotalFrames, type MoveData } from '../../combat/types';

/**
 * 12종 도트 스프라이트 재생기 (디렉터 확정 계약).
 *
 * 규격: 셀 502×304, 발 기준선 footY=298, 기준 x anchorX=251, 정수배(×4)만.
 * 이 모듈은 그림을 "부위로 잘라 돌리는" 대신 통째로 그려진 프레임을 순서대로 재생한다.
 * 판정·피해·사거리는 이 모듈이 만지지 않는다(전투 쪽 값 그대로).
 */

/** 디렉터 지정 10상태. 아티스트 클립 이름과 1:1로 대응한다. */
export const SPRITE_STATES = ['idle', 'walk', 'jump', 'light', 'strong', 'special', 'hit', 'flail', 'down', 'victory'] as const;
export type SpriteState = typeof SPRITE_STATES[number];

export const STATE_LABELS: Record<SpriteState, string> = {
  idle: '대기', walk: '걷기', jump: '점프', light: '약공격', strong: '강공격',
  special: '특수', hit: '피격', flail: '공중버둥', down: '다운', victory: '승리',
};

/** 아티스트 납품 클립 이름 → 게임 상태. 표에 없는 클립은 받지 않는다. */
export const ART_CLIPS: Record<SpriteState, string> = {
  idle: 'idle', walk: 'walk', jump: 'jump', light: 'light_attack', strong: 'heavy_slam',
  special: 'special', hit: 'hit', flail: 'flail', down: 'down', victory: 'victory',
};

export interface SpriteFrame {
  /** 시트 안의 잘라낸 그림 사각형(원본 픽셀). */
  x: number; y: number; w: number; h: number;
  /** 잘라낸 그림 안에서 발 기준점이 놓이는 위치. 그림이 바닥에서 떠 있으면 경계 밖일 수 있다. */
  anchor: { x: number; y: number };
  /** 원본 파일 이름(추적용). */
  source: string;
}

export interface SpriteClip {
  /** manifest.frames 배열의 인덱스 순서. */
  frames: number[];
  /** 프레임별 지속 틱(60Hz). */
  ticks: number[];
  /** 아티스트 원본 ms. 공격 클립을 기술 길이에 맞춰 늘릴 때 기준이 된다. */
  artMs: number[];
  loop: boolean;
  art: string;
  artLabel: string;
}

export interface SpriteManifest {
  version: 1;
  character: string;
  folder: string;
  name: string;
  image: string;
  facing: 'right' | 'left';
  scale: number;
  cell: [number, number];
  footY: number;
  anchorX: number;
  frames: SpriteFrame[];
  clips: Record<SpriteState, SpriteClip>;
}

export interface SpriteAssets { manifest: SpriteManifest; image: CanvasImageSource & { width: number; height: number } }

export interface SpriteSample { state: SpriteState; frame: number; /** 클립 안에서 몇 번째 그림인지. */ step: number }

const CONTRACT = { cellW: 502, cellH: 304, footY: 298, anchorX: 251, scale: 4 } as const;

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const int = (v: unknown, min: number, max = 1 << 16): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/**
 * 저장소의 도트 manifest를 검증한다. 규격이 하나라도 어긋나면 그리지 않고 던진다 —
 * 반쯤 맞는 그림으로 화면을 채우면 손교정 여부를 판단할 수 없기 때문이다.
 */
export function parseSpriteManifest(raw: unknown): SpriteManifest {
  if (!isObject(raw) || raw.version !== 1) throw new Error('도트 manifest 버전이 1이 아닙니다.');
  for (const [key, want] of [['scale', CONTRACT.scale], ['footY', CONTRACT.footY], ['anchorX', CONTRACT.anchorX]] as const) {
    if (raw[key] !== want) throw new Error(`도트 계약 위반: ${key}는 ${want}이어야 합니다(받은 값 ${String(raw[key])}).`);
  }
  if (!Array.isArray(raw.cell) || raw.cell[0] !== CONTRACT.cellW || raw.cell[1] !== CONTRACT.cellH) {
    throw new Error(`도트 계약 위반: 셀은 ${CONTRACT.cellW}×${CONTRACT.cellH}이어야 합니다.`);
  }
  if (typeof raw.character !== 'string' || !raw.character || typeof raw.image !== 'string' ||
      !/^[\w./-]+\.png$/i.test(raw.image) || raw.image.startsWith('/') || raw.image.includes('..')) {
    throw new Error('도트 manifest의 종 이름이나 PNG 경로가 올바르지 않습니다.');
  }
  if (!Array.isArray(raw.frames) || raw.frames.length < 1 || raw.frames.length > 512) {
    throw new Error('도트 manifest의 프레임 수가 범위를 벗어났습니다.');
  }
  const frames = raw.frames.map((f, i) => {
    if (!isObject(f) || !int(f.x, 0) || !int(f.y, 0) || !int(f.w, 1) || !int(f.h, 1) ||
        !isObject(f.anchor) || !int(f.anchor.x, -1024, 1024) || !int(f.anchor.y, -1024, 1024)) {
      throw new Error(`${i}번 프레임의 좌표·발 기준점이 잘못되었습니다.`);
    }
    return {
      x: f.x, y: f.y, w: f.w, h: f.h,
      anchor: { x: f.anchor.x, y: f.anchor.y },
      source: typeof f.source === 'string' ? f.source : '',
    } satisfies SpriteFrame;
  });
  if (!isObject(raw.clips)) throw new Error('도트 manifest에 상태 클립이 없습니다.');
  const clips = {} as Record<SpriteState, SpriteClip>;
  for (const state of SPRITE_STATES) {
    const clip = raw.clips[state];
    if (!isObject(clip) || !Array.isArray(clip.frames) || !Array.isArray(clip.ticks) ||
        clip.frames.length < 1 || clip.frames.length !== clip.ticks.length ||
        clip.frames.length > 64) {
      throw new Error(`${STATE_LABELS[state]}(${state}) 클립의 프레임/지속시간이 잘못되었습니다.`);
    }
    const indices = clip.frames.map((v) => {
      if (!int(v, 0, frames.length - 1)) throw new Error(`${state}: 없는 프레임을 가리킵니다.`);
      return v;
    });
    const ticks = clip.ticks.map((v) => {
      if (!int(v, 1, 600)) throw new Error(`${state}: 지속 틱이 범위를 벗어났습니다.`);
      return v;
    });
    const artMs = Array.isArray(clip.artMs) ? clip.artMs.map((v) => (typeof v === 'number' && v > 0 ? v : 0)) : ticks.map((t) => t * 1000 / 60);
    if (artMs.length !== ticks.length) throw new Error(`${state}: 원본 시간 길이가 다릅니다.`);
    clips[state] = {
      frames: indices, ticks, artMs,
      loop: clip.loop === true,
      art: typeof clip.art === 'string' ? clip.art : ART_CLIPS[state],
      artLabel: typeof clip.artLabel === 'string' ? clip.artLabel : STATE_LABELS[state],
    };
  }
  return {
    version: 1, character: raw.character, folder: typeof raw.folder === 'string' ? raw.folder : '',
    name: typeof raw.name === 'string' ? raw.name : raw.character,
    image: raw.image, facing: raw.facing === 'left' ? 'left' : 'right',
    scale: CONTRACT.scale, cell: [CONTRACT.cellW, CONTRACT.cellH],
    footY: CONTRACT.footY, anchorX: CONTRACT.anchorX, frames, clips,
  };
}

export function clipTicks(clip: SpriteClip): number {
  return clip.ticks.reduce((n, t) => n + t, 0);
}

/**
 * 클립을 특정 틱에서 샘플링한다. `stretchTo`가 있으면 원본 리듬(artMs 비율)을 유지한 채
 * 전체 길이를 그 틱 수에 맞춘다 — 공격은 기술 프레임 수에 맞춰야 접촉 순간과 그림이 어긋나지 않는다.
 */
export function sampleSpriteClip(manifest: SpriteManifest, state: SpriteState, tick: number, stretchTo?: number): SpriteSample {
  const clip = manifest.clips[state];
  const total = clipTicks(clip);
  const safe = Number.isFinite(tick) ? Math.max(0, Math.floor(tick)) : 0;
  let index = 0;
  if (stretchTo && stretchTo > 0) {
    // 비율만 쓴다: 프레임 경계는 원본 리듬 그대로, 전체 길이만 기술 길이.
    const ratio = Math.min(0.999999, safe / stretchTo);
    const totalMs = clip.artMs.reduce((n, v) => n + v, 0) || total;
    let time = ratio * totalMs;
    index = clip.frames.length - 1;
    for (let i = 0; i < clip.artMs.length; i++) {
      if (time < clip.artMs[i]) { index = i; break; }
      time -= clip.artMs[i];
    }
    if (safe >= stretchTo) index = clip.frames.length - 1;
  } else if (clip.loop) {
    let remaining = total > 0 ? safe % total : 0;
    index = clip.frames.length - 1;
    for (let i = 0; i < clip.ticks.length; i++) {
      if (remaining < clip.ticks[i]) { index = i; break; }
      remaining -= clip.ticks[i];
    }
  } else {
    let remaining = Math.min(safe, Math.max(0, total - 1));
    index = clip.frames.length - 1;
    for (let i = 0; i < clip.ticks.length; i++) {
      if (remaining < clip.ticks[i]) { index = i; break; }
      remaining -= clip.ticks[i];
    }
  }
  return { state, step: index, frame: clip.frames[index] };
}

/** 상태 → 재생할 클립. 그림이 없는 상태는 null을 돌려 기존 렌더러로 남긴다. */
export function spriteStateFor(fighter: Fighter): SpriteState | null {
  switch (fighter.state) {
    case 'idle':
    case 'crouch':
    case 'guard':
    case 'stun':
      return 'idle';
    case 'walk':
      return 'walk';
    case 'jump':
      return fighter.onGround ? 'idle' : 'jump';
    case 'attack': {
      const kind = fighter.attack?.move.kind;
      if (kind === 'light') return 'light';
      if (kind === 'heavy') return 'strong';
      if (kind === 'special') return 'special';
      return null;
    }
    case 'hit':
      return fighter.onGround ? 'hit' : 'flail';
    case 'held':
    case 'fallen':
      return 'flail';
    case 'down':
      return 'down';
    case 'victory':
      return 'victory';
    default:
      return null;
  }
}

/** 이 상태를 기술 길이에 맞춰 늘려 재생해야 하는가(공격 3종). */
export function stretchTargetFor(fighter: Fighter, move: MoveData | undefined): number | undefined {
  if (fighter.state !== 'attack' || !move) return undefined;
  const total = moveTotalFrames(move);
  return total > 0 ? total : undefined;
}

/** 캐릭터 하나의 재생 시계. 상태·공격이 바뀌면 처음부터. 피격은 HP가 줄 때 다시 시작. */
export class SpriteClock {
  private key = '';
  private age = 0;
  private health: number | null = null;
  private air = 0;
  reset(): void { this.key = ''; this.age = 0; this.health = null; this.air = 0; }

  step(fighter: Fighter, frozen: boolean): void {
    const state = spriteStateFor(fighter);
    const key = `${state}:${fighter.attack?.attackId ?? 0}`;
    const hitAgain = fighter.state === 'hit' && this.health !== null && fighter.health < this.health;
    if (key !== this.key || hitAgain) { this.key = key; this.age = 0; }
    else if (!frozen) this.age++;
    if (!frozen) this.air = fighter.onGround ? 0 : this.air + 1;
    if (fighter.onGround) this.air = 0;
    this.health = fighter.health;
  }

  /** 지금 재생할 상태와 그 상태에서 흐른 틱. 판정은 전투 쪽 값을 그대로 쓴다. */
  read(fighter: Fighter): { state: SpriteState | null; tick: number; air: number } {
    return { state: spriteStateFor(fighter), tick: this.age, air: this.air };
  }
}

/**
 * 한 캐릭터를 그 상태에 맞춰 샘플링한다.
 * 공격은 기술 프레임 수에 그림 전체를 맞추고, 점프는 공중에 떠 있는 동안 원본 길이로 돈다.
 */
export function sampleFighter(manifest: SpriteManifest, fighter: Fighter, clock: SpriteClock): SpriteSample | null {
  const { state, tick } = clock.read(fighter);
  if (!state) return null;
  const move = fighter.state === 'attack' ? fighter.attack?.move : undefined;
  const stretch = stretchTargetFor(fighter, move);
  if (stretch) return sampleSpriteClip(manifest, state, fighter.attack!.frame, stretch);
  return sampleSpriteClip(manifest, state, tick);
}

/** 프레임 하나를 화면에 그린다. 고정 등록(anchor) + 정수배만, 프레임별 맞춤 없음. */
export function drawSpriteFrame(
  g: CanvasRenderingContext2D,
  assets: SpriteAssets,
  frame: SpriteFrame,
  x: number,
  y: number,
  facing: 1 | -1,
): void {
  const { manifest, image } = assets;
  const scale = manifest.scale;
  const flip = facing * (manifest.facing === 'right' ? 1 : -1);
  g.save();
  g.imageSmoothingEnabled = false;
  g.translate(Math.round(x), Math.round(y));
  g.scale(flip, 1);
  g.drawImage(image as CanvasImageSource, frame.x, frame.y, frame.w, frame.h,
    -frame.anchor.x * scale, -frame.anchor.y * scale, frame.w * scale, frame.h * scale);
  g.restore();
}
