import type { PlayerIndex } from '../input/InputManager';
import { BaseScene } from './BaseScene';
import { BattleScene } from './BattleScene';
import { CharacterSelectScene } from './CharacterSelectScene';
import { TitleScene } from './TitleScene';
import { drawButton, drawText } from '../ui/draw';
import { moveListIndex } from '../ui/menu';
import { COLORS, FONTS } from '../ui/theme';

interface ResultOption {
  label: string;
  run: () => void;
}

export class ResultScene extends BaseScene {
  private index = 0;

  constructor(private readonly winner: PlayerIndex | null) {
    super();
  }

  private get options(): ResultOption[] {
    return [
      { label: '다시 할래', run: () => this.context.setScene(new BattleScene()) },
      { label: '공룡 바꾸기', run: () => this.context.setScene(new CharacterSelectScene()) },
      { label: '처음으로', run: () => this.context.setScene(new TitleScene()) },
    ];
  }

  protected tick(_dt: number): void {
    const input = this.context.input;
    const options = this.options;

    if (input.anyPressed('up')) this.index = moveListIndex(this.index, options.length, -1);
    if (input.anyPressed('down')) this.index = moveListIndex(this.index, options.length, 1);
    if (input.anyPressed('confirm')) {
      options[this.index].run();
    }
  }

  render(g: CanvasRenderingContext2D, width: number, height: number): void {
    g.fillStyle = COLORS.bg;
    g.fillRect(0, 0, width, height);

    drawText(g, winnerLabel(this.winner), width / 2, 220, {
      font: FONTS.title,
      color: this.winner === null ? COLORS.textDim : this.winner === 0 ? COLORS.p1 : COLORS.p2,
    });

    const options = this.options;
    options.forEach((option, index) => {
      const y = 420 + index * 160;
      drawButton(g, width / 2 - 320, y, 640, 120, option.label, index === this.index);
    });

    drawText(g, '위아래 이동 · 확인 선택', width / 2, 1010, {
      font: FONTS.small,
      color: COLORS.textDim,
    });
  }
}

function winnerLabel(winner: PlayerIndex | null): string {
  if (winner === null) return '무승부';
  return `${winner + 1}P 승리`;
}
