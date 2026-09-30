import { getCharacter } from '../data';
import type { AssetLoader } from './AssetLoader';
import { POSE_NAMES, loadRig, type PoseName, type RigData } from './rig';

export interface CharacterAssets {
  id: string;
  rig: RigData | null;
  master: HTMLImageElement | null;
  portrait: HTMLImageElement | null;
  poses: Partial<Record<PoseName, HTMLImageElement | null>>;
}

const EMPTY: CharacterAssets = { id: '', rig: null, master: null, portrait: null, poses: {} };

export function emptyAssets(id: string): CharacterAssets {
  return { ...EMPTY, id, poses: {} };
}

/**
 * 캐릭터 하나의 rig.json·마스터·초상·전용 포즈를 로드한다.
 * 파일이 없거나 깨졌으면 null로 남고 렌더러가 임시 표시로 대체한다.
 */
export async function loadCharacterAssets(loader: AssetLoader, id: string): Promise<CharacterAssets> {
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

  return { id, rig, master, portrait, poses };
}

/** 포즈·마스터를 쓸 수 없을 때 임시 도형으로 대체할지 판단한다. */
export function hasSprite(assets: CharacterAssets): boolean {
  return assets.rig?.master.usable === true && assets.master !== null;
}
