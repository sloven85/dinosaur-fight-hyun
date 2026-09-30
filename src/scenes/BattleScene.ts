import {
  BASE_MOVE_SPEED,
  GRAVITY,
  JUMP_VELOCITY,
  ROUND_SECONDS,
} from '../core/constants';
import type { GameContext } from '../core/GameContext';
import { getCharacter, getStage, type CharacterData } from '../data';
import { PLAYERS, type InputManager, type PlayerIndex } from '../input/InputManager';
import { BaseScene } from './BaseScene';
import { ResultScene } from './ResultScene';
import { drawText, fillRoundRect } from '../ui/draw';
import { COLORS, FONTS } from '../ui/theme';

const ARENA_LEFT = 170;
const ARENA_RIGHT = 1750;
const MIN_GAP = 150;

const MAX_METER = 100;
const START_METER = 50;

interface Fighter {
  readonly player: PlayerIndex;
  readonly data: CharacterData;
  x: number;
  y: number;
  vy: number;
  onGround: boolean;
  facing: 1 | -1;
  crouching: boolean;
  readonly health: number;
  readonly meter: number;
}

/**
 * 대전 화면 골격. 실제 전투(공격·가드·판정·게이지)는 계획서 16절 프롬프트 2에서 붙인다.
 * 지금은 두 플레이어의 좌우 이동·점프·웅크리기와 HUD·타이머만 동작한다.
 */
export class BattleScene extends BaseScene {
  readonly pausable = true;

  private timer = ROUND_SECONDS;
  private fighters!: [Fighter, Fighter];

  enter(context: GameContext): void {
    super.enter(context);
    this.timer = ROUND_SECONDS;
    this.fighters = [
      createFighter(0, context.session.characters[0], 560, 1),
      createFighter(1, context.session.characters[1], 1360, -1),
    ];
  }

  protected tick(dt: number): void {
    const session = this.context.session;

    for (const player of PLAYERS) {
      // 2P가 CPU인 경우는 프롬프트 5에서 AIController로 채운다.
      if (session.mode === 'cpu' && player === 1) continue;
      updateMovement(this.fighters[player], this.context.input, dt);
    }

    updateFacing(this.fighters[0], this.fighters[1]);
    separate(this.fighters[0], this.fighters[1]);

    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0;
      // 프롬프트 2에서 남은 체력 비율로 승패를 판정한다. 지금은 1P 승리로 연결만 확인한다.
      this.context.setScene(new ResultScene(0));
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

    for (const fighter of this.fighters) {
      renderFighter(g, fighter, stage.groundY);
    }

    this.renderHud(g, width);

    drawText(g, '이동·점프만 동작합니다 · 전투는 다음 단계에서 구현', width / 2, height - 40, {
      font: FONTS.small,
      color: COLORS.textDim,
    });
  }

  private renderHud(g: CanvasRenderingContext2D, width: number): void {
    const barW = 700;
    const barH = 42;

    renderBar(g, 60, 60, barW, barH, this.fighters[0].health / this.fighters[0].data.baseHealth, COLORS.health, false);
    renderBar(
      g,
      width - 60 - barW,
      60,
      barW,
      barH,
      this.fighters[1].health / this.fighters[1].data.baseHealth,
      COLORS.health,
      true,
    );

    drawText(g, `${Math.ceil(this.timer)}`, width / 2, 84, { font: FONTS.heading, color: COLORS.text });

    for (const fighter of this.fighters) {
      const isP1 = fighter.player === 0;
      const meterX = isP1 ? 60 : width - 60 - 480;
      renderBar(g, meterX, 118, 480, 18, fighter.meter / MAX_METER, COLORS.meter, !isP1);
    }

    drawText(g, '1P', 60, 190, { font: FONTS.small, color: COLORS.p1, align: 'left' });
    drawText(g, '2P', width - 60, 190, { font: FONTS.small, color: COLORS.p2, align: 'right' });
  }
}

function createFighter(
  player: PlayerIndex,
  characterId: string,
  x: number,
  facing: 1 | -1,
): Fighter {
  const data = getCharacter(characterId);
  return {
    player,
    data,
    x,
    y: 0,
    vy: 0,
    onGround: true,
    facing,
    crouching: false,
    health: data.baseHealth,
    meter: START_METER,
  };
}

function updateMovement(fighter: Fighter, input: InputManager, dt: number): void {
  const speed = BASE_MOVE_SPEED * fighter.data.speedScale;
  const player = fighter.player;

  fighter.crouching = fighter.onGround && input.isHeld(player, 'down');

  let direction = 0;
  if (input.isHeld(player, 'left')) direction -= 1;
  if (input.isHeld(player, 'right')) direction += 1;
  if (fighter.crouching) direction = 0;

  fighter.x += direction * speed * dt;

  if (fighter.onGround && input.isPressed(player, 'up')) {
    fighter.vy = JUMP_VELOCITY;
    fighter.onGround = false;
  }

  if (!fighter.onGround) {
    fighter.vy += GRAVITY * dt;
    fighter.y += fighter.vy * dt;
    if (fighter.y >= 0) {
      fighter.y = 0;
      fighter.vy = 0;
      fighter.onGround = true;
    }
  }

  fighter.x = clamp(fighter.x, ARENA_LEFT, ARENA_RIGHT);
}

function updateFacing(a: Fighter, b: Fighter): void {
  if (a.x === b.x) return;
  a.facing = a.x < b.x ? 1 : -1;
  b.facing = b.x < a.x ? 1 : -1;
}

function separate(a: Fighter, b: Fighter): void {
  const gap = Math.abs(a.x - b.x);
  if (gap >= MIN_GAP) return;
  const push = (MIN_GAP - gap) / 2;
  if (a.x <= b.x) {
    a.x = clamp(a.x - push, ARENA_LEFT, ARENA_RIGHT);
    b.x = clamp(b.x + push, ARENA_LEFT, ARENA_RIGHT);
  } else {
    a.x = clamp(a.x + push, ARENA_LEFT, ARENA_RIGHT);
    b.x = clamp(b.x - push, ARENA_LEFT, ARENA_RIGHT);
  }
}

function renderFighter(g: CanvasRenderingContext2D, fighter: Fighter, groundY: number): void {
  const height = fighter.data.displayHeight * (fighter.crouching ? 0.75 : 1);
  const bodyW = height * 0.62;
  const feetY = groundY + fighter.y;
  const x = fighter.x - bodyW / 2;
  const y = feetY - height;

  fillRoundRect(g, x, y, bodyW, height, 26, fighter.data.color, 'rgba(0, 0, 0, 0.35)', 4);

  const eyeX = fighter.facing === 1 ? x + bodyW * 0.72 : x + bodyW * 0.28;
  g.beginPath();
  g.arc(eyeX, y + height * 0.18, 12, 0, Math.PI * 2);
  g.fillStyle = '#ffffff';
  g.fill();

  drawText(g, fighter.data.name, fighter.x, y - 34, { font: FONTS.small, color: COLORS.text });
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
  const clamped = clamp(ratio, 0, 1);
  fillRoundRect(g, x, y, w, h, h / 2, COLORS.healthBack, null);
  const fillW = w * clamped;
  if (fillW > 0) {
    fillRoundRect(g, mirrored ? x + w - fillW : x, y, fillW, h, h / 2, color, null);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
