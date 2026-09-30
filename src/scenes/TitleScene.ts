import { BaseScene } from './BaseScene';
import { ModeScene } from './ModeScene';
import { drawButton, drawText } from '../ui/draw';
import { COLORS, FONTS } from '../ui/theme';

export class TitleScene extends BaseScene {
  private elapsed = 0;

  protected tick(dt: number): void {
    this.elapsed += dt;
    if (this.context.input.anyPressed('confirm')) {
      this.context.setScene(new ModeScene());
    }
  }

  render(g: CanvasRenderingContext2D, width: number, height: number): void {
    g.fillStyle = COLORS.bg;
    g.fillRect(0, 0, width, height);

    drawText(g, '다이노 파이터즈', width / 2, 250, { font: FONTS.title, color: COLORS.text });
    drawText(g, 'Dino Fighters', width / 2, 355, { font: FONTS.heading, color: COLORS.textDim });

    const pulse = 0.75 + 0.25 * Math.sin(this.elapsed * 3);
    g.globalAlpha = pulse;
    drawButton(g, width / 2 - 220, 500, 440, 120, '시작', true);
    g.globalAlpha = 1;

    drawText(g, '패드의 아래쪽 얼굴 버튼을 누르면 참가합니다', width / 2, 690, {
      font: FONTS.body,
      color: COLORS.textDim,
    });

    const p1 = this.context.input.padIndex(0);
    const p2 = this.context.input.padIndex(1);
    drawText(g, `1P 패드  ${padLabel(p1)}`, width / 2 - 280, 800, {
      font: FONTS.small,
      color: COLORS.p1,
    });
    drawText(g, `2P 패드  ${padLabel(p2)}`, width / 2 + 280, 800, {
      font: FONTS.small,
      color: COLORS.p2,
    });

    drawText(g, 'Enter 또는 패드 확인 버튼으로 시작 · Esc 일시정지', width / 2, 970, {
      font: FONTS.small,
      color: COLORS.textDim,
    });
  }
}

function padLabel(index: number | null): string {
  return index === null ? '미참가' : `참가 (index ${index})`;
}
