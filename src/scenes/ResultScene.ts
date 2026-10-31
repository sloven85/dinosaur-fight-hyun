import type { PlayerIndex } from '../input/InputManager';
import type { CharacterAssets } from '../rendering/CharacterAssets';
import { BaseScene } from './BaseScene';
import { BattleScene } from './BattleScene';
import { CharacterSelectScene } from './CharacterSelectScene';
import { TitleScene } from './TitleScene';
import { drawButton, drawText } from '../ui/draw';
import { moveListIndex } from '../ui/menu';
import { COLORS, FONTS } from '../ui/theme';
import { dotUiEnabled } from '../rendering/pixel/pilotFlag';
import { drawResultScreen } from '../rendering/pixel/PixelScreens';
import { PixelBackground } from '../rendering/pixel/PixelBackground';
import { CHARACTERS } from '../data';

interface ResultOption {
  label: string;
  run: () => void;
}

export class ResultScene extends BaseScene {
  /** 캡처 스크립트·진단용 고정 이름(번들에서 클래스 이름이 압축되어도 유지). */
  readonly sceneId = 'ResultScene';
  private index = 0;
  /** 결과 화면 뒤에 깔 경기장 밀림 배경(전투와 같은 레이어·같은 시차). */
  private backdrop: PixelBackground | null = null;

  constructor(
    private readonly winner: PlayerIndex | null,
    private readonly characterAssets: [CharacterAssets, CharacterAssets] | null = null,
  ) {
    super();
  }

  private get options(): ResultOption[] {
    return [
      { label: '다시 할래', run: () => this.context.setScene(new BattleScene(this.characterAssets)) },
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
    if (dotUiEnabled(import.meta.env.DEV, typeof location === 'undefined' ? '' : location.search)) {
      this.backdrop ??= new PixelBackground(this.context.assets);
      const winnerId = this.winner === null ? null : this.context.session.characters[this.winner];
      drawResultScreen(g, {
        loader: this.context.assets,
        winner: this.winner,
        winnerId,
        winnerName: winnerId ? CHARACTERS.find((character) => character.id === winnerId)?.name : undefined,
        options: this.options.map((option) => option.label),
        index: this.index,
        stage: this.context.session.stage,
        background: this.backdrop,
      });
      return;
    }
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
