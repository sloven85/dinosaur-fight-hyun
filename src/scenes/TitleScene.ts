import type { Scene } from './Scene';

/**
 * 임시 타이틀 화면. 실제 시작 버튼·모드 선택은 계획서 16절 프롬프트 1에서 붙인다.
 * 지금은 파이프라인(고정 스텝 루프 + 캔버스 렌더)이 도는지 확인하는 용도다.
 */
export class TitleScene implements Scene {
  private elapsed = 0;

  enter(): void {
    this.elapsed = 0;
  }

  exit(): void {}

  update(dt: number): void {
    this.elapsed += dt;
  }

  render(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    ctx.fillStyle = '#1b2430';
    ctx.fillRect(0, 0, width, height);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = '#f2f4f8';
    ctx.font = 'bold 104px "Noto Sans KR", system-ui, sans-serif';
    ctx.fillText('다이노 파이터즈', width / 2, height / 2 - 50);

    const pulse = 0.6 + 0.4 * Math.sin(this.elapsed * 2);
    ctx.fillStyle = `rgba(143, 163, 184, ${pulse.toFixed(3)})`;
    ctx.font = '40px "Noto Sans KR", system-ui, sans-serif';
    ctx.fillText('Dino Fighters — 준비 중', width / 2, height / 2 + 70);
  }
}
