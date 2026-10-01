/**
 * 넘어짐 연출(jk 피드백 2026-10-01: "그대로 뒤집는 건 성의 없다").
 * 한 장을 뒤집어 두는 대신, 시간에 따라 단계가 이어지는 동작으로 만든다.
 *
 * 1) 쓰러짐  : 맞은 반대쪽(뒤)으로 넘어간다. 공중에서 돌던 각도에서 이어서 돈다.
 * 2) 쿵·튕김 : 바닥에 닿는 순간 납작해졌다가 한 번 통 튀어 오른다.
 * 3) 버둥버둥: 배를 위로 하고 다리·팔을 허우적, 꼬리 철썩, 입 벌리고 머리를 흔든다(머리 위 별).
 * 4) 벌떡    : 뒤로 한 바퀴 굴러 일어나며 살짝 뛰어오르고 몸을 쭉 편다.
 *
 * 판정과 무관한 보이는 모양만 계산한다(Fighter의 fallenFrames·fallenTotal·fallStartAngle을 읽는다).
 */

export type FallPhase = 'topple' | 'impact' | 'flail' | 'getup';

export interface FallPose {
  phase: FallPhase;
  /** 몸 회전(라디안, 음수 = 뒤로). 몸 가운데를 축으로 건다. */
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

const TOPPLE = 10;
const IMPACT = 14;
const GETUP = 16;
const BACK = -Math.PI;

const easeIn = (t: number): number => t * t;
const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);
const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));

/** elapsed = 넘어진 뒤 지난 프레임, total = 넘어짐 전체 프레임, height = 몸 높이(px). */
export function fallPose(elapsed: number, total: number, startAngle: number, height: number): FallPose {
  // 짧은 넘어짐이면 단계를 비율로 줄인다.
  const k = Math.min(1, total / (TOPPLE + IMPACT + GETUP + 10));
  const topple = Math.max(4, Math.round(TOPPLE * k * (startAngle < -1.5 ? 0.6 : 1)));
  const impact = Math.max(6, Math.round(IMPACT * k));
  const getup = Math.max(8, Math.round(GETUP * k));
  const getupStart = Math.max(topple + impact, total - getup);

  if (elapsed < topple) {
    const t = easeIn(clamp01(elapsed / topple));
    return { phase: 'topple', rot: startAngle + (BACK - startAngle) * t, dy: 0, sx: 1, sy: 1, flail: 0.3 * t, dizzy: false };
  }
  if (elapsed < topple + impact) {
    const u = clamp01((elapsed - topple) / impact);
    // 처음 1/4은 납작, 이후 한 번 튀었다가 내려온다.
    const squash = u < 0.25 ? 1 - 0.22 * Math.sin((u / 0.25) * Math.PI) : 1;
    const bounce = u >= 0.25 ? Math.sin(((u - 0.25) / 0.75) * Math.PI) * height * 0.14 : 0;
    return {
      phase: 'impact',
      rot: BACK + Math.sin(u * Math.PI * 2) * 0.08 * (1 - u),
      dy: -bounce,
      sx: 2 - squash,
      sy: squash,
      flail: 0.6,
      dizzy: u > 0.5,
    };
  }
  if (elapsed < getupStart) {
    const t = elapsed - topple - impact;
    return {
      phase: 'flail',
      // 등으로 누운 채 좌우로 흔들흔들(배를 내밀며 버둥).
      rot: BACK + Math.sin(t * 0.35) * 0.07,
      dy: -Math.abs(Math.sin(t * 0.7)) * 4,
      sx: 1 + Math.sin(t * 0.7) * 0.02,
      sy: 0.94 - Math.sin(t * 0.7) * 0.02,
      flail: 1,
      dizzy: true,
    };
  }
  const u = clamp01((elapsed - getupStart) / getup);
  const roll = easeOut(u);
  return {
    phase: 'getup',
    // 뒤로 한 바퀴 더 굴러 똑바로 선다(-π → -2π). 구르는 동안 바닥을 파고들지 않게 띄운다.
    rot: BACK + BACK * roll,
    dy: -Math.sin(Math.min(1, u * 1.15) * Math.PI) * height * 0.6,
    sx: u > 0.8 ? 1 + (1 - u) * 0.5 : 1,
    sy: u > 0.8 ? 1 - (1 - u) * 0.5 : 1,
    flail: 0.4 * (1 - u),
    dizzy: false,
  };
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
