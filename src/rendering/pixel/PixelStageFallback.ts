/**
 * 도트 배경이 아직 없는 경기장(8곳 중 6곳)을 위한 절차적 도트 배경.
 *
 * 원경·중경·지면 3레이어를 4px 격자(아트 좌표) 위에 직접 그린다 — 확대한 사진이나
 * 흐린 그라디언트를 쓰지 않으므로 캐릭터와 같은 픽셀 언어가 된다.
 * 시차 계수는 아티스트 배경과 동일하다(원경 0.25 / 중경 0.60 / 지면 1.00).
 */
import { DOT_K_BATTLE } from './PixelStyle';

export interface DotBackdropStage {
  id: string;
  groundY: number;
  placeholderColor: string;
}

const VIEW_W = 480;
const VIEW_H = 270;

/** xorshift — 같은 경기장은 항상 같은 그림이 나오도록 id에서 씨앗을 만든다. */
function rng(seed: number): () => number {
  let s = seed || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0xffffffff;
  };
}

function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

interface Tone { r: number; g: number; b: number }

function hexToTone(hex: string): Tone {
  const full = hex.replace('#', '');
  const v = full.length === 3 ? full.split('').map((c) => c + c).join('') : full;
  return { r: parseInt(v.slice(0, 2), 16), g: parseInt(v.slice(2, 4), 16), b: parseInt(v.slice(4, 6), 16) };
}

const clamp255 = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));
const css = (t: Tone): string => `rgb(${clamp255(t.r)},${clamp255(t.g)},${clamp255(t.b)})`;

/** 밝기 비율(0~2)과 채도 감소로 톤을 만든다. 팔레트를 늘리지 않고 5색 안에서 해결한다. */
function tone(base: Tone, factor: number, desaturate = 0): Tone {
  const gray = (base.r + base.g + base.b) / 3;
  return {
    r: base.r * factor + (gray - base.r) * desaturate,
    g: base.g * factor + (gray - base.g) * desaturate,
    b: base.b * factor + (gray - base.b) * desaturate,
  };
}

/** 흩뿌린 점(별·모래·풀) — 1아트px 사각형만 쓴다. */
function speckle(
  g: CanvasRenderingContext2D,
  rand: () => number,
  x: number, y: number, w: number, h: number,
  color: string, count: number, size = 1,
): void {
  g.fillStyle = color;
  for (let i = 0; i < count; i++) {
    g.fillRect(Math.round(x + rand() * w), Math.round(y + rand() * h), size, size);
  }
}

/**
 * 경기장 하나를 도트로 그린다. 좌표는 모두 아트 px(1px = 화면 4px).
 * focusX는 화면(디자인 px) 기준 카메라 중심이라 아트 좌표로 환산해 시차를 준다.
 */
export function renderDotBackdrop(
  g: CanvasRenderingContext2D,
  stage: DotBackdropStage,
  focusX: number,
  width: number,
  height: number,
): void {
  const k = DOT_K_BATTLE;
  if (width % k !== 0) return;
  void height;
  const camX = focusX / k - VIEW_W / 2;
  const groundArt = Math.round(stage.groundY / k);
  const base = hexToTone(stage.placeholderColor);
  const rand = rng(seedOf(stage.id));
  const skyTop = tone(base, 0.28, 0.35);
  const skyMid = tone(base, 0.46, 0.25);
  const skyLow = tone(base, 0.66, 0.1);
  const farColor = tone(base, 0.38, 0.2);
  const midColor = tone(base, 0.24, 0.1);
  const groundColor = tone(base, 0.5, 0.05);
  const groundDark = tone(base, 0.32, 0);

  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.imageSmoothingEnabled = false;
  g.scale(k, k);

  // 하늘: 3단 띠 + 띠 경계 디더(그라디언트 대신).
  const bands = [skyTop, skyMid, skyLow];
  const bandH = Math.ceil(groundArt / 3);
  bands.forEach((color, i) => {
    g.fillStyle = css(color);
    g.fillRect(0, i * bandH, VIEW_W, bandH);
  });
  g.fillStyle = css(skyLow);
  for (let y = bandH; y < groundArt; y += 2) {
    const width = Math.round(VIEW_W * (0.15 + 0.4 * Math.min(1, (y - bandH) / Math.max(1, groundArt - bandH))));
    g.fillRect(Math.round((VIEW_W - width) / 2), y, width, 1);
  }

  // 해/달: 픽셀 원(2px 블록).
  const sunX = Math.round(VIEW_W * 0.72 - camX * 0.12);
  const sunY = Math.round(groundArt * 0.34);
  g.fillStyle = css(tone(base, 1.35, 0.55));
  for (let dy = -12; dy <= 12; dy++) {
    const half = Math.round(Math.sqrt(Math.max(0, 144 - dy * dy)) / 2) * 2;
    g.fillRect(sunX - half / 2, sunY + dy, half, 1);
  }
  g.fillStyle = css(tone(base, 1.6, 0.6));
  for (let dy = -8; dy <= 8; dy += 2) {
    const half = Math.round(Math.sqrt(Math.max(0, 64 - dy * dy)) / 2) * 2;
    g.fillRect(sunX - half / 2, sunY + dy, half, 2);
  }

  // 원경 능선: 시차 0.25.
  const farShift = Math.round(-camX * 0.25);
  g.fillStyle = css(farColor);
  let ridge = [];
  for (let x = -20; x <= VIEW_W + 20; x += 12) {
    ridge.push([x, groundArt - 34 - Math.round(rand() * 26)]);
  }
  for (let i = 0; i < ridge.length - 1; i++) {
    const [x0, y0] = ridge[i];
    const [x1, y1] = ridge[i + 1];
    for (let x = x0; x < x1; x++) {
      const t = (x - x0) / (x1 - x0);
      const y = Math.round(y0 + (y1 - y0) * t);
      g.fillRect(((x + farShift) % (VIEW_W + 40) + VIEW_W + 40) % (VIEW_W + 40) - 20, y, 1, groundArt - y);
    }
  }

  // 중경: 시차 0.60 — 나무/바위 실루엣.
  const midShift = Math.round(-camX * 0.6);
  g.fillStyle = css(midColor);
  for (let i = 0; i < 26; i++) {
    const baseX = Math.round(rand() * (VIEW_W + 80)) - 40;
    const x = ((baseX + midShift) % (VIEW_W + 80) + VIEW_W + 80) % (VIEW_W + 80) - 40;
    const h = 14 + Math.round(rand() * 30);
    const w = 6 + Math.round(rand() * 8);
    if (rand() > 0.45) {
      // 나무: 기둥 + 계단식 수관
      g.fillRect(x, groundArt - h, 2, h);
      for (let row = 0; row < 4; row++) {
        const cw = w + (3 - row) * 4;
        g.fillRect(x - Math.round((cw - 2) / 2), groundArt - h + row * 5, cw, 4);
      }
    } else {
      // 바위/덤불
      for (let row = 0; row < 4; row++) {
        g.fillRect(x - row, groundArt - h + row * 4, w + row * 2, 4);
      }
    }
  }

  // 지면: 시차 1.00. 위 2px 밝은 띠 + 아래 어두운 흙 + 디더.
  g.fillStyle = css(tone(groundColor, 1.12, 0.1));
  g.fillRect(0, groundArt, VIEW_W, 3);
  g.fillStyle = css(groundColor);
  g.fillRect(0, groundArt + 3, VIEW_W, VIEW_H - groundArt - 3);
  g.fillStyle = css(groundDark);
  for (let y = groundArt + 5; y < VIEW_H; y += 3) {
    const offset = y % 6 === 0 ? 0 : 2;
    for (let x = offset; x < VIEW_W; x += 6) g.fillRect(x, y, 3, 1);
  }
  speckle(g, rand, 0, groundArt + 4, VIEW_W, VIEW_H - groundArt - 4, css(tone(groundColor, 1.3, 0.2)), 90);
  speckle(g, rand, 0, groundArt + 8, VIEW_W, VIEW_H - groundArt - 8, css(tone(groundDark, 0.8, 0)), 60);

  g.restore();
}
