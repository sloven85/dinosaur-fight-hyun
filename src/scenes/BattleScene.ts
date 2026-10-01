import { MAX_METER, ROUNDS_TO_WIN } from '../core/constants';
import type { GameContext } from '../core/GameContext';
import { getStage } from '../data';
import { Match, SPECIAL_CUTIN_FRAMES, type Projectile } from '../combat/Match';
import type { Fighter } from '../combat/Fighter';
import { EMOTION_COLORS, EMOTION_LABELS, emotionFor } from '../combat/emotion';
import type { Rect } from '../combat/types';
import { EffectSystem } from '../rendering/effects';
import { renderFighter, setOverlayLoader } from '../rendering/FighterRenderer';
import { renderStage, setStageLoader } from '../rendering/stageRenderer';
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
/** 마무리 타격: 멈춤 9프레임(0.15초) 뒤 확대가 24프레임에 걸쳐 풀린다. */
const FINISH_FREEZE_FRAMES = 9;
const FINISH_ZOOM_FRAMES = 24;
const FINISH_ZOOM = 1.12;

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
  /** 특수기 컷인 연출(경기 정지는 Match가 맡는다). */
  private cutinTotal = 0;
  private cutinPlayer = 0;
  /** 마무리 확대·멈춤: 남은 프레임과 확대 중심. */
  private finishFrames = 0;
  private finishX = 960;
  private finishY = 600;

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
    this.finishFrames = 0;
    // 다시 하기를 눌러 새 경기를 시작할 때도 저장된 난이도·도움 설정을 그대로 다시 읽는다.
    const options = { difficulty: settings.difficulty, assist: settings.assist, specialCutin: true };
    this.match = this.characterAssets
      ? new Match(session.mode, session.characters, this.characterAssets, options)
      : new Match(session.mode, session.characters, undefined, options);
    context.audio.playBgm('battle');
    setOverlayLoader(context.assets);
    setStageLoader(context.assets);
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

    // 마무리 한 방: 0.15초 멈추고 화면을 살짝 확대한다(그동안 경기는 멈춘다).
    if (this.finishFrames > FINISH_ZOOM_FRAMES) {
      this.finishFrames -= 1;
      return;
    }
    if (this.finishFrames > 0) this.finishFrames -= 1;

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
        this.finishFrames = FINISH_FREEZE_FRAMES + FINISH_ZOOM_FRAMES;
        this.finishX = event.x;
        this.finishY = y;
        this.effects.spawnStars(event.x, y, 7);
        this.context.audio.playSfx('ko');
        if (vibration) this.context.input.rumble(event.player, 0.9, 260);
        continue;
      }

      if (event.type === 'special') {
        this.cutinTotal = SPECIAL_CUTIN_FRAMES;
        this.cutinPlayer = event.player;
        this.context.audio.playSfx('roar');
        continue;
      }

      this.effects.spawnHit(event.x, y, {
        kind: event.kind,
        guarded: event.type === 'guard',
        direction: event.direction,
        attackerId: event.attackerId,
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
      // 대시 출발·도중 발밑 먼지.
      if (fighter.dashFrames > 0 && fighter.dashFrames % 4 === 0) {
        this.effects.spawnDust(fighter.x - fighter.dashDir * fighter.bodyWidth * 0.3, groundY, 2, 0.7);
      }
      if (!fighter.landedThisStep) continue;
      fighter.landedThisStep = false;
      this.effects.spawnDust(fighter.x, groundY, 5, 0.8);
    }
  }

  /**
   * 특수기 컷인(0.6초): 화면이 어두워지고 그 종 초상이 종 대표색 띠와 함께 옆으로 쓱 지나간다.
   * 1P는 왼쪽에서, 2P는 오른쪽에서 들어온다.
   */
  private renderCutin(g: CanvasRenderingContext2D, width: number, height: number): void {
    const left = this.match.cutinFrames;
    if (left <= 0 || this.cutinTotal <= 0) return;
    const t = 1 - left / this.cutinTotal; // 0 → 1
    const fighter = this.match.fighters[this.cutinPlayer as 0 | 1];
    const fromLeft = this.cutinPlayer === 0;
    const fade = Math.min(1, t * 5, (1 - t) * 5);
    g.save();
    g.fillStyle = `rgba(0, 0, 0, ${0.55 * fade})`;
    g.fillRect(0, 0, width, height);
    // 띠: 비스듬한 종 대표색 띠.
    const bandH = 300;
    const cy = height * 0.5;
    g.translate(width / 2, cy);
    g.rotate(fromLeft ? -0.08 : 0.08);
    g.globalAlpha = fade;
    g.fillStyle = fighter.data.color;
    g.fillRect(-width, -bandH / 2, width * 2, bandH);
    g.fillStyle = 'rgba(255, 255, 255, 0.85)';
    g.fillRect(-width, -bandH / 2 - 8, width * 2, 8);
    g.fillRect(-width, bandH / 2, width * 2, 8);
    // 속도선.
    g.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    g.lineWidth = 6;
    for (let i = 0; i < 9; i++) {
      const yy = -bandH / 2 + 20 + i * 32;
      const off = ((t * 2600 + i * 210) % (width * 1.6)) - width * 0.8;
      const sx = fromLeft ? off : -off;
      g.beginPath();
      g.moveTo(sx, yy);
      g.lineTo(sx + (fromLeft ? -220 : 220), yy);
      g.stroke();
    }
    // 초상: 빠르게 들어와 가운데서 천천히, 다시 빠르게 나간다.
    const ease = t < 0.25 ? 1 - Math.pow(1 - t / 0.25, 3) : t > 0.8 ? 1 + Math.pow((t - 0.8) / 0.2, 2) : 1 + (t - 0.25) * 0.15;
    const px = (fromLeft ? -1 : 1) * (width * 0.9) * (1 - ease);
    const portrait = fighter.assets.portrait;
    const size = 420;
    if (portrait) {
      g.save();
      if (!fromLeft) g.scale(-1, 1);
      g.drawImage(portrait, (fromLeft ? px : -px) - size / 2 - 260, -size / 2, size, size);
      g.restore();
    }
    g.rotate(fromLeft ? 0.08 : -0.08);
    drawText(g, fighter.attack?.move.name ?? '', px + (fromLeft ? 220 : -220), 0, {
      font: FONTS.heading,
      color: '#ffffff',
    });
    g.restore();
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
    if (this.finishFrames > 0) {
      // 마무리 확대: 멈춤 동안 최대, 이후 서서히 풀린다. 맞은 지점을 중심으로.
      const t = Math.min(1, this.finishFrames / FINISH_ZOOM_FRAMES);
      const z = 1 + (FINISH_ZOOM - 1) * t;
      g.translate(this.finishX, this.finishY);
      g.scale(z, z);
      g.translate(-this.finishX, -this.finishY);
    }

    const focusX = (this.match.p1.x + this.match.p2.x) / 2;
    renderStage(g, stage, width, height, this.elapsed, focusX);

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
    this.renderCutin(g, width, height);
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
