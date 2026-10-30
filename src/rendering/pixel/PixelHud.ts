/**
 * 전투 HUD 도트 버전 — 체력바·이름표·초상·게이지·라운드 점·타이머.
 *
 * 전투 화면은 아트 1px = 화면 4px 계약(2026-10-29)을 그대로 쓴다. HUD도 같은 격자,
 * 480×270 아트 좌표 위에 그린다. 둥근 막대·그라디언트 없이 4px 블록 눈금으로 채운다.
 */
import type { Fighter } from '../../combat/Fighter';
import { MAX_METER, ROUNDS_TO_WIN } from '../../core/constants';
import type { DotSpritesApi } from './DotSprites';
import { DOT, DOT_K_BATTLE, box, cursor, dither, inDotGrid, outline, panel, text } from './PixelStyle';

export interface HudView {
  p1: Fighter;
  p2: Fighter;
  timeLeft: number;
  difficulty: 'easy' | 'normal';
  assist: boolean;
  sprites: DotSpritesApi;
}

const VIEW_W = 480;

/** 4px 블록 눈금 막대(도트). 오른쪽 정렬이면 오른쪽에서 채운다. */
function blockBar(
  g: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  ratio: number, color: string, mirrored: boolean,
): void {
  box(g, x, y, w, h, DOT.ink);
  box(g, x + 1, y + 1, w - 2, h - 2, DOT.hpBack);
  const clamped = Math.max(0, Math.min(1, ratio));
  const inner = w - 2;
  const filled = Math.round(inner * clamped);
  const block = 4;
  const count = Math.floor(filled / block);
  for (let i = 0; i < count; i++) {
    const bx = mirrored ? x + 1 + inner - (i + 1) * block : x + 1 + i * block;
    box(g, bx, y + 1, block - 1, h - 2, color);
  }
  // 남은 자투리도 한 블록(끝이 뚝 끊겨 보이지 않게).
  const rest = filled - count * block;
  if (rest > 0) {
    const bx = mirrored ? x + 1 + inner - filled : x + 1 + count * block;
    box(g, bx, y + 1, rest, h - 2, color);
  }
}

function portrait(
  g: CanvasRenderingContext2D,
  sprites: DotSpritesApi,
  id: string,
  x: number, y: number, size: number,
  alternate: boolean,
  accent: string,
): void {
  panel(g, x, y, size, size, { fill: DOT.shade, top: DOT.stone, side: DOT.ink, border: DOT.ink });
  if (!sprites.drawPortrait(g, id, x + 2, y + 2, size - 4, alternate)) {
    box(g, x + 2, y + 2, size - 4, size - 4, DOT.panel);
  }
  box(g, x, y + size - 3, size, 3, accent);
}

/** 감정 표시: 3단계를 얼굴 도트로. */
function mood(g: CanvasRenderingContext2D, x: number, y: number, ratio: number): void {
  const energetic = ratio > 0.66;
  const tired = ratio <= 0.33;
  const color = energetic ? DOT.hp : tired ? DOT.p1 : DOT.gold;
  box(g, x, y, 13, 13, DOT.ink);
  box(g, x + 1, y + 1, 11, 11, DOT.shade);
  box(g, x + 3, y + 4, 2, 2, color);
  box(g, x + 8, y + 4, 2, 2, color);
  if (energetic) {
    box(g, x + 4, y + 8, 5, 1, color);
    box(g, x + 4, y + 7, 1, 1, color);
    box(g, x + 8, y + 7, 1, 1, color);
  } else if (tired) {
    box(g, x + 4, y + 9, 5, 1, color);
  } else {
    box(g, x + 4, y + 8, 5, 1, color);
  }
}

export function drawPixelHud(g: CanvasRenderingContext2D, width: number, height: number, view: HudView): void {
  if (width % DOT_K_BATTLE !== 0) return;
  void height;
  const { p1, p2, sprites } = view;
  sprites.request(p1.data.id);
  sprites.request(p2.data.id);

  inDotGrid(g, DOT_K_BATTLE, (c) => {
    // 위쪽 어두운 띠: HUD가 배경 위에서 읽히게. 디더 대신 단색 + 1px 경계(픽셀 잡음 없음).
    box(c, 0, 0, VIEW_W, 52, DOT.ink);
    box(c, 0, 52, VIEW_W, 1, DOT.stone);

    portrait(c, sprites, p1.data.id, 4, 4, 40, p1.useAlternatePalette, DOT.p1);
    portrait(c, sprites, p2.data.id, VIEW_W - 44, 4, 40, p2.useAlternatePalette, DOT.p2);

    // 체력: 가운데에서 바깥으로 줄어드는 방향(1P 왼쪽 정렬, 2P 오른쪽 정렬).
    const barW = 150;
    blockBar(c, 48, 8, barW, 12, p1.health / p1.maxHealth, DOT.hp, false);
    blockBar(c, VIEW_W - 48 - barW, 8, barW, 12, p2.health / p2.maxHealth, DOT.hp, true);

    // 이름표.
    text(c, p1.data.name, 50, 24, { size: 11, color: DOT.white });
    text(c, p2.data.name, VIEW_W - 50, 24, { size: 11, color: DOT.white, align: 'right' });

    // 라운드 점: 4px 사각형.
    for (let i = 0; i < ROUNDS_TO_WIN; i++) {
      box(c, 48 + i * 8, 38, 6, 6, i < p1.roundWins ? DOT.gold : DOT.hpBack);
      box(c, VIEW_W - 48 - (i + 1) * 8, 38, 6, 6, i < p2.roundWins ? DOT.gold : DOT.hpBack);
    }

    // 게이지: 얇은 블록 눈금 + 꽉 차면 '특수기 준비'.
    const meterW = 104;
    const meterY = 37;
    blockBar(c, 80, meterY, meterW, 6, p1.meter / MAX_METER, p1.meter >= MAX_METER ? DOT.gold : DOT.moss, false);
    blockBar(c, VIEW_W - 80 - meterW, meterY, meterW, 6, p2.meter / MAX_METER, p2.meter >= MAX_METER ? DOT.gold : DOT.moss, true);
    if (p1.meter >= MAX_METER) cursor(c, 74, meterY - 2, DOT.gold, 2);
    if (p2.meter >= MAX_METER) cursor(c, VIEW_W - 66, meterY - 2, DOT.gold, 2);

    // 감정 3단계.
    mood(c, 48, 42, p1.health / p1.maxHealth);
    mood(c, VIEW_W - 61, 42, p2.health / p2.maxHealth);

    // 타이머: 가운데, 도트 글자.
    box(c, VIEW_W / 2 - 22, 4, 44, 26, DOT.ink);
    outline(c, VIEW_W / 2 - 22, 4, 44, 26, DOT.stone);
    text(c, `${view.timeLeft}`, VIEW_W / 2, 9, { size: 16, color: DOT.gold, align: 'center' });

    // 1P/2P 색 표식(색 구분은 팔레트 시트가 맡고, 여기선 이름표 아래 색 띠).
    box(c, 48, 21, 34, 2, DOT.p1);
    box(c, VIEW_W - 82, 21, 34, 2, DOT.p2);

    if (view.difficulty === 'easy' || view.assist) {
      const label = `난이도 ${view.difficulty === 'easy' ? '쉬움' : '보통'}${view.assist ? ' · 도움 켜짐' : ''}`;
      text(c, label, VIEW_W / 2, 39, { size: 10, color: DOT.dim, align: 'center' });
    }

    // 화면 아래: 조작 힌트.
    box(c, 0, 264, VIEW_W, 6, DOT.ink);
    text(c, 'F/G/H · J/K/L · Esc', 4, 263, { size: 8, color: DOT.stone });
  });
}

/**
 * 라운드/승부 연출 글자(ROUND 1 · 시작! · K.O. · 승리)의 도트 버전.
 * 로고 이미지·둥근 띠·회전 대신 판 + 도트 글자만 쓴다.
 */
export function drawPixelCallout(
  g: CanvasRenderingContext2D,
  width: number,
  height: number,
  label: string,
  sub = '',
  color: string = DOT.gold,
): void {
  if (width % DOT_K_BATTLE !== 0) return;
  void height;
  inDotGrid(g, DOT_K_BATTLE, (c) => {
    const w = Math.max(120, label.length * 26 + 40);
    const h = sub ? 54 : 42;
    const x = Math.round(W2 / 2 - w / 2);
    const y = 96;
    panel(c, x, y, w, h, { fill: DOT.ink, top: DOT.stone, side: DOT.ink, border: DOT.gold });
    dither(c, x + 2, y + 2, w - 4, h - 4, DOT.shade, 2);
    text(c, label, W2 / 2, y + 8, { size: 20, color, align: 'center' });
    if (sub) text(c, sub, W2 / 2, y + 34, { size: 8, color: DOT.dim, align: 'center' });
  });
}

const W2 = 480;
