import type { MatchEvent } from '../combat/Match';

/**
 * 계획서 13절 사운드 목록. 지금은 음원 파일이 없어 모두 무음으로 대체되지만,
 * 파일이 `public/assets/audio/...`에 들어오면 경로 수정 없이 그대로 재생된다.
 */
export type AudioKind = 'bgm' | 'sfx';

export interface AudioTrack {
  id: string;
  path: string;
  kind: AudioKind;
}

export const AUDIO_TRACKS: readonly AudioTrack[] = [
  { id: 'title', path: 'assets/audio/bgm/title.mp3', kind: 'bgm' },
  { id: 'battle', path: 'assets/audio/bgm/battle.mp3', kind: 'bgm' },
  { id: 'victory', path: 'assets/audio/bgm/victory.mp3', kind: 'bgm' },
  { id: 'click', path: 'assets/audio/sfx/click.mp3', kind: 'sfx' },
  { id: 'confirm', path: 'assets/audio/sfx/confirm.mp3', kind: 'sfx' },
  { id: 'cancel', path: 'assets/audio/sfx/cancel.mp3', kind: 'sfx' },
  { id: 'countdown', path: 'assets/audio/sfx/countdown.mp3', kind: 'sfx' },
  { id: 'jump', path: 'assets/audio/sfx/jump.mp3', kind: 'sfx' },
  { id: 'light', path: 'assets/audio/sfx/light.mp3', kind: 'sfx' },
  { id: 'heavy', path: 'assets/audio/sfx/heavy.mp3', kind: 'sfx' },
  { id: 'guard', path: 'assets/audio/sfx/guard.mp3', kind: 'sfx' },
  { id: 'special', path: 'assets/audio/sfx/special.mp3', kind: 'sfx' },
  { id: 'ko', path: 'assets/audio/sfx/ko.mp3', kind: 'sfx' },
  { id: 'roar', path: 'assets/audio/sfx/roar.mp3', kind: 'sfx' },
];

export function trackById(id: string): AudioTrack | undefined {
  return AUDIO_TRACKS.find((track) => track.id === id);
}

/** 전투 이벤트를 효과음 id로 바꾼다(음원이 없으면 재생되지 않을 뿐이다). */
export function sfxIdForEvent(event: MatchEvent): string {
  if (event.type === 'ko') return 'ko';
  if (event.type === 'guard') return 'guard';
  if (event.kind === 'special') return 'special';
  if (event.kind === 'heavy') return 'heavy';
  return 'light';
}
