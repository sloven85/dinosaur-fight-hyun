import type { Fighter } from '../combat/Fighter';
import { attackPhase } from '../combat/types';
import type { PoseName } from './rig';

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

const tintCache = new Map<string, HTMLCanvasElement>();

/**
 * 원본 이미지를 한 가지 색으로 보정한 사본을 만들어 캐시한다.
 * source-atop이라 그림의 불투명한 픽셀에만 색이 얹힌다(배경은 건드리지 않는다).
 */
function tintedSprite(image: HTMLImageElement, color: string): HTMLCanvasElement | null {
  const key = `${image.src}|${color}`;
  const cached = tintCache.get(key);
  if (cached) return cached;

  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) return null;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  if (!g) return null;

  g.drawImage(image, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = color;
  g.fillRect(0, 0, width, height);

  tintCache.set(key, canvas);
  return canvas;
}

interface SpriteChoice {
  image: HTMLImageElement;
  rootX: number;
  rootY: number;
  /** 전용 포즈 PNG인지(절차적 변형을 덜 준다). */
  isPose: boolean;
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

  if (choice.isPose) applyPoseTransform(g, fighter, time);
  else applyMasterTransform(g, fighter, time);

  if (fighter.state === 'hit') {
    g.filter = 'brightness(1.45) saturate(1.35)';
  } else if (fighter.invulnFrames > 0) {
    g.globalAlpha = 0.55;
  }

  const altSkin = fighter.useAlternatePalette ? fighter.data.alternatePalette.skin : null;

  // 2P 파란 테두리는 스프라이트 뒤에 그린다.
  if (altSkin) {
    const outline = tintedSprite(choice.image, TWO_P_OUTLINE);
    if (outline) {
      g.save();
      g.globalAlpha = 0.85;
      for (const [dx, dy] of OUTLINE_OFFSETS) {
        g.drawImage(outline, -choice.rootX + dx, -choice.rootY + dy);
      }
      g.restore();
    }
  }

  g.drawImage(choice.image, -choice.rootX, -choice.rootY);

  // 2P 보조색 보정은 원본 위에 옅게 얹는다.
  if (altSkin) {
    const tinted = tintedSprite(choice.image, altSkin);
    if (tinted) {
      g.save();
      g.globalAlpha = ALT_PALETTE_ALPHA;
      g.drawImage(tinted, -choice.rootX, -choice.rootY);
      g.restore();
    }
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
        return { image, rootX: entry.rootX, rootY: entry.rootY, isPose: true };
      }
    }
    if (rig.master.usable && master) {
      return { image: master, rootX: rig.root.x, rootY: rig.root.y, isPose: false };
    }
  }

  // 마스터가 깨진 캐릭터(딜로포사우루스)는 초상으로 대체한다. 초상도 깨졌으면 임시 도형으로 간다.
  if (portrait && rig?.portrait.usable !== false) {
    return {
      image: portrait,
      rootX: portrait.width / 2,
      rootY: portrait.height,
      isPose: true,
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
    case 'attack': {
      const phase = fighter.attack ? attackPhase(fighter.attack.move, fighter.attack.frame) : 'startup';
      const lean = phase === 'startup' ? -14 : phase === 'active' ? 34 : 10;
      g.translate(lean, phase === 'active' ? -6 : 0);
      g.rotate(phase === 'active' ? 0.06 : 0);
      break;
    }
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
  g.strokeStyle = 'rgba(0, 0, 0, 0.35)';
  g.lineWidth = 4;
  g.beginPath();
  g.roundRect(fighter.x - bodyW / 2, feetY - height, bodyW, height, down ? 40 : 26);
  g.fill();
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
