import { MAX_METER, ROUNDS_TO_WIN } from '../core/constants';
import type { GameContext } from '../core/GameContext';
import { getStage } from '../data';
import { Match } from '../combat/Match';
import type { Fighter } from '../combat/Fighter';
import type { Rect } from '../combat/types';
import { renderFighter } from '../rendering/FighterRenderer';
import type { CharacterAssets } from '../rendering/CharacterAssets';
import { BaseScene } from './BaseScene';
import { ResultScene } from './ResultScene';
import { drawText, fillRoundRect } from '../ui/draw';
import { COLORS, FONTS } from '../ui/theme';

const HUD_BAR_W = 700;
const HUD_BAR_H = 42;

/** 계획서 16절 프롬프트 2·3: 대전 화면. 전투 규칙은 Match, 보이는 모양은 FighterRenderer가 맡는다. */
export class BattleScene extends BaseScene {
  readonly pausable = true;

  private match!: Match;
  private debugBoxes = false;
  private elapsed = 0;

  constructor(private readonly characterAssets: [CharacterAssets, CharacterAssets] | null = null) {
    super();
  }

  enter(context: GameContext): void {
    super.enter(context);
    const { session } = context;
    this.elapsed = 0;
    this.match = this.characterAssets
      ? new Match(session.mode, session.characters, this.characterAssets)
      : new Match(session.mode, session.characters);
  }

  protected tick(dt: number): void {
    const input = this.context.input;
    this.elapsed += dt;

    if (input.consumeDebugToggle()) this.debugBoxes = !this.debugBoxes;

    this.match.step(input, dt);

    if (this.match.phase === 'matchOver') {
      this.context.setScene(new ResultScene(this.match.matchWinner, this.characterAssets));
    }
  }

  render(g: CanvasRenderingContext2D, width: number, height: number): void {
    const stage = getStage(this.context.session.stage);

    g.fillStyle = stage.placeholderColor;
    g.fillRect(0, 0, width, height);

    g.fillStyle = 'rgba(0, 0, 0, 0.28)';
    g.fillRect(0, stage.groundY, width, height - stage.groundY);
    g.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(0, stage.groundY);
    g.lineTo(width, stage.groundY);
    g.stroke();

    for (const fighter of this.match.fighters) {
      renderFighter(g, fighter, stage.groundY, this.elapsed);
    }

    this.renderHud(g, width);
    this.renderRoundText(g, width, height);

    if (this.debugBoxes) {
      this.renderDebugBoxes(g, stage.groundY);
      drawText(g, 'F3: 판정 상자 표시', width / 2, height - 40, {
        font: FONTS.small,
        color: COLORS.textDim,
      });
    }
  }

  // --- HUD ---

  private renderHud(g: CanvasRenderingContext2D, width: number): void {
    const [p1, p2] = this.match.fighters;

    renderBar(g, 60, 60, HUD_BAR_W, HUD_BAR_H, p1.health / p1.data.baseHealth, COLORS.health, false);
    renderBar(
      g,
      width - 60 - HUD_BAR_W,
      60,
      HUD_BAR_W,
      HUD_BAR_H,
      p2.health / p2.data.baseHealth,
      COLORS.health,
      true,
    );

    drawText(g, `${this.match.timeLeftSeconds}`, width / 2, 84, {
      font: FONTS.heading,
      color: COLORS.text,
    });

    this.renderRoundPips(g, 60, 118, false, p1.roundWins);
    this.renderRoundPips(g, width - 60, 118, true, p2.roundWins);

    this.renderMeter(g, 60, 160, p1.meter, p1.specialFlashFrames > 0, false);
    this.renderMeter(g, width - 60 - 480, 160, p2.meter, p2.specialFlashFrames > 0, true);

    drawText(g, '1P', 60, 256, { font: FONTS.small, color: COLORS.p1, align: 'left' });
    drawText(g, '2P', width - 60, 256, { font: FONTS.small, color: COLORS.p2, align: 'right' });
  }

  private renderRoundPips(
    g: CanvasRenderingContext2D,
    x: number,
    y: number,
    right: boolean,
    wins: number,
  ): void {
    for (let i = 0; i < ROUNDS_TO_WIN; i++) {
      const cx = right ? x - i * 34 : x + i * 34;
      g.beginPath();
      g.arc(cx, y, 12, 0, Math.PI * 2);
      g.fillStyle = i < wins ? COLORS.accent : COLORS.healthBack;
      g.fill();
    }
  }

  private renderMeter(
    g: CanvasRenderingContext2D,
    x: number,
    y: number,
    meter: number,
    flash: boolean,
    right: boolean,
  ): void {
    const full = meter >= MAX_METER;
    const color = flash && !full ? '#ffffff' : full ? COLORS.accent : COLORS.meter;
    renderBar(g, x, y, 480, 18, meter / MAX_METER, color, right);
    if (full) {
      drawText(g, '특수기 준비', right ? x + 480 - 90 : x + 90, y + 44, {
        font: FONTS.small,
        color: COLORS.accent,
      });
    }
  }

  // --- 라운드 연출 ---

  private renderRoundText(g: CanvasRenderingContext2D, width: number, height: number): void {
    const { phase, phaseFrames } = this.match;

    if (phase === 'intro') {
      const label = phaseFrames < 60 ? `라운드 ${this.match.roundNumber}` : '시작!';
      drawText(g, label, width / 2, height / 2 - 120, { font: FONTS.title, color: COLORS.accent });
      return;
    }

    if (phase === 'roundOver') {
      const label =
        this.match.roundWinner === null ? '무승부' : `${this.match.roundWinner + 1}P 라운드 승리`;
      drawText(g, label, width / 2, height / 2 - 140, { font: FONTS.heading, color: COLORS.text });
      return;
    }

    if (phase === 'matchOver') {
      const label = this.match.matchWinner === null ? '무승부' : `${this.match.matchWinner + 1}P 승리`;
      drawText(g, label, width / 2, height / 2 - 140, { font: FONTS.heading, color: COLORS.text });
    }
  }

  // --- 개발용 판정 상자 ---

  private renderDebugBoxes(g: CanvasRenderingContext2D, groundY: number): void {
    for (const fighter of this.match.fighters) {
      drawBox(g, shift(fighter.hurtbox(), groundY), '#4dabf7');
      for (const box of fighter.activeHitboxes()) {
        drawBox(g, shift(box, groundY), '#ff6b6b');
      }
    }
  }
}

/** 판정 상자는 지면 기준 y라서 화면 좌표로 옮겨 그린다. */
function shift(box: Rect, groundY: number): Rect {
  return { left: box.left, right: box.right, top: box.top + groundY, bottom: box.bottom + groundY };
}

function drawBox(g: CanvasRenderingContext2D, box: Rect, color: string): void {
  g.strokeStyle = color;
  g.lineWidth = 3;
  g.strokeRect(box.left, box.top, box.right - box.left, box.bottom - box.top);
}

function renderBar(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  ratio: number,
  color: string,
  mirrored: boolean,
): void {
  const clamped = Math.min(1, Math.max(0, ratio));
  fillRoundRect(g, x, y, w, h, h / 2, COLORS.healthBack, null);
  const fillW = w * clamped;
  if (fillW > 0) {
    fillRoundRect(g, mirrored ? x + w - fillW : x, y, fillW, h, h / 2, color, null);
  }
}

export type { Fighter };
