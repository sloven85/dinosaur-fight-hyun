import type { AttackKind } from '../combat/types';

/**
 * 컷아웃 파츠 리그(다이노 아티스트 파일럿, 디렉터 승인 2026-10-01).
 * 좌표는 원본 2048×1536 무대 px. 각 파츠는 부모 기준 pivot을 축으로만 회전한다.
 */
export interface PartDef {
  parent: string | null;
  drawOrder: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  pivotX?: number;
  pivotY?: number;
}

export interface PartRigData {
  stage: { width: number; height: number; rootX: number; rootY: number };
  drawOrder: string[];
  parts: Record<string, PartDef>;
}

/** 아티스트 동작 이름. 엔진의 heavy는 아티스트 파일의 strong이다. */
export type PartMotionName = 'idle' | 'walk' | 'light' | 'strong' | 'special';

export interface PartMotionProfile {
  /** 도 단위. 아티스트 표기 그대로 저장하고 적용할 때 부호를 뒤집는다(partAngleRadians). */
  angles: Record<string, number>;
  /** 아티스트가 제안한 몸 이동(무대 px). 엔진은 쓰지 않는다 — 몸 변환은 한 곳(엔진)에서만. */
  root: [number, number];
}

export interface PartMotionsData {
  motions: Partial<Record<PartMotionName, PartMotionProfile>>;
}

export function motionNameFor(kind: AttackKind): PartMotionName {
  return kind === 'heavy' ? 'strong' : kind;
}

/**
 * 아티스트 표기 각도 → 캔버스 회전(라디안).
 * 아티스트 포즈 PNG와 픽셀 대조(평균 차 0.3/255)로 부호가 반대임을 확인했다.
 */
export function partAngleRadians(degrees: number): number {
  return (-degrees * Math.PI) / 180;
}

/** 2D 아핀 행렬 [a, b, c, d, e, f] (캔버스 setTransform과 같은 순서). */
export type Affine = [number, number, number, number, number, number];

const IDENTITY: Affine = [1, 0, 0, 1, 0, 0];

export function multiply(m: Affine, n: Affine): Affine {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

function rotateAbout(px: number, py: number, radians: number): Affine {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return [c, s, -s, c, px - c * px + s * py, py - s * px - c * py];
}

export function applyAffine(m: Affine, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/**
 * 파츠마다 '파츠 이미지 좌상단(0,0) → 무대 px' 변환을 만든다.
 * 자식은 부모 회전을 그대로 물려받는다(목→턱, 꼬리 밑동→끝).
 */
export function partTransforms(
  rig: PartRigData,
  angles: Record<string, number>,
): Record<string, Affine> {
  const world: Record<string, Affine> = {};
  const resolve = (name: string): Affine => {
    const cached = world[name];
    if (cached) return cached;
    const part = rig.parts[name];
    let m = part.parent ? resolve(part.parent) : IDENTITY;
    const deg = angles[name] ?? 0;
    if (deg !== 0 && part.pivotX !== undefined && part.pivotY !== undefined) {
      m = multiply(m, rotateAbout(part.pivotX, part.pivotY, partAngleRadians(deg)));
    }
    world[name] = m;
    return m;
  };
  const placed: Record<string, Affine> = {};
  for (const name of rig.drawOrder) {
    const part = rig.parts[name];
    placed[name] = multiply(resolve(name), [1, 0, 0, 1, part.offsetX, part.offsetY]);
  }
  return placed;
}

/** 두 각도 표를 섞는다(t=0 → a, t=1 → b). 빠진 파츠는 0으로 본다. */
export function blendAngles(
  a: Record<string, number>,
  b: Record<string, number>,
  t: number,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    out[key] = (a[key] ?? 0) + ((b[key] ?? 0) - (a[key] ?? 0)) * t;
  }
  return out;
}

export function scaleAngles(a: Record<string, number>, t: number): Record<string, number> {
  return blendAngles({}, a, t);
}

export interface AttackTimingLike {
  startupFrames: number;
  activeFrames: number;
  recoveryFrames: number;
}

/** 준비 동작 때 반대로 살짝 당기는 비율(예비 동작). */
const WINDUP_RATIO = -0.35;

/**
 * 공격 진행 프레임 → 파츠 각도. 준비=반대로 당김, 판정=아티스트 프로파일 100%, 회복=원위치.
 * 몸 이동·기울기는 여기서 다루지 않는다(엔진 절차 변환이 담당, 중복 금지).
 */
export function attackPartAngles(
  profile: PartMotionProfile,
  timing: AttackTimingLike,
  frame: number,
): Record<string, number> {
  const { startupFrames: su, activeFrames: ac, recoveryFrames: rc } = timing;
  const strike = profile.angles;
  if (frame < su) {
    const t = easeOut(clamp01(frame / Math.max(1, su)));
    return scaleAngles(strike, WINDUP_RATIO * t);
  }
  if (frame < su + ac) {
    const t = easeOut(Math.min(1, clamp01((frame - su + 1) / Math.max(1, ac)) * 1.6));
    return blendAngles(scaleAngles(strike, WINDUP_RATIO), strike, t);
  }
  const t = clamp01((frame - su - ac) / Math.max(1, rc));
  return scaleAngles(strike, 1 - easeInOut(t));
}

/** 걷기는 보폭 주기에 맞춰 앞뒤로 흔든다. */
export function walkPartAngles(profile: PartMotionProfile, time: number): Record<string, number> {
  return scaleAngles(profile.angles, Math.sin(time * 9));
}

const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);
const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t));

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
