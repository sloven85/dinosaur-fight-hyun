import { MAX_METER, ROUNDS_TO_WIN } from '../core/constants';
import type { GameContext } from '../core/GameContext';
import { getStage } from '../data';
import { Match, type Projectile } from '../combat/Match';
import type { Fighter } from '../combat/Fighter';
import { EMOTION_COLORS, EMOTION_LABELS, emotionFor } from '../combat/emotion';
import type { Rect } from '../combat/types';
import { EffectSystem } from '../rendering/effects';
import { renderFighter, setOverlayLoader } from '../rendering/FighterRenderer';
import type { CharacterAssets } from '../rendering/CharacterAssets';
import { sfxIdForEvent } from '../audio/tracks';
import { BaseScene } from './BaseScene';
import { ResultScene } from './ResultScene';
import { drawText, fillRoundRect } from '../ui/draw';
import { COLORS, FONTS } from '../ui/theme';

const HUD_BAR_W = 700;
const HUD_BAR_H = 42;

/** 화면 흔들림: 세기(px)와 지속 프레임. 약하게, 짧게. */
const SHAKE_HEAVY = 9;
const SHAKE_SPECIAL = 14;
const SHAKE_FRAMES = 10;

/** 계획서 16절 프롬프트 6: 대전 화면. 전투 규칙은 Match, 보이는 모양은 FighterRenderer·EffectSystem이 맡는다. */
export class BattleScene extends BaseScene {
  readonly pausable = true;

  private match!: Match;
  private debugBoxes = false;
  private elapsed = 0;
  private readonly effects = new EffectSystem();
  private shakeFrames = 0;
  private shakeStrength = 0;
  private flashFrames = 0;
  private prevPhase = '';

  constructor(private readonly characterAssets: [CharacterAssets, CharacterAssets] | null = null) {
    super();
  }

  enter(context: GameContext): void {
    super.enter(context);
    const { session, settings } = context;
    this.elapsed = 0;
    this.effects.clear();
    this.shakeFrames = 0;
    this.flashFrames = 0;
    this.prevPhase = '';
    // 다시 하기를 눌러 새 경기를 시작할 때도 저장된 난이도·도움 설정을 그대로 다시 읽는다.
    const options = { difficulty: settings.difficulty, assist: settings.assist };
    this.match = this.characterAssets
      ? new Match(session.mode, session.characters, this.characterAssets, options)
      : new Match(session.mode, session.characters, undefined, options);
    context.audio.playBgm('battle');
    setOverlayLoader(context.assets);
  }

  exit(): void {
    this.context.audio.stopBgm();
  }

  protected tick(dt: number): void {
    const input = this.context.input;
    const settings = this.context.settings.value;
    const stage = getStage(this.context.session.stage);
    this.elapsed += dt;

    if (input.consumeDebugToggle()) this.debugBoxes = !this.debugBoxes;

    this.match.step(input, dt);
    this.consumeMatchEvents(stage.groundY, settings.screenShake, settings.vibration);
    this.spawnLandingDust(stage.groundY);
    this.effects.update(dt);
    if (this.shakeFrames > 0) this.shakeFrames -= 1;
    if (this.flashFrames > 0) this.flashFrames -= 1;

    // 라운드 시작 소리(준비 → 라운드 → 시작).
    if (this.match.phase === 'intro' && this.prevPhase !== 'intro') {
      this.context.audio.playSfx('countdown');
    }
    if (this.match.phase === 'roundOver' && this.prevPhase === 'fight') {
      this.onRoundFinished(stage.groundY);
    }
    if (this.match.phase === 'matchOver') {
      this.context.audio.playBgm('victory');
      this.context.setScene(new ResultScene(this.match.matchWinner, this.characterAssets));
      return;
    }
    this.prevPhase = this.match.phase;
  }

  /** Match가 남긴 연출 이벤트를 먼지·별·충격파·소리·진동으로 바꾼다(피해와 무관). */
  private consumeMatchEvents(groundY: number, screenShake: boolean, vibration: boolean): void {
    for (const event of this.match.consumeEvents()) {
      const y = groundY + event.y;
      if (event.type === 'fx') {
        const strength = event.strength ?? 1;
        if (event.fx === 'shake') {
          if (screenShake) this.triggerShake(SHAKE_HEAVY * strength);
        } else if (event.fx === 'dust') {
          this.effects.spawnDust(event.x, y, Math.round(6 * strength), strength);
        } else if (event.fx === 'shockwave') {
          this.effects.spawnShockwave(event.x, y, event.direction);
        } else if (event.fx === 'splash') {
          this.effects.spawnDust(event.x, y, Math.round(8 * strength), strength * 1.2);
        } else if (event.fx === 'slash') {
          this.effects.spawnSlash(event.x, y, event.direction === 1 ? 0.9 : Math.PI - 0.9, 110 * strength);
        } else if (event.fx === 'feathers') {
          this.effects.spawnFeathers(event.x, y, Math.round(6 * strength));
        } else if (event.fx === 'flash') {
          this.flashFrames = Math.max(this.flashFrames, Math.round(3 * strength));
        }
        continue;
      }
      if (event.type === 'stun') {
        this.effects.spawnStars(event.x, y, 3);
        continue;
      }
      if (event.type === 'ko') {
        this.effects.spawnStars(event.x, y, 7);
        this.context.audio.playSfx('ko');
        if (vibration) this.context.input.rumble(event.player, 0.9, 260);
        continue;
      }

      this.effects.spawnHit(event.x, y, {
        kind: event.kind,
        guarded: event.type === 'guard',
        direction: event.direction,
      });
      this.context.audio.playSfx(sfxIdForEvent(event));

      if (vibration) {
        const special = event.kind === 'special';
        this.context.input.rumble(event.player, special ? 0.8 : 0.45, special ? 180 : 90);
      }
      if (screenShake && event.type === 'hit' && (event.kind === 'heavy' || event.kind === 'special')) {
        this.triggerShake(event.kind === 'special' ? SHAKE_SPECIAL : SHAKE_HEAVY);
      }
      if (event.type === 'hit' && event.kind === 'special') this.flashFrames = 4;
    }
  }

  private spawnLandingDust(groundY: number): void {
    for (const fighter of this.match.fighters) {
      if (!fighter.landedThisStep) continue;
      fighter.landedThisStep = false;
      this.effects.spawnDust(fighter.x, groundY, 5, 0.8);
    }
  }

  private onRoundFinished(groundY: number): void {
    const winner = this.match.roundWinner;
    if (winner !== null) {
      const fighter = this.match.fighters[winner];
      this.effects.spawnStars(fighter.x, groundY + fighter.y - fighter.bodyHeight * 0.7, 5);
      this.context.audio.playSfx('roar');
    }
  }

  private triggerShake(strength: number): void {
    this.shakeStrength = Math.max(this.shakeStrength, strength);
    this.shakeFrames = SHAKE_FRAMES;
  }

  private shakeOffset(): { x: number; y: number } {
    if (this.shakeFrames <= 0 || !this.context.settings.value.screenShake) return { x: 0, y: 0 };
    const decay = this.shakeFrames / SHAKE_FRAMES;
    const magnitude = this.shakeStrength * decay;
    return {
      x: Math.sin(this.elapsed * 82) * magnitude,
      y: Math.cos(this.elapsed * 71) * magnitude * 0.6,
    };
  }

  render(g: CanvasRenderingContext2D, width: number, height: number): void {
    const stage = getStage(this.context.session.stage);
    const shake = this.shakeOffset();

    // 흔들림은 무대·캐릭터·이펙트에만 적용하고 HUD는 고정한다.
    g.save();
    g.translate(shake.x, shake.y);

    g.fillStyle = stage.placeholderColor;
    g.fillRect(-40, -40, width + 80, height + 80);

    g.fillStyle = 'rgba(0, 0, 0, 0.28)';
    g.fillRect(-40, stage.groundY, width + 80, height - stage.groundY + 40);
    g.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(0, stage.groundY);
    g.lineTo(width, stage.groundY);
    g.stroke();

    // 잡힌 쪽은 잡은 쪽 뒤에 그린다(입에 물린 것처럼).
    const order = drawOrder(this.match.fighters);
    for (const fighter of order) {
      renderFighter(g, fighter, stage.groundY, this.elapsed);
    }
    for (const projectile of this.match.projectiles) {
      this.renderProjectile(g, projectile, stage.groundY);
    }

    // 이펙트는 캐릭터 뒤가 아니라 앞에 그려 타격이 보이게 한다.
    this.effects.render(g);

    if (this.debugBoxes) {
      this.renderDebugBoxes(g, stage.groundY);
    }
    g.restore();

    if (this.flashFrames > 0) {
      g.fillStyle = `rgba(255, 255, 255, ${this.flashFrames * 0.05})`;
      g.fillRect(0, 0, width, height);
    }

    this.renderHud(g, width);
    this.renderRoundText(g, width, height);

    if (this.debugBoxes) {
      drawText(g, 'F3: 판정 상자 표시', width / 2, height - 40, {
        font: FONTS.small,
        color: COLORS.textDim,
      });
    }
  }

  // --- HUD ---

  private renderHud(g: CanvasRenderingContext2D, width: number): void {
    const [p1, p2] = this.match.fighters;

    // 도움 설정으로 최대 체력이 달라질 수 있어 data.baseHealth가 아니라 maxHealth로 나눈다.
    renderBar(g, 60, 60, HUD_BAR_W, HUD_BAR_H, p1.health / p1.maxHealth, COLORS.health, false);
    renderBar(
      g,
      width - 60 - HUD_BAR_W,
      60,
      HUD_BAR_W,
      HUD_BAR_H,
      p2.health / p2.maxHealth,
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

    // 감정 3단계: 남은 체력 비율로 활기·보통·지침을 보여 준다(연출 전용).
    this.renderEmotion(g, p1, 200, 256, false);
    this.renderEmotion(g, p2, width - 200, 256, true);

    this.renderSettingsChip(g, width);
  }

  /** 감정 3단계 아이콘. 색과 표정만 바뀌고 전투 수치에는 영향이 없다. */
  private renderEmotion(
    g: CanvasRenderingContext2D,
    fighter: Fighter,
    x: number,
    y: number,
    right: boolean,
  ): void {
    const emotion = emotionFor(fighter.health / fighter.maxHealth);
    const color = EMOTION_COLORS[emotion];

    g.beginPath();
    g.arc(x, y, 22, 0, Math.PI * 2);
    g.fillStyle = 'rgba(8, 12, 16, 0.72)';
    g.fill();
    g.strokeStyle = color;
    g.lineWidth = 3;
    g.stroke();

    // 눈 두 개.
    g.fillStyle = color;
    g.beginPath();
    g.arc(x - 7, y - 5, 2.6, 0, Math.PI * 2);
    g.arc(x + 7, y - 5, 2.6, 0, Math.PI * 2);
    g.fill();

    // 입 모양: 활기=웃음, 보통=일자, 지침=처짐.
    g.strokeStyle = color;
    g.lineWidth = 2.6;
    g.beginPath();
    if (emotion === 'energetic') {
      g.arc(x, y + 3, 8, 0.15 * Math.PI, 0.85 * Math.PI);
    } else if (emotion === 'tired') {
      g.arc(x, y + 13, 8, 1.15 * Math.PI, 1.85 * Math.PI);
    } else {
      g.moveTo(x - 8, y + 7);
      g.lineTo(x + 8, y + 7);
    }
    g.stroke();

    drawText(g, EMOTION_LABELS[emotion], right ? x - 34 : x + 34, y, {
      font: FONTS.tiny,
      color,
      align: right ? 'right' : 'left',
    });
  }

  /**
   * 1인 대전에서만 현재 난이도·도움 설정을 알려 준다.
   * 체력바·게이지·캐릭터와 섞이지 않게 중앙 빈칸의 별도 판으로 그린다(C3).
   */
  private renderSettingsChip(g: CanvasRenderingContext2D, width: number): void {
    if (this.context.session.mode !== 'cpu') return;

    const label = `난이도 ${this.match.difficulty === 'easy' ? '쉬움' : '보통'}${
      this.match.assistActive ? ' · 도움 설정 켜짐' : ''
    }`;
    const chipW = 380;
    const chipH = 44;
    const x = width / 2 - chipW / 2;
    const y = 158;
    fillRoundRect(g, x, y, chipW, chipH, 22, 'rgba(8, 12, 16, 0.72)', COLORS.panelBorder, 2);
    drawText(g, label, width / 2, y + chipH / 2, {
      font: FONTS.tiny,
      color: this.match.assistActive ? COLORS.accent : COLORS.textDim,
    });
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
      // 준비 → 라운드 → 시작! 3단계 연출.
      const label =
        phaseFrames < 30 ? '준비' : phaseFrames < 60 ? `라운드 ${this.match.roundNumber}` : '시작!';
      const pop = 1 + Math.max(0, 0.25 - Math.abs(phaseFrames % 30) * 0.008);
      g.save();
      g.translate(width / 2, height / 2 - 120);
      g.scale(pop, pop);
      drawText(g, label, 0, 0, { font: FONTS.title, color: COLORS.accent });
      g.restore();
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
      for (const box of this.match.scriptHitboxes(fighter)) {
        drawBox(g, shift(box, groundY), '#ff6b6b');
      }
    }
    for (const p of this.match.projectiles) {
      const box = { left: p.x - p.spec.w / 2, right: p.x + p.spec.w / 2, top: p.y - p.spec.h / 2, bottom: p.y + p.spec.h / 2 };
      drawBox(g, shift(box, groundY), '#ffa94d');
    }
  }

  /** 투사체: 그림이 있으면 그림, 없으면 색 마름모. 진행 방향으로 뒤집고 속도선 3줄을 붙인다. */
  private renderProjectile(g: CanvasRenderingContext2D, p: Projectile, groundY: number): void {
    const { spec } = p;
    const image = spec.sprite ? this.context.assets.image(spec.sprite) : null;
    if (spec.sprite && !image) void this.context.assets.loadImage(spec.sprite);
    g.save();
    g.translate(p.x, groundY + p.y);
    const grow = 1 + (spec.grow ?? 0) * p.age;
    if (spec.fade) g.globalAlpha = Math.max(0, Math.min(1, p.life / 0.25));
    g.scale(grow, grow);
    // 속도선(회전 전, 진행 반대쪽).
    g.strokeStyle = 'rgba(255,255,255,0.75)';
    g.lineWidth = 5;
    g.lineCap = 'round';
    for (let i = -1; i <= 1 && !spec.noTrail && !image; i++) {
      g.beginPath();
      g.moveTo(-p.facing * spec.w * 0.55, i * spec.h * 0.22);
      g.lineTo(-p.facing * spec.w * (0.95 + Math.abs(i) * -0.15), i * spec.h * 0.22);
      g.stroke();
    }
    if (p.facing === -1) g.scale(-1, 1);
    g.rotate(p.facing === -1 ? -p.rotation : p.rotation);
    if (image) {
      const scale = Math.max(spec.w / image.width, spec.h / image.height);
      const w = image.width * scale;
      const h = image.height * scale;
      g.drawImage(image, -w / 2, -h / 2, w, h);
    } else {
      g.fillStyle = spec.color ?? '#ffffff';
      g.beginPath();
      g.moveTo(spec.w / 2, 0);
      g.lineTo(0, -spec.h / 2);
      g.lineTo(-spec.w / 2, 0);
      g.lineTo(0, spec.h / 2);
      g.closePath();
      g.fill();
    }
    g.restore();
  }
}

/**
 * 그리기 순서(뒤 → 앞). 공격 중인 쪽을 항상 앞에 그려 돌진·왕복 중 상대 몸 뒤로 숨지 않게 한다
 * (마스터 판정 2026-10-01). 잡힌 쪽은 잡은 쪽 뒤.
 */
export function drawOrder(fighters: readonly Fighter[]): Fighter[] {
  const rank = (f: Fighter): number => {
    if (f.state === 'held') return 0;
    if (f.state === 'attack') return 2;
    return 1;
  };
  return [...fighters].sort((a, b) => rank(a) - rank(b));
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
