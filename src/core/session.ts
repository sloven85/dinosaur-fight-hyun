import { CHARACTERS, STAGES } from '../data';

export type GameMode = 'cpu' | 'versus';

/** 화면 전환 사이에 유지되는 선택 상태. */
export interface Session {
  mode: GameMode;
  /** [1P, 2P] 캐릭터 id */
  characters: [string, string];
  stage: string;
}

export function createSession(): Session {
  return {
    mode: 'versus',
    characters: [CHARACTERS[0].id, CHARACTERS[1].id],
    stage: STAGES[0].id,
  };
}
