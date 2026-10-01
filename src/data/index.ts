import charactersJson from './characters.json';
import stagesJson from './stages.json';
import movesJson from './moves.json';
import type { MoveData } from '../combat/types';
import type { AttackStyle } from '../rendering/attackMotion';

export interface MoveSet {
  light: string;
  heavy: string;
  special: string;
}

/**
 * 계획서 19절 CPU 검수(C1): CPU 행동에서 종 아키타입이 드러나게 하는 성향.
 * 6개 아키타입 코드를 재사용하되 캐릭터별로 어느 성향을 쓸지 데이터로 정한다.
 */
export type CpuStyle =
  | 'balanced'
  | 'bruiser'
  | 'rusher'
  | 'rushdown'
  | 'counter'
  | 'zoning'
  | 'leaper'
  | 'trickster';

/** 계획서 16절 프롬프트 4: 캐릭터별 이동 특성. */
export interface CharacterTraits {
  /** 파키케팔로사우루스: 지상 강공격을 앞으로 뛰어들며 시작한다(도약 돌진). */
  leapCharge?: boolean;
  /** 프테라노돈: 공중에서 위를 누르면 제한된 프레임 동안 천천히 활공한다. */
  glide?: boolean;
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
  /** 컷아웃 파츠 리그 폴더(rig.json·attack_motions.json·파츠 PNG). 있는 종만. */
  partsPath?: string;
  moves: MoveSet;
  alternatePalette: { skin: string };
  /** CPU가 이 캐릭터를 조종할 때의 행동 성향(계획서 19절 C1). */
  cpuStyle: CpuStyle;
  /** 공격 동작 모티프(꼬리·뿔머리·발톱 등). 전용 포즈가 없을 때의 궤적·잔상을 정한다. */
  attackStyle: AttackStyle;
  /**
   * 계획서 16절 프롬프트 4의 캐릭터별 이동 특성.
   * 6개 아키타입 공통 코드는 그대로 두고, 이 플래그로만 개성을 준다.
   */
  traits?: CharacterTraits;
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
