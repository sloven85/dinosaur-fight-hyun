import type { AttackKind, AttackPhase } from '../combat/types';

/**
 * 종별 공격 모티프(디렉터 결정 2026-10-01). 전용 포즈가 아직 없어도
 * 궤적과 잔상으로 기술마다 다른 동작이 보이게 하는 순수 연출 데이터다.
 * 판정·피해에는 전혀 관여하지 않는다.
 *
 * - bite  : 머리를 숙이며 앞으로 무는 동작(티라노)
 * - horn  : 몸을 낮췄다가 앞으로 돌진(트리케라·카르노·파키)
 * - tail  : 몸을 틀어 꼬리를 뒤에서 앞으로 휘두름(스피노·안킬로·스테고)
 * - claw  : 앞발을 들었다가 위에서 아래로 내려침(벨로키·테리지노·딜로포)
 * - stomp : 앞몸을 들었다가 내려찍음(브라키오)
 * - dive  : 날개로 밀거나 떠올랐다가 내리꽂음(프테라노돈)
 */
export type AttackStyle = 'bite' | 'horn' | 'tail' | 'claw' | 'stomp' | 'dive';

export const ATTACK_STYLES: readonly AttackStyle[] = ['bite', 'horn', 'tail', 'claw', 'stomp', 'dive'];

/** 몸 기준 변형 한 장면. 단위는 디자인 px·라디안, 얼굴 쪽이 +x다. */
export interface MotionPose {
  dx: number;
  dy: number;
  /** 양수 = 얼굴 쪽이 아래로 숙여짐. */
  rot: number;
  sx: number;
  sy: number;
}

export interface MotionFrame extends MotionPose {
  /** 회전·축척의 중심(발밑 원점 기준). */
  pivotX: number;
  pivotY: number;
  /** 잔상 세기 0~1. 판정 구간에 가장 진하다. */
  trail: number;
}

export interface BodySize {
  /** 몸 앞끝(중심→얼굴 쪽 경계, 디자인 px). */
  front: number;
  /** 화면 키(디자인 px). */
  height: number;
}

interface StyleKeys {
  windup: Partial<MotionPose>;
  strike: Partial<MotionPose>;
  /** 준비~판정 구간 동안 위로 뜨는 높이(점프형 특수기). */
  arc?: number;
}

const NEUTRAL: MotionPose = { dx: 0, dy: 0, rot: 0, sx: 1, sy: 1 };

/** 약 = 짧은 앞찌르기, 강 = 크게 휘두르기/들이받기, 특수 = 돌진·점프. */
const KEYS: Record<AttackStyle, Record<AttackKind, StyleKeys>> = {
  bite: {
    light: { windup: { dx: -8, rot: -0.06 }, strike: { dx: 28, rot: 0.1 } },
    heavy: { windup: { dx: -22, rot: -0.16 }, strike: { dx: 60, rot: 0.18 } },
    special: { windup: { dx: -30, rot: -0.22, sy: 1.04 }, strike: { dx: 110, rot: 0.08, sx: 1.06 } },
  },
  horn: {
    light: { windup: { dx: -10, rot: -0.04 }, strike: { dx: 32, rot: 0.08 } },
    heavy: { windup: { dx: -36, rot: 0.06, sy: 0.92 }, strike: { dx: 85, rot: 0.14, sx: 1.05 } },
    special: { windup: { dx: -45, rot: 0.08, sy: 0.88 }, strike: { dx: 150, rot: 0.12, sx: 1.1 } },
  },
  tail: {
    light: { windup: { dx: -8 }, strike: { dx: 26, rot: 0.04 } },
    // 몸을 틀어(sx가 0을 지나 음수) 꼬리가 상대 쪽으로 오게 한다.
    heavy: { windup: { dx: -10, rot: -0.08 }, strike: { dx: -20, rot: 0.05, sx: -0.85 } },
    special: { windup: { dx: -15, rot: -0.1, sy: 0.95 }, strike: { dx: 40, rot: 0.08, sx: -1 }, arc: 40 },
  },
  claw: {
    light: { windup: { dx: -6, dy: -8, rot: -0.08 }, strike: { dx: 24, dy: 4, rot: 0.12 } },
    heavy: { windup: { dx: -14, dy: -26, rot: -0.2 }, strike: { dx: 55, dy: 8, rot: 0.26 } },
    special: { windup: { dx: -20, sy: 0.9 }, strike: { dx: 140, rot: 0.2 }, arc: 110 },
  },
  stomp: {
    light: { windup: { dx: -6, rot: -0.04 }, strike: { dx: 24, rot: 0.04 } },
    heavy: { windup: { dx: -10, rot: -0.22 }, strike: { dx: 40, rot: 0.04, sy: 0.97 } },
    special: { windup: { rot: -0.28, sy: 1.02 }, strike: { dx: 60, rot: 0.05, sy: 0.94 }, arc: 70 },
  },
  dive: {
    light: { windup: { dx: -6 }, strike: { dx: 28, rot: 0.1 } },
    heavy: { windup: { dx: -16, sx: 0.92, sy: 1.08 }, strike: { dx: 60, sx: 1.12, sy: 0.92 } },
    special: { windup: { dx: -10, dy: -60, rot: -0.3 }, strike: { dx: 150, rot: 0.35 }, arc: 140 },
  },
};

/** 회전 중심: 머리·몸통·뒷발 등 모티프마다 축이 다르다. */
function pivotFor(style: AttackStyle, size: BodySize): { x: number; y: number } {
  const { front, height } = size;
  switch (style) {
    case 'bite':
      return { x: front * 0.6, y: -height * 0.65 };
    case 'horn':
      return { x: front * 0.4, y: -height * 0.35 };
    case 'claw':
      return { x: front * 0.3, y: -height * 0.6 };
    case 'stomp':
      return { x: -front * 0.5, y: 0 };
    case 'tail':
    case 'dive':
      return { x: 0, y: -height * 0.5 };
  }
}

function full(pose: Partial<MotionPose>): MotionPose {
  return { ...NEUTRAL, ...pose };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mix(a: MotionPose, b: MotionPose, t: number): MotionPose {
  return {
    dx: lerp(a.dx, b.dx, t),
    dy: lerp(a.dy, b.dy, t),
    rot: lerp(a.rot, b.rot, t),
    sx: mixScale(a.sx, b.sx, t),
    sy: lerp(a.sy, b.sy, t),
  };
}

/**
 * 좌우 뒤집기(꼬리 휘두르기)는 폭이 0을 지나며 종잇장처럼 보이지 않게,
 * 앞쪽 30%에서 방향을 홱 바꾸고 크기만 부드럽게 맞춘다.
 */
function mixScale(a: number, b: number, t: number): number {
  if (a * b >= 0) return lerp(a, b, t);
  const magnitude = lerp(Math.abs(a), Math.abs(b), t);
  return (t < 0.3 ? Math.sign(a) : Math.sign(b)) * Math.max(0.75, magnitude);
}

const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);
const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t));

export interface AttackTiming {
  startupFrames: number;
  activeFrames: number;
  recoveryFrames: number;
}

/** 기술 진행 프레임에서 지금 보일 몸 변형을 계산한다. */
export function attackMotion(
  style: AttackStyle,
  kind: AttackKind,
  timing: AttackTiming,
  frame: number,
  size: BodySize,
): MotionFrame {
  const keys = KEYS[style][kind];
  const windup = full(keys.windup);
  const strike = full(keys.strike);
  const { startupFrames: su, activeFrames: ac, recoveryFrames: rc } = timing;

  let pose: MotionPose;
  let trail = 0;
  let phase: AttackPhase;
  if (frame < su) {
    phase = 'startup';
    pose = mix(NEUTRAL, windup, easeOut(clamp01(frame / Math.max(1, su))));
  } else if (frame < su + ac) {
    phase = 'active';
    // 판정 첫 프레임에 거의 다 뻗어 있도록 빠르게 친다.
    const t = clamp01((frame - su + 1) / Math.max(1, ac));
    pose = mix(windup, strike, easeOut(Math.min(1, t * 1.6)));
    trail = 1;
  } else {
    phase = 'recovery';
    const t = clamp01((frame - su - ac) / Math.max(1, rc));
    pose = mix(strike, NEUTRAL, easeInOut(t));
    trail = Math.max(0, 1 - t * 2.5);
  }

  if (keys.arc && phase !== 'recovery') {
    const u = clamp01(frame / Math.max(1, su + ac));
    pose.dy -= keys.arc * Math.sin(Math.PI * u);
  }

  const pivot = pivotFor(style, size);
  return { ...pose, pivotX: pivot.x, pivotY: pivot.y, trail };
}

/** 몸 변형을 캔버스에 건다(발밑 원점·얼굴 쪽 +x 좌표계에서 호출). */
export function applyMotion(g: CanvasRenderingContext2D, motion: MotionFrame, amount = 1): void {
  g.translate(motion.dx * amount, motion.dy * amount);
  g.translate(motion.pivotX, motion.pivotY);
  g.rotate(motion.rot * amount);
  g.scale(lerp(1, motion.sx, amount), lerp(1, motion.sy, amount));
  g.translate(-motion.pivotX, -motion.pivotY);
}

const TRAIL_STRENGTH: Record<AttackKind, number> = { light: 0.6, heavy: 0.85, special: 1 };

/**
 * 모티프별 잔상(물기 선·돌진 속도선·꼬리 호·발톱 세 줄·충격 고리·급강하 줄기).
 * 같은 몸통 그림이라도 궤적이 달라 보이게 한다.
 */
export function drawAttackTrail(
  g: CanvasRenderingContext2D,
  style: AttackStyle,
  kind: AttackKind,
  motion: MotionFrame,
  size: BodySize,
  accent: string,
): void {
  const alpha = motion.trail * TRAIL_STRENGTH[kind];
  if (alpha <= 0.01) return;
  const { front, height: h } = size;
  const color = kind === 'special' ? accent : kind === 'heavy' ? '#fff3c4' : '#ffffff';
  const width = kind === 'light' ? 5 : kind === 'heavy' ? 8 : 11;
  const reach = kind === 'light' ? 45 : kind === 'heavy' ? 100 : 160;

  g.save();
  g.globalAlpha = alpha;
  g.strokeStyle = color;
  g.lineWidth = width;
  g.lineCap = 'round';
  g.translate(motion.dx, motion.dy);
  g.beginPath();

  switch (style) {
    case 'bite': {
      // 위아래 턱이 닫히는 꺾쇠 + 특수기는 포효 음파.
      const x = front + reach * 0.4;
      const y = -h * 0.62;
      g.moveTo(x - 30, y - 34);
      g.lineTo(x + 6, y);
      g.lineTo(x - 30, y + 34);
      if (kind === 'special') {
        for (let i = 1; i <= 3; i++) {
          g.moveTo(x + i * 38, y - 30 - i * 14);
          g.arc(x + i * 38 - 30 - i * 14, y, 30 + i * 14, -0.9, 0.9);
        }
      }
      break;
    }
    case 'horn': {
      // 몸 뒤로 속도선, 앞에 충돌 꺾쇠.
      for (let i = 0; i < 4; i++) {
        const y = -h * (0.25 + i * 0.16);
        g.moveTo(-front * 0.6, y);
        g.lineTo(-front * 0.6 - reach * (0.5 + i * 0.15), y);
      }
      const x = front + reach * 0.3;
      g.moveTo(x, -h * 0.55);
      g.lineTo(x + 24, -h * 0.35);
      g.lineTo(x, -h * 0.15);
      break;
    }
    case 'tail': {
      // 뒤에서 위를 지나 앞으로 크게 도는 호.
      const r = front + reach * 0.5;
      g.arc(0, -h * 0.3, r, Math.PI * 1.05, Math.PI * 1.95);
      break;
    }
    case 'claw': {
      // 위에서 아래로 긋는 발톱 세 줄.
      for (let i = 0; i < 3; i++) {
        const ox = front * 0.55 + i * 22;
        g.moveTo(ox, -h * 0.95);
        g.quadraticCurveTo(ox + reach * 0.7, -h * 0.6, ox + reach * 0.4, -h * 0.15);
      }
      break;
    }
    case 'stomp': {
      // 앞발이 내려찍은 자리의 충격 고리.
      const grow = 1 - motion.trail * 0.4;
      g.ellipse(front * 0.6, 0, (60 + reach) * grow, 18 * grow + 6, 0, 0, Math.PI * 2);
      break;
    }
    case 'dive': {
      // 위 뒤쪽에서 앞 아래로 내리꽂는 줄기.
      g.moveTo(-front * 0.8, -h * 1.1);
      g.lineTo(front + reach * 0.4, -h * 0.35);
      g.moveTo(-front * 0.5, -h * 1.25);
      g.lineTo(front + reach * 0.2, -h * 0.5);
      break;
    }
  }
  g.stroke();
  g.restore();
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
