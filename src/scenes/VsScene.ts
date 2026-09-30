import { getCharacter, getStage } from '../data';
import { BaseScene } from './BaseScene';
import { BattleScene } from './BattleScene';
import { drawText, fillRoundRect } from '../ui/draw';
import { COLORS, FONTS } from '../ui/theme';

const HOLD_SECONDS = 1.8;

export class VsScene extends BaseScene {
  private elapsed = 0;

  protected tick(dt: number): void {
    this.elapsed += dt;
    const canSkip = this.elapsed > 0.4 && this.context.input.anyPressed('confirm');
    if (this.elapsed >= HOLD_SECONDS || canSkip) {
      this.context.setScene(new BattleScene());
    }
  }

  render(g: CanvasRenderingContext2D, width: number, height: number): void {
    const session = this.context.session;
    const p1 = getCharacter(session.characters[0]);
    const p2 = getCharacter(session.characters[1]);
    const stage = getStage(session.stage);

    g.fillStyle = COLORS.bg;
    g.fillRect(0, 0, width, height);

    fillRoundRect(g, 180, 300, 560, 480, 24, p1.color, COLORS.p1, 6);
    drawText(g, p1.name, 460, 560, { font: FONTS.heading, color: '#ffffff' });
    drawText(g, '1P', 460, 400, { font: FONTS.body, color: COLORS.p1 });

    fillRoundRect(g, 1180, 300, 560, 480, 24, p2.color, COLORS.p2, 6);
    drawText(g, p2.name, 1460, 560, { font: FONTS.heading, color: '#ffffff' });
    drawText(g, '2P', 1460, 400, { font: FONTS.body, color: COLORS.p2 });

    drawText(g, 'VS', width / 2, 540, { font: FONTS.title, color: COLORS.accent });
    drawText(g, stage.name, width / 2, 880, { font: FONTS.heading, color: COLORS.text });
    drawText(g, '확인 버튼으로 바로 시작', width / 2, 980, {
      font: FONTS.small,
      color: COLORS.textDim,
    });
  }
}
