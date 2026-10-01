import type { GameContext } from '../core/GameContext';
import { STAGES } from '../data';
import { preloadStages } from '../rendering/stageRenderer';
import { BaseScene } from './BaseScene';
import { CharacterSelectScene } from './CharacterSelectScene';
import { VsScene } from './VsScene';
import { drawText, fillRoundRect } from '../ui/draw';
import { moveListIndex } from '../ui/menu';
import { COLORS, FONTS } from '../ui/theme';

const CARD_W = 380;
const CARD_H = 420;
const GAP = 40;

export class StageSelectScene extends BaseScene {
  private cursor = 0;

  enter(context: GameContext): void {
    super.enter(context);
    void preloadStages(context.assets, STAGES);
    void context.assets.loadImages(STAGES.map((s) => s.thumbnailPath));
  }

  protected tick(_dt: number): void {
    const input = this.context.input;

    if (input.anyPressed('cancel')) {
      this.context.setScene(new CharacterSelectScene());
      return;
    }
    if (input.anyPressed('left')) this.cursor = moveListIndex(this.cursor, STAGES.length, -1);
    if (input.anyPressed('right')) this.cursor = moveListIndex(this.cursor, STAGES.length, 1);
    if (input.anyPressed('confirm')) {
      this.context.session.stage = STAGES[this.cursor].id;
      this.context.setScene(new VsScene());
    }
  }

  render(g: CanvasRenderingContext2D, width: number, height: number): void {
    g.fillStyle = COLORS.bg;
    g.fillRect(0, 0, width, height);

    drawText(g, '경기장을 고르세요', width / 2, 170, { font: FONTS.heading, color: COLORS.text });

    const totalW = STAGES.length * CARD_W + (STAGES.length - 1) * GAP;
    const x0 = (width - totalW) / 2;
    const y = 320;

    STAGES.forEach((stage, index) => {
      const x = x0 + index * (CARD_W + GAP);
      const selected = index === this.cursor;

      fillRoundRect(g, x, y, CARD_W, CARD_H, 22, stage.placeholderColor, COLORS.panelBorder, 3);
      // 경기장 썸네일(하늘+중경 합성 16:9). 카드 위쪽을 둥글게 채운다.
      const thumb = this.context.assets.image(stage.thumbnailPath);
      const tw = CARD_W - 24;
      const th = Math.round((tw * 9) / 16) + 90;
      if (thumb) {
        g.save();
        g.beginPath();
        g.roundRect(x + 12, y + 12, tw, th, 16);
        g.clip();
        const scale = Math.max(tw / thumb.width, th / thumb.height);
        const iw = thumb.width * scale;
        const ih = thumb.height * scale;
        g.drawImage(thumb, x + 12 + (tw - iw) / 2, y + 12 + (th - ih) / 2, iw, ih);
        g.restore();
      } else {
        drawText(g, '불러오는 중', x + CARD_W / 2, y + 12 + th / 2, {
          font: FONTS.small,
          color: 'rgba(255,255,255,0.55)',
        });
      }
      drawText(g, stage.name, x + CARD_W / 2, y + CARD_H - 60, {
        font: FONTS.body,
        color: selected ? COLORS.accent : COLORS.text,
      });

      if (selected) {
        fillRoundRect(g, x - 10, y - 10, CARD_W + 20, CARD_H + 20, 28, null, COLORS.accent, 6);
      }
    });

    drawText(g, '좌우 이동 · 확인 선택 · 취소 뒤로', width / 2, 900, {
      font: FONTS.small,
      color: COLORS.textDim,
    });
  }
}
