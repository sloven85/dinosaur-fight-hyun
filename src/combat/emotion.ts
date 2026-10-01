/**
 * 계획서 16절 프롬프트 6: 감정 3단계.
 *
 * 남은 체력 비율로만 판단하는 표시용 상태다. 전투 수치(피해·속도)에는
 * 전혀 영향을 주지 않는다 — 순수하게 보이는 연출이다.
 */
export type Emotion = 'energetic' | 'steady' | 'tired';

/** 활기 기준(이 비율 이상이면 활기). */
export const EMOTION_ENERGETIC_RATIO = 0.6;
/** 지침 기준(이 비율 미만이면 지침). */
export const EMOTION_TIRED_RATIO = 0.3;

export function emotionFor(healthRatio: number): Emotion {
  if (!Number.isFinite(healthRatio)) return 'steady';
  if (healthRatio >= EMOTION_ENERGETIC_RATIO) return 'energetic';
  if (healthRatio >= EMOTION_TIRED_RATIO) return 'steady';
  return 'tired';
}

export const EMOTION_LABELS: Record<Emotion, string> = {
  energetic: '활기',
  steady: '보통',
  tired: '지침',
};

/** HUD 감정 아이콘의 색. */
export const EMOTION_COLORS: Record<Emotion, string> = {
  energetic: '#5ed17a',
  steady: '#ffd166',
  tired: '#ff8a5c',
};
