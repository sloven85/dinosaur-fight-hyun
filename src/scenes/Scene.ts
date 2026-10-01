import type { GameContext } from '../core/GameContext';

/** 모든 화면(타이틀·선택·대전·결과)이 구현하는 공통 인터페이스. */
export interface Scene {
  /** true인 화면에서만 일시정지 입력(1·2 / 9·0 / Esc / 패드 Start)이 동작한다. */
  readonly pausable?: boolean;
  enter(context: GameContext): void;
  exit(): void;
  update(dt: number, context: GameContext): void;
  render(g: CanvasRenderingContext2D, width: number, height: number): void;
}
