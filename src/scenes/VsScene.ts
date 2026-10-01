import { getCharacter, getStage } from '../data';
import type { GameContext } from '../core/GameContext';
import { loadCharacterAssets, type CharacterAssets } from '../rendering/CharacterAssets';
import { preloadStages } from '../rendering/stageRenderer';
import { BaseScene } from './BaseScene';
import { BattleScene } from './BattleScene';
import { drawText, fillRoundRect } from '../ui/draw';
import { COLORS, FONTS } from '../ui/theme';

const HOLD_SECONDS = 1.8;
const LOAD_TIMEOUT_SECONDS = 10;

/** VS 화면. 이 사이에 두 캐릭터의 스프라이트를 미리 불러온다(계획서 14절 AssetLoader). */
export class VsScene extends BaseScene {
  private elapsed = 0;
  private characterAssets: [CharacterAssets, CharacterAssets] | null = null;
  private disposed = false;

  enter(context: GameContext): void {
    super.enter(context);
    this.elapsed = 0;
    this.characterAssets = null;
    this.disposed = false;
    void this.preload(context);
  }

  exit(): void {
    this.disposed = true;
  }

  private async preload(context: GameContext): Promise<void> {
    const [p1, p2] = context.session.characters;
    // 캐릭터와 함께 고른 경기장 배경도 이 화면에서 다 받아 둔다(대전 첫 화면부터 배경이 보이게).
    const [loaded] = await Promise.all([
      Promise.all([loadCharacterAssets(context.assets, p1), loadCharacterAssets(context.assets, p2)]),
      preloadStages(context.assets, [getStage(context.session.stage)]),
    ]);
    if (this.disposed) return;
    this.characterAssets = loaded;
  }

  protected tick(dt: number): void {
    this.elapsed += dt;
    if (!this.characterAssets && this.elapsed < LOAD_TIMEOUT_SECONDS) return;

    const canSkip = this.elapsed > 0.4 && this.context.input.anyPressed('confirm');
    if (this.elapsed >= HOLD_SECONDS || canSkip) {
      this.context.setScene(new BattleScene(this.characterAssets));
    }
  }

  render(g: CanvasRenderingContext2D, width: number, height: number): void {
    const session = this.context.session;
    const p1 = getCharacter(session.characters[0]);
    const p2 = getCharacter(session.characters[1]);
    const stage = getStage(session.stage);

    g.fillStyle = COLORS.bg;
    g.fillRect(0, 0, width, height);

    this.renderPortrait(g, this.characterAssets?.[0] ?? null, p1.color, 180, 300, 560, 480, COLORS.p1);
    this.renderPortrait(g, this.characterAssets?.[1] ?? null, p2.color, 1180, 300, 560, 480, COLORS.p2);

    drawText(g, p1.name, 460, 840, { font: FONTS.heading, color: COLORS.p1 });
    drawText(g, p2.name, 1460, 840, { font: FONTS.heading, color: COLORS.p2 });

    drawText(g, 'VS', width / 2, 540, { font: FONTS.title, color: COLORS.accent });
    drawText(g, stage.name, width / 2, 920, { font: FONTS.heading, color: COLORS.text });

    const label = this.characterAssets ? '확인 버튼으로 바로 시작' : '캐릭터 준비 중…';
    drawText(g, label, width / 2, 1000, { font: FONTS.small, color: COLORS.textDim });
  }

  private renderPortrait(
    g: CanvasRenderingContext2D,
    assets: CharacterAssets | null,
    color: string,
    x: number,
    y: number,
    w: number,
    h: number,
    border: string,
  ): void {
    fillRoundRect(g, x, y, w, h, 24, color, border, 6);
    const portrait = assets?.portrait;
    if (!portrait) return;

    const size = Math.min(w, h) - 40;
    g.drawImage(portrait, x + (w - size) / 2, y + (h - size) / 2, size, size);
  }
}
