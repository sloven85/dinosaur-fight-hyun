import type { MoveData } from './types';
import type { Fighter } from './Fighter';

export function pilotChargePreparing(f: Fighter): boolean {
  return f.partContacts && f.state === 'attack' && f.attack?.move.id === 'triceratops_special' && f.attack.frame < 16;
}

/** Pilot-only correction: xr must not interpolate from implicit frame 0 to frame 40. */
export function contactPilotMove(move: MoveData): MoveData {
  if (move.id !== 'triceratops_special' || !move.script) return move;
  return { ...move, script: { ...move.script, keys: move.script.keys.map(key =>
    key.f === 16 && key.x !== undefined ? { ...key, xr: 0 } : key),
  } };
}
