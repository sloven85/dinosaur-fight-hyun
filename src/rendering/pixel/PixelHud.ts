/**
 * 전투 HUD 도트 버전 — 체력바·이름표·초상·게이지·라운드 점·타이머·감정.
 *
 * 전투 화면은 아트 1px = 화면 4px 계약(2026-10-29)을 그대로 쓴다. HUD도 같은 격자,
 * 480×270 아트 좌표 위에 그린다. 둥근 막대·그라디언트 없이 4px 블록 눈금으로 채운다.
 *
 * 기존판(공개 베타)과 같은 정보를 같은 자리에 둔다 — 도트판이 더 낮으면 안 된다(정종길 님 8108869):
 *  - 라운드 승수 점은 0승에서도 보이도록 8아트px + 어두운 테두리 + 밝은 빈 색을 쓴다.
 *  - 감정은 얼굴 아이콘 + 문구(활기·보통·지침)를 함께 쓴다.
 *  - 게이지가 꽉 차면 '특수기 준비' 문구를 게이지 옆에 쓴다.
 */
import type { Fighter } from '../../combat/Fighter';
import { MAX_METER, ROUNDS_TO_WIN } from '../../core/constants';
import { EMOTION_LABELS, emotionFor, type Emotion } from '../../combat/emotion';
import type { DotSpritesApi } from './DotSprites';
import { DOT, DOT_K_BATTLE, box, dither, inDotGrid, outline, panel, text } from './PixelStyle';

export interface HudView {
  p1: Fighter;
  p2: Fighter;
  timeLeft: number;
  difficulty: 'easy' | 'normal';
  assist: boolean;
  sprites: DotSpritesApi;
}

const VIEW_W = 480;
/** 위쪽 정보 띠 높이(아트 px). 감정을 아래 띠로 내리면서 52 → 64로 늘렸다. */
export const HUD_BAND_H = 64;

/** 라운드 점: 8아트px(=화면 32px) 정사각형 + 1px 테두리 — 기존판 24px 원보다 크다. */
export const ROUND_PIP_SIZE = 8;
export const ROUND_PIP_GAP = 4;
/** 0승 점도 배경과 구분되게 밝은 빈 색을 쓴다(예전 hpBack은 띠 색과 거의 같았다). */
export const ROUND_PIP_EMPTY = DOT.stone;
export const ROUND_PIP_WON = DOT.gold;
/** 라운드 점이 놓이는 행(아트 px). 이름표 줄과 같은 높이다. */
export const ROUND_PIP_Y = 40;
/** 라운드 점 묶음이 붙는 x(체력바 안쪽 끝 = 1P 198 / 2P 282에서 시작). */
const PIP_ANCHOR = 198;

/** 게이지가 꽉 찼을 때만 나오는 문구. */
export const SPECIAL_READY_LABEL = '특수기 준비';

/** 감정 문구의 도트 팔레트 색(기존 EMOTION_COLORS와 같은 의미: 활기=초록·보통=노랑·지침=주황). */
export const EMOTION_DOT_COLORS: Record<Emotion, string> = {
  energetic: DOT.hp,
  steady: DOT.gold,
  tired: DOT.p1,
};

export interface EmotionMark { emotion: Emotion; label: string; color: string }

/** 체력 비율 → 감정 3단계(문구·색). 기존판과 같은 기준(0.6 / 0.3)을 쓴다. */
export function emotionMark(healthRatio: number): EmotionMark {
  const emotion = emotionFor(healthRatio);
  return { emotion, label: EMOTION_LABELS[emotion], color: EMOTION_DOT_COLORS[emotion] };
}

export interface PipRect { x: number; y: number; w: number; h: number; filled: boolean }

/**
 * 라운드 승수 점의 자리. 1P는 체력바 안쪽(가운데 쪽) 끝에, 2P는 반대쪽에 같은 모양으로 놓는다.
 * 좌표를 순수 함수로 빼 두어 "0승에서도 보이는가"를 테스트가 직접 검사한다.
 */
export function roundPipRects(wins: number, mirrored: boolean): PipRect[] {
  const step = ROUND_PIP_SIZE + ROUND_PIP_GAP;
  const span = ROUNDS_TO_WIN * ROUND_PIP_SIZE + (ROUNDS_TO_WIN - 1) * ROUND_PIP_GAP;
  const start = mirrored ? VIEW_W - PIP_ANCHOR : PIP_ANCHOR - span;
  return Array.from({ length: ROUNDS_TO_WIN }, (_, i) => ({
    x: mirrored ? start + (ROUNDS_TO_WIN - 1 - i) * step : start + i * step,
    y: ROUND_PIP_Y,
    w: ROUND_PIP_SIZE,
    h: ROUND_PIP_SIZE,
    filled: i < wins,
  }));
}

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

/** 라운드 점: 어두운 테두리를 먼저 깔고 안을 채운다(0승 점도 띠와 구분된다). */
function roundPips(g: CanvasRenderingContext2D, wins: number, mirrored: boolean): void {
  for (const pip of roundPipRects(wins, mirrored)) {
    box(g, pip.x, pip.y, pip.w, pip.h, DOT.ink);
    box(g, pip.x + 1, pip.y + 1, pip.w - 2, pip.h - 2, pip.filled ? ROUND_PIP_WON : ROUND_PIP_EMPTY);
    if (pip.filled) box(g, pip.x + 1, pip.y + 1, pip.w - 2, 1, DOT.parchment);
  }
}

/** 감정 표시: 3단계를 얼굴 도트로(문구는 옆에 따로 쓴다). */
function moodFace(g: CanvasRenderingContext2D, x: number, y: number, mark: EmotionMark): void {
  const color = mark.color;
  box(g, x, y, 13, 13, DOT.ink);
  box(g, x + 1, y + 1, 11, 11, DOT.shade);
  box(g, x + 3, y + 4, 2, 2, color);
  box(g, x + 8, y + 4, 2, 2, color);
  if (mark.emotion === 'energetic') {
    box(g, x + 4, y + 8, 5, 1, color);
    box(g, x + 4, y + 7, 1, 1, color);
    box(g, x + 8, y + 7, 1, 1, color);
  } else if (mark.emotion === 'tired') {
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

  /** 기준 x를 2P에서 좌우 반전한다(1P 왼쪽 정렬 ↔ 2P 오른쪽 정렬). */
  const edge = (mirrored: boolean, x: number, w = 0): number => (mirrored ? VIEW_W - x - w : x);
  const anchor = (mirrored: boolean, x: number): number => (mirrored ? VIEW_W - x : x);

  inDotGrid(g, DOT_K_BATTLE, (c) => {
    // 위쪽 어두운 띠: HUD가 배경 위에서 읽히게. 디더 대신 단색 + 1px 경계(픽셀 잡음 없음).
    box(c, 0, 0, VIEW_W, HUD_BAND_H, DOT.ink);
    box(c, 0, HUD_BAND_H, VIEW_W, 1, DOT.stone);

    const sides = [
      { fighter: p1, mirrored: false, accent: DOT.p1 },
      { fighter: p2, mirrored: true, accent: DOT.p2 },
    ] as const;

    for (const { fighter, mirrored, accent } of sides) {
      const ratio = fighter.health / fighter.maxHealth;

      // 초상은 머리가 들어오는 크기(52)로. 40 이면 머리가 잘려 턱·목만 남았다(검수 2026-10-31).
      portrait(c, sprites, fighter.data.id, edge(mirrored, 4, 52), 4, 52, fighter.useAlternatePalette, accent);

      // 체력: 가운데에서 바깥으로 줄어드는 방향(1P 왼쪽 정렬, 2P 오른쪽 정렬).
      blockBar(c, edge(mirrored, 62, 138), 6, 138, 12, ratio, DOT.hp, mirrored);

      // 1P/2P 색 표식(체력바 바로 아래 얇은 띠).
      box(c, edge(mirrored, 62, 34), 19, 34, 2, accent);

      // 게이지: 얇은 블록 눈금. 꽉 차면 색이 금색으로 바뀌고 옆에 '특수기 준비'.
      const meterW = 70;
      const ready = fighter.meter >= MAX_METER;
      blockBar(c, edge(mirrored, 62, meterW), 23, meterW, 6, fighter.meter / MAX_METER, ready ? DOT.gold : DOT.moss, mirrored);
      if (ready) {
        text(c, SPECIAL_READY_LABEL, anchor(mirrored, 136), 21, {
          size: 9, color: DOT.gold, align: mirrored ? 'right' : 'left',
        });
      }

      // 이름표(라운드 점과 같은 줄, 서로 겹치지 않는 폭).
      text(c, fighter.data.name, anchor(mirrored, 62), 38, { size: 10, color: DOT.white, align: mirrored ? 'right' : 'left' });

      // 라운드 점: 0승에서도 보이는 점.
      roundPips(c, fighter.roundWins, mirrored);
    }

    // 타이머: 가운데, 도트 글자.
    box(c, VIEW_W / 2 - 22, 4, 44, 26, DOT.ink);
    outline(c, VIEW_W / 2 - 22, 4, 44, 26, DOT.stone);
    text(c, `${view.timeLeft}`, VIEW_W / 2, 9, { size: 16, color: DOT.gold, align: 'center' });

    // 1인 대전에서만 난이도·도움을 가운데 아래에 알려 준다(양쪽 이름표·라운드 점과 겹치지 않는 자리).
    if (view.difficulty === 'easy' || view.assist) {
      const label = `난이도 ${view.difficulty === 'easy' ? '쉬움' : '보통'}${view.assist ? ' · 도움 켜짐' : ''}`;
      text(c, label, VIEW_W / 2, 49, { size: 9, color: DOT.dim, align: 'center' });
    }

    // 아래쪽 띠: 감정(아이콘 + 문구)과 조작 힌트. 기존판처럼 양 끝에 1P/2P를 둔다.
    box(c, 0, 250, VIEW_W, 20, DOT.ink);
    box(c, 0, 249, VIEW_W, 1, DOT.stone);
    for (const { fighter, mirrored } of sides) {
      const mark = emotionMark(fighter.health / fighter.maxHealth);
      moodFace(c, edge(mirrored, 4, 13), 254, mark);
      text(c, mark.label, anchor(mirrored, 20), 255, {
        size: 10, color: mark.color, align: mirrored ? 'right' : 'left',
      });
    }
    text(c, 'F/G/H · J/K/L · Esc', VIEW_W / 2, 256, { size: 8, color: DOT.stone, align: 'center' });
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
