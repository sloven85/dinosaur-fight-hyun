/**
 * 기술 스크립트(디렉터 결정 2026-10-01, 기술 시스템 전면 교체).
 *
 * 기술 하나 = '준비 → 공격 → 회복' 단계 + 프레임 키프레임 + 사건 목록. 전부 moves.json 데이터다.
 * - 키프레임: 몸 이동(x·y, 실제 위치가 움직임)·기울기·늘었다 줄기·방향 뒤집기·잔상 세기·
 *   파츠 회전(도, 아티스트 표기)·잡은 상대 위치.
 * - 판정(hits): 프레임 구간마다 다른 상자·피해 → 다단히트. 띄우기·넘어뜨리기·기절 지정 가능.
 * - 잡기(grab): 구간 안에 닿으면 상대를 붙잡고 success 프레임으로 건너뛴다. 못 잡으면 miss로.
 * - 사건(events): 투사체 발사·던지기·위치 바꾸기·화면 연출·종료.
 *
 * 단계 이름(startup/active/recovery)은 기존 MoveData의 프레임 수를 그대로 쓴다(AI·HUD용).
 */

export type Ease = 'linear' | 'in' | 'out' | 'inout' | 'step';

export interface ScriptKey {
  /** 기술 시작 기준 프레임. */
  f: number;
  /** 이 키로 들어오는 구간의 보간 방식(기본 inout). */
  ease?: Ease;
  /** 앞쪽(+)으로 실제 이동(디자인 px, 시작 위치·시작 방향 기준). */
  x?: number;
  /** 돌진 거리 비율(1 = 상대를 지나 바로 뒤까지). 기술 시작 때 거리로 환산한다. */
  xr?: number;
  /** 위(-)로 실제 이동(디자인 px). 지정하면 그 구간 동안 중력 대신 스크립트가 높이를 정한다. */
  y?: number;
  /** 몸 기울기(라디안, + = 얼굴이 숙여짐). 보이는 모양만. */
  rot?: number;
  /** 가로·세로 늘이기(만화 연출). 보이는 모양만. */
  sx?: number;
  sy?: number;
  /** 1 = 시작 방향, -1 = 뒤돌아봄(왕복 공격). 판정 방향도 따라간다. 보간 없이 즉시 바뀐다. */
  face?: 1 | -1;
  /** 잔상 세기 0~1. */
  ghost?: number;
  /** 파츠 회전(도, 아티스트 표기 +=화면 시계방향). 파츠 리그가 없는 종은 무시. */
  parts?: Record<string, number>;
  /** 잡은 상대의 위치(몸 앞끝 기준 px)와 기울기(라디안). */
  hold?: { x?: number; y?: number; rot?: number };
}

export interface ScriptBox {
  /** anchor=front면 몸 앞끝에서, center면 몸 중심에서 앞쪽(+)으로의 시작점. */
  x: number;
  /** 지면 기준 위쪽(-) 시작점. */
  y: number;
  w: number;
  h: number;
  anchor?: 'front' | 'center';
}

export interface HitParams {
  damage: number;
  knockback: number;
  hitstun: number;
  hitstop: number;
  /** 띄우기: 맞은 쪽 속도(px/초, vx는 공격 방향 기준). */
  launch?: { vx: number; vy: number };
  /** 넘어뜨리기: 착지 후(또는 바로) 누워 있는 프레임. */
  knockdown?: number;
  /** 짧은 기절(머리 위 별) 프레임. */
  stun?: number;
  /** 가드 불가(잡기 계열). */
  unguardable?: boolean;
  /** 화면 연출 크기(효과음·이펙트). 기본은 기술 kind. */
  fx?: 'light' | 'heavy' | 'special';
}

export interface ScriptHit extends HitParams {
  from: number;
  to: number;
  /** target=held면 상자 대신 잡고 있는 상대에게 바로 들어간다(물고 흔들기). */
  target?: 'box' | 'held';
  box?: ScriptBox;
}

export interface ScriptGrab {
  from: number;
  to: number;
  box: ScriptBox;
  /** 잡으면 건너뛸 프레임. */
  success: number;
  /** 못 잡으면 건너뛸 프레임(헛방 회복). */
  miss: number;
}

export interface ProjectileSpec extends HitParams {
  /** 발사 위치: 몸 앞끝 기준 앞(+)·지면 기준 위(-). */
  x: number;
  y: number;
  /** 속도(px/초, vx는 앞쪽 +). */
  vx: number;
  vy?: number;
  gravity?: number;
  /** 회전 속도(라디안/초). */
  spin?: number;
  /** 수명(초). */
  life: number;
  /** 판정·그림 크기(디자인 px). */
  w: number;
  h: number;
  /** public 기준 그림 경로. 없으면 도형으로 그린다. */
  sprite?: string;
  color?: string;
}

export type ScriptEvent =
  | ({ f: number; type: 'projectile' } & ProjectileSpec)
  | {
      f: number;
      type: 'throw';
      vx: number;
      vy: number;
      damage: number;
      knockdown: number;
      /** true면 뒤로 넘긴다(위치 바꾸기). */
      behind?: boolean;
    }
  | { f: number; type: 'swap' }
  | {
      f: number;
      type: 'fx';
      fx: 'shake' | 'dust' | 'shockwave' | 'splash' | 'flash';
      strength?: number;
      /** 몸 앞끝 기준 위치. */
      x?: number;
      y?: number;
    }
  | { f: number; type: 'end' };

export interface MoveScript {
  /** 전체 프레임(잡기 성공 경로 포함). */
  frames: number;
  keys: ScriptKey[];
  hits?: ScriptHit[];
  grab?: ScriptGrab;
  events?: ScriptEvent[];
  /** 이 기술 동안 몸끼리 밀어내지 않는다(상대를 통과하는 왕복 공격). */
  passThrough?: boolean;
  /** CPU 사거리 판단용 도달 거리(중심에서, px). */
  reach: number;
}

/** 진행 중 스크립트 상태(공격 1회분). */
export interface ScriptRuntime {
  startX: number;
  startY: number;
  startFacing: 1 | -1;
  /** xr=1에 해당하는 실제 거리. */
  dashDistance: number;
  /** 이미 처리한 사건 인덱스. */
  fired: Set<number>;
  /** 이미 맞힌 판정 인덱스. */
  landed: Set<number>;
  grabbed: boolean;
  grabResolved: boolean;
}

export type Channel = 'x' | 'xr' | 'y' | 'rot' | 'sx' | 'sy' | 'ghost' | 'holdX' | 'holdY' | 'holdRot';

const DEFAULTS: Record<Channel, number> = {
  x: 0,
  xr: 0,
  y: 0,
  rot: 0,
  sx: 1,
  sy: 1,
  ghost: 0,
  holdX: 0,
  holdY: 0,
  holdRot: 0,
};

function channelValue(key: ScriptKey, channel: Channel): number | undefined {
  switch (channel) {
    case 'holdX':
      return key.hold?.x;
    case 'holdY':
      return key.hold?.y;
    case 'holdRot':
      return key.hold?.rot;
    default:
      return key[channel];
  }
}

function ease(kind: Ease | undefined, t: number): number {
  switch (kind ?? 'inout') {
    case 'linear':
      return t;
    case 'in':
      return t * t;
    case 'out':
      return 1 - (1 - t) * (1 - t);
    case 'step':
      return t >= 1 ? 1 : 0;
    case 'inout':
    default:
      return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
  }
}

/** 채널 하나를 프레임에서 보간한다. 키가 없는 앞쪽은 기본값, 마지막 키 뒤는 그 값을 유지한다. */
function sampleWith(
  keys: readonly ScriptKey[],
  frame: number,
  read: (key: ScriptKey) => number | undefined,
  fallback: number,
): number {
  let prevF = 0;
  let prevV = fallback;
  for (const key of keys) {
    const v = read(key);
    if (v === undefined) continue;
    if (key.f >= frame) {
      if (key.f === prevF) return v;
      const t = Math.min(1, Math.max(0, (frame - prevF) / (key.f - prevF)));
      return prevV + (v - prevV) * ease(key.ease, t);
    }
    prevF = key.f;
    prevV = v;
  }
  return prevV;
}

export function sampleChannel(script: MoveScript, channel: Channel, frame: number): number {
  return sampleWith(script.keys, frame, (k) => channelValue(k, channel), DEFAULTS[channel]);
}

export function hasChannel(script: MoveScript, channel: Channel): boolean {
  return script.keys.some((k) => channelValue(k, channel) !== undefined);
}

/** 파츠 회전 표(도). 키에 나온 모든 파츠를 보간한다. */
export function sampleParts(script: MoveScript, frame: number): Record<string, number> {
  const names = new Set<string>();
  for (const key of script.keys) for (const name of Object.keys(key.parts ?? {})) names.add(name);
  const out: Record<string, number> = {};
  for (const name of names) {
    out[name] = sampleWith(script.keys, frame, (k) => k.parts?.[name], 0);
  }
  return out;
}

/** 방향은 보간하지 않는다: frame 이하 마지막 face 키. */
export function sampleFace(script: MoveScript, frame: number): 1 | -1 {
  let face: 1 | -1 = 1;
  for (const key of script.keys) {
    if (key.f > frame) break;
    if (key.face !== undefined) face = key.face;
  }
  return face;
}

/** 키프레임 순서·범위를 확인한다(데이터 오류를 테스트에서 잡는다). */
export function validateScript(id: string, script: MoveScript): string[] {
  const errors: string[] = [];
  let last = -1;
  for (const key of script.keys) {
    if (key.f < last) errors.push(`${id}: 키 프레임 ${key.f}가 앞 키(${last})보다 작다`);
    if (key.f > script.frames) errors.push(`${id}: 키 프레임 ${key.f} > frames ${script.frames}`);
    last = key.f;
  }
  for (const hit of script.hits ?? []) {
    if (hit.from > hit.to) errors.push(`${id}: 판정 구간 from>to`);
    if (hit.target !== 'held' && !hit.box) errors.push(`${id}: 상자 없는 판정`);
  }
  if (script.grab) {
    const g = script.grab;
    if (!(g.from <= g.to && g.to < g.miss && g.success < script.frames)) {
      errors.push(`${id}: 잡기 프레임 순서가 맞지 않다`);
    }
  }
  return errors;
}
