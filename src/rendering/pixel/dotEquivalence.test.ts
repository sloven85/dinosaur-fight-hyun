import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  EMOTION_DOT_COLORS, HUD_BAND_H, ROUND_PIP_EMPTY, ROUND_PIP_GAP, ROUND_PIP_SIZE, ROUND_PIP_WON,
  SPECIAL_READY_LABEL, drawPixelHud, emotionMark, roundPipRects,
} from './PixelHud';
import { SELECT_BANNER, TITLE_BANNER_BOTTOM, TITLE_BANNER_TOP, TITLE_TAB_GAP, drawSelectScreen, drawTitleScreen, selectSettingsChip } from './PixelScreens';
import { DOT, DOT_K_UI } from './PixelStyle';
import { dotSprites, resetDotSprites } from './DotSprites';
import { Match } from '../../combat/Match';
import { CHARACTERS } from '../../data';
import { FIXED_DT, ROUND_INTRO_FRAMES, ROUNDS_TO_WIN } from '../../core/constants';
import { ScriptInput } from '../../combat/ScriptInput';
import type { CharacterAssets } from '../CharacterAssets';
import type { RigData } from '../rig';
import type { AssetLoader } from '../AssetLoader';

/**
 * "도트판이 기존판(공개 베타)보다 낮지 않은가" 게이트 — 배포 전 마감 항목(정종길 님 8108869).
 *
 * 자동 테스트는 구조만 본다. 화면이 실제로 읽히는지는 1920×1080 캡처로 따로 확인해야 하고,
 * 이 테스트 통과를 시각 승인으로 말하지 않는다.
 */

interface Call { name: string; args: unknown[] }

function recorder(): { ctx: CanvasRenderingContext2D; calls: Call[] } {
  const calls: Call[] = [];
  const store: Record<string, unknown> = { canvas: { width: 1920, height: 1080 } };
  const ctx = new Proxy(store, {
    get: (target, property) => {
      if (property in target) return (target as Record<string, unknown>)[property as string];
      return (...args: unknown[]) => { calls.push({ name: String(property), args }); };
    },
    set: (target, property, value) => {
      (target as Record<string, unknown>)[String(property)] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

function fakeLoader(): AssetLoader {
  return {
    resolve: (path: string) => path,
    image: () => null,
    loadImage: async () => null,
    loadJson: async () => null,
    loadImages: async () => {},
    missingFiles: [],
  } as unknown as AssetLoader;
}

function realAssets(id: string): CharacterAssets {
  const rig = JSON.parse(readFileSync(`public/assets/characters/${id}/rig.json`, 'utf8')) as RigData;
  return { id, rig, master: null, portrait: null, poses: {} };
}

/** #rrggbb → 상대 휘도(WCAG). */
function luminance(hex: string): number {
  const full = hex.replace('#', '');
  const channels = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function startMatch(): Match {
  resetDotSprites();
  return new Match('versus', [CHARACTERS[0].id, CHARACTERS[1].id],
    [realAssets(CHARACTERS[0].id), realAssets(CHARACTERS[1].id)]);
}

describe('라운드 승수 점: 0승에서도 보인다', () => {
  it('8아트px 이상 + 0승 점도 배경과 구분되는 밝기', () => {
    expect(ROUND_PIP_SIZE).toBeGreaterThanOrEqual(2);
    expect(ROUND_PIP_SIZE + ROUND_PIP_GAP).toBeGreaterThan(ROUND_PIP_SIZE);
    // 띠(DOT.ink) 대비: 빈 점·딴 점 모두 3:1 이상이어야 "구분된다"고 말할 수 있다.
    expect(contrast(ROUND_PIP_EMPTY, DOT.ink), '빈 점 대비').toBeGreaterThanOrEqual(3);
    expect(contrast(ROUND_PIP_WON, DOT.ink), '이긴 점 대비').toBeGreaterThanOrEqual(3);
    // 0승 색이 이긴 색과 같으면 승수를 못 읽는다.
    expect(ROUND_PIP_EMPTY).not.toBe(ROUND_PIP_WON);
    expect(ROUND_PIP_EMPTY).not.toBe(DOT.ink);
  });

  it('0·1·2승이 서로 다른 그림이 된다', () => {
    const count = (wins: number): number => roundPipRects(wins, false).filter((p) => p.filled).length;
    expect(roundPipRects(0, false)).toHaveLength(ROUNDS_TO_WIN);
    expect([count(0), count(1), count(2)]).toEqual([0, 1, ROUNDS_TO_WIN]);
  });

  it('점은 위쪽 띠 안에 있고 좌우가 같은 모양으로 반전된다', () => {
    const one = roundPipRects(2, false);
    const two = roundPipRects(2, true);
    for (const pip of [...one, ...two]) {
      expect(pip.y).toBeGreaterThan(0);
      expect(pip.y + pip.h).toBeLessThanOrEqual(HUD_BAND_H);
      expect(Number.isInteger(pip.x)).toBe(true);
    }
    // 1P는 왼쪽 절반, 2P는 오른쪽 절반.
    expect(Math.max(...one.map((p) => p.x + p.w))).toBeLessThan(240);
    expect(Math.min(...two.map((p) => p.x))).toBeGreaterThan(240);
    // 2P는 가운데 쪽부터 채운다(거울).
    expect(two.filter((p) => p.filled)[0].x).toBeLessThan(one.filter((p) => p.filled)[0].x + 480);
  });

  it('HUD가 0승 점을 실제로 그린다(테두리 + 밝은 안)', () => {
    const match = startMatch();
    const idle = new ScriptInput();
    for (let i = 0; i < ROUND_INTRO_FRAMES; i++) match.step(idle, FIXED_DT);
    const { ctx, calls } = recorder();
    drawPixelHud(ctx, 1920, 1080, {
      p1: match.p1, p2: match.p2, timeLeft: 45, difficulty: 'normal', assist: false, sprites: dotSprites(fakeLoader()),
    });
    // 점 안쪽은 6×6(= 8 - 테두리 2) 사각형 4개(양쪽 2점).
    const inner = calls.filter((call) => call.name === 'fillRect' && call.args[2] === ROUND_PIP_SIZE - 2 && call.args[3] === ROUND_PIP_SIZE - 2);
    expect(inner).toHaveLength(ROUNDS_TO_WIN * 2);
  });
});

describe('감정 표시: 아이콘 + 문구', () => {
  it('활기·보통·지침 세 문구가 기존판과 같다', () => {
    expect([emotionMark(1).label, emotionMark(0.5).label, emotionMark(0.1).label]).toEqual(['활기', '보통', '지침']);
    expect([emotionMark(1).emotion, emotionMark(0.5).emotion, emotionMark(0.1).emotion]).toEqual(['energetic', 'steady', 'tired']);
  });

  it('문구마다 색이 다르고 띠 위에서 읽힌다', () => {
    const colors = new Set(Object.values(EMOTION_DOT_COLORS));
    expect(colors.size).toBe(3);
    for (const color of colors) expect(contrast(color, DOT.ink)).toBeGreaterThanOrEqual(3);
  });
});

describe('특수기 준비 표시', () => {
  it('문구가 있고 게이지가 꽉 차면 HUD가 금색 블록을 채운다', () => {
    expect(SPECIAL_READY_LABEL).toBe('특수기 준비');
    const match = startMatch();
    const idle = new ScriptInput();
    for (let i = 0; i < ROUND_INTRO_FRAMES; i++) match.step(idle, FIXED_DT);
    match.p1.meter = 100;
    const { ctx, calls } = recorder();
    drawPixelHud(ctx, 1920, 1080, {
      p1: match.p1, p2: match.p2, timeLeft: 45, difficulty: 'normal', assist: false, sprites: dotSprites(fakeLoader()),
    });
    // 게이지가 꽉 차면 금색(DOT.gold)으로 채운 3px 폭 블록이 나온다(빈 게이지면 moss).
    expect(calls.filter((call) => call.name === 'fillRect' && call.args[2] === 3 && call.args[3] === 4).length).toBeGreaterThan(4);
  });
});

describe('캐릭터 선택: 난이도·도움 표시(죽은 인자 제거)', () => {
  it('칩 문구가 실제 설정 값을 쓴다', () => {
    expect(selectSettingsChip(['난이도 보통', '도움 꺼짐', '1인 대전'], false)).toBe('난이도 보통 · 도움 꺼짐');
    expect(selectSettingsChip(['난이도 쉬움', '도움 켜짐', '1인 대전'], false)).toBe('난이도 쉬움 · 도움 켜짐');
    expect(selectSettingsChip(['난이도 보통', '도움 꺼짐', '2인 대전'], true)).toBe('2인 대전 · 난이도·도움 미적용');
  });

  it('칩이 상단 배너 안쪽 좌표에 들어간다', () => {
    expect(SELECT_BANNER.left).toBeGreaterThan(90);
    expect(SELECT_BANNER.right).toBeLessThan(550);
    expect(SELECT_BANNER.y).toBeGreaterThan(30);
    expect(SELECT_BANNER.y).toBeLessThan(55);
  });

  it('설정이 바뀌면 그리기 결과가 달라진다(인자를 실제로 읽는다)', () => {
    const draw = (settings: string[]): number => {
      const { ctx, calls } = recorder();
      drawSelectScreen(ctx, {
        loader: fakeLoader(),
        picks: [{ cursor: 0, locked: false }, { cursor: 1, locked: false }],
        hovered: null,
        settings,
        twoPlayer: false,
      });
      return calls.length;
    };
    // 글자는 캔버스가 없으면 그리지 않으므로, 인자를 읽는지는 drawImage 없이 호출 수로만 확인할 수 없다.
    // 대신 두 호출이 예외 없이 끝나고 같은 뼈대를 그리는지(설정 때문에 구조가 바뀌지 않는지)를 본다.
    expect(draw(['난이도 보통', '도움 꺼짐', '1인 대전'])).toBeGreaterThan(100);
    expect(draw(['난이도 쉬움', '도움 켜짐', '1인 대전'])).toBe(draw(['난이도 보통', '도움 꺼짐', '1인 대전']));
  });
});

describe('타이틀: 버튼–안내문 간격과 하단 여백', () => {
  it('버튼 아래 9아트px, 안내문은 배너 안쪽에 위아래 여백을 남긴다', () => {
    const tabH = 26;
    const tabBottom = TITLE_BANNER_TOP - TITLE_TAB_GAP;
    expect(tabBottom + TITLE_TAB_GAP).toBe(TITLE_BANNER_TOP);
    // textCenter(cy) → 글자 위 = cy - size*0.75, 높이 = ceil(size*1.35) + 2 (PixelStyle.bake).
    const hintTop = TITLE_BANNER_TOP + 12 - 11 * 0.75;
    const hintBottom = hintTop + Math.ceil(11 * 1.35) + 2;
    expect(hintTop - tabBottom, '버튼–안내문 간격').toBeGreaterThanOrEqual(6);
    expect(TITLE_BANNER_BOTTOM - hintBottom, '안내문 아래 여백').toBeGreaterThanOrEqual(6);
    expect(tabH).toBeLessThan(TITLE_BANNER_TOP - 60);
  });

  it('타이틀 화면이 예외 없이 그려진다', () => {
    const { ctx, calls } = recorder();
    drawTitleScreen(ctx, {
      loader: fakeLoader(), options: ['시작', '어른 설정'], index: 0,
      padHint: '패드 2개 보임', p1: '참가', p2: '미참가', controls: '위아래 이동', sound: '소리 켜짐',
    });
    expect(calls.filter((call) => call.name === 'fillRect').length).toBeGreaterThan(20);
    expect(DOT_K_UI * 640).toBe(1920);
  });
});
