import type { MoveData } from './types';

const cache=new WeakMap<MoveData,MoveData>();
/** Only three legacy trajectories placed their real anatomy above every grounded target.
 * Fix their local height keys in the review build; timing, input and damage stay unchanged.
 */
export function expandedPilotMove(move:MoveData):MoveData {
  const heights:Record<string,Record<number,number>>={
    spinosaurus_special:{41:0,46:-80},
    pachycephalosaurus_special:{46:0,50:-35},
    pteranodon_special:{26:-90},
  };
  const patch=heights[move.id];
  if(!patch||!move.script)return move;
  const cached=cache.get(move);if(cached)return cached;
  const changed={...move,script:{...move.script,keys:move.script.keys.map(k=>patch[k.f]===undefined?k:{...k,y:patch[k.f]})}};
  cache.set(move,changed);return changed;
}
