import { getCharacter, getStage } from '../data';
import type { GameContext } from '../core/GameContext';
import { loadCharacterAssets, type CharacterAssets } from '../rendering/CharacterAssets';
import { preloadStages } from '../rendering/stageRenderer';
import { BaseScene } from './BaseScene';
import { BattleScene } from './BattleScene';
import { drawText, fillRoundRect } from '../ui/draw';
import { COLORS, FONTS } from '../ui/theme';

const HOLD_SECONDS = 2.2;
const VS_BG = 'assets/ui/vs_bg.jpg';
const LOAD_TIMEOUT_SECONDS = 10;

/** VS 화면. 이 사이에 두 캐릭터의 스프라이트를 미리 불러온다(계획서 14절 AssetLoader). */
export class VsScene extends BaseScene {
  private elapsed = 0;
  private characterAssets: [CharacterAssets, CharacterAssets] | null = null;
  private disposed = false;

  enter(context: GameContext): void {
    super.enter(context);
    void context.assets.loadImage(VS_BG);
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
    // VS 배경(아티스트 UI, 5168534).
    const bg = this.context.assets.image(VS_BG);
    if (bg) g.drawImage(bg, 0, 0, width, height);

    // 양쪽 초상이 바깥에서 미끄러져 들어온다(0.35초).
    const t = Math.min(1, this.elapsed / 0.35);
    const slide = (1 - Math.pow(1 - t, 3)) * 1;
    this.renderPortrait(g, this.characterAssets?.[0] ?? null, p1.color, 180 - (1 - slide) * 700, 260, 600, 560, COLORS.p1, false);
    this.renderPortrait(g, this.characterAssets?.[1] ?? null, p2.color, 1140 + (1 - slide) * 700, 260, 600, 560, COLORS.p2, true);

    drawText(g, p1.name, 480, 870, { font: FONTS.heading, color: '#ffffff' });
    drawText(g, p2.name, 1440, 870, { font: FONTS.heading, color: '#ffffff' });

    const pop = 1 + Math.max(0, 0.6 - this.elapsed * 2) ;
    g.save();
    g.translate(width / 2, 540);
    g.scale(pop, pop);
    drawText(g, 'VS', 0, 0, { font: 'bold 160px "Noto Sans KR", system-ui, sans-serif', color: COLORS.accent });
    g.restore();
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
    mirror: boolean,
  ): void {
    fillRoundRect(g, x - 8, y - 8, w + 16, h + 16, 30, null, border, 8);
    const portrait = assets?.portrait;
    if (!portrait) {
      fillRoundRect(g, x, y, w, h, 24, color, null, 0);
      return;
    }
    // 정식 초상은 둥근 종 대표색 카드라 그대로 크게. 2P는 마주 보게 뒤집는다.
    const size = Math.min(w, h);
    g.save();
    g.translate(x + w / 2, y + h / 2);
    if (mirror) g.scale(-1, 1);
    g.drawImage(portrait, -size / 2, -size / 2, size, size);
    g.restore();
  }
}
