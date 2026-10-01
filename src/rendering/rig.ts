import type { AssetLoader } from './AssetLoader';

/**
 * 종별 전용 자세 슬롯. 파일은 assets/characters/<id>/poses/<이름>.png, rig.json의 poses에 등록한다.
 * - airborne: 맞아 띄워짐·잡힘 때의 '버둥' 자세(마스터 판정 2026-10-01 추가)
 * - down    : 넘어짐·KO 때의 '다운' 자세(옆으로 쓰러져 누움)
 * 슬롯에 그림이 없으면 렌더러가 마스터·파츠를 ±15° 안에서 기울여 대신한다(거꾸로 뒤집기 금지).
 */
export const POSE_NAMES = ['heavy', 'special', 'hit', 'airborne', 'down', 'victory'] as const;
export type PoseName = (typeof POSE_NAMES)[number];

/** 실측한 스프라이트 경계(원본 캔버스 픽셀 좌표). */
export interface BoxData {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  w: number;
  h: number;
  cx: number;
  feet: number;
  fill: number;
}

export interface PoseRig {
  imagePath: string;
  /** 이 좌표를 파이터 발밑 원점에 맞춰 그린다. */
  rootX: number;
  rootY: number;
  /** 자동 추출 품질 검수를 통과한 포즈만 true. 아니면 마스터로 대체한다. */
  usable: boolean;
  box: BoxData | null;
}

export interface RigData {
  canvas: { width: number; height: number };
  root: { x: number; y: number };
  master: { imagePath: string; usable: boolean; box: BoxData | null };
  portrait: { imagePath: string; usable: boolean };
  poses: Partial<Record<PoseName, PoseRig>>;
  parts: {
    sheet: string;
    extractedDir: string;
    manualRiggingRequired: boolean;
    productionReady: boolean;
  };
}

export async function loadRig(loader: AssetLoader, rigPath: string): Promise<RigData | null> {
  return loader.loadJson<RigData>(rigPath);
}

/**
 * 원본 아트를 화면에 그릴 때 곱하는 배율.
 * 계획서 11절대로 아트는 화면에 보일 키의 약 2.7배(슈퍼샘플)로 그려져 있으므로,
 * 실측 실루엣 높이(box.h)를 캐릭터의 화면 키(displayHeight)로 나눠 축소한다.
 * box가 없는 예전 1:1 아트는 배율 1로 그린다.
 */
export function spriteScale(displayHeight: number, box: BoxData | null | undefined): number {
  if (!box || box.h <= 0 || displayHeight <= 0) return 1;
  return displayHeight / box.h;
}
