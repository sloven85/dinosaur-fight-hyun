import charactersJson from './characters.json';
import stagesJson from './stages.json';
import movesJson from './moves.json';
import type { MoveData } from '../combat/types';

export interface MoveSet {
  light: string;
  heavy: string;
  special: string;
}

export interface CharacterData {
  id: string;
  name: string;
  /** 계획서 4절 6개 아키타입(standard·charge·speed·power·reach·trick) 중 하나. */
  archetype: string;
  /** 화면 표시용 유형 이름(예: 돌진 변형). */
  archetypeLabel: string;
  baseHealth: number;
  speedScale: number;
  damageScale: number;
  displayHeight: number;
  /** 임시 도형 렌더링용 대표색. 계획서 4절 색상 열. */
  color: string;
  /** 배·프릴·등판 등 보조색. 계획서 5~10절. */
  accentColor: string;
  rigPath: string;
  portraitPath: string;
  moves: MoveSet;
  alternatePalette: { skin: string };
  description: string;
  /** 선택 카드에 작게 붙이는 표기(예: 익룡 게스트). */
  cardNote?: string;
}

export interface StageData {
  id: string;
  name: string;
  thumbnailPath: string;
  layerPaths: Record<string, string>;
  groundY: number;
  musicId: string;
  /** 에셋 준비 전 임시 배경색. */
  placeholderColor: string;
}

export const CHARACTERS = charactersJson.characters as CharacterData[];
export const STAGES = stagesJson.stages as StageData[];
export const MOVES = movesJson.moves as MoveData[];

export function getMove(id: string): MoveData {
  const found = MOVES.find((move) => move.id === id);
  if (!found) {
    throw new Error(`알 수 없는 기술 id: ${id}`);
  }
  return found;
}

export function getCharacter(id: string): CharacterData {
  const found = CHARACTERS.find((character) => character.id === id);
  if (!found) {
    throw new Error(`알 수 없는 캐릭터 id: ${id}`);
  }
  return found;
}

export function getStage(id: string): StageData {
  const found = STAGES.find((stage) => stage.id === id);
  if (!found) {
    throw new Error(`알 수 없는 경기장 id: ${id}`);
  }
  return found;
}
