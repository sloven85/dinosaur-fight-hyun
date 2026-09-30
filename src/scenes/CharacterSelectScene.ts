import type { GameContext } from '../core/GameContext';
import { CHARACTERS, getMove, type CharacterData } from '../data';
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
const GRID_Y = 210;

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
  private readonly portraits = new Map<string, HTMLImageElement>();
  /** rig의 마스터까지 준비된 캐릭터. 나머지는 임시 도형으로 표시한다(계획서 16절 프롬프트 4). */
  private readonly readyIds = new Set<string>();

  enter(context: GameContext): void {
    super.enter(context);
    void this.preloadPortraits(context);
  }

  private async preloadPortraits(context: GameContext): Promise<void> {
    await Promise.all(
      CHARACTERS.map(async (character) => {
        const rig = await context.assets.loadJson<{
          portrait?: { usable?: boolean };
          master?: { usable?: boolean };
        }>(character.rigPath);
        if (rig?.master?.usable === true) this.readyIds.add(character.id);
        if (rig?.portrait?.usable === false) return;
        const image = await context.assets.loadImage(character.portraitPath);
        if (image) this.portraits.set(character.id, image);
      }),
    );
  }

  protected tick(dt: number): void {
    const input = this.context.input;
    const session = this.context.session;
    const anyLocked = this.picks[0].locked || this.picks[1].locked;

    // 계획서 2절 어른용 설정. 선택 화면에서만 쓰는 약·강공격 버튼으로 난이도·도움 설정을 바꾼다.
    // (확인·취소와 겹치지 않게 light·heavy를 쓰고, 2인 대전에서도 값을 저장해 둔다.)
    if (input.anyPressed('heavy')) this.context.settings.cycleDifficulty();
    if (input.anyPressed('light')) this.context.settings.toggleAssist();

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

    drawText(g, '공룡을 고르세요', width / 2, 110, { font: FONTS.heading, color: COLORS.text });

    const gridW = COLS * CELL_W + (COLS - 1) * GAP_X;
    const x0 = (width - gridW) / 2;

    for (let i = 0; i < CELL_COUNT; i++) {
      const x = x0 + (i % COLS) * (CELL_W + GAP_X);
      const y = GRID_Y + Math.floor(i / COLS) * (CELL_H + GAP_Y);
      const character = CHARACTERS[i];

      if (character) {
        this.renderCard(g, x, y, character);
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

    this.renderSettingsPanel(g);
    this.renderStatus(g, width);
  }

  /**
   * 계획서 2절: 난이도와 도움 설정 상태를 선택 화면에 명확히 보여 준다.
   * 카드·HUD와 섞이지 않도록 왼쪽 위에 별도 판으로 둔다(C3).
   */
  private renderSettingsPanel(g: CanvasRenderingContext2D): void {
    const settings = this.context.settings.value;
    const cpuMode = this.context.session.mode === 'cpu';
    const x = 40;
    const y = 40;
    const w = 380;
    const h = cpuMode ? 176 : 206;

    fillRoundRect(g, x, y, w, h, 18, COLORS.panel, COLORS.panelBorder, 3);
    drawText(g, '어른 설정', x + 24, y + 36, {
      font: FONTS.small,
      color: COLORS.accent,
      align: 'left',
    });

    drawText(
      g,
      `난이도 · ${settings.cpuDifficulty === 'easy' ? '쉬움' : '보통'} (강공격 버튼으로 변경)`,
      x + 24,
      y + 78,
      { font: FONTS.tiny, color: COLORS.text, align: 'left' },
    );
    drawText(
      g,
      `도움 설정 · ${settings.assist ? '켜짐' : '꺼짐'} (약공격 버튼으로 변경)`,
      x + 24,
      y + 114,
      {
        font: FONTS.tiny,
        color: settings.assist ? COLORS.accent : COLORS.textDim,
        align: 'left',
      },
    );
    drawText(g, '1P 체력 1.5배 + CPU 공격 빈도 감소', x + 24, y + 144, {
      font: FONTS.tiny,
      color: COLORS.textDim,
      align: 'left',
    });

    if (!cpuMode) {
      drawText(g, '2인 대전에서는 도움 설정이 적용되지 않습니다', x + 24, y + 178, {
        font: FONTS.tiny,
        color: COLORS.textDim,
        align: 'left',
      });
    }
  }

  private renderCard(g: CanvasRenderingContext2D, x: number, y: number, character: CharacterData): void {
    fillRoundRect(g, x, y, CELL_W, CELL_H, 18, character.color, COLORS.panelBorder, 3);

    const portrait = this.portraits.get(character.id);
    if (portrait) {
      const size = 92;
      g.drawImage(portrait, x + (CELL_W - size) / 2, y + 8, size, size);
    } else {
      // 초상을 아직 못 받았을 때는 보조색 원으로 자리를 잡아 둔다.
      g.beginPath();
      g.arc(x + CELL_W / 2, y + 52, 38, 0, Math.PI * 2);
      g.fillStyle = character.accentColor;
      g.globalAlpha = 0.9;
      g.fill();
      g.globalAlpha = 1;
    }

    drawText(g, character.name, x + CELL_W / 2, y + 112, { font: FONTS.small, color: '#ffffff' });
    drawText(g, character.archetypeLabel, x + CELL_W / 2, y + 142, {
      font: FONTS.tiny,
      color: 'rgba(255, 255, 255, 0.75)',
    });
    if (character.cardNote) {
      drawText(g, character.cardNote, x + CELL_W / 2, y + 164, {
        font: FONTS.tiny,
        color: COLORS.accent,
      });
    }

    // 에셋 준비 상태를 카드마다 명확히 알려 준다.
    const ready = this.readyIds.has(character.id);
    const badgeW = 104;
    fillRoundRect(
      g,
      x + CELL_W - badgeW - 8,
      y + 8,
      badgeW,
      30,
      10,
      ready ? COLORS.accent : 'rgba(0, 0, 0, 0.45)',
      null,
      0,
    );
    drawText(g, ready ? '에셋 준비' : '임시 도형', x + CELL_W - badgeW / 2 - 8, y + 23, {
      font: FONTS.tiny,
      color: ready ? '#101418' : 'rgba(255, 255, 255, 0.85)',
    });
  }

  private renderStatus(g: CanvasRenderingContext2D, width: number): void {
    const hovered = CHARACTERS[this.picks[0].cursor];

    if (hovered) {
      drawText(g, `${hovered.name} · ${hovered.description}`, width / 2, 880, {
        font: FONTS.body,
        color: COLORS.text,
      });

      const row = 930;
      this.renderStat(g, width / 2 - 400, row, '빠름', statLevel(hovered.speedScale, 0.68, 1.24));
      this.renderStat(g, width / 2, row, '힘', statLevel(hovered.damageScale, 0.86, 1.14));
      this.renderStat(g, width / 2 + 400, row, '단단함', statLevel(hovered.baseHealth, 86, 120));

      drawText(g, `특수기 · ${getMove(hovered.moves.special).name}`, width / 2, 975, {
        font: FONTS.small,
        color: COLORS.textDim,
      });
    }

    drawText(g, `1P ${lockLabel(this.picks[0])}`, width / 2 - 300, 1020, {
      font: FONTS.small,
      color: COLORS.p1,
    });
    drawText(g, `2P ${lockLabel(this.picks[1])}`, width / 2 + 300, 1020, {
      font: FONTS.small,
      color: COLORS.p2,
    });
    drawText(g, '좌우·상하 이동 · 확인 선택 · 취소 뒤로', width / 2, 1058, {
      font: FONTS.small,
      color: COLORS.textDim,
    });
  }

  /** 계획서 1절: 빠름·힘·단단함 3개 아이콘. */
  private renderStat(g: CanvasRenderingContext2D, cx: number, y: number, label: string, level: number): void {
    drawText(g, label, cx - 70, y, { font: FONTS.small, color: COLORS.textDim, align: 'right' });
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.arc(cx - 40 + i * 26, y, 9, 0, Math.PI * 2);
      g.fillStyle = i < level ? COLORS.accent : COLORS.healthBack;
      g.fill();
    }
  }

  private resetPicks(): void {
    for (const pick of this.picks) pick.locked = false;
    this.cpuPicked = false;
    this.cpuTimer = 0;
  }
}

function statLevel(value: number, min: number, max: number): number {
  const ratio = (value - min) / (max - min);
  return Math.max(1, Math.min(5, Math.round(1 + ratio * 4)));
}

function lockLabel(pick: PlayerPick): string {
  const character = CHARACTERS[pick.cursor];
  if (pick.locked && character) return `확정 · ${character.name}`;
  return '고르는 중';
}

function pickCpuCharacter(excludeIndex: number): CharacterData {
  const others = CHARACTERS.filter((_, index) => index !== excludeIndex);
  const pool = others.length > 0 ? others : CHARACTERS;
  return pool[Math.floor(Math.random() * pool.length)];
}
