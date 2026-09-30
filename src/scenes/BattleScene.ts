import { MAX_METER, ROUNDS_TO_WIN } from '../core/constants';
import type { GameContext } from '../core/GameContext';
import { getStage } from '../data';
import { Match } from '../combat/Match';
import type { Fighter } from '../combat/Fighter';
import { attackPhase, type Rect } from '../combat/types';
import { BaseScene } from './BaseScene';
import { ResultScene } from './ResultScene';
import { drawText, fillRoundRect } from '../ui/draw';
import { COLORS, FONTS } from '../ui/theme';

const HUD_BAR_W = 700;
const HUD_BAR_H = 42;

/** 계획서 16절 프롬프트 2: 대전 화면. 전투 규칙은 Match가 담당한다. */
export class BattleScene extends BaseScene {
  readonly pausable = true;

  private match!: Match;
  private debugBoxes = false;

  enter(context: GameContext): void {
    super.enter(context);
    const { session } = context;
    this.match = new Match(session.mode, session.characters);
  }

  protected tick(dt: number): void {
    const input = this.context.input;

    if (input.consumeDebugToggle()) this.debugBoxes = !this.debugBoxes;

    this.match.step(input, dt);

    if (this.match.phase === 'matchOver') {
      this.context.setScene(new ResultScene(this.match.matchWinner));
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
      this.renderFighter(g, fighter, stage.groundY);
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

  // --- 캐릭터 ---

  private renderFighter(g: CanvasRenderingContext2D, fighter: Fighter, groundY: number): void {
    const down = fighter.state === 'down';
    const height = fighter.bodyHeight * (down ? 0.4 : 1);
    const bodyW = fighter.bodyWidth * (down ? 1.4 : 1);
    const feetY = groundY + fighter.y;

    const lean =
      fighter.state === 'attack'
        ? attackPhase(fighter.attack!.move, fighter.attack!.frame) === 'active'
          ? 26
          : 12
        : fighter.state === 'hit'
          ? -18
          : 0;

    const x = fighter.x - bodyW / 2 + fighter.facing * lean;
    const y = feetY - height;

    if (fighter.state === 'attack') this.renderAttackArc(g, fighter);

    const outline =
      fighter.invulnFrames > 0 ? '#ffffff' : fighter.state === 'hit' ? '#ffd166' : 'rgba(0, 0, 0, 0.35)';
    fillRoundRect(g, x, y, bodyW, height, down ? 40 : 26, fighter.data.color, outline, 4);

    if (!down) {
      const eyeX = fighter.facing === 1 ? x + bodyW * 0.72 : x + bodyW * 0.28;
      g.beginPath();
      g.arc(eyeX, y + height * 0.18, 12, 0, Math.PI * 2);
      g.fillStyle = '#ffffff';
      g.fill();
    }

    drawText(g, fighter.data.name, fighter.x, y - 34, { font: FONTS.small, color: COLORS.text });
  }

  /** 판정과 분리된 시각 연출. 실제 피해는 Match가 판정한다(연출 강화는 프롬프트 6). */
  private renderAttackArc(g: CanvasRenderingContext2D, fighter: Fighter): void {
    if (!fighter.attack) return;
    if (attackPhase(fighter.attack.move, fighter.attack.frame) !== 'active') return;

    const box = fighter.activeHitboxes()[0];
    if (!box) return;

    g.save();
    g.globalAlpha = 0.35;
    g.fillStyle = fighter.attack.move.kind === 'special' ? COLORS.accent : '#ffffff';
    g.beginPath();
    g.ellipse(
      (box.left + box.right) / 2,
      (box.top + box.bottom) / 2,
      (box.right - box.left) / 2,
      (box.bottom - box.top) / 2,
      0,
      0,
      Math.PI * 2,
    );
    g.fill();
    g.restore();
  }

  // --- HUD ---

  private renderHud(g: CanvasRenderingContext2D, width: number): void {
    const [p1, p2] = this.match.fighters;

    renderBar(
      g,
      60,
      60,
      HUD_BAR_W,
      HUD_BAR_H,
      p1.health / p1.data.baseHealth,
      COLORS.health,
      false,
    );
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
      const hurt = fighter.hurtbox();
      drawBox(g, shift(hurt, groundY), '#4dabf7');
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
