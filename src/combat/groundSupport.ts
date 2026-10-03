import contours from '../data/supportContours.json';
import type { Fighter } from './Fighter';
import type { Affine } from '../rendering/partRig';

export const SUPPORT_CONTOURS=contours as Record<string,Record<string,number[][]>>;
export function supportBottom(id:string,matrices:Record<string,Affine>):number {
  return Math.max(...Object.entries(SUPPORT_CONTOURS[id]??{}).flatMap(([name,pts])=>
    pts.map(([x,y])=>{const m=matrices[name];return m[1]*x+m[3]*y+m[5];})));
}
export function canGroundSupport(f:Fighter):boolean {
  return f.partContacts && !!SUPPORT_CONTOURS[f.data.id] && !f.assets.parts?.rig.hitPivot &&
    f.onGround && Math.abs(f.y)<.001 && !['held','down','victory'].includes(f.state) &&
    !(f.scriptVisual?.sink) && !f.scriptVisual?.overlays.some(o=>o.hideBody);
}
/** Support correction is simulation state, not a render-side mutation. */
export function updateGroundSupport(f:Fighter,matrices:Record<string,Affine>):void {
  if(!canGroundSupport(f)){f.groundOffset=0;return;}
  const desired=Math.max(-50,Math.min(50,-supportBottom(f.data.id,matrices)));
  // Two game pixels per fixed frame prevents a hit/pose-change recentering snap.
  f.groundOffset+=Math.max(-2,Math.min(2,desired-f.groundOffset));
}
