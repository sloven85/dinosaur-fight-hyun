import { getCharacter } from '../data';
import { contactCandidate } from '../core/contactCandidate';
import type { AssetLoader } from './AssetLoader';
import { POSE_NAMES, loadRig, type PoseName, type RigData } from './rig';
import type { PartMotionsData, PartRigData } from './partRig';

export interface CharacterAssets {
  id: string;
  rig: RigData | null;
  master: HTMLImageElement | null;
  portrait: HTMLImageElement | null;
  poses: Partial<Record<PoseName, HTMLImageElement | null>>;
  /** 컷아웃 파츠 리그(있는 종만). 있으면 대기·걷기·공격 몸 동작을 파츠가 맡는다. */
  parts?: PartsAssets | null;
}

export interface PartsAssets {
  rig: PartRigData;
  motions: PartMotionsData;
  images: Record<string, HTMLImageElement>;
}

const EMPTY: CharacterAssets = { id: '', rig: null, master: null, portrait: null, poses: {} };

export function emptyAssets(id: string): CharacterAssets {
  return { ...EMPTY, id, poses: {} };
}

/**
 * 캐릭터 하나의 rig.json·마스터·초상·전용 포즈를 로드한다.
 * 파일이 없거나 깨졌으면 null로 남고 렌더러가 임시 표시로 대체한다.
 */
export async function loadCharacterAssets(loader: AssetLoader, id: string, partsOverride?: string): Promise<CharacterAssets> {
  const character = getCharacter(id);
  const base = `assets/characters/${id}`;

  const rig = await loadRig(loader, character.rigPath);
  const portrait = await loader.loadImage(character.portraitPath);

  if (!rig) {
    return { id, rig: null, master: null, portrait, poses: {} };
  }

  const master = await loader.loadImage(`${base}/${rig.master.imagePath}`);
  const poses: Partial<Record<PoseName, HTMLImageElement | null>> = {};

  await Promise.all(
    POSE_NAMES.map(async (pose) => {
      const entry = rig.poses[pose];
      if (!entry?.usable) return;
      poses[pose] = await loader.loadImage(`${base}/${entry.imagePath}`);
    }),
  );

  const partsPath = partsOverride ?? (contactCandidate() && ['tyrannosaurus','triceratops'].includes(id)
    ? `assets/characters/${id}/parts/integrated-v3` : character.partsPath);
  const parts = partsPath ? await loadParts(loader, partsPath) : null;
  return { id, rig, master, portrait, poses, parts };
}

/** 파츠 9장·rig.json·attack_motions.json을 모두 불러온다. 하나라도 빠지면 null(기존 그림으로 폴백). */
async function loadParts(loader: AssetLoader, dir: string): Promise<PartsAssets | null> {
  const [rig, motions] = await Promise.all([
    loader.loadJson<PartRigData>(`${dir}/rig.json`),
    loader.loadJson<PartMotionsData>(`${dir}/attack_motions.json`),
  ]);
  if (!rig || !motions) return null;
  const entries = await Promise.all(
    rig.drawOrder.map(async (name) => [name, await loader.loadImage(`${dir}/${name}.png`)] as const),
  );
  if (entries.some(([, image]) => !image)) return null;
  return { rig, motions, images: Object.fromEntries(entries) as Record<string, HTMLImageElement> };
}

/** 포즈·마스터를 쓸 수 없을 때 임시 도형으로 대체할지 판단한다. */
export function hasSprite(assets: CharacterAssets): boolean {
  return assets.rig?.master.usable === true && assets.master !== null;
}
