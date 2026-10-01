import { describe, expect, it } from 'vitest';
import {
  EMOTION_ENERGETIC_RATIO,
  EMOTION_TIRED_RATIO,
  emotionFor,
} from './emotion';

describe('감정 3단계 (프롬프트 6)', () => {
  it('체력이 높으면 활기, 중간이면 보통, 낮으면 지침이다', () => {
    expect(emotionFor(1)).toBe('energetic');
    expect(emotionFor(EMOTION_ENERGETIC_RATIO)).toBe('energetic');
    expect(emotionFor(0.5)).toBe('steady');
    expect(emotionFor(EMOTION_TIRED_RATIO)).toBe('steady');
    expect(emotionFor(0.29)).toBe('tired');
    expect(emotionFor(0)).toBe('tired');
  });

  it('잘못된 값은 보통으로 처리한다', () => {
    expect(emotionFor(Number.NaN)).toBe('steady');
    expect(emotionFor(Number.POSITIVE_INFINITY)).toBe('steady');
  });
});
