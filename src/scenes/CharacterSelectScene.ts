import { CHARACTERS, type CharacterData } from '../data';
import { PLAYERS } from '../input/InputManager';
import { BaseScene } from './BaseScene';
import { ModeScene } from './ModeScene';
import { StageSelectScene } from './StageSelectScene';
import { drawText, fillRoundRect } from '../ui/draw';
import { moveGridIndex } from '../ui/menu';
import { COLORS, FONTS } from '../ui/theme';

const ROWS = 3;
const COLS = 4;
const CELL_COUNT = ROWS * COLS;

const CELL_W = 240;
const CELL_H = 180;
const GAP_X = 28;
const GAP_Y = 24;
const GRID_Y = 220;

interface PlayerPick {
  cursor: number;
  locked: boolean;
}

/** 계획서 1절: 3행 4열 공룡 카드, 1P와 2P 표시. */
export class CharacterSelectScene extends BaseScene {
  private readonly picks: [PlayerPick, PlayerPick] = [
    { cursor: 0, locked: false },
    { cursor: 1, locked: false },
  ];
  private cpuTimer = 0;
  private cpuPicked = false;

  protected tick(dt: number): void {
    const input = this.context.input;
    const session = this.context.session;
    const anyLocked = this.picks[0].locked || this.picks[1].locked;

    if (input.anyPressed('cancel')) {
      if (anyLocked) {
        this.resetPicks();
      } else {
        this.context.setScene(new ModeScene());
      }
      return;
    }

    for (const player of PLAYERS) {
      if (session.mode === 'cpu' && player === 1) continue;
      const pick = this.picks[player];
      if (pick.locked) continue;

      if (input.isPressed(player, 'left')) pick.cursor = moveGridIndex(pick.cursor, ROWS, COLS, 'left');
      if (input.isPressed(player, 'right')) pick.cursor = moveGridIndex(pick.cursor, ROWS, COLS, 'right');
      if (input.isPressed(player, 'up')) pick.cursor = moveGridIndex(pick.cursor, ROWS, COLS, 'up');
      if (input.isPressed(player, 'down')) pick.cursor = moveGridIndex(pick.cursor, ROWS, COLS, 'down');

      if (input.isPressed(player, 'confirm')) {
        const character = CHARACTERS[pick.cursor];
        if (character) {
          session.characters[player] = character.id;
          pick.locked = true;
        }
      }
    }

    if (session.mode === 'cpu' && this.picks[0].locked && !this.cpuPicked) {
      this.cpuTimer += dt;
      if (this.cpuTimer >= 0.6) {
        const choice = pickCpuCharacter(this.picks[0].cursor);
        session.characters[1] = choice.id;
        this.picks[1].cursor = CHARACTERS.indexOf(choice);
        this.picks[1].locked = true;
        this.cpuPicked = true;
      }
    }

    if (this.picks[0].locked && this.picks[1].locked) {
      this.context.setScene(new StageSelectScene());
    }
  }

  render(g: CanvasRenderingContext2D, width: number, height: number): void {
    g.fillStyle = COLORS.bg;
    g.fillRect(0, 0, width, height);

    drawText(g, '공룡을 고르세요', width / 2, 120, { font: FONTS.heading, color: COLORS.text });

    const gridW = COLS * CELL_W + (COLS - 1) * GAP_X;
    const x0 = (width - gridW) / 2;

    for (let i = 0; i < CELL_COUNT; i++) {
      const x = x0 + (i % COLS) * (CELL_W + GAP_X);
      const y = GRID_Y + Math.floor(i / COLS) * (CELL_H + GAP_Y);
      const character = CHARACTERS[i];

      if (character) {
        fillRoundRect(g, x, y, CELL_W, CELL_H, 18, character.color, COLORS.panelBorder, 3);
        g.beginPath();
        g.arc(x + CELL_W / 2, y + 62, 46, 0, Math.PI * 2);
        g.fillStyle = 'rgba(255, 255, 255, 0.22)';
        g.fill();
        drawText(g, character.name, x + CELL_W / 2, y + CELL_H - 42, {
          font: FONTS.small,
          color: '#ffffff',
        });
      } else {
        fillRoundRect(g, x, y, CELL_W, CELL_H, 18, COLORS.locked, COLORS.panelBorder, 2);
        drawText(g, '준비 중', x + CELL_W / 2, y + CELL_H / 2, {
          font: FONTS.small,
          color: COLORS.textDim,
        });
      }

      if (this.picks[0].cursor === i) {
        fillRoundRect(g, x - 8, y - 8, CELL_W + 16, CELL_H + 16, 22, null, COLORS.p1, 6);
      }
      if (this.picks[1].cursor === i) {
        fillRoundRect(g, x - 16, y - 16, CELL_W + 32, CELL_H + 32, 26, null, COLORS.p2, 6);
      }
    }

    this.renderStatus(g, width);
  }

  private renderStatus(g: CanvasRenderingContext2D, width: number): void {
    const hovered = CHARACTERS[this.picks[0].cursor];
    if (hovered) {
      drawText(g, `${hovered.name} · ${hovered.description}`, width / 2, 890, {
        font: FONTS.body,
        color: COLORS.text,
      });
      drawText(g, statLine(hovered), width / 2, 940, { font: FONTS.small, color: COLORS.textDim });
    }

    drawText(g, `1P ${lockLabel(this.picks[0])}`, width / 2 - 280, 1010, {
      font: FONTS.small,
      color: COLORS.p1,
    });
    drawText(g, `2P ${lockLabel(this.picks[1])}`, width / 2 + 280, 1010, {
      font: FONTS.small,
      color: COLORS.p2,
    });
    drawText(g, '좌우·상하 이동 · 확인 선택 · 취소 뒤로', width / 2, 1055, {
      font: FONTS.small,
      color: COLORS.textDim,
    });
  }

  private resetPicks(): void {
    for (const pick of this.picks) pick.locked = false;
    this.cpuPicked = false;
    this.cpuTimer = 0;
  }
}

function lockLabel(pick: PlayerPick): string {
  const character = CHARACTERS[pick.cursor];
  if (pick.locked && character) return `확정 · ${character.name}`;
  return '고르는 중';
}

function statLine(character: CharacterData): string {
  return `빠름 ${character.speedScale.toFixed(2)}   힘 ${character.damageScale.toFixed(2)}   단단함 ${character.baseHealth}`;
}

function pickCpuCharacter(excludeIndex: number): CharacterData {
  const others = CHARACTERS.filter((_, index) => index !== excludeIndex);
  const pool = others.length > 0 ? others : CHARACTERS;
  return pool[Math.floor(Math.random() * pool.length)];
}
