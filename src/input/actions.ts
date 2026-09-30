/** 계획서 1절: 플레이어별로 추상화하는 공통 Action. */
export const ACTIONS = [
  'left',
  'right',
  'up',
  'down',
  'light',
  'heavy',
  'special',
  'confirm',
  'cancel',
  'pause',
] as const;

export type Action = (typeof ACTIONS)[number];

export interface ActionState {
  /** 지금 눌려 있는 상태 */
  held: boolean;
  /** 이번 틱에 새로 눌림 */
  pressed: boolean;
  /** 이번 틱에 새로 뗌 */
  released: boolean;
}

export type ActionStates = Record<Action, ActionState>;

export function createActionStates(): ActionStates {
  const states = {} as ActionStates;
  for (const action of ACTIONS) {
    states[action] = { held: false, pressed: false, released: false };
  }
  return states;
}
