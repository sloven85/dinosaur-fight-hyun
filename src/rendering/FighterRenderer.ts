import type { Fighter } from '../combat/Fighter';
import { emotionFor, type Emotion } from '../combat/emotion';
import { spriteScale, type PoseName } from './rig';
import { applyMotion, attackMotion, drawAttackTrail, type MotionFrame } from './attackMotion';

const CROUCH_SQUASH = 0.75;

/** 동일 캐릭터 대전에서 2P를 구분하는 테두리 색(계획서 4절: 파란 테두리). */
const TWO_P_OUTLINE = '#2E6BFF';
const OUTLINE_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [4, 0],
  [-4, 0],
  [0, 4],
  [0, -4],
];
/** 보조색 보정 강도. 원본 그림을 완전히 덮지 않고 피부색만 기울인다. */
const ALT_PALETTE_ALPHA = 0.32;
/**
 * 피부 대표색과 이 정도 색 차이 안의 픽셀만 보조색 대상으로 본다.
 * 눈·이빨처럼 밝거나 어두운 픽셀은 범위를 벗어나 그대로 남는다(B6: 반전 금지).
 */
const SKIN_MATCH_TOLERANCE = 96;

const solidTintCache = new Map<string, HTMLCanvasElement>();
const skinTintCache = new Map<string, HTMLCanvasElement>();

function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function spriteSize(image: HTMLImageElement): { width: number; height: number } | null {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) return null;
  return { width, height };
}

/**
 * 실루엣 전체를 한 색으로 채운 사본(2P 파란 테두리용).
 * source-atop이라 그림의 불투명한 픽셀에만 색이 얹힌다(배경은 건드리지 않는다).
 */
function solidTintedSprite(image: HTMLImageElement, color: string): HTMLCanvasElement | null {
  const key = `${image.src}|${color}`;
  const cached = solidTintCache.get(key);
  if (cached) return cached;

  const size = spriteSize(image);
  if (!size) return null;

  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const g = canvas.getContext('2d');
  if (!g) return null;

  g.drawImage(image, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = color;
  g.fillRect(0, 0, size.width, size.height);

  solidTintCache.set(key, canvas);
  return canvas;
}

/**
 * 피부로 보이는 픽셀만 보조색으로 바꾼 사본(2P 보조색).
 * 파츠 마스크가 없는 지금은 대표 피부색과의 색 차이로 피부를 추정한다.
 * 눈·이빨·발톱처럼 색이 다른 부위는 손대지 않아 반전되지 않는다(B6).
 */
function skinTintedSprite(
  image: HTMLImageElement,
  baseColor: string,
  tintColor: string,
): HTMLCanvasElement | null {
  const key = `${image.src}|${baseColor}|${tintColor}|skin`;
  const cached = skinTintCache.get(key);
  if (cached) return cached;

  const size = spriteSize(image);
  const base = hexToRgb(baseColor);
  const tint = hexToRgb(tintColor);
  if (!size || !base || !tint) return null;

  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  if (!g) return null;

  g.drawImage(image, 0, 0);
  const pixels = g.getImageData(0, 0, size.width, size.height);
  const data = pixels.data;
  const limit = SKIN_MATCH_TOLERANCE * SKIN_MATCH_TOLERANCE;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const dr = data[i] - base[0];
    const dg = data[i + 1] - base[1];
    const db = data[i + 2] - base[2];
    if (dr * dr + dg * dg + db * db > limit) continue;
    data[i] = tint[0];
    data[i + 1] = tint[1];
    data[i + 2] = tint[2];
  }

  g.putImageData(pixels, 0, 0);
  skinTintCache.set(key, canvas);
  return canvas;
}

interface SpriteChoice {
  image: HTMLImageElement;
  rootX: number;
  rootY: number;
  /** 전용 포즈 PNG인지(절차적 변형을 덜 준다). */
  isPose: boolean;
  /** rig의 마스터 배율을 적용할지. 초상 대체일 때는 원본 크기로 그린다. */
  fromRig: boolean;
}

/**
 * 캐릭터 스프라이트를 그린다. 실제 피해 판정은 Match가 담당하고
 * 이 모듈은 보이는 모양만 다룬다(계획서 16절 프롬프트 3).
 */
export function renderFighter(
  g: CanvasRenderingContext2D,
  fighter: Fighter,
  groundY: number,
  time: number,
): void {
  const feetY = groundY + fighter.y;
  renderShadow(g, fighter, groundY);

  const choice = selectSprite(fighter);
  if (!choice) {
    renderPlaceholder(g, fighter, feetY);
    return;
  }

  g.save();
  g.translate(fighter.x, feetY);
  if (fighter.facing === -1) g.scale(-1, 1);

  // 기술별·종별 공격 동작(포즈가 없으면 궤적 전체, 전용 포즈면 약하게 더한다).
  const motion = attackMotionFor(fighter);
  g.save();
  if (choice.isPose) applyPoseTransform(g, fighter, time);
  else applyMasterTransform(g, fighter, time);
  if (motion) applyMotion(g, motion, choice.isPose ? 0.35 : 1);
  // 감정 3단계(프롬프트 6): 체력이 낮을수록 어깨가 처지고, 높으면 가볍게 들썩인다.
  applyEmotionTransform(g, emotionFor(fighter.health / fighter.maxHealth), time);

  if (fighter.state === 'hit') {
    g.filter = 'brightness(1.45) saturate(1.35)';
  } else if (fighter.invulnFrames > 0) {
    g.globalAlpha = 0.55;
  }

  // 아트는 화면 키의 약 2.7배로 그려져 있어 실측 높이 기준으로 축소해 그린다.
  const scale = choice.fromRig
    ? spriteScale(fighter.data.displayHeight, fighter.assets.rig?.master.box)
    : 1;
  const size = spriteSize(choice.image);
  const destW = (size?.width ?? 0) * scale;
  const destH = (size?.height ?? 0) * scale;
  const destX = -choice.rootX * scale;
  const destY = -choice.rootY * scale;

  const altSkin = fighter.useAlternatePalette ? fighter.data.alternatePalette.skin : null;

  // 2P 파란 테두리는 스프라이트 뒤에 그린다.
  if (altSkin) {
    const outline = solidTintedSprite(choice.image, TWO_P_OUTLINE);
    if (outline) {
      g.save();
      g.globalAlpha = 0.85;
      for (const [dx, dy] of OUTLINE_OFFSETS) {
        g.drawImage(outline, destX + dx, destY + dy, destW, destH);
      }
      g.restore();
    }
  }

  g.drawImage(choice.image, destX, destY, destW, destH);

  // 2P 보조색 보정은 피부 픽셀만 원본 위에 옅게 얹는다(눈·이빨은 그대로).
  if (altSkin) {
    const tinted = skinTintedSprite(choice.image, fighter.data.color, altSkin);
    if (tinted) {
      g.save();
      g.globalAlpha = ALT_PALETTE_ALPHA;
      g.drawImage(tinted, destX, destY, destW, destH);
      g.restore();
    }
  }
  g.restore();

  if (motion && fighter.attack) {
    drawAttackTrail(
      g,
      fighter.data.attackStyle,
      fighter.attack.move.kind,
      motion,
      { front: fighter.bodyFront, height: fighter.data.displayHeight },
      fighter.data.accentColor,
    );
  }

  g.restore();

  if (fighter.state === 'down' || fighter.state === 'victory') return;
  drawNameTag(g, fighter, feetY);
}

function selectSprite(fighter: Fighter): SpriteChoice | null {
  const { rig, master, portrait, poses } = fighter.assets;

  if (rig) {
    const poseName = poseForState(fighter);
    if (poseName) {
      const entry = rig.poses[poseName];
      const image = poses[poseName];
      if (entry?.usable && image) {
        return { image, rootX: entry.rootX, rootY: entry.rootY, isPose: true, fromRig: true };
      }
    }
    if (rig.master.usable && master) {
      return { image: master, rootX: rig.root.x, rootY: rig.root.y, isPose: false, fromRig: true };
    }
  }

  // 마스터가 깨진 캐릭터(딜로포사우루스)는 초상으로 대체한다. 초상도 깨졌으면 임시 도형으로 간다.
  if (portrait && rig?.portrait.usable !== false) {
    return {
      image: portrait,
      rootX: portrait.width / 2,
      rootY: portrait.height,
      isPose: true,
      fromRig: false,
    };
  }

  return null;
}

function poseForState(fighter: Fighter): PoseName | null {
  switch (fighter.state) {
    case 'hit':
      return 'hit';
    case 'down':
      return 'down';
    case 'victory':
      return 'victory';
    case 'attack': {
      const kind = fighter.attack?.move.kind;
      if (kind === 'heavy') return 'heavy';
      if (kind === 'special') return 'special';
      return null;
    }
    default:
      return null;
  }
}

function applyMasterTransform(g: CanvasRenderingContext2D, fighter: Fighter, time: number): void {
  switch (fighter.state) {
    case 'idle':
      g.translate(0, Math.sin(time * 2.2) * 5);
      break;
    case 'walk':
      g.translate(0, Math.abs(Math.sin(time * 9)) * -7);
      g.rotate(Math.sin(time * 9) * 0.02);
      break;
    case 'crouch':
      g.scale(1, CROUCH_SQUASH);
      break;
    case 'jump':
      g.rotate(Math.max(-0.22, Math.min(0.22, fighter.vy / 4000)));
      break;
    case 'attack':
      // 공격 동작은 attackMotion이 기술·종별로 따로 건다(예전의 '몸통 밀어 넣기' 폴백 대체).
      break;
    case 'hit':
      g.rotate(-0.09);
      break;
    case 'down':
      // 다운 전용 포즈가 없을 때는 발을 축으로 눕힌다.
      g.rotate(-1.25);
      g.translate(-fighter.data.displayHeight * 0.35, 0);
      break;
    case 'victory':
      g.translate(0, Math.sin(time * 6) * -10);
      break;
  }
}

function applyPoseTransform(g: CanvasRenderingContext2D, fighter: Fighter, time: number): void {
  if (fighter.state === 'victory') {
    g.translate(0, Math.sin(time * 6) * -8);
  }
}

/** 감정 3단계의 자세 변화. 수치는 전투에 영향이 없는 순수 연출이다. */
function applyEmotionTransform(g: CanvasRenderingContext2D, emotion: Emotion, time: number): void {
  if (emotion === 'energetic') {
    g.translate(0, Math.sin(time * 3.1) * 3);
  } else if (emotion === 'tired') {
    g.translate(0, 8);
    g.rotate(0.05);
  }
}

function renderShadow(g: CanvasRenderingContext2D, fighter: Fighter, groundY: number): void {
  const box = fighter.hurtbox();
  const width = box.right - box.left;
  const lift = Math.max(0, -fighter.y);
  const scale = Math.max(0.45, 1 - lift / 900);

  g.save();
  g.globalAlpha = 0.28 * scale;
  g.fillStyle = '#000000';
  g.beginPath();
  g.ellipse(fighter.x, groundY + 8, (width / 2) * scale, 16 * scale, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** 에셋이 없을 때 쓰는 임시 도형(계획서 16절: 새 그림을 임의 생성하지 않는다). */
function renderPlaceholder(g: CanvasRenderingContext2D, fighter: Fighter, feetY: number): void {
  const crouch = fighter.state === 'crouch';
  const down = fighter.state === 'down';
  const height = fighter.data.displayHeight * (crouch ? CROUCH_SQUASH : down ? 0.4 : 1);
  const bodyW = fighter.data.displayHeight * 0.62 * (down ? 1.4 : 1);

  g.fillStyle = fighter.useAlternatePalette ? fighter.data.alternatePalette.skin : fighter.data.color;
  g.beginPath();
  g.roundRect(fighter.x - bodyW / 2, feetY - height, bodyW, height, down ? 40 : 26);
  g.fill();

  // 에셋이 없어도 2P를 알아볼 수 있게 같은 파란 테두리를 임시 도형에도 두른다.
  if (fighter.useAlternatePalette) {
    g.strokeStyle = TWO_P_OUTLINE;
    g.lineWidth = 10;
    g.stroke();
  }
  g.strokeStyle = 'rgba(0, 0, 0, 0.35)';
  g.lineWidth = 4;
  g.stroke();

  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.font = '20px "Noto Sans KR", system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('임시', fighter.x, feetY - height / 2);
}

function drawNameTag(g: CanvasRenderingContext2D, fighter: Fighter, feetY: number): void {
  g.font = '24px "Noto Sans KR", system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#f2f4f8';
  g.fillText(fighter.data.name, fighter.x, feetY - fighter.data.displayHeight - 22);

  // 동일 캐릭터 대전: 2P는 발밑에 표시한다(계획서 4절).
  if (fighter.useAlternatePalette) {
    g.font = 'bold 26px "Noto Sans KR", system-ui, sans-serif';
    g.fillStyle = TWO_P_OUTLINE;
    g.fillText('2P', fighter.x, feetY - 34);
  }
}

/** 공격 중이면 지금 프레임의 몸 변형을 돌려준다. */
function attackMotionFor(fighter: Fighter): MotionFrame | null {
  if (fighter.state !== 'attack' || !fighter.attack) return null;
  const { move, frame } = fighter.attack;
  return attackMotion(fighter.data.attackStyle, move.kind, move, frame, {
    front: fighter.bodyFront,
    height: fighter.data.displayHeight,
  });
}
