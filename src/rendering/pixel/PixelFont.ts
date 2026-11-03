/**
 * 도트 글꼴(Galmuri 9/11/14) 로더.
 *
 * 왜 필요한가 (2026-10-31 수정):
 *  기존에는 시스템의 매끈한 외곽선 글꼴(Noto Sans KR 등)을 아트 해상도(8~13px)에서
 *  1비트로 구워 썼다. 그 크기에서는 한글 획이 1px로 붙거나 사라져 'D'가 'C'로, '어'가 '0'으로
 *  보이는 글자 깨짐이 났다(검수 지적: CINC FIGHTERS, 0른 설장).
 *  Galmuri 는 9/11/14px 격자에 맞춰 처음부터 픽셀로 그린 한글 글꼴이라, 그 크기로 구우면
 *  획이 그대로 남는다(정확한 한글). 화면 배율(3배)에서도 정수배라 픽셀이 뭉개지지 않는다.
 *
 * 라이선스: SIL Open Font License 1.1 (public/fonts/LICENSE-Galmuri.md).
 * 서브셋: 이 게임 UI가 실제로 쓰는 824자(한글 726자 + ASCII + 기호)만 담아 3개 합계 약 57KB.
 *
 * 글꼴이 아직 안 왔을 때 굽힌 글자는 캐시에 남기면 안 된다 — 로드가 끝나면 PixelStyle 이
 * 캐시를 비워 다음 프레임에 픽셀 글꼴로 다시 굽는다.
 */

export interface PixelFace {
  family: string;
  /**
   * 캔버스에 지정하는 글꼴 크기(px).
   * Galmuri 는 em(upm) 1000/1200/1500 에 글리프 상자를 900/1100/1400 으로 그린다.
   * 즉 '1 단위 = 0.01px' 격자이므로, 글꼴 크기를 upm/100(=10/12/15px)으로 맞춰야
   * 스트로크가 화면 픽셀에 정확히 1:1로 떨어진다. (11px 로 그리면 격자가 어긋나
   *  묵→무, 본→븐 처럼 획이 사라진다 — 2026-10-31 실측)
   */
  px: number;
  /** 그 크기에서 실제로 찍히는 잉크 높이(px). */
  ink: number;
}

/** 제공하는 픽셀 글꼴(작은 것부터). */
export const PIXEL_FONT_FILES: ReadonlyArray<{ family: string; file: string }> = [
  { family: 'Galmuri9', file: 'fonts/Galmuri9.woff2' },
  { family: 'Galmuri11', file: 'fonts/Galmuri11.woff2' },
  { family: 'Galmuri14', file: 'fonts/Galmuri14.woff2' },
];

/**
 * 요청 크기(아트 px) → 실제 픽셀 글꼴과 그 고유 크기.
 * 9/11/14 의 정수배(9·11·14·18·22·28·33)로만 내보내 획이 반 픽셀로 흐려지지 않게 한다.
 */
export function pixelFaceFor(size: number): PixelFace {
  if (size <= 9) return { family: 'Galmuri9', px: 10, ink: 9 };
  if (size <= 13) return { family: 'Galmuri11', px: 12, ink: 11 };
  if (size <= 17) return { family: 'Galmuri14', px: 15, ink: 14 };
  if (size <= 19) return { family: 'Galmuri9', px: 20, ink: 18 };
  if (size <= 23) return { family: 'Galmuri11', px: 24, ink: 22 };
  if (size <= 29) return { family: 'Galmuri14', px: 30, ink: 28 };
  return { family: 'Galmuri11', px: 36, ink: 33 };
}

type FontFaceLike = { load(): Promise<unknown> };

let applied = false;
let failed = false;

/**
 * 글꼴 적용을 한 번만 시도한다. 성공 여부를 돌려준다(브라우저 캡처·테스트에서 즉시 확인용).
 * document 가 없는 환경(단위 테스트)에서는 false.
 */
export async function ensurePixelFonts(): Promise<boolean> {
  if (applied) return true;
  if (failed) return false;
  if (typeof document === 'undefined' || typeof FontFace === 'undefined' || !document.fonts) {
    return false;
  }
  const base = (import.meta.env as Record<string, string | undefined>).BASE_URL ?? '/';
  try {
    await Promise.all(PIXEL_FONT_FILES.map(async ({ family, file }) => {
      const face = new FontFace(family, `url("${base}${file}")`, { display: 'block' }) as unknown as FontFaceLike;
      const loaded = await face.load();
      // @ts-expect-error FontFace.load() 의 반환형은 환경마다 다르다(전부 글꼴 객체).
      document.fonts.add(loaded);
    }));
    await document.fonts.ready;
    applied = true;
    return true;
  } catch {
    failed = true;
    return false;
  }
}

/** 글꼴 적용 여부(디버그·캡처 판정용). */
export function pixelFontsApplied(): boolean {
  return applied;
}
