import type { AssetLoader } from './AssetLoader';

export const POSE_NAMES = ['heavy', 'special', 'hit', 'down', 'victory'] as const;
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
  poses: Record<PoseName, PoseRig>;
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
