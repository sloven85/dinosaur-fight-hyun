/** 계획서 11절: 1920x1080 디자인 좌표(16:9)를 기준으로 한다. */
export const DESIGN_WIDTH = 1920;
export const DESIGN_HEIGHT = 1080;

/** 계획서 3절: 60Hz 고정 시뮬레이션. */
export const SIMULATION_HZ = 60;
export const FIXED_DT = 1 / SIMULATION_HZ;

/** 한 프레임에서 한꺼번에 처리할 수 있는 최대 경과 시간(초). 긴 정지 후 몰아서 처리하지 않는다. */
export const MAX_FRAME_DELTA = 0.25;

/** 계획서 2절: 45초 라운드, 2라운드 선승. */
export const ROUND_SECONDS = 45;
export const ROUNDS_TO_WIN = 2;
/** 무승부가 반복될 때 경기를 끝내기 위한 안전 상한. */
export const MAX_ROUNDS = 9;

/** 계획서 3절 공통 값(디자인 px, 프레임). */
export const BASE_MOVE_SPEED = 360;
export const JUMP_VELOCITY = -900;
export const GRAVITY = 2400;

/** 화면 안쪽 여유. 스프라이트가 화면 밖으로 잘리지 않도록 이 안에서만 움직인다. */
export const ARENA_LEFT = 60;
export const ARENA_RIGHT = 1860;
export const START_X_P1 = 620;
export const START_X_P2 = 1300;

/** 계획서 2절 게이지. */
export const MAX_METER = 100;
export const START_METER = 50;
export const METER_PER_SECOND = 4;
export const METER_ON_HIT = 8;
export const METER_ON_HIT_TAKEN = 4;
/** 게이지 부족으로 특수기가 나가지 않을 때 아이콘 깜빡임 프레임. */
export const SPECIAL_FLASH_FRAMES = 30;

/** 넉백은 지정 거리(px)를 이 프레임 동안 나눠 이동한다. */
export const KNOCKBACK_FRAMES = 15;
export const GUARD_KNOCKBACK_RATIO = 0.5;

/** 가드 시 특수기 피해 비율. 약·강공격은 0이다. 체력은 1 아래로 내려가지 않는다. */
export const GUARD_DAMAGE_SPECIAL_RATIO = 0.2;
export const GUARD_MIN_HEALTH = 1;

/** 계획서 3절 연속 피격 보호: 3회 연속 명중 후 30프레임 공격 무적(이동은 가능). */
export const CONSECUTIVE_HIT_LIMIT = 3;
export const HIT_INVULN_FRAMES = 30;

/** 계획서 3절 입력 보관: 공격 버튼의 새 누름을 최대 120ms 보관(60Hz에서 7프레임). */
export const INPUT_BUFFER_FRAMES = 7;

/** 라운드 연출 길이(프레임). */
export const ROUND_INTRO_FRAMES = 90;
export const ROUND_OVER_FRAMES = 120;
