/**
 * 넘어짐 연출(마스터 판정 2026-10-01: 그림 통째 회전은 ±15° 기울기까지, 거꾸로 뒤집기 금지).
 * 전용 '다운' 그림이 있으면 그 그림을 쓰고(렌더러), 없으면 이 동작으로 대신한다.
 *
 * 1) 쓰러짐  : 뒤로 기울며(최대 15°) 털썩 주저앉는다(세로로 눌림).
 * 2) 쿵·튕김 : 바닥에 닿는 순간 납작해졌다가 한 번 통 튀어 오른다.
 * 3) 버둥버둥: 낮게 엎드린 채 좌우로 흔들흔들, 다리·팔 허우적(파츠 종), 머리 위 별.
 * 4) 벌떡    : 쭉 펴며 통 뛰어올라 선다.
 *
 * 판정과 무관한 보이는 모양만 계산한다(Fighter의 fallenFrames·fallenTotal·fallStartAngle을 읽는다).
 */

export type FallPhase = 'topple' | 'impact' | 'flail' | 'getup';

export interface FallPose {
  phase: FallPhase;
  /** 몸 기울기(라디안, 음수 = 뒤로). ±MAX_BODY_TILT 안. 몸 가운데를 축으로 건다. */
  rot: number;
  /** 위(-)로 뜨는 높이(디자인 px). */
  dy: number;
  sx: number;
  sy: number;
  /** 다리·팔 허우적 세기 0~1. */
  flail: number;
  /** 머리 위 별을 보일지. */
  dizzy: boolean;
}

/** 그림 한 장을 통째로 돌릴 수 있는 최대 각도(15°). 이보다 크게 돌리면 거꾸로 서 보인다. */
export const MAX_BODY_TILT = (15 * Math.PI) / 180;

export function clampTilt(rad: number): number {
  return Math.max(-MAX_BODY_TILT, Math.min(MAX_BODY_TILT, rad));
}

const TOPPLE = 10;
const IMPACT = 14;
const GETUP = 16;
const BACK = -MAX_BODY_TILT;
/** 누운 자세의 세로 눌림(옆으로 털썩 쓰러진 느낌). */
const LIE = 0.62;

const easeIn = (t: number): number => t * t;
const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));

/** elapsed = 넘어진 뒤 지난 프레임, total = 넘어짐 전체 프레임, height = 몸 높이(px). */
export function fallPose(elapsed: number, total: number, startAngle: number, height: number): FallPose {
  const pose = rawFallPose(elapsed, total, startAngle, height);
  pose.rot = clampTilt(pose.rot);
  return pose;
}

function rawFallPose(elapsed: number, total: number, startAngle: number, height: number): FallPose {
  const k = Math.min(1, total / (TOPPLE + IMPACT + GETUP + 10));
  const topple = Math.max(4, Math.round(TOPPLE * k));
  const impact = Math.max(6, Math.round(IMPACT * k));
  const getup = Math.max(8, Math.round(GETUP * k));
  const getupStart = Math.max(topple + impact, total - getup);
  const start = clampTilt(startAngle);

  if (elapsed < topple) {
    const t = easeIn(clamp01(elapsed / topple));
    return { phase: 'topple', rot: start + (BACK - start) * t, dy: 0, sx: 1 + 0.12 * t, sy: 1 - (1 - LIE) * t, flail: 0.4 * t, dizzy: false };
  }
  if (elapsed < topple + impact) {
    const u = clamp01((elapsed - topple) / impact);
    const squash = u < 0.25 ? 1 - 0.25 * Math.sin((u / 0.25) * Math.PI) : 1;
    const bounce = u >= 0.25 ? Math.sin(((u - 0.25) / 0.75) * Math.PI) * height * 0.1 : 0;
    return {
      phase: 'impact',
      rot: BACK + Math.sin(u * Math.PI * 2) * 0.05 * (1 - u),
      dy: -bounce,
      sx: 1.12 + (1 - squash) * 0.5,
      sy: LIE * squash,
      flail: 0.7,
      dizzy: u > 0.5,
    };
  }
  if (elapsed < getupStart) {
    const t = elapsed - topple - impact;
    return {
      phase: 'flail',
      rot: BACK * 0.7 + Math.sin(t * 0.35) * 0.06,
      dy: -Math.abs(Math.sin(t * 0.7)) * 4,
      sx: 1.12 + Math.sin(t * 0.7) * 0.02,
      sy: LIE - Math.sin(t * 0.7) * 0.02,
      flail: 1,
      dizzy: true,
    };
  }
  const u = clamp01((elapsed - getupStart) / getup);
  // 쭉 펴며 통 뛰어올라 선다(뒤집기 없음).
  const rise = Math.min(1, u * 2);
  return {
    phase: 'getup',
    rot: BACK * 0.7 * (1 - rise) + Math.sin(u * Math.PI) * 0.12,
    dy: -Math.sin(u * Math.PI) * height * 0.28,
    sx: 1.12 - 0.12 * rise + (u > 0.8 ? (1 - u) * 0.4 : 0),
    sy: LIE + (1 - LIE) * rise + (u < 0.3 ? 0.08 : 0) - (u > 0.8 ? (1 - u) * 0.4 : 0),
    flail: 0.4 * (1 - u),
    dizzy: false,
  };
}

/** 띄워진(맞아 날아가는) 동안 몸 기울기: 뒤로 젖혔다가 흔들흔들(±15° 안). frame = 공중 경과 프레임. */
export function airborneTilt(frame: number): number {
  return clampTilt(-MAX_BODY_TILT * 0.8 + Math.sin(frame * 0.5) * 0.06);
}

/**
 * 허우적 파츠 각도(도, 아티스트 표기). 파츠 이름의 부위(leg·arm·tail·head·jaw)로 고른다.
 * 다리끼리·팔끼리 반대 박자로 차서 자전거 타듯 보이게 한다.
 */
export function flailPartAngles(partNames: readonly string[], frame: number, amount: number): Record<string, number> {
  const out: Record<string, number> = {};
  let legIndex = 0;
  let armIndex = 0;
  for (const name of partNames) {
    if (name.includes('leg')) {
      const phase = legIndex++ * Math.PI * 0.9;
      out[name] = Math.sin(frame * 0.9 + phase) * 28 * amount;
    } else if (name.includes('arm')) {
      const phase = armIndex++ * Math.PI;
      out[name] = Math.sin(frame * 1.1 + phase) * 34 * amount;
    } else if (name === 'tailbase') {
      out[name] = Math.sin(frame * 0.45) * 10 * amount;
    } else if (name === 'tailtip') {
      out[name] = Math.sin(frame * 0.45 - 0.8) * 16 * amount;
    } else if (name === 'head') {
      out[name] = (-8 + Math.sin(frame * 0.3) * 8) * amount;
    } else if (name === 'jaw') {
      out[name] = 22 * amount;
    }
  }
  return out;
}
