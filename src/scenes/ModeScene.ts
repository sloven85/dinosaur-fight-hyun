import type { GameMode } from '../core/session';
import { BaseScene } from './BaseScene';
import { CharacterSelectScene } from './CharacterSelectScene';
import { TitleScene } from './TitleScene';
import { drawButton, drawText } from '../ui/draw';
import { moveListIndex } from '../ui/menu';
import { COLORS, FONTS } from '../ui/theme';

interface ModeOption {
  id: GameMode;
  label: string;
  hint: string;
}

const OPTIONS: ModeOption[] = [
  { id: 'cpu', label: '1인 대전', hint: '2P는 컴퓨터가 조종합니다' },
  { id: 'versus', label: '2인 대전', hint: '한 기기에서 두 사람이 겨룹니다' },
];

export class ModeScene extends BaseScene {
  private index = 0;

  protected tick(_dt: number): void {
    const input = this.context.input;

    if (input.anyPressed('cancel')) {
      this.context.setScene(new TitleScene());
      return;
    }
    if (input.anyPressed('up')) this.index = moveListIndex(this.index, OPTIONS.length, -1);
    if (input.anyPressed('down')) this.index = moveListIndex(this.index, OPTIONS.length, 1);
    if (input.anyPressed('confirm')) {
      this.context.session.mode = OPTIONS[this.index].id;
      this.context.setScene(new CharacterSelectScene());
    }
  }

  render(g: CanvasRenderingContext2D, width: number, height: number): void {
    g.fillStyle = COLORS.bg;
    g.fillRect(0, 0, width, height);

    drawText(g, '모드를 고르세요', width / 2, 200, { font: FONTS.heading, color: COLORS.text });

    OPTIONS.forEach((option, index) => {
      const y = 380 + index * 180;
      drawButton(g, width / 2 - 320, y, 640, 120, option.label, index === this.index);
    });

    drawText(g, OPTIONS[this.index].hint, width / 2, 810, {
      font: FONTS.body,
      color: COLORS.accent,
    });

    drawText(g, '위아래 이동 · 확인 선택 · 취소 뒤로', width / 2, 1010, {
      font: FONTS.small,
      color: COLORS.textDim,
    });
  }
}
