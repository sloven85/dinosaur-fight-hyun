/**
 * 도트 화면들 — 타이틀·모드·캐릭터 선택·경기장 선택·VS·결과·설정·일시정지.
 *
 * 모든 좌표는 아티스트 UI 원본(640×360)의 '아트 px'이고, 화면에는 3배(1920×1080)로 그려진다.
 * 아티스트가 준 보드 그림을 바탕으로 그 위에 도트 글자·판·커서만 얹는다(보드에 글자는 없다).
 * 보드가 아직 안 왔으면 같은 팔레트의 도트 판으로 대신한다 — 매끈한 벡터 UI는 한 화면도 없다.
 */
import { CHARACTERS, getStage } from '../../data';
import type { AssetLoader } from '../AssetLoader';
import { dotSprites, PORTRAIT_SIZE } from './DotSprites';
import { renderDotBackdropArt } from './PixelStageFallback';
import {
  DOT, DOT_K_UI, box, cursor, dither, dotTextWidth, drawUiBoard, inDotGrid, outline, panel, parchment,
  text, textCenter, textLines, uiBoard,
} from './PixelStyle';

const W = 640;
const H = 360;

export interface MenuTab { label: string }

/** 보드가 없을 때: 같은 팔레트의 밤 하늘 + 능선(도트). */
function fallbackBackdrop(g: CanvasRenderingContext2D, tint: string): void {
  box(g, 0, 0, W, H, DOT.deep);
  for (let y = 0; y < H; y += 4) {
    box(g, 0, y, W, 2, y % 8 === 0 ? DOT.shade : tint);
  }
  dither(g, 0, 150, W, 210, DOT.ink, 4);
}

function board(g: CanvasRenderingContext2D, loader: AssetLoader, name: 'title' | 'menu' | 'select' | 'stage', tint: string): void {
  const image = uiBoard(loader, name);
  if (image) drawUiBoard(g, image);
  else fallbackBackdrop(g, tint);
}

/** 판 폭에 맞춰 글자를 자른다(말줄임 없이 마지막 글자만 제거 — 글자 겹침 방지). */
function clipText(value: string, size: number, maxWidth: number): string {
  if (dotTextWidth(value, size) <= maxWidth) return value;
  let out = value;
  while (out.length > 1 && dotTextWidth(`${out}…`, size) > maxWidth) out = out.slice(0, -1);
  return `${out}…`;
}

/** 가로 메뉴 탭 줄(아래 배너 안). */
function tabRow(
  g: CanvasRenderingContext2D,
  items: MenuTab[],
  index: number,
  cx: number,
  y: number,
  height = 26,
): void {
  const widths = items.map((item) => Math.max(72, dotTextWidth(item.label, 11) + 26));
  const gap = 8;
  const total = widths.reduce((a, b) => a + b, 0) + gap * (items.length - 1);
  let x = Math.round(cx - total / 2);
  items.forEach((item, i) => {
    const selected = i === index;
    const w = widths[i];
    parchment(g, x, y, w, height);
    if (selected) {
      box(g, x + 2, y + 2, w - 4, height - 4, DOT.gold);
      box(g, x + 2, y + 2, w - 4, 2, DOT.white);
      textCenter(g, item.label, x + w / 2, y + height / 2, { size: 11, color: DOT.ink });
      cursor(g, x - 9, y + height / 2 - 4, DOT.ink, 2);
    } else {
      box(g, x + 2, y + height - 5, w - 4, 1, DOT.parchmentDark);
      textCenter(g, item.label, x + w / 2, y + height / 2, { size: 11, color: DOT.ink });
    }
    x += w + gap;
  });
}

/** 세로 메뉴(패널 안). */
function listRows(
  g: CanvasRenderingContext2D,
  items: string[],
  index: number,
  x: number,
  y: number,
  w: number,
  rowH: number,
  size = 11,
): void {
  items.forEach((label, i) => {
    const selected = i === index;
    const rowY = y + i * rowH;
    if (selected) {
      box(g, x, rowY, w, rowH - 4, DOT.gold);
      box(g, x, rowY, w, 2, DOT.white);
      box(g, x, rowY + rowH - 6, w, 2, DOT.goldDark);
      text(g, label, x + 16, rowY + Math.round((rowH - 4 - size) / 2), { size, color: DOT.ink });
      cursor(g, x + 6, rowY + Math.round((rowH - 4) / 2) - 4, DOT.ink, 2);
    } else {
      box(g, x, rowY, w, rowH - 4, DOT.panel);
      outline(g, x, rowY, w, rowH - 4, DOT.ink);
      text(g, label, x + 16, rowY + Math.round((rowH - 4 - size) / 2), { size, color: DOT.dim });
    }
  });
}

// --- 타이틀 ---

export interface TitleView {
  loader: AssetLoader;
  options: string[];
  index: number;
  padHint: string;
  p1: string;
  p2: string;
  controls: string;
  sound: string;
}

/** 아래 양피지 배너(아티스트 보드 실측) 안쪽 행. */
export const TITLE_BANNER_TOP = 311;
export const TITLE_BANNER_BOTTOM = 341;
/** 위쪽 양피지 배너(보드 실측 y 35..88). 로고는 이 안쪽에만 앉힌다. */
export const TITLE_HEAD_TOP = 35;
export const TITLE_HEAD_BOTTOM = 88;
/** 메뉴 탭 줄과 그 아래 안내문 사이 간격(아트 px). */
export const TITLE_TAB_GAP = 9;

export function drawTitleScreen(g: CanvasRenderingContext2D, view: TitleView): void {
  inDotGrid(g, DOT_K_UI, (c) => {
    board(c, view.loader, 'title', DOT.shade);
    // 상단 배너(아티스트가 비워 둔 자리)에 로고를 도트 글자로 앉힌다.
    // 글자는 잉크 기준으로 가운데를 맞추므로(TextCenter) 두 줄 모두 배너 안쪽에 들어온다.
    // 배경을 2×2 블록(화면 6px)으로 눌렀으므로 로고도 굵게: 1px 오프셋 한 번(2아트px 획).
    textCenter(c, '다이노 파이터즈', W / 2, 51, { size: 22, color: DOT.ink, weight: 2 });
    textCenter(c, 'DINO  FIGHTERS', W / 2, 73, { size: 11, color: DOT.ink, weight: 2 });

    // 메뉴: 배너 바로 위 풀밭 줄에 가로 탭. 아래 양피지 배너와 9아트px 띄운다.
    const tabH = 26;
    tabRow(c, view.options.map((label) => ({ label })), view.index, W / 2, TITLE_BANNER_TOP - TITLE_TAB_GAP - tabH, tabH);

    // 안내문은 아래 양피지 배너 안에 한 줄로 넣고 위아래 여백을 남긴다(겹침 없음).
    textCenter(c, view.controls, W / 2, TITLE_BANNER_TOP + 12, { size: 11, color: DOT.ink });

    // 패드·소리·참가 상태: 우상단 판. 위쪽 배너(x≈450)와 겹치지 않게 폭을 좁게 잡는다.
    const statusLine = `1P ${view.p1} · 2P ${view.p2}`;
    // '·' 로 나뉜 안내는 각각 따로 줄바꿈한다(단어 중간에서 끊기지 않게).
    const padLines = view.padHint.split(' · ').flatMap((part) => wrap(part, 9, 150).split('\n'));
    const statusLines = [statusLine, view.sound];
    const padW = Math.max(
      ...padLines.map((line) => dotTextWidth(line, 9)),
      ...statusLines.map((line) => dotTextWidth(line, 9)),
    ) + 12;
    const lineH = 11;
    panel(c, W - padW - 6, 6, padW, (padLines.length + statusLines.length) * lineH + 8, {
      fill: DOT.deep, top: DOT.shade, side: DOT.ink, border: DOT.stone,
    });
    textLines(c, padLines.join('\n'), W - 12, 11, { size: 9, color: DOT.parchment, align: 'right' }, 2);
    textLines(c, statusLines.join('\n'), W - 12, 11 + padLines.length * lineH, { size: 9, color: DOT.gold, align: 'right' }, 2);
  });
}

// --- 모드 선택 ---

export interface ModeView {
  loader: AssetLoader;
  options: string[];
  index: number;
  hint: string;
}

export function drawModeScreen(g: CanvasRenderingContext2D, view: ModeView): void {
  inDotGrid(g, DOT_K_UI, (c) => {
    board(c, view.loader, 'menu', DOT.shade);
    // 왼쪽 석조 패널 안쪽(아트 px 52..186, 48..302)에 메뉴를 넣는다.
    panel(c, 50, 46, 138, 258, { fill: DOT.panel, top: DOT.panelTop, side: DOT.ink, border: DOT.ink });
    panel(c, 54, 50, 130, 250, { fill: DOT.deep, top: DOT.shade, side: DOT.ink, border: DOT.stone });
    textCenter(c, '모드', 119, 64, { size: 14, color: DOT.gold });
    box(c, 66, 76, 106, 1, DOT.stone);
    listRows(c, view.options, view.index, 64, 86, 112, 34, 11);
    textLines(c, wrap(view.hint, 12, 112), 64, 232, { size: 12, color: DOT.dim }, 3);
    textCenter(c, '확인 · 취소 뒤로', 119, 292, { size: 11, color: DOT.dim });
  });
}

/** 아주 단순한 도트 줄바꿈(공백 기준). */
function wrap(value: string, size: number, maxWidth: number): string {
  const words = value.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (dotTextWidth(candidate, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.join('\n');
}

// --- 캐릭터 선택 ---

export interface SelectPickView { cursor: number; locked: boolean }

export interface SelectView {
  loader: AssetLoader;
  picks: [SelectPickView, SelectPickView];
  hovered: {
    name: string;
    archetype: string;
    cardNote?: string;
    description: string;
    special: string;
    speed: number;
    power: number;
    toughness: number;
  } | null;
  settings: string[];
  twoPlayer: boolean;
}

/** 아티스트 선택 보드의 빈 슬롯 좌표(아트 px) — 6열 2행. */
export const SELECT_SLOTS: ReadonlyArray<{ x: number; y: number }> = [117, 205].flatMap(
  (y) => [98, 177, 256, 335, 415, 494].map((x) => ({ x, y })),
);

/** 상단 양피지 배너(아티스트 보드 실측) 안쪽 폭 — 제목과 설정 칩이 이 안에 들어간다. */
export const SELECT_BANNER = { left: 104, right: 540, y: 44 } as const;

/**
 * 선택 화면 상단 배너의 설정 칩 문구.
 * 난이도·도움은 1인 대전에서만 적용되므로 2인 대전에서는 그 사실을 그대로 적는다(기존판 C3 판과 같은 내용).
 */
export function selectSettingsChip(settings: readonly string[], twoPlayer: boolean): string {
  const difficulty = settings[0] ?? '난이도 보통';
  const assist = settings[1] ?? '도움 꺼짐';
  return twoPlayer ? `${settings[2] ?? '2인 대전'} · 난이도·도움 미적용` : `${difficulty} · ${assist}`;
}

export function drawSelectScreen(g: CanvasRenderingContext2D, view: SelectView): void {
  const sprites = dotSprites(view.loader);
  for (const character of CHARACTERS) sprites.request(character.id);

  inDotGrid(g, DOT_K_UI, (c) => {
    board(c, view.loader, 'select', DOT.shade);
    // 상단 배너: 왼쪽에 제목, 오른쪽에 지금 적용되는 난이도·도움(기존판과 같은 정보).
    text(c, '공룡을 고르세요', SELECT_BANNER.left + 40, SELECT_BANNER.y, { size: 13, color: DOT.ink });
    // 오른쪽 칩은 배너 안쪽(양피지)에서 끝나게 자른다 — 넘치면 횃불 그림 위로 나간다.
    text(c, clipText(selectSettingsChip(view.settings, view.twoPlayer), 10, 150), SELECT_BANNER.right - 40, SELECT_BANNER.y + 2, {
      size: 10, color: view.twoPlayer ? DOT.parchmentDark : DOT.ink, align: 'right',
    });

    CHARACTERS.forEach((character, i) => {
      const slot = SELECT_SLOTS[i];
      if (!slot) return;
      // 초상은 슬롯(49)보다 조금 크게 그려 머리가 잘리지 않게 한다(픽셀은 1:1 그대로).
      const px = slot.x - 8;
      const py = slot.y - 9;
      panel(c, px - 2, py - 2, PORTRAIT_SIZE + 4, PORTRAIT_SIZE + 4, {
        fill: DOT.ink, top: DOT.stone, side: DOT.ink, border: DOT.ink,
      });
      if (!sprites.drawPortrait(c, character.id, px, py, PORTRAIT_SIZE)) {
        box(c, px, py, PORTRAIT_SIZE, PORTRAIT_SIZE, DOT.panel);
        textCenter(c, character.name.slice(0, 2), px + PORTRAIT_SIZE / 2, py + PORTRAIT_SIZE / 2, {
          size: 16, color: DOT.dim,
        });
      }
      // 1P/2P 커서: 모서리 브래킷(둥근 테두리 없음).
      const bracket = (x: number, y: number, w: number, h: number, color: string, thick: number): void => {
        box(c, x, y, w, thick, color); box(c, x, y, thick, h, color);
        box(c, x, y + h - thick, w, thick, color); box(c, x + w - thick, y, thick, h, color);
      };
      const bx = slot.x - 9;
      const by = slot.y - 10;
      if (view.picks[1].cursor === i) bracket(bx - 2, by - 2, PORTRAIT_SIZE + 4, PORTRAIT_SIZE + 4, DOT.p2, 2);
      if (view.picks[0].cursor === i) bracket(bx, by, PORTRAIT_SIZE + 2, PORTRAIT_SIZE + 2, DOT.p1, 2);
      if (view.picks[0].locked && view.picks[0].cursor === i) box(c, bx + PORTRAIT_SIZE - 8, by + 2, 6, 6, DOT.gold);
      if (view.picks[1].locked && view.picks[1].cursor === i) box(c, bx + 2, by + 2, 6, 6, DOT.gold);
    });

    // 하단 정보 띠: 고른 공룡 이름·설명·능력 눈금·특수기.
    panel(c, 20, 272, 600, 84, { fill: DOT.panel, top: DOT.panelTop, side: DOT.ink, border: DOT.ink });
    panel(c, 24, 276, 592, 76, { fill: DOT.deep, top: DOT.shade, side: DOT.ink, border: DOT.stone });
    if (view.hovered) {
      text(c, view.hovered.name, 34, 281, { size: 18, color: DOT.gold });
      text(c, view.hovered.archetype, 44 + dotTextWidth(view.hovered.name, 18), 288, { size: 13, color: DOT.moss });
      text(c, clipText(view.hovered.description, 13, 470), 34, 305, { size: 13, color: DOT.white });
      const pips = (label: string, value: number, x: number, y: number): void => {
        text(c, label, x, y, { size: 13, color: DOT.dim });
        const px = x + dotTextWidth(label, 13) + 6;
        for (let i = 0; i < 5; i++) box(c, px + i * 10, y + 2, 8, 9, i < value ? DOT.gold : DOT.hpBack);
      };
      pips('빠름', view.hovered.speed, 34, 321);
      pips('힘', view.hovered.power, 140, 321);
      pips('단단함', view.hovered.toughness, 222, 321);
      text(c, `특수기 · ${clipText(view.hovered.special, 13, 130)}`, 384, 321, { size: 13, color: DOT.dim });

    }
    text(c, '이동 방향키 · 확인 F/J · 취소 G/K', 34, 339, { size: 11, color: DOT.stoneLight });
    const p1State = `1P ${view.picks[0].locked ? '확정' : '고르는 중'}`;
    const p2State = `2P ${view.picks[1].locked ? '확정' : '고르는 중'}`;
    text(c, p2State, 606, 339, { size: 11, color: DOT.p2, align: 'right' });
    text(c, p1State, 606 - dotTextWidth(p2State, 11) - 12, 339, { size: 11, color: DOT.p1, align: 'right' });
  });
}

// --- 경기장 선택 ---

export interface StageView {
  loader: AssetLoader;
  stages: ReadonlyArray<{ id: string; name: string; note: string; tint: string }>;
  index: number;
}

const STAGE_COLS_TOKENS = 4;

export function drawStageScreen(g: CanvasRenderingContext2D, view: StageView): void {
  inDotGrid(g, DOT_K_UI, (c) => {
    board(c, view.loader, 'stage', DOT.shade);
    textCenter(c, '경기장을 고르세요', W / 2, 24, { size: 12, color: DOT.ink });

    // 섬 그림이 이미 있으니 카드는 그 위에 얇게 얹는다(가림 최소).
    const cardW = 138;
    const cardH = 44;
    const gapX = 10;
    const gapY = 6;
    const totalW = STAGE_COLS_TOKENS * cardW + (STAGE_COLS_TOKENS - 1) * gapX;
    const x0 = Math.round((W - totalW) / 2);
    const y0 = 244;

    view.stages.forEach((stage, i) => {
      const x = x0 + (i % STAGE_COLS_TOKENS) * (cardW + gapX);
      const y = y0 + Math.floor(i / STAGE_COLS_TOKENS) * (cardH + gapY);
      const selected = i === view.index;
      panel(c, x, y, cardW, cardH, {
        fill: selected ? DOT.panelTop : DOT.panel, top: selected ? DOT.gold : DOT.stone,
        side: DOT.ink, border: selected ? DOT.gold : DOT.ink,
      });
      // 섬 아이콘: 경기장 색으로 도트 섬(둥근·그라디언트 없음).
      const islandX = x + 8;
      const islandY = y + 12;
      box(c, islandX + 4, islandY + 6, 22, 5, stage.tint);
      box(c, islandX + 1, islandY + 11, 28, 5, DOT.shade);
      box(c, islandX + 6, islandY + 2, 16, 4, DOT.moss);
      box(c, islandX + 10, islandY, 8, 3, DOT.stoneLight);
      text(c, clipText(stage.name, 12, cardW - 48), x + 36, y + 10, { size: 12, color: selected ? DOT.gold : DOT.white });
      text(c, clipText(stage.note, 11, cardW - 46), x + 36, y + 25, { size: 11, color: DOT.dim });
      if (selected) cursor(c, x + cardW - 10, y + 8, DOT.gold, 2);
    });

    textCenter(c, '좌우·위아래 이동 · 확인 선택 · 취소 뒤로', W / 2, 346, { size: 11, color: DOT.parchment });
  });
}

// --- VS ---

export interface VsView {
  loader: AssetLoader;
  p1: { id: string; name: string };
  p2: { id: string; name: string };
  stage: string;
  progress: number;
  status: string;
}

export function drawVsScreen(g: CanvasRenderingContext2D, view: VsView): void {
  const sprites = dotSprites(view.loader);
  sprites.request(view.p1.id);
  sprites.request(view.p2.id);
  inDotGrid(g, DOT_K_UI, (c) => {
    // 도트 무대: 어두운 3단 띠 + 사선 줄(그라디언트 대신).
    box(c, 0, 0, W, H, DOT.deep);
    box(c, 0, 120, W, 120, DOT.shade);
    box(c, 0, 300, W, 60, DOT.ink);
    for (let i = -H; i < W; i += 44) {
      for (let y = 0; y < H; y += 4) {
        const x = i + Math.round(y * 0.6);
        if (x >= 0 && x < W && y > 110 && y < 296) box(c, x, y, 2, 2, DOT.shade);
      }
    }
    dither(c, 0, 0, W, 100, DOT.ink, 4);

    textCenter(c, '대결', W / 2, 28, { size: 12, color: DOT.dim });

    // 스프라이터 1:1 (아트 px). 발을 지면선에 맞춘다.
    sprites.drawState(c, view.p1.id, 'idle', 0, 150, 300, 1);
    sprites.drawState(c, view.p2.id, 'idle', 0, W - 150, 300, -1);
    box(c, 0, 300, W, 2, DOT.stone);

    panel(c, 120, 304, 150, 24, { fill: DOT.panel, top: DOT.panelTop, side: DOT.ink, border: DOT.ink });
    box(c, 120, 325, 150, 3, DOT.p1);
    textCenter(c, view.p1.name, 195, 316, { size: 11, color: DOT.white });
    panel(c, W - 270, 304, 150, 24, { fill: DOT.panel, top: DOT.panelTop, side: DOT.ink, border: DOT.ink });
    box(c, W - 270, 325, 150, 3, DOT.p2);
    textCenter(c, view.p2.name, W - 195, 316, { size: 11, color: DOT.white });

    // VS 글자: 픽셀 블록 그림자 없이 1px 외곽선만.
    textCenter(c, 'VS', W / 2 + 1, 168, { size: 34, color: DOT.ink });
    textCenter(c, 'VS', W / 2, 166, { size: 34, color: DOT.gold });

    textCenter(c, view.stage, W / 2, 336, { size: 11, color: DOT.white });
    textCenter(c, clipText(view.status, 11, 460), W / 2, 350, { size: 11, color: DOT.dim });
  });
}

// --- 결과 ---

/** 결과 화면에서 승자가 서는 지면선(아트 px) — 배경 레이어의 standLine(298)과 같은 행. */
export const RESULT_GROUND_Y = 298;
/** 아래 선택 띠의 위쪽 경계. 승자 발(298) 아래에서 시작해 배경을 가리지 않는다. */
const RESULT_DOCK_TOP = 300;

/** 결과 화면 뒤에 깔 도트 배경(경기장 3레이어). 없으면 어두운 도트 판으로 대신한다. */
export interface ResultBackdrop {
  renderArt(g: CanvasRenderingContext2D, stage: string, focusX: number, width: number): boolean;
}

export interface ResultView {
  loader: AssetLoader;
  winner: 0 | 1 | null;
  winnerId: string | null;
  /** 승자 종 이름(제목 아래 한 줄). */
  winnerName?: string;
  options: string[];
  index: number;
  /** 경기장 id — 결과 화면은 그 무대의 밀림 배경을 이어서 깐다. */
  stage?: string;
  background?: ResultBackdrop;
}

export function drawResultScreen(g: CanvasRenderingContext2D, view: ResultView): void {
  const sprites = dotSprites(view.loader);
  inDotGrid(g, DOT_K_UI, (c) => {
    // 1) 전투가 끝난 경기장의 밀림 배경 3레이어 → 2) 어둡게 눌러 → 3) 승자·문구를 위에.
    const backdrop = view.stage && view.background
      ? view.background.renderArt(c, view.stage, 0, W)
      : false;
    if (!backdrop) {
      // 레이어 아트가 없는 경기장은 전투와 같은 절차적 도트 배경을 이어서 깐다
      // (평평한 판을 깔면 "그 경기장에서 끝난 판"이 아니라 다른 화면처럼 보인다).
      const stage = view.stage ? getStage(view.stage) : null;
      if (stage) {
        renderDotBackdropArt(
          c,
          { id: stage.id, groundY: stage.groundY, placeholderColor: stage.placeholderColor },
          RESULT_GROUND_Y,
        );
      } else {
        fallbackBackdrop(c, DOT.shade);
      }
    }
    // 배경 위에 글자·스프라이트가 묻히지 않게 한 겹 눌러 준다(그라디언트 없이 단색 한 겹).
    box(c, 0, 0, W, H, 'rgba(8, 14, 16, 0.58)');
    // 제목 띠와 아래 선택 띠는 조금 더 눌러 경계를 만든다(제목 잉크 28px + 이름 11px이 안에 들어온다).
    box(c, 0, 0, W, 66, 'rgba(8, 14, 16, 0.45)');
    box(c, 0, 66, W, 1, DOT.stone);
    box(c, 0, RESULT_DOCK_TOP, W, H - RESULT_DOCK_TOP, 'rgba(8, 14, 16, 0.78)');
    box(c, 0, RESULT_DOCK_TOP, W, 1, DOT.stone);

    const color = view.winner === 0 ? DOT.p1 : view.winner === 1 ? DOT.p2 : DOT.dim;
    textCenter(c, view.winner === null ? '무승부' : `${view.winner + 1}P 승리`, W / 2, 30, { size: 28, color, weight: 2 });
    if (view.winnerName) {
      textCenter(c, clipText(view.winnerName, 11, 360), W / 2, 54, { size: 11, color: DOT.white });
    }

    if (view.winnerId) {
      sprites.request(view.winnerId);
      // 승리 포즈 1:1, 발을 배경 지면선(298)에 맞춘다. 발밑 그림자는 판이 아니라 2px 막대 하나.
      box(c, W / 2 - 46, RESULT_GROUND_Y - 3, 92, 3, 'rgba(0, 0, 0, 0.38)');
      sprites.drawState(c, view.winnerId, 'victory', 0, W / 2, RESULT_GROUND_Y, view.winner === 1 ? -1 : 1);
    }
    tabRow(c, view.options.map((label) => ({ label })), view.index, W / 2, RESULT_DOCK_TOP + 14, 26);
    textCenter(c, '위아래 이동 · 확인 선택', W / 2, 346, { size: 10, color: DOT.dim });
  });
}

// --- 어른 설정 ---

export interface SettingsView {
  loader: AssetLoader;
  title: string;
  hint: string;
  rows: string[];
  values: string[];
  index: number;
  footer: string;
}

export function drawSettingsScreen(g: CanvasRenderingContext2D, view: SettingsView): void {
  inDotGrid(g, DOT_K_UI, (c) => {
    board(c, view.loader, 'menu', DOT.shade);
    dither(c, 0, 0, W, H, DOT.ink, 4);
    panel(c, 60, 24, 520, 312, { fill: DOT.deep, top: DOT.shade, side: DOT.ink, border: DOT.stone });
    textCenter(c, view.title, W / 2, 36, { size: 14, color: DOT.gold });
    textCenter(c, clipText(view.hint, 12, 470), W / 2, 54, { size: 12, color: DOT.dim });
    box(c, 76, 70, 488, 1, DOT.stone);

    const rowH = 17;
    view.rows.forEach((label, i) => {
      const y = 78 + i * rowH;
      const selected = i === view.index;
      if (selected) {
        box(c, 74, y - 2, 492, rowH - 2, DOT.gold);
        cursor(c, 78, y + 4, DOT.ink, 2);
        text(c, clipText(label, 12, 260), 90, y + 1, { size: 12, color: DOT.ink });
        text(c, view.values[i] ?? '', 558, y + 1, { size: 12, color: DOT.ink, align: 'right' });
      } else {
        text(c, clipText(label, 12, 260), 90, y + 1, { size: 12, color: DOT.dim });
        text(c, view.values[i] ?? '', 558, y + 1, { size: 12, color: DOT.white, align: 'right' });
      }
    });
    box(c, 76, 262, 488, 1, DOT.stone);
    textCenter(c, clipText(view.footer, 11, 460), W / 2, 284, { size: 11, color: DOT.dim });
    textCenter(c, '좌우로 값 변경 · 확인 선택 · 취소 뒤로', W / 2, 306, { size: 11, color: DOT.stoneLight });
  });
}

// --- 일시정지 ---

export interface PauseView {
  loader: AssetLoader;
  items: string[];
  index: number;
  title: string;
  detail: string;
  confirming: string | null;
  confirmIndex: number;
}

export function drawPauseScreen(g: CanvasRenderingContext2D, view: PauseView): void {
  inDotGrid(g, DOT_K_UI, (c) => {
    // 배경은 단색 반투명으로만 어둡게(체커 디더는 화면을 시끄럽게 만든다).
    c.globalAlpha = 0.86;
    box(c, 0, 0, W, H, DOT.ink);
    c.globalAlpha = 1;
    panel(c, 150, 80, 340, 200, { fill: DOT.panel, top: DOT.panelTop, side: DOT.ink, border: DOT.ink });
    panel(c, 156, 86, 328, 188, { fill: DOT.deep, top: DOT.shade, side: DOT.ink, border: DOT.stone });
    textCenter(c, view.title, W / 2, 96, { size: 16, color: DOT.gold });
    if (view.detail) textCenter(c, clipText(view.detail, 12, 300), W / 2, 116, { size: 12, color: DOT.p1 });
    box(c, 172, 132, 296, 1, DOT.stone);
    listRows(c, view.items, view.index, 172, 140, 296, 26, 11);
    if (view.confirming) {
      panel(c, 190, 214, 260, 54, { fill: DOT.panel, top: DOT.panelTop, side: DOT.ink, border: DOT.gold });
      textCenter(c, view.confirming, W / 2, 222, { size: 9, color: DOT.white });
      tabRow(c, [{ label: '아니오' }, { label: '네' }], view.confirmIndex, W / 2, 238, 22);
    } else {
      textCenter(c, '확인 또는 일시정지 버튼으로 계속', W / 2, 254, { size: 11, color: DOT.dim });
    }
  });
}
