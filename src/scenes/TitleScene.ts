import type { GameContext } from '../core/GameContext';
import { STAGES } from '../data';
import { preloadStages } from '../rendering/stageRenderer';
import { BaseScene } from './BaseScene';
import { ModeScene } from './ModeScene';
import { SettingsScene } from './SettingsScene';
import { drawButton, drawText } from '../ui/draw';
import { moveListIndex } from '../ui/menu';
import { COLORS, FONTS } from '../ui/theme';

interface TitleOption {
  label: string;
  run: () => void;
}

/** 계획서 1절 시작 화면. 시작·어른 설정, 그리고 소리가 막혔을 때 소리 켜기 버튼. */
export class TitleScene extends BaseScene {
  private elapsed = 0;
  private index = 0;

  enter(context: GameContext): void {
    super.enter(context);
    this.elapsed = 0;
    context.audio.playBgm('title');
    // 경기장 배경·썸네일을 미리 받아 둔다(대전 시작 때 배경이 늦게 뜨지 않게).
    void preloadStages(context.assets, STAGES);
    void context.assets.loadImages(STAGES.map((s) => s.thumbnailPath));
  }

  private get options(): TitleOption[] {
    const items: TitleOption[] = [
      { label: '시작', run: () => this.context.setScene(new ModeScene()) },
      { label: '어른 설정', run: () => this.context.setScene(new SettingsScene()) },
    ];
    // 계획서 2절: 브라우저가 소리를 막으면 큰 "소리 켜기" 버튼을 보여 준다.
    if (this.context.audio.needsUnlock) {
      items.push({
        label: this.context.audio.hasSources ? '소리 켜기' : '소리 켜기 (음원 없음)',
        run: () => this.context.audio.unlock(),
      });
    }
    return items;
  }

  protected tick(dt: number): void {
    this.elapsed += dt;
    const input = this.context.input;
    const options = this.options;
    if (this.index >= options.length) this.index = 0;

    if (input.anyPressed('up')) this.index = moveListIndex(this.index, options.length, -1);
    if (input.anyPressed('down')) this.index = moveListIndex(this.index, options.length, 1);
    if (input.anyPressed('confirm')) options[this.index].run();
  }

  render(g: CanvasRenderingContext2D, width: number, height: number): void {
    g.fillStyle = COLORS.bg;
    g.fillRect(0, 0, width, height);

    drawText(g, '다이노 파이터즈', width / 2, 190, { font: FONTS.title, color: COLORS.text });
    drawText(g, 'Dino Fighters', width / 2, 290, { font: FONTS.heading, color: COLORS.textDim });

    const options = this.options;
    options.forEach((option, index) => {
      const y = 400 + index * 140;
      const selected = index === this.index;
      const pulse = selected ? 0.85 + 0.15 * Math.sin(this.elapsed * 4) : 1;
      g.globalAlpha = pulse;
      drawButton(g, width / 2 - 240, y, 480, 110, option.label, selected);
      g.globalAlpha = 1;
    });

    // 패드 상태 안내: 브라우저는 페이지에서 패드 버튼을 한 번 눌러야 패드를 보여 준다.
    const input = this.context.input;
    const seen = input.connectedPadCount;
    const padHint = input.padBlocked
      ? '이 화면에서는 브라우저가 패드를 막았습니다 · 게임 주소를 새 탭에서 직접 열어 주세요'
      : seen === 0
        ? '패드: 아직 안 보임 · 패드 아무 버튼이나 한 번 눌러 주세요'
        : `패드 ${seen}개 보임 · 아래쪽 얼굴 버튼(A/×)을 누르면 참가합니다`;
    drawText(g, padHint, width / 2, 860, {
      font: FONTS.body,
      color: input.padBlocked ? '#ff8a7a' : COLORS.textDim,
    });

    const p1 = this.context.input.padIndex(0);
    const p2 = this.context.input.padIndex(1);
    drawText(g, `1P 패드  ${padLabel(p1)}`, width / 2 - 280, 920, {
      font: FONTS.small,
      color: COLORS.p1,
    });
    drawText(g, `2P 패드  ${padLabel(p2)}`, width / 2 + 280, 920, {
      font: FONTS.small,
      color: COLORS.p2,
    });

    const sound = this.soundLabel();
    drawText(g, `위아래 이동 · 확인 F(1P)/J(2P) · 일시정지 1·2(1P)/9·0(2P)/Esc · ${sound}`, width / 2, 1000, {
      font: FONTS.small,
      color: COLORS.textDim,
    });
  }

  private soundLabel(): string {
    const audio = this.context.audio;
    if (audio.needsUnlock) return '소리 대기 중';
    if (audio.readySourceCount === 0) return '무음(음원 없음)';
    return '소리 켜짐';
  }
}

function padLabel(index: number | null): string {
  return index === null ? '미참가' : `참가 (index ${index})`;
}
