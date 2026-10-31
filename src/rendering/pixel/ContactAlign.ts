/**
 * 그림→판정 정합: 새 도트 스프라이트의 **실제 접촉 그림**에 판정을 맞춘다.
 *
 * 문제(정종길 님 8073841 "공격을 전부 허공에"): 판정은 옛 리그의 몸 앞끝(bodyFront) 기준으로
 * 잡혀 있는데, 새 그림의 주둥이는 그보다 100px 이상 짧다. 그래서 화면에서는 상대 앞에서
 * 멈추는데 판정은 이미 닿아 있거나, 그림이 닿는데 판정이 비어 있다.
 *
 * 해결: 피해·사거리·상자 크기는 그대로 두고 **그림만** 접촉 프레임에서 주둥이가
 * 판정 상자 앞끝에 닿도록 내민다. 내미는 양은 공격 프레임에 따라 부드럽게 차오르고 회수된다.
 *  - 접촉 프레임 = 기술의 첫 판정 구간(from). 판정 앞끝 = 몸 앞끝 + 상자 x + 폭(스크립트 기술).
 *  - 그림 주둥이 = 접촉 프레임의 불투명 경계 오른끝(아트 px) × 배율.
 *  - 정수 아트 px로 반올림해 픽셀 격자를 깨지 않는다.
 */
import type { Fighter } from '../../combat/Fighter';
import { HITBOX_OVERSHOOT } from '../../core/constants';
import type { AttackKind, MoveData } from '../../combat/types';
import { PIXEL_ART_SCALE } from './PixelBackground';
import { sampleSpriteClip, type SpriteManifest, type SpriteState } from './SpeciesSprite';

interface ScriptHitWindow { from: number; to: number; box: { x: number; y: number; w: number; h: number; anchor?: 'front' | 'center' }; target?: string }

function stateFor(kind: AttackKind): SpriteState {
  return kind === 'heavy' ? 'strong' : kind === 'special' ? 'special' : 'light';
}

function hitWindows(move: MoveData): ScriptHitWindow[] {
  const hits = (move.script?.hits ?? []) as ScriptHitWindow[];
  return hits.filter((hit) => !!hit.box && hit.target !== 'held');
}

/** 기술이 실제로 판정을 내는 첫 프레임. */
export function contactFrame(move: MoveData): number {
  const windows = hitWindows(move);
  if (windows.length > 0) return Math.min(...windows.map((hit) => hit.from));
  return move.startupFrames;
}

/** 접촉 프레임에서 판정 상자 앞끝이 몸 중심에서 얼마나 떨어져 있는가(화면 px). */
export function contactFront(move: MoveData, bodyFront: number): number {
  const frame = contactFrame(move);
  const windows = hitWindows(move).filter((hit) => hit.from === frame);
  if (windows.length === 0) return bodyFront + HITBOX_OVERSHOOT[move.kind];
  return Math.max(...windows.map((hit) => bodyFront + hit.box.x + hit.box.w));
}

/**
 * 접촉 프레임 상자가 몸 뒤쪽까지 걸친 광역·회전 기술인가.
 *
 * 이런 기술(브라키오·안킬로·테리지노·트리케라 특수)은 상자 폭이 400~4800px이고 뒤끝이 몸 중심보다
 * 뒤에 있다. 상자 '앞끝'은 사거리가 아니라 판정 범위의 오른쪽 끝일 뿐이라, 그림을 그 끝까지 밀면
 * 몸이 화면 밖으로 날아간다(브라키오 특수 2574px · 안킬로 특수 2136px 실측).
 * 그림 내밀기는 앞으로 뻗는 기술에만 적용한다.
 */
export function isAreaContact(move: MoveData, bodyFront: number): boolean {
  const frame = contactFrame(move);
  const hits = (move.script?.hits ?? []) as ScriptHitWindow[];
  return hits
    .filter((hit) => !!hit.box && hit.target !== 'held')
    .some((hit) => hit.from === frame && bodyFront + hit.box.x <= 0);
}

/** 접촉 프레임에 그려지는 그림의 주둥이 끝(아트 px, 중심 기준). */
export function contactTipArt(manifest: SpriteManifest, kind: AttackKind, move: MoveData): number {
  const state = stateFor(kind);
  const clip = manifest.clips[state];
  if (!clip) return 0;
  const total = Math.max(1, move.startupFrames + move.activeFrames + move.recoveryFrames);
  const sample = sampleSpriteClip(manifest, state, contactFrame(move), total);
  const frame = manifest.frames[sample.frame];
  return frame ? frame.w - frame.anchor.x : 0;
}

/** 접촉 순간에 그림을 얼마나 앞으로 내밀어야 하는가(화면 px, facing=1 기준). */
export function contactGap(fighter: Fighter, move: MoveData, manifest: SpriteManifest): number {
  // 광역·회전 상자는 '앞끝'이 사거리가 아니므로 그림을 밀지 않는다(몸이 화면 밖으로 나간다).
  if (isAreaContact(move, fighter.bodyFront)) return 0;
  return contactFront(move, fighter.bodyFront) - contactTipArt(manifest, move.kind, move) * PIXEL_ART_SCALE;
}

/**
 * 공격 진행도에 따른 내미는 비율(0~1). 접촉 프레임에서 정확히 1 → 그 순간 그림 주둥이 = 판정 앞끝.
 * 기동 구간에 차오르고, 판정 구간 동안 유지, 회수 구간에 줄어든다(튀는 프레임 없음).
 */
export function contactRamp(move: MoveData, attackFrame: number): number {
  const hit = contactFrame(move);
  const startup = Math.max(1, hit);
  const windows = hitWindows(move);
  const lastTo = windows.length > 0 ? Math.max(...windows.map((w) => w.to)) : hit + Math.max(1, move.activeFrames) - 1;
  const total = Math.max(lastTo + 1, move.startupFrames + move.activeFrames + move.recoveryFrames);
  const frame = Math.max(0, Math.min(total, attackFrame));
  if (frame <= startup) return frame / startup;
  if (frame <= lastTo) return 1;
  const back = (frame - lastTo) / Math.max(1, total - lastTo);
  return Math.max(0, 1 - back);
}

/** 지금 프레임에서 그림을 내밀 거리(아트 px, 정수). */
export function contactOffsetArt(fighter: Fighter, move: MoveData, manifest: SpriteManifest): number {
  if (fighter.state !== 'attack' || !fighter.attack) return 0;
  const gap = contactGap(fighter, move, manifest);
  if (gap <= 0) return 0;
  return Math.round((gap * contactRamp(move, fighter.attack.frame)) / PIXEL_ART_SCALE);
}
