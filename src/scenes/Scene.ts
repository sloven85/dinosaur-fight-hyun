/** 모든 화면(타이틀·선택·대전·결과)이 구현하는 공통 인터페이스. */
export interface Scene {
  enter(): void;
  exit(): void;
  update(dt: number): void;
  render(ctx: CanvasRenderingContext2D, width: number, height: number): void;
}
