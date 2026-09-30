import type { Action } from '../input/actions';
import type { PlayerIndex } from '../input/InputManager';
import type { FighterInput } from './Fighter';

/** 테스트에서 프레임별로 입력을 직접 넣기 위한 스텁. */
export class ScriptInput implements FighterInput {
  private readonly held: [Set<Action>, Set<Action>] = [new Set(), new Set()];
  private readonly pressed: [Set<Action>, Set<Action>] = [new Set(), new Set()];

  isHeld(player: PlayerIndex, action: Action): boolean {
    return this.held[player].has(action);
  }

  isPressed(player: PlayerIndex, action: Action): boolean {
    return this.pressed[player].has(action);
  }

  hold(player: PlayerIndex, action: Action): void {
    this.held[player].add(action);
  }

  release(player: PlayerIndex, action: Action): void {
    this.held[player].delete(action);
  }

  press(player: PlayerIndex, action: Action): void {
    this.pressed[player].add(action);
    this.held[player].add(action);
  }

  /** 다음 프레임으로 넘어가며 새로 눌림 상태를 비운다. */
  clearPressed(): void {
    this.pressed[0].clear();
    this.pressed[1].clear();
  }

  reset(): void {
    this.held[0].clear();
    this.held[1].clear();
    this.clearPressed();
  }
}
