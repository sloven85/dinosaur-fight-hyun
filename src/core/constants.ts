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

/** 계획서 3절 공통 값(디자인 px 기준). */
export const BASE_MOVE_SPEED = 360;
export const JUMP_VELOCITY = -900;
export const GRAVITY = 2400;
