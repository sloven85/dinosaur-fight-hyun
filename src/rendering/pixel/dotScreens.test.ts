import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { AssetLoader } from '../AssetLoader';
import { dotUiEnabled } from './pilotFlag';
import {
  RESULT_GROUND_Y, drawModeScreen, drawPauseScreen, drawResultScreen, drawSelectScreen, drawSettingsScreen, drawStageScreen, drawTitleScreen, drawVsScreen,
} from './PixelScreens';
import { drawPixelCallout, drawPixelHud } from './PixelHud';
import { renderDotBackdrop } from './PixelStageFallback';
import { DOT_K_UI } from './PixelStyle';
import { dotSprites, resetDotSprites } from './DotSprites';
import { Match } from '../../combat/Match';
import { CHARACTERS, STAGES } from '../../data';
import type { CharacterAssets } from '../CharacterAssets';
import type { RigData } from '../rig';
import { ROUND_INTRO_FRAMES, FIXED_DT } from '../../core/constants';
import { ScriptInput } from '../../combat/ScriptInput';

/**
 * "화면 전체가 도트인가" 게이트 (정종길 님 8073841 "메뉴·선택 화면 전부 옛날 것").
 *
 * 벡터 UI의 흔적(둥근 모서리·원·베지어·안티에일리어싱 글자)이 한 화면도 남지 않아야 한다.
 * 그래서 이 테스트는 그리기 호출을 모두 기록해 다음을 강제한다:
 *  - roundRect / arc / ellipse / bezier / lineTo / fillText / strokeText / createLinearGradient 호출 0건
 *  - 모든 fillRect 좌표·크기는 정수
 *  - 화면마다 배경을 칠하고, 무언가를 그린다(빈 화면 아님)
 */

interface Call { name: string; args: unknown[] }

function recorder(): { ctx: CanvasRenderingContext2D; calls: Call[] } {
  const calls: Call[] = [];
  const store: Record<string, unknown> = { canvas: { width: 1920, height: 1080 } };
  const ctx = new Proxy(store, {
    get: (target, property) => {
      if (property in target) return (target as Record<string, unknown>)[property as string];
      const name = String(property);
      if (/^create/.test(name)) {
        return (...args: unknown[]) => {
          calls.push({ name, args });
          return { addColorStop: () => {} };
        };
      }
      return (...args: unknown[]) => { calls.push({ name, args }); };
    },
    set: (target, property, value) => {
      (target as Record<string, unknown>)[String(property)] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

const SMOOTH = ['roundRect', 'arc', 'ellipse', 'bezierCurveTo', 'quadraticCurveTo', 'fillText', 'strokeText', 'createLinearGradient', 'createRadialGradient'];

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

function assertDotOnly(calls: Call[], label: string): void {
  const smooth = calls.filter((call) => SMOOTH.includes(call.name)).map((call) => call.name);
  expect(smooth, `${label}: 벡터 UI 호출`).toEqual([]);
  const fractional = calls
    .filter((call) => call.name === 'fillRect' || call.name === 'strokeRect')
    .filter((call) => (call.args as number[]).some((value) => typeof value === 'number' && !Number.isInteger(value)));
  expect(fractional.slice(0, 3), `${label}: 정수 격자 밖 좌표`).toEqual([]);
  expect(calls.filter((call) => call.name === 'fillRect').length, `${label}: 그린 사각형`).toBeGreaterThan(10);
}

function realAssets(id: string): CharacterAssets {
  const rig = JSON.parse(readFileSync(`public/assets/characters/${id}/rig.json`, 'utf8')) as RigData;
  return { id, rig, master: null, portrait: null, poses: {} };
}

describe('도트 화면 그리기(벡터 UI 없음)', () => {
  const loader = fakeLoader();

  it('타이틀', () => {
    const { ctx, calls } = recorder();
    drawTitleScreen(ctx, {
      loader, options: ['시작', '어른 설정', '소리 켜기'], index: 0,
      padHint: '패드 2개 보임', p1: '참가', p2: '미참가', controls: '위아래 이동', sound: '소리 켜짐',
    });
    assertDotOnly(calls, '타이틀');
  });

  it('모드 선택', () => {
    const { ctx, calls } = recorder();
    drawModeScreen(ctx, { loader, options: ['1인 대전', '2인 대전'], index: 0, hint: '2P는 컴퓨터가 조종합니다' });
    assertDotOnly(calls, '모드');
  });

  it('캐릭터 선택(12칸 + 하단 정보)', () => {
    const { ctx, calls } = recorder();
    drawSelectScreen(ctx, {
      loader,
      picks: [{ cursor: 0, locked: false }, { cursor: 1, locked: false }],
      hovered: {
        name: CHARACTERS[0].name, archetype: CHARACTERS[0].archetypeLabel, description: CHARACTERS[0].description,
        special: '대포효', speed: 3, power: 4, toughness: 5,
      },
      settings: ['난이도 보통', '도움 꺼짐', '2인 대전'],
      twoPlayer: true,
    });
    assertDotOnly(calls, '캐릭터 선택');
  });

  it('경기장 선택(8곳)', () => {
    const { ctx, calls } = recorder();
    drawStageScreen(ctx, {
      loader,
      stages: STAGES.map((stage) => ({ id: stage.id, name: stage.name, note: '도트 톤', tint: stage.placeholderColor })),
      index: 0,
    });
    assertDotOnly(calls, '경기장 선택');
  });

  it('VS', () => {
    const { ctx, calls } = recorder();
    drawVsScreen(ctx, {
      loader,
      p1: { id: CHARACTERS[0].id, name: CHARACTERS[0].name },
      p2: { id: CHARACTERS[1].id, name: CHARACTERS[1].name },
      stage: '정글', progress: 0.5, status: '확인 버튼으로 바로 시작',
    });
    assertDotOnly(calls, 'VS');
  });

  it('결과', () => {
    const { ctx, calls } = recorder();
    drawResultScreen(ctx, { loader, winner: 0, winnerId: CHARACTERS[0].id, options: ['다시 할래', '공룡 바꾸기', '처음으로'], index: 0 });
    assertDotOnly(calls, '결과');
  });

  it('결과 — 경기장 밀림 배경 위에 어둡게 깔고 승자·문구를 올린다', () => {
    const { ctx, calls } = recorder();
    const asked: string[] = [];
    drawResultScreen(ctx, {
      loader, winner: 1, winnerId: CHARACTERS[1].id, winnerName: CHARACTERS[1].name,
      options: ['다시 할래', '공룡 바꾸기', '처음으로'], index: 1, stage: 'jungle',
      // 배경은 실제 레이어 대신 drawImage 한 번으로 자리를 표시한다(그리기 순서 확인용).
      background: {
        renderArt: (g, stage: string) => {
          asked.push(stage);
          (g as unknown as { drawImage: (...args: unknown[]) => void }).drawImage({}, 0, 0, 640, 360);
          return true;
        },
      },
    });
    assertDotOnly(calls, '결과(배경)');
    // 배경은 그 경기장 레이어로 한 번만 요청한다.
    expect(asked).toEqual(['jungle']);
    // 배경을 먼저 그리고, 화면 전체(아트 좌표 0,0,640,360)를 어둡게 누르는 채우기가 그 뒤에 온다.
    const backdropAt = calls.findIndex((call) => call.name === 'drawImage');
    const dimAt = calls.findIndex((call) => call.name === 'fillRect'
      && call.args[0] === 0 && call.args[1] === 0 && call.args[2] === 640 && call.args[3] === 360);
    expect(backdropAt).toBeGreaterThanOrEqual(0);
    expect(dimAt).toBeGreaterThan(backdropAt);
    // 승자 스프라이트는 배경 지면선(298)에 발을 맞춘다.
    expect(RESULT_GROUND_Y).toBe(298);
  });

  it('어른 설정', () => {
    const { ctx, calls } = recorder();
    drawSettingsScreen(ctx, {
      loader, title: '어른 설정', hint: '좌우로 값을 바꿉니다',
      rows: ['CPU 난이도', '음량', '전체화면'], values: ['보통', '70%', '꺼짐'], index: 1, footer: '무음으로 진행',
    });
    assertDotOnly(calls, '설정');
  });

  it('일시정지', () => {
    const { ctx, calls } = recorder();
    drawPauseScreen(ctx, {
      loader, items: ['계속하기', '캐릭터 다시 고르기', '메인 화면으로'], index: 0,
      title: '일시정지', detail: '', confirming: null, confirmIndex: 0,
    });
    assertDotOnly(calls, '일시정지');
  });
});

describe('전투 HUD·연출 글자도 도트', () => {
  it('체력바·이름표·게이지·라운드 점', () => {
    resetDotSprites();
    const match = new Match('versus', [CHARACTERS[0].id, CHARACTERS[1].id],
      [realAssets(CHARACTERS[0].id), realAssets(CHARACTERS[1].id)]);
    const idle = new ScriptInput();
    for (let i = 0; i < ROUND_INTRO_FRAMES; i++) match.step(idle, FIXED_DT);
    const { ctx, calls } = recorder();
    drawPixelHud(ctx, 1920, 1080, {
      p1: match.p1, p2: match.p2, timeLeft: 45, difficulty: 'easy', assist: false,
      sprites: dotSprites(fakeLoader()),
    });
    assertDotOnly(calls, 'HUD');
  });

  it('라운드/승부 글자', () => {
    const { ctx, calls } = recorder();
    drawPixelCallout(ctx, 1920, 1080, '라운드 1', '준비');
    assertDotOnly(calls, '연출 글자');
  });
});

describe('도트 배경이 없는 경기장도 같은 격자로 채운다', () => {
  for (const stage of STAGES) {
    it(`${stage.id}: 절차적 도트 배경`, () => {
      const { ctx, calls } = recorder();
      renderDotBackdrop(ctx, { id: stage.id, groundY: stage.groundY, placeholderColor: stage.placeholderColor }, 960, 1920, 1080);
      assertDotOnly(calls, `배경 ${stage.id}`);
      const scaled = calls.find((call) => call.name === 'scale');
      expect(scaled?.args[0]).toBe(4);
    });
  }
});

describe('도트 UI 켜기 조건', () => {
  it('개발 서버에서는 ?dotUi=1일 때만, 파일럿 빌드 상수는 빌드에서 인라인된다', () => {
    expect(dotUiEnabled(true, '?dotUi=1')).toBe(true);
    expect(dotUiEnabled(true, '')).toBe(false);
    expect(dotUiEnabled(false, '?dotUi=1')).toBe(false);
  });

  it('메뉴 격자는 3px(640×360 → 1920×1080 정수배)', () => {
    expect(DOT_K_UI * 640).toBe(1920);
    expect(DOT_K_UI * 360).toBe(1080);
  });
});
