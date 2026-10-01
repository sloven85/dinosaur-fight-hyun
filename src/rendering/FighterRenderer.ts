import type { Fighter, ScriptVisual } from '../combat/Fighter';
import { emotionFor, type Emotion } from '../combat/emotion';
import { spriteScale, type PoseName } from './rig';
import { airborneTilt, clampTilt, fallPose, flailPartAngles } from './fallMotion';
import { applyMotion, attackMotion, drawAttackTrail, type MotionFrame } from './attackMotion';
import type { PartsAssets } from './CharacterAssets';
import type { AssetLoader } from './AssetLoader';
import {
  attackPartAngles,
  motionNameFor,
  partTransforms,
  walkPartAngles,
  type Affine,
} from './partRig';

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

/** 기술 덧그림(볏·나는 자세)·투사체 그림을 꺼내 올 로더. BattleScene이 등록한다. */
let overlayLoader: AssetLoader | null = null;
export function setOverlayLoader(loader: AssetLoader | null): void {
  overlayLoader = loader;
}
function overlayImage(path: string): HTMLImageElement | null {
  if (!overlayLoader) return null;
  const image = overlayLoader.image(path);
  if (!image) void overlayLoader.loadImage(path);
  return image;
}
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
  /** 마스터 배율에 더 곱할 값(웅크린 방어 그림이 서 있을 때보다 커 보이지 않게). */
  fit?: number;
}

/**
 * 방어 그림은 마스터와 같은 픽셀 배율로 그려졌지만, 웅크린 자세가 서 있는 키보다 커지는 종이 있다
 * (안킬로 931 > 734px). 막을 때마다 몸이 커졌다 작아지는 것처럼 보여(jk 2026-10-02)
 * 서 있는 실루엣의 키·폭을 넘지 않게 줄인다.
 */
export function guardFit(master: { w: number; h: number } | undefined, pose: { w: number; h: number } | undefined): number {
  if (!master || !pose || pose.h <= 0 || pose.w <= 0) return 1;
  return Math.min(1, (master.h * 0.98) / pose.h, (master.w * 1.04) / pose.w);
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
  renderShadow(g, fighter, groundY);

  // 잔상(번개 왕복 등): 지난 위치에 종 보조색 실루엣을 옅게 남긴다.
  for (const ghost of fighter.ghosts) {
    drawBody(g, fighter, groundY, time, {
      x: ghost.x,
      y: ghost.y,
      facing: ghost.facing,
      visual: ghost.visual,
      ghostAlpha: ghost.alpha,
    });
  }

  const drawn = drawBody(g, fighter, groundY, time, {
    x: fighter.x,
    y: fighter.y,
    facing: fighter.facing,
    visual: fighter.scriptVisual,
    ghostAlpha: 0,
  });
  if (!drawn) return;

  const feetY = groundY + fighter.y;
  if (fighter.state === 'stun') drawStunStars(g, fighter, feetY, time);
  if (fighter.guardStance) drawGuardShield(g, fighter, feetY, time);
  if (fighter.state === 'fallen' && fallPoseOf(fighter).dizzy) {
    // 털썩 주저앉은 몸의 머리 위에 별이 돈다(주저앉은 높이 ≈ 키의 62%).
    drawStunStars(g, fighter, feetY + fighter.data.displayHeight * 0.32, time, fighter.facing * fighter.bodyFront * 0.55);
  }
  if (fighter.state === 'down' || fighter.state === 'victory' || fighter.state === 'fallen') return;
  drawNameTag(g, fighter, feetY);
}

interface BodyView {
  x: number;
  y: number;
  facing: 1 | -1;
  /** 스크립트 기술의 보이는 모양(없으면 기존 절차 동작). */
  visual: ScriptVisual | null;
  /** 0이면 본체, 0보다 크면 이 투명도로 잔상만 그린다. */
  ghostAlpha: number;
}

/** 몸 한 벌을 그린다. 그림이 없어 임시 도형으로 대체했으면 false. */
function drawBody(
  g: CanvasRenderingContext2D,
  fighter: Fighter,
  groundY: number,
  time: number,
  view: BodyView,
): boolean {
  const feetY = groundY + view.y;
  const ghost = view.ghostAlpha > 0;
  const partAngles = view.visual?.parts && fighter.assets.parts ? view.visual.parts : partAnglesFor(fighter, time);
  const choice = partAngles ? partsChoice(fighter) : selectSprite(fighter);
  if (!choice) {
    if (!ghost) renderPlaceholder(g, fighter, feetY);
    return false;
  }

  g.save();
  const groundLine = canvasYOf(g, groundY);
  g.translate(view.x, feetY);
  if (view.facing === -1) g.scale(-1, 1);

  // 기술별·종별 공격 동작(포즈가 없으면 궤적 전체, 전용 포즈면 약하게 더한다).
  // 파츠 리그가 있는 종도 몸 전체 이동·기울기는 여기서 한 번만 건다. 파츠는 부위 회전만 맡는다
  // (아티스트 JSON의 root는 쓰지 않는다 — 디렉터 통합 규칙: 몸 변환 중복 금지).
  const motion = view.visual ? null : attackMotionFor(fighter);
  g.save();
  if (view.visual) applyScriptVisual(g, fighter, view.visual);
  else if (choice.isPose) applyPoseTransform(g, fighter, time);
  else applyMasterTransform(g, fighter, time);
  if (motion) applyMotion(g, motion, choice.isPose ? 0.35 : 1);
  // 감정 3단계(프롬프트 6): 체력이 낮을수록 어깨가 처지고, 높으면 가볍게 들썩인다.
  applyEmotionTransform(g, emotionFor(fighter.health / fighter.maxHealth), time);
  // 눕기·구르기·기울기로 몸이 돌면 실루엣 아래쪽이 바닥선 밑으로 파고든다(jk: "지면 아래로 떨어짐").
  // 모든 변환을 건 뒤 실루엣의 가장 낮은 점이 바닥선을 넘으면 그만큼 위로 올린다. 판정과 무관한 그림 보정이다.
  if (groundLine !== null) keepAboveGround(g, fighter, groundLine);

  if (ghost) {
    // 잔상은 아래 draw에서 보조색 실루엣으로만 그린다.
  } else if (fighter.state === 'hit' || fighter.state === 'held') {
    g.filter = 'brightness(1.45) saturate(1.35)';
  } else if (fighter.invulnFrames > 0) {
    g.globalAlpha = 0.55;
  }

  // 아트는 화면 키의 약 2.7배로 그려져 있어 실측 높이 기준으로 축소해 그린다.
  const scale = choice.fromRig
    ? spriteScale(fighter.data.displayHeight, fighter.assets.rig?.master.box) * (choice.fit ?? 1)
    : 1;
  const size = spriteSize(choice.image);
  const destW = (size?.width ?? 0) * scale;
  const destH = (size?.height ?? 0) * scale;
  const destX = -choice.rootX * scale;
  const destY = -choice.rootY * scale;

  const altSkin = fighter.useAlternatePalette ? fighter.data.alternatePalette.skin : null;
  const parts = partAngles ? fighter.assets.parts ?? null : null;
  const placed = parts && partAngles ? partTransforms(parts.rig, partAngles) : null;

  /** 한 번 그리기: 파츠 리그면 파츠마다, 아니면 한 장으로. pick이 그릴 그림을 고른다. */
  const draw = (
    pick: (image: HTMLImageElement) => CanvasImageSource | null,
    dx = 0,
    dy = 0,
  ): void => {
    if (parts && placed) {
      drawParts(g, parts, placed, scale, choice.rootX, choice.rootY, pick, dx, dy);
      return;
    }
    const source = pick(choice.image);
    if (source) g.drawImage(source, destX + dx, destY + dy, destW, destH);
  };

  // 땅속으로 가라앉기: 지면 위만 보이게 자르고 아래로 내린다.
  const sink = view.visual?.sink ?? 0;
  if (sink > 0) {
    g.beginPath();
    g.rect(-4000, -4000, 8000, 4000);
    g.clip();
    g.translate(0, sink);
  }

  const overlays = view.visual?.overlays ?? [];
  const hideBody = overlays.some((o) => o.hideBody);
  const drawOverlays = (alphaPick?: (image: HTMLImageElement) => CanvasImageSource | null): void => {
    for (const o of overlays) {
      const image = overlayImage(o.sprite);
      if (!image) continue;
      const source = alphaPick ? alphaPick(image) : image;
      if (!source) continue;
      const [x0, y0, x1, y1] = o.rect;
      g.save();
      if (o.flash && !alphaPick) g.filter = `brightness(${1.25 + Math.abs(Math.sin(time * 24)) * 0.6})`;
      g.drawImage(source, (x0 - choice.rootX) * scale, (y0 - choice.rootY) * scale, (x1 - x0) * scale, (y1 - y0) * scale);
      g.restore();
    }
  };
  const drawAll = (pick: (image: HTMLImageElement) => CanvasImageSource | null, dx = 0, dy = 0): void => {
    if (!hideBody) draw(pick, dx, dy);
  };

  if (ghost) {
    g.globalAlpha = view.ghostAlpha;
    drawAll((image) => solidTintedSprite(image, fighter.data.accentColor));
    drawOverlays((image) => solidTintedSprite(image, fighter.data.accentColor));
    g.restore();
    g.restore();
    return true;
  }

  // 2P 파란 테두리는 스프라이트 뒤에 그린다.
  if (altSkin) {
    g.save();
    g.globalAlpha = 0.85;
    for (const [dx, dy] of OUTLINE_OFFSETS) {
      drawAll((image) => solidTintedSprite(image, TWO_P_OUTLINE), dx, dy);
    }
    g.restore();
  }

  drawAll((image) => image);
  drawOverlays();

  // 2P 보조색 보정은 피부 픽셀만 원본 위에 옅게 얹는다(눈·이빨은 그대로).
  if (altSkin) {
    g.save();
    g.globalAlpha = ALT_PALETTE_ALPHA;
    drawAll((image) => skinTintedSprite(image, fighter.data.color, altSkin));
    g.restore();
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
  return true;
}

/** 스크립트 기술의 기울기·늘이기. 몸 가운데(허리 높이)를 축으로 건다. */
function applyScriptVisual(g: CanvasRenderingContext2D, fighter: Fighter, visual: ScriptVisual): void {
  const pivotY = -fighter.data.displayHeight * 0.45;
  g.translate(0, pivotY);
  // 그림 통째 회전은 ±15°까지(마스터 판정 2026-10-01). 큰 동작은 이동·늘이기·파츠로 만든다.
  g.rotate(clampTilt(visual.rot));
  g.scale(visual.sx, visual.sy);
  g.translate(0, -pivotY);
}

/** 짧은 기절: 머리 위에서 별 3개가 돈다. */
function drawStunStars(g: CanvasRenderingContext2D, fighter: Fighter, feetY: number, time: number, offsetX = 0): void {
  const cx = fighter.x + offsetX;
  const cy = feetY - fighter.data.displayHeight - 10;
  g.save();
  g.fillStyle = '#ffe066';
  g.strokeStyle = '#8a5a00';
  g.lineWidth = 3;
  for (let i = 0; i < 3; i++) {
    const a = time * 6 + (i * Math.PI * 2) / 3;
    const x = cx + Math.cos(a) * 70;
    const y = cy + Math.sin(a) * 18;
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const r = k % 2 === 0 ? 20 : 9;
      const t = (Math.PI * k) / 5 - Math.PI / 2 + a;
      if (k === 0) g.moveTo(x + Math.cos(t) * r, y + Math.sin(t) * r);
      else g.lineTo(x + Math.cos(t) * r, y + Math.sin(t) * r);
    }
    g.closePath();
    g.fill();
    g.stroke();
  }
  g.restore();
}

function hasPose(fighter: Fighter, name: PoseName): boolean {
  return !!fighter.assets.rig?.poses[name]?.usable && !!fighter.assets.poses[name];
}

function selectSprite(fighter: Fighter): SpriteChoice | null {
  const { rig, master, portrait, poses } = fighter.assets;

  if (rig) {
    const poseName = poseForState(fighter);
    if (poseName) {
      const entry = rig.poses[poseName];
      const image = poses[poseName];
      if (entry?.usable && image) {
        const fit = poseName === 'guard' ? guardFit(rig.master.box ?? undefined, entry.box ?? undefined) : 1;
        return { image, rootX: entry.rootX, rootY: entry.rootY, isPose: true, fromRig: true, fit };
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

/** 띄워짐(공중 피격)·잡힘인지. 전용 '버둥' 자세를 쓰는 상태. */
function isAirborneHit(fighter: Fighter): boolean {
  return fighter.state === 'held' || (fighter.state === 'hit' && fighter.airTumble > 0);
}

function poseForState(fighter: Fighter): PoseName | null {
  if (fighter.guardStance && hasPose(fighter, 'guard')) return 'guard';
  if (isAirborneHit(fighter)) return hasPose(fighter, 'airborne') ? 'airborne' : 'hit';
  switch (fighter.state) {
    case 'hit':
      return 'hit';
    case 'fallen':
      return hasPose(fighter, 'down') ? 'down' : null;
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

/**
 * 종별 방어 자세(마스터 결정 2026-10-01). 전용 그림이 오기 전까지 몸 낮추기·기울기와 파츠 각도로 표현한다.
 * tilt: 몸 기울기(라디안, ±15° 안), squash: 세로 눌림, parts: 파츠 각도(아티스트 표기, 도).
 */
const GUARD_STANCE: Record<string, { tilt: number; squash: number; parts: Record<string, number> }> = {
  tyrannosaurus: { tilt: 0.12, squash: 0.9, parts: { head: 16, jaw: -4, neararm: 10, fararm: 8, tailbase: 6 } },
  triceratops: { tilt: 0.14, squash: 0.88, parts: { head: 14, jaw: -4, nearleg_front: -6 } },
  velociraptor: { tilt: 0.1, squash: 0.82, parts: { neararm: 30, fararm: 26, head: 12, tailbase: 10, tailtip: 10 } },
  spinosaurus: { tilt: -0.06, squash: 0.9, parts: { head: 8 } },
  ankylosaurus: { tilt: 0.04, squash: 0.8, parts: { head: 16, tailbase: 10, tailtip: 14 } },
  stegosaurus: { tilt: 0.1, squash: 0.86, parts: { head: 16, tailbase: -10, tailtip: -12 } },
  carnotaurus: { tilt: 0.16, squash: 0.88, parts: { head: 16, neararm: 10, fararm: 8 } },
  pachycephalosaurus: { tilt: 0.2, squash: 0.86, parts: { head: 18, neararm: 12, fararm: 10 } },
  therizinosaurus: { tilt: 0.08, squash: 0.9, parts: { neararm: 30, fararm: 30 } },
  dilophosaurus: { tilt: 0.12, squash: 0.82, parts: { head: 14 } },
  brachiosaurus: { tilt: 0.06, squash: 0.86, parts: { head: 20 } },
  pteranodon: { tilt: 0.04, squash: 0.86, parts: {} },
};

function guardStanceOf(fighter: Fighter) {
  return GUARD_STANCE[fighter.data.id] ?? { tilt: 0.1, squash: 0.88, parts: {} };
}

/** 방어 자세: 앞으로 웅크려 버틴다. 막은 직후(guard 상태)에는 살짝 더 눌리며 떨린다. */
function applyGuardTransform(g: CanvasRenderingContext2D, fighter: Fighter): void {
  const stance = guardStanceOf(fighter);
  const shake = fighter.state === 'guard' ? Math.sin(fighter.guardFrames * 2.4) * 0.03 : 0;
  const squash = stance.squash - (fighter.state === 'guard' ? 0.03 : 0);
  tiltAboutMiddle(g, fighter, stance.tilt + shake);
  g.scale(1 + (1 - squash) * 0.4, squash);
}

/** 방어 중 몸 앞에 뜨는 파란 방패(그림이 오기 전 표시). */
function drawGuardShield(g: CanvasRenderingContext2D, fighter: Fighter, feetY: number, time: number): void {
  const h = fighter.data.displayHeight;
  const x = fighter.x + fighter.facing * (fighter.bodyFront * 0.95);
  const y = feetY - h * 0.5;
  const flash = fighter.state === 'guard' ? 1 : 0.55 + Math.sin(time * 8) * 0.1;
  g.save();
  g.translate(x, y);
  g.scale(fighter.facing, 1);
  g.globalAlpha = 0.35 + 0.45 * flash;
  const grad = g.createRadialGradient(0, 0, h * 0.05, 0, 0, h * 0.5);
  grad.addColorStop(0, 'rgba(180, 225, 255, 0.9)');
  grad.addColorStop(1, 'rgba(60, 140, 255, 0)');
  g.fillStyle = grad;
  g.beginPath();
  g.ellipse(0, 0, h * 0.22, h * 0.5, 0, -Math.PI / 2, Math.PI / 2);
  g.fill();
  g.strokeStyle = 'rgba(200, 235, 255, 0.95)';
  g.lineWidth = fighter.state === 'guard' ? 8 : 5;
  g.beginPath();
  g.ellipse(0, 0, h * 0.18, h * 0.44, 0, -Math.PI / 2, Math.PI / 2);
  g.stroke();
  g.restore();
}

function applyMasterTransform(g: CanvasRenderingContext2D, fighter: Fighter, time: number): void {
  if (fighter.guardStance) {
    applyGuardTransform(g, fighter);
    return;
  }
  if (fighter.dashFrames > 0) {
    // 대시: 앞으로 숙여 쭉 늘어나고(앞), 뒤로 젖혀 살짝 뜬다(백스텝).
    const t = fighter.dashFrames / fighter.dashTotal;
    if (fighter.dashForward) {
      tiltAboutMiddle(g, fighter, 0.12 * t);
      g.scale(1 + 0.1 * t, 1 - 0.06 * t);
    } else {
      g.translate(0, -Math.sin(Math.PI * (1 - t)) * 26);
      tiltAboutMiddle(g, fighter, -0.08 * t);
    }
    return;
  }
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
      if (fighter.airTumble > 0) applyAirTumble(g, fighter);
      else g.rotate(-0.09);
      break;
    case 'held':
      // 물려서 들린 채 흔들린다(잡은 쪽 스크립트가 기울기를 정한다). 통째 회전은 ±15°까지.
      tiltAboutMiddle(g, fighter, clampTilt(-0.15 + fighter.heldRot));
      break;
    case 'stun':
      g.rotate(Math.sin(time * 9) * 0.06);
      break;
    case 'fallen': {
      // 쓰러짐 → 쿵·튕김 → 버둥버둥 → 뒤로 굴러 벌떡(fallMotion.ts).
      const h = fighter.data.displayHeight;
      const pose = fallPoseOf(fighter);
      g.translate(0, pose.dy - h * 0.5);
      g.rotate(clampTilt(pose.rot));
      g.scale(pose.sx, pose.sy);
      g.translate(0, h * 0.5);
      break;
    }
    case 'down': {
      // 다운 전용 그림이 없을 때: 뒤로 15° 기울여 털썩 주저앉힌다(뒤집기·눕히기 회전 금지).
      tiltAboutMiddle(g, fighter, -clampTilt(Math.PI));
      g.scale(1.12, 0.62);
      break;
    }
    case 'victory':
      g.translate(0, Math.sin(time * 6) * -10);
      break;
  }
}

function fallPoseOf(fighter: Fighter) {
  const elapsed = fighter.fallenTotal - fighter.fallenFrames;
  return fallPose(elapsed, fighter.fallenTotal, fighter.fallStartAngle, fighter.data.displayHeight);
}

/** 몸 가운데를 축으로 기울인다. 그림 통째 회전은 반드시 이 함수(±15° 제한)를 거친다. */
function tiltAboutMiddle(g: CanvasRenderingContext2D, fighter: Fighter, rad: number): void {
  const h = fighter.data.displayHeight * 0.5;
  g.translate(0, -h);
  g.rotate(clampTilt(rad));
  g.translate(0, h);
}

/** 띄워져 날아가는 동안: 뒤로 젖힌 채 흔들흔들(±15°), 살짝 늘어난다. */
function applyAirTumble(g: CanvasRenderingContext2D, fighter: Fighter): void {
  tiltAboutMiddle(g, fighter, airborneTilt(fighter.airTumble));
  const wobble = Math.sin(fighter.airTumble * 0.6) * 0.04;
  g.scale(0.96 + wobble, 1.05 - wobble);
}

function applyPoseTransform(g: CanvasRenderingContext2D, fighter: Fighter, time: number): void {
  if (fighter.guardStance) {
    // 전용 방어 그림: 막은 순간만 살짝 눌리며 떨린다(그림 자체가 웅크린 자세).
    if (fighter.state === 'guard') {
      tiltAboutMiddle(g, fighter, Math.sin(fighter.guardFrames * 2.4) * 0.03);
      g.scale(1.02, 0.97);
    }
    return;
  }
  if (fighter.state === 'hit' && fighter.airTumble > 0) applyAirTumble(g, fighter);
  if (fighter.state === 'held') tiltAboutMiddle(g, fighter, fighter.heldRot);
  if (fighter.state === 'fallen') {
    // 전용 다운 그림: 쿵·튕김·흔들흔들만 얹는다(그림 자체가 누운 자세).
    const pose = fallPoseOf(fighter);
    g.translate(0, pose.dy);
    tiltAboutMiddle(g, fighter, (pose.rot - clampTilt(-Math.PI) * 0.7) * 0.5);
  }
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

/** 파츠 리그로 그릴 상태면 부위 각도를, 아니면 null(기존 그림 경로). 피격·다운·승리는 전용 포즈 PNG를 쓴다. */
function partAnglesFor(fighter: Fighter, time: number): Record<string, number> | null {
  const parts = fighter.assets.parts;
  if (!parts) return null;
  const motions = parts.motions.motions;
  // 방어 전용 그림이 있으면 파츠 대신 그 그림(한눈에 '막는다'로 읽히게).
  if (fighter.guardStance) return hasPose(fighter, 'guard') ? null : guardStanceOf(fighter).parts;
  switch (fighter.state) {
    case 'idle':
    case 'crouch':
    case 'jump':
    case 'stun':
      return {};
    case 'fallen': {
      if (hasPose(fighter, 'down')) return null;
      const pose = fallPoseOf(fighter);
      return flailPartAngles(parts.rig.drawOrder, fighter.fallenTotal - fighter.fallenFrames, pose.flail);
    }
    case 'hit':
    case 'held':
      // 띄워짐·잡힘: 전용 '버둥' 그림이 오기 전까지 파츠 다리·팔을 허우적댄다(마스터 지시 3).
      if (hasPose(fighter, 'airborne')) return null;
      if (fighter.state === 'held') return flailPartAngles(parts.rig.drawOrder, Math.round(time * 60), 1);
      if (fighter.airTumble > 0) return flailPartAngles(parts.rig.drawOrder, fighter.airTumble, 0.9);
      return null;
    case 'walk': {
      const walk = motions.walk;
      return walk ? walkPartAngles(walk, time) : {};
    }
    case 'attack': {
      if (!fighter.attack) return {};
      const profile = motions[motionNameFor(fighter.attack.move.kind)];
      return profile ? attackPartAngles(profile, fighter.attack.move, fighter.attack.frame) : {};
    }
    default:
      return null;
  }
}

/** 파츠는 마스터와 같은 2048 캔버스 좌표라 마스터의 root·배율을 그대로 쓴다(판정 위치와 일치). */
function partsChoice(fighter: Fighter): SpriteChoice | null {
  const { rig, master } = fighter.assets;
  if (!rig || !master) return selectSprite(fighter);
  return { image: master, rootX: rig.root.x, rootY: rig.root.y, isPose: false, fromRig: true };
}

function drawParts(
  g: CanvasRenderingContext2D,
  parts: PartsAssets,
  placed: Record<string, Affine>,
  scale: number,
  rootX: number,
  rootY: number,
  pick: (image: HTMLImageElement) => CanvasImageSource | null,
  dx: number,
  dy: number,
): void {
  for (const name of parts.rig.drawOrder) {
    const image = parts.images[name];
    const m = placed[name];
    if (!image || !m) continue;
    const source = pick(image);
    if (!source) continue;
    g.save();
    g.translate(dx, dy);
    g.scale(scale, scale);
    g.translate(-rootX, -rootY);
    g.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
    g.drawImage(source, 0, 0);
    g.restore();
  }
}

/** 현재 변환에서 디자인 y(변환 전 좌표계) 한 줄이 캔버스의 어느 y인지. 변환을 못 읽으면 null. */
function canvasYOf(g: CanvasRenderingContext2D, y: number): number | null {
  const m = typeof g.getTransform === 'function' ? g.getTransform() : null;
  if (!m || typeof m.d !== 'number') return null;
  return m.d * y + m.f;
}

/**
 * 몸 실루엣(리그 실측 상자를 화면 크기로 환산)의 네 모서리를 현재 변환으로 옮겨,
 * 가장 낮은 점이 바닥선(groundLine, 캔버스 y)보다 아래면 그 차이만큼 캔버스 기준으로 위로 민다.
 */
export function keepAboveGround(g: CanvasRenderingContext2D, fighter: Fighter, groundLine: number): void {
  const m = g.getTransform();
  const corners = silhouetteCorners(fighter);
  let lowest = -Infinity;
  for (const [x, y] of corners) lowest = Math.max(lowest, m.b * x + m.d * y + m.f);
  const sink = lowest - groundLine;
  if (sink <= 0.5) return;
  g.setTransform(m.a, m.b, m.c, m.d, m.e, m.f - sink);
}

/** 발 기준(0,0) 좌표계의 몸 실루엣 모서리. 리그가 없으면 표시 높이 기반 임시 상자. */
export function silhouetteCorners(fighter: Fighter): Array<[number, number]> {
  const box = fighter.assets.rig?.master.box;
  const root = fighter.assets.rig?.root;
  if (box && root) {
    const s = spriteScale(fighter.data.displayHeight, box);
    const left = (box.minX - root.x) * s;
    const right = (box.maxX - root.x) * s;
    const top = (box.minY - root.y) * s;
    const bottom = (box.maxY - root.y) * s;
    return [
      [left, top],
      [right, top],
      [left, bottom],
      [right, bottom],
    ];
  }
  const h = fighter.data.displayHeight;
  const half = h * 0.31;
  return [
    [-half, -h],
    [half, -h],
    [-half, 0],
    [half, 0],
  ];
}
