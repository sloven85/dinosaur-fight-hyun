/**
 * 도트 재생기를 켜는 조건만 담는 작은 모듈.
 *
 * BattleScene이 무거운 SpriteStage를 정적으로 끌어오지 않도록 분리했다.
 * - 파일럿 빌드(`VITE_DOT_PILOT=1`): 파라미터 없이 기본이 도트.
 * - 개발 서버: `?pixelStage=1`로만.
 * - 공개 베타 빌드: 이 상수가 false로 인라인되어 분기가 통째로 사라진다.
 */
export const DOT_PILOT_BUILD = (import.meta.env as Record<string, string | undefined>).VITE_DOT_PILOT === '1';

export function spriteStageEnabled(dev: boolean, search: string): boolean {
  if (DOT_PILOT_BUILD) return true;
  return dev && new URLSearchParams(search).get('pixelStage') === '1';
}
