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
  archetype: string;
  baseHealth: number;
  speedScale: number;
  damageScale: number;
  displayHeight: number;
  /** 임시 도형 렌더링용 대표색. 계획서 4절 색상 열. */
  color: string;
  rigPath: string;
  portraitPath: string;
  moves: MoveSet;
  alternatePalette: { skin: string };
  description: string;
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
