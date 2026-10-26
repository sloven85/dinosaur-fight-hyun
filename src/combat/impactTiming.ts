import type { AttackKind } from './types';
/** Reviewed three-species stop tiers; no damage/stun extension or contact dependency. */
export function impactStop(id:string,kind:AttackKind,original:number,guarded:boolean,held:boolean):number {
  if(!['tyrannosaurus','triceratops','ankylosaurus'].includes(id))return original;
  if(guarded)return Math.min(original,3);
  if(held)return Math.min(original,2);
  return kind==='light'?4:kind==='heavy'?7:6;
}
