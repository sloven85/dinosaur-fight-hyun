import profiles from '../data/contactProfiles.json';
import type { AttackKind } from './types';
import type { BodyRegion } from './partContact';

export type LocalCircle = [part: string, region: BodyRegion, x: number, y: number, r: number];
export const CONTACT_PROFILES = profiles as unknown as Record<string, LocalCircle[]>;
// Select the actual striking anatomy per move, not the species' generic attackStyle.
const WEAPONS: Record<string, Record<AttackKind, string[]>> = {
  velociraptor: { light: ['neararm','fararm'], heavy: ['nearleg','farleg'], special: ['neararm','fararm'] },
  spinosaurus: { light: ['neararm','fararm'], heavy: ['tailtip','tailbase'], special: ['head','jaw','neararm'] },
  ankylosaurus: { light: ['torso','head'], heavy: ['tailtip'], special: ['tailtip'] },
  stegosaurus: { light: ['tailtip'], heavy: ['torso'], special: ['torso'] },
  carnotaurus: { light: ['head'], heavy: ['head'], special: ['head'] },
  pachycephalosaurus: { light: ['head'], heavy: ['head'], special: ['head'] },
  therizinosaurus: { light: ['neararm','fararm'], heavy: ['neararm','fararm'], special: ['neararm','fararm'] },
  dilophosaurus: { light: ['head','jaw'], heavy: ['head','neck'], special: ['head','jaw','neararm'] },
  brachiosaurus: { light: ['head','neck','neck2'], heavy: ['nearleg'], special: ['nearleg','farleg'] },
  pteranodon: { light: ['head','jaw'], heavy: ['head'], special: ['nearleg','farleg'] },
};
export function weaponParts(id: string, kind: AttackKind = 'light'): string[] {
  return WEAPONS[id]?.[kind] ?? ['head'];
}
