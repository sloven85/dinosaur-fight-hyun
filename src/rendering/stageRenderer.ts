import type { AssetLoader } from './AssetLoader';
import type { StageData } from '../data';

/**
 * 경기장 배경(마스터 결정 2026-10-01): 하늘·중경·바닥(+앞쪽 장식) 겹을 카메라 기준점에 따라
 * 서로 다른 속도로 움직여 깊이감을 준다. 아티스트 그림이 있으면 그 그림을, 없으면 같은 구도의
 * 만화풍 도형 배경을 그린다. 캐릭터·기술 이펙트를 가리지 않게 채도·명도를 한 단계 낮춘다.
 */

/** 겹별 시차 비율: 기준점이 1px 움직일 때 겹이 움직이는 양(px). */
export const PARALLAX = { sky: 0.04, mid: 0.14, ground: 0.3, fore: 0.45 } as const;
export type LayerName = keyof typeof PARALLAX;

/** 기준점(두 캐릭터 가운데 x)이 화면 가운데에서 벗어난 만큼 겹을 반대쪽으로 민다. */
export function parallaxOffset(layer: LayerName, focusX: number, screenW: number): number {
  return -(focusX - screenW / 2) * PARALLAX[layer];
}

const images = new Map<string, HTMLImageElement | null | 'loading'>();
let loader: AssetLoader | null = null;

export function setStageLoader(next: AssetLoader): void {
  loader = next;
}

function layerImage(path: string | undefined): HTMLImageElement | null {
  if (!path || !loader) return null;
  const cached = images.get(path);
  if (cached === 'loading') return null;
  if (cached !== undefined) return cached;
  images.set(path, 'loading');
  void loader.loadImage(path).then((img) => images.set(path, img));
  return null;
}

/** 그림 한 겹: 화면보다 넓게(시차 여유) 바닥을 맞춰 그린다. */
function drawImageLayer(g: CanvasRenderingContext2D, img: HTMLImageElement, dx: number, w: number, h: number): void {
  const scale = Math.max((w * 1.12) / img.width, h / img.height);
  const iw = img.width * scale;
  const ih = img.height * scale;
  g.drawImage(img, (w - iw) / 2 + dx, h - ih, iw, ih);
}

type Painter = (g: CanvasRenderingContext2D, w: number, h: number, groundY: number, time: number, focusX: number) => void;

function sky(g: CanvasRenderingContext2D, w: number, groundY: number, top: string, bottom: string): void {
  const grad = g.createLinearGradient(0, 0, 0, groundY);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  g.fillStyle = grad;
  g.fillRect(-60, -60, w + 120, groundY + 60);
}

function hills(g: CanvasRenderingContext2D, w: number, baseY: number, amp: number, period: number, color: string, dx: number, seed = 0): void {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(-200, baseY + 400);
  for (let x = -200; x <= w + 200; x += 20) {
    const t = (x - dx) / period + seed;
    g.lineTo(x, baseY - amp * (0.55 + 0.3 * Math.sin(t) + 0.15 * Math.sin(t * 2.7 + 1.3)));
  }
  g.lineTo(w + 200, baseY + 400);
  g.closePath();
  g.fill();
}

function ground(g: CanvasRenderingContext2D, w: number, h: number, groundY: number, top: string, bottom: string, edge: string): void {
  const grad = g.createLinearGradient(0, groundY, 0, h);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  g.fillStyle = grad;
  g.fillRect(-60, groundY, w + 120, h - groundY + 60);
  g.fillStyle = edge;
  g.fillRect(-60, groundY - 4, w + 120, 10);
}

function palm(g: CanvasRenderingContext2D, x: number, baseY: number, s: number, trunk: string, leaf: string, time: number): void {
  g.save();
  g.translate(x, baseY);
  g.scale(s, s);
  g.strokeStyle = trunk;
  g.lineWidth = 22;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(30, -160, 10, -320);
  g.stroke();
  g.fillStyle = leaf;
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i - 2.5) * 0.55 + Math.sin(time * 1.3 + i) * 0.05;
    g.save();
    g.translate(10, -320);
    g.rotate(a);
    g.beginPath();
    g.ellipse(80, 0, 95, 22, 0.25, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  g.restore();
}

const PAINTERS: Record<string, Painter> = {
  jungle(g, w, h, gy, time, fx) {
    sky(g, w, gy, '#8fc2c4', '#c9dfb8');
    g.fillStyle = 'rgba(255, 250, 220, 0.55)';
    g.beginPath();
    g.arc(w * 0.78 + parallaxOffset('sky', fx, w), 170, 70, 0, Math.PI * 2);
    g.fill();
    hills(g, w, gy - 150, 260, 260, '#6f9a78', parallaxOffset('sky', fx, w) * 2, 0.4);
    const mid = parallaxOffset('mid', fx, w);
    hills(g, w, gy - 40, 170, 150, '#4f7f58', mid, 2.1);
    for (let i = 0; i < 7; i++) palm(g, i * 330 - 120 + mid, gy - 20, 0.8 + (i % 3) * 0.12, '#5f4a36', '#3f6d45', time + i);
    ground(g, w, h, gy, '#6b8a4c', '#4a5f36', '#86a35c');
  },
  volcano(g, w, h, gy, time, fx) {
    sky(g, w, gy, '#6a4a52', '#c4806a');
    const s = parallaxOffset('sky', fx, w);
    // 화산과 연기: 연기는 천천히 피어오른다.
    g.fillStyle = '#5a3d3c';
    g.beginPath();
    g.moveTo(w * 0.35 + s, gy - 60);
    g.lineTo(w * 0.55 + s, gy - 520);
    g.lineTo(w * 0.63 + s, gy - 520);
    g.lineTo(w * 0.86 + s, gy - 60);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(255, 150, 80, 0.55)';
    g.fillRect(w * 0.555 + s, gy - 525, w * 0.07, 14);
    for (let i = 0; i < 5; i++) {
      const t = (time * 0.12 + i / 5) % 1;
      g.fillStyle = `rgba(110, 95, 100, ${0.45 * (1 - t)})`;
      g.beginPath();
      g.arc(w * 0.59 + s + Math.sin(i * 2 + time * 0.3) * 40 * t, gy - 560 - t * 380, 50 + t * 120, 0, Math.PI * 2);
      g.fill();
    }
    hills(g, w, gy - 30, 140, 170, '#4a3232', parallaxOffset('mid', fx, w), 1.2);
    ground(g, w, h, gy, '#6a4a3e', '#3e2b26', '#8a5a44');
    // 바닥의 용암 틈(은은하게 깜빡).
    const gx = parallaxOffset('ground', fx, w);
    g.strokeStyle = `rgba(255, 140, 60, ${0.35 + Math.sin(time * 2) * 0.1})`;
    g.lineWidth = 5;
    for (let i = 0; i < 6; i++) {
      const x = i * 360 + gx;
      g.beginPath();
      g.moveTo(x, gy + 40);
      g.lineTo(x + 60, gy + 70);
      g.lineTo(x + 130, gy + 58);
      g.stroke();
    }
  },
  desert(g, w, h, gy, time, fx) {
    sky(g, w, gy, '#9cc2d6', '#e8d7ae');
    const s = parallaxOffset('sky', fx, w);
    hills(g, w, gy - 70, 200, 320, '#c9a978', s * 2, 0.8);
    const mid = parallaxOffset('mid', fx, w);
    hills(g, w, gy - 10, 110, 200, '#b8925e', mid, 3.1);
    // 모래에 반쯤 묻힌 갈비뼈 화석.
    g.strokeStyle = '#ede0c4';
    g.lineWidth = 16;
    g.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const x = w * 0.18 + i * 46 + mid;
      g.beginPath();
      g.moveTo(x, gy - 10);
      g.quadraticCurveTo(x + 40, gy - 150 + i * 6, x + 90, gy - 60);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(w * 0.18 + mid - 20, gy - 130);
    g.lineTo(w * 0.18 + mid + 320, gy - 110);
    g.stroke();
    ground(g, w, h, gy, '#d2b37e', '#a88452', '#e2c792');
    // 굴러가는 모래바람.
    g.fillStyle = 'rgba(240, 225, 190, 0.35)';
    for (let i = 0; i < 4; i++) {
      const x = ((time * 90 + i * 520) % (w + 400)) - 200;
      g.beginPath();
      g.ellipse(x, gy + 30 + i * 18, 120, 10, 0, 0, Math.PI * 2);
      g.fill();
    }
  },
  museum(g, w, h, gy, time, fx) {
    sky(g, w, gy, '#2e3446', '#4a5268');
    const s = parallaxOffset('sky', fx, w);
    // 기둥과 천장 조명.
    for (let i = 0; i < 6; i++) {
      const x = i * 380 - 80 + s * 3;
      g.fillStyle = '#3c4458';
      g.fillRect(x, 0, 70, gy);
      const a = 0.12 + Math.sin(time * 1.5 + i) * 0.03;
      const grad = g.createLinearGradient(x + 190, 0, x + 190, gy);
      grad.addColorStop(0, `rgba(255, 240, 200, ${a * 2})`);
      grad.addColorStop(1, 'rgba(255, 240, 200, 0)');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(x + 160, 0);
      g.lineTo(x + 220, 0);
      g.lineTo(x + 320, gy);
      g.lineTo(x + 60, gy);
      g.closePath();
      g.fill();
    }
    // 진열대 위 뼈 화석 실루엣(긴 목 공룡).
    const mid = parallaxOffset('mid', fx, w);
    g.strokeStyle = 'rgba(220, 210, 190, 0.55)';
    g.lineWidth = 12;
    g.lineCap = 'round';
    const bx = w * 0.62 + mid;
    g.beginPath();
    g.moveTo(bx - 260, gy - 230);
    g.quadraticCurveTo(bx - 60, gy - 300, bx + 120, gy - 240);
    g.quadraticCurveTo(bx + 220, gy - 420, bx + 260, gy - 520);
    g.stroke();
    for (let i = 0; i < 7; i++) {
      g.beginPath();
      g.moveTo(bx - 180 + i * 40, gy - 260);
      g.lineTo(bx - 190 + i * 40, gy - 190);
      g.stroke();
    }
    for (const lx of [-200, -120, 60, 130]) {
      g.beginPath();
      g.moveTo(bx + lx, gy - 230);
      g.lineTo(bx + lx + 6, gy - 90);
      g.stroke();
    }
    g.fillStyle = '#353c4e';
    g.fillRect(bx - 320, gy - 90, 640, 90);
    ground(g, w, h, gy, '#5a5248', '#3a342e', '#7a6e60');
    // 마루 무늬.
    const gx = parallaxOffset('ground', fx, w);
    g.strokeStyle = 'rgba(0, 0, 0, 0.18)';
    g.lineWidth = 3;
    for (let x = -200; x < w + 200; x += 120) {
      g.beginPath();
      g.moveTo(x + (gx % 120), gy);
      g.lineTo(x + (gx % 120) - 80, h);
      g.stroke();
    }
  },
};

/**
 * 무대를 그린다. 하늘·중경·바닥 그림이 모두 있으면 그림으로, 하나라도 없으면 전체를 도형 배경으로 그린다(구도가 섞이지 않게).
 * 앞쪽 장식(fore)은 캐릭터 발을 가릴 수 있어 그리지 않는다.
 */
export function renderStage(
  g: CanvasRenderingContext2D,
  stage: StageData,
  w: number,
  h: number,
  time: number,
  focusX: number,
): void {
  const paths = stage.layerPaths as Partial<Record<LayerName, string>>;
  const sky = layerImage(paths.sky);
  const mid = layerImage(paths.mid);
  const ground = layerImage(paths.ground);
  if (sky && mid && ground) {
    drawImageLayer(g, sky, parallaxOffset('sky', focusX, w), w, h);
    drawImageLayer(g, mid, parallaxOffset('mid', focusX, w), w, h);
    drawImageLayer(g, ground, parallaxOffset('ground', focusX, w), w, h);
  } else {
    const paint = PAINTERS[stage.id];
    if (paint) paint(g, w, h, stage.groundY, time, focusX);
    else {
      g.fillStyle = stage.placeholderColor;
      g.fillRect(-40, -40, w + 80, h + 80);
    }
  }
  // 캐릭터가 배경에서 떠 보이도록 아주 옅게 눌러 준다(채도·명도 한 단계 아래).
  g.fillStyle = 'rgba(20, 24, 30, 0.12)';
  g.fillRect(-60, -60, w + 120, h + 120);
}
