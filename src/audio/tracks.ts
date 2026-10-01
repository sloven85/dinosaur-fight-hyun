import type { MatchEvent } from '../combat/Match';

/**
 * 계획서 13절 사운드 목록. 음원은 아티스트 사운드 팩 v1(효과음 35 · 배경음 5 · 아나운서 3).
 * 파일이 없는 트랙은 요청하지 않고 무음으로 둔다(AUDIO_FILES).
 */
export type AudioKind = 'bgm' | 'sfx';

export interface AudioTrack {
  id: string;
  path: string;
  kind: AudioKind;
}

export const AUDIO_TRACKS: readonly AudioTrack[] = [
  // 배경음: 경기장별 4곡 + 승리 징글(아티스트 사운드 팩 v1, 5168534). 제목 화면은 정글 곡을 같이 쓴다.
  { id: 'title', path: 'assets/audio/bgm/jungle.mp3', kind: 'bgm' },
  { id: 'bgm_jungle', path: 'assets/audio/bgm/jungle.mp3', kind: 'bgm' },
  { id: 'bgm_volcano', path: 'assets/audio/bgm/volcano.mp3', kind: 'bgm' },
  { id: 'bgm_desert', path: 'assets/audio/bgm/desert.mp3', kind: 'bgm' },
  { id: 'bgm_museum', path: 'assets/audio/bgm/museum.mp3', kind: 'bgm' },
  { id: 'battle', path: 'assets/audio/bgm/jungle.mp3', kind: 'bgm' },
  { id: 'victory', path: 'assets/audio/bgm/victory.mp3', kind: 'bgm' },
  // 예전 이름(화면 코드에서 쓰는 id) → 새 음원.
  { id: 'click', path: 'assets/audio/sfx/ui_move.mp3', kind: 'sfx' },
  { id: 'confirm', path: 'assets/audio/sfx/ui_confirm.mp3', kind: 'sfx' },
  { id: 'cancel', path: 'assets/audio/sfx/ui_cancel.mp3', kind: 'sfx' },
  { id: 'countdown', path: 'assets/audio/sfx/round_start.mp3', kind: 'sfx' },
  { id: 'light', path: 'assets/audio/sfx/hit_light.mp3', kind: 'sfx' },
  { id: 'heavy', path: 'assets/audio/sfx/hit_heavy.mp3', kind: 'sfx' },
  { id: 'guard', path: 'assets/audio/sfx/hit_block.mp3', kind: 'sfx' },
  { id: 'special', path: 'assets/audio/sfx/hit_heavy.mp3', kind: 'sfx' },
  { id: 'ko', path: 'assets/audio/sfx/ko_bell.mp3', kind: 'sfx' },
  { id: 'roar', path: 'assets/audio/sfx/trex_roar.mp3', kind: 'sfx' },
  { id: 'ui_move', path: 'assets/audio/sfx/ui_move.mp3', kind: 'sfx' },
  { id: 'ui_confirm', path: 'assets/audio/sfx/ui_confirm.mp3', kind: 'sfx' },
  { id: 'ui_cancel', path: 'assets/audio/sfx/ui_cancel.mp3', kind: 'sfx' },
  { id: 'ui_select', path: 'assets/audio/sfx/ui_select.mp3', kind: 'sfx' },
  { id: 'round_start', path: 'assets/audio/sfx/round_start.mp3', kind: 'sfx' },
  { id: 'ko_bell', path: 'assets/audio/sfx/ko_bell.mp3', kind: 'sfx' },
  { id: 'gauge_full', path: 'assets/audio/sfx/gauge_full.mp3', kind: 'sfx' },
  { id: 'super_flash', path: 'assets/audio/sfx/super_flash.mp3', kind: 'sfx' },
  { id: 'hit_light', path: 'assets/audio/sfx/hit_light.mp3', kind: 'sfx' },
  { id: 'hit_heavy', path: 'assets/audio/sfx/hit_heavy.mp3', kind: 'sfx' },
  { id: 'hit_block', path: 'assets/audio/sfx/hit_block.mp3', kind: 'sfx' },
  { id: 'counter', path: 'assets/audio/sfx/counter.mp3', kind: 'sfx' },
  { id: 'whiff', path: 'assets/audio/sfx/whiff.mp3', kind: 'sfx' },
  { id: 'jump', path: 'assets/audio/sfx/jump.mp3', kind: 'sfx' },
  { id: 'land', path: 'assets/audio/sfx/land.mp3', kind: 'sfx' },
  { id: 'dash', path: 'assets/audio/sfx/dash.mp3', kind: 'sfx' },
  { id: 'knockdown', path: 'assets/audio/sfx/knockdown.mp3', kind: 'sfx' },
  { id: 'getup', path: 'assets/audio/sfx/getup.mp3', kind: 'sfx' },
  { id: 'throw_grab', path: 'assets/audio/sfx/throw_grab.mp3', kind: 'sfx' },
  { id: 'trex_roar', path: 'assets/audio/sfx/trex_roar.mp3', kind: 'sfx' },
  { id: 'trike_snort', path: 'assets/audio/sfx/trike_snort.mp3', kind: 'sfx' },
  { id: 'velo_screech', path: 'assets/audio/sfx/velo_screech.mp3', kind: 'sfx' },
  { id: 'stego_swing', path: 'assets/audio/sfx/stego_swing.mp3', kind: 'sfx' },
  { id: 'anky_slam', path: 'assets/audio/sfx/anky_slam.mp3', kind: 'sfx' },
  { id: 'carno_snort', path: 'assets/audio/sfx/carno_snort.mp3', kind: 'sfx' },
  { id: 'pachy_butt', path: 'assets/audio/sfx/pachy_butt.mp3', kind: 'sfx' },
  { id: 'theri_slash', path: 'assets/audio/sfx/theri_slash.mp3', kind: 'sfx' },
  { id: 'dilo_shriek', path: 'assets/audio/sfx/dilo_shriek.mp3', kind: 'sfx' },
  { id: 'brachio_trumpet', path: 'assets/audio/sfx/brachio_trumpet.mp3', kind: 'sfx' },
  { id: 'ptera_screech', path: 'assets/audio/sfx/ptera_screech.mp3', kind: 'sfx' },
  { id: 'spino_roar', path: 'assets/audio/sfx/spino_roar.mp3', kind: 'sfx' },
  { id: 'meteor_impact', path: 'assets/audio/sfx/meteor_impact.mp3', kind: 'sfx' },
  { id: 'wave_crash', path: 'assets/audio/sfx/wave_crash.mp3', kind: 'sfx' },
  { id: 'tornado_loop', path: 'assets/audio/sfx/tornado_loop.mp3', kind: 'sfx' },
  { id: 'bowling_strike', path: 'assets/audio/sfx/bowling_strike.mp3', kind: 'sfx' },
  { id: 'star_twinkle', path: 'assets/audio/sfx/star_twinkle.mp3', kind: 'sfx' },
  { id: 'leaves_rustle', path: 'assets/audio/sfx/leaves_rustle.mp3', kind: 'sfx' },
  { id: 'ann_round1', path: 'assets/audio/sfx/ann_round1.mp3', kind: 'sfx' },
  { id: 'ann_fight', path: 'assets/audio/sfx/ann_fight.mp3', kind: 'sfx' },
  { id: 'ann_ko', path: 'assets/audio/sfx/ann_ko.mp3', kind: 'sfx' },
];


/** 종별 대표 소리(특수기 발동·라운드 승리). */
export const SPECIES_VOICE: Record<string, string> = {
  tyrannosaurus: 'trex_roar',
  triceratops: 'trike_snort',
  velociraptor: 'velo_screech',
  spinosaurus: 'spino_roar',
  ankylosaurus: 'anky_slam',
  stegosaurus: 'stego_swing',
  carnotaurus: 'carno_snort',
  pachycephalosaurus: 'pachy_butt',
  therizinosaurus: 'theri_slash',
  dilophosaurus: 'dilo_shriek',
  brachiosaurus: 'brachio_trumpet',
  pteranodon: 'ptera_screech',
};

/** 경기장별 배경음 id. */
export function bgmForStage(stageId: string): string {
  return `bgm_${stageId}`;
}

export function trackById(id: string): AudioTrack | undefined {
  return AUDIO_TRACKS.find((track) => track.id === id);
}

/** 전투 이벤트를 효과음 id로 바꾼다(음원이 없으면 재생되지 않을 뿐이다). */
export function sfxIdForEvent(event: MatchEvent): string {
  if (event.type === 'ko') return 'ko';
  if (event.type === 'guard') return 'guard';
  if (event.type === 'stun') return 'star_twinkle';
  if (event.kind === 'special') return 'special';
  if (event.kind === 'heavy') return 'heavy';
  return 'light';
}
