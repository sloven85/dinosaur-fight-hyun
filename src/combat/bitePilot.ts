import type { MoveData } from './types';
import type { ScriptKey } from './moveScript';

// Mouth-open / insertion / close poses. Existing damage events remain unchanged.
export function bitePilotMove(move: MoveData): MoveData {
  if (!move.script) return move;
  const key = (f: number, x: number, head: number, jaw: number): ScriptKey =>
    ({ f, x, rot: 0, sx: 1, sy: 1, parts: { head, jaw }, ease: 'linear' });
  if (move.id === 'tyrannosaurus_light') return { ...move, script: { ...move.script, frames: 38,
    keys: [key(0, 0, 0, 0), key(4, -8, -6, -26), key(8, 36, -6, -26), key(11, 36, -6, -2),
      key(15, 30, -6, -26), key(20, 62, -6, -26), key(23, 62, -6, -2), key(36, 0, 0, 0)],
    hits: move.script.hits!.map((h, i) => ({ ...h, from: i ? 21 : 9, to: i ? 23 : 11 })),
  } };
  if (move.id === 'tyrannosaurus_heavy') return { ...move, script: { ...move.script,
    keys: [key(0, 0, 0, 0), key(10, -8, -6, -26), key(16, 40, -6, -26), key(22, 40, -6, -6),
      key(30, 40, -6, -6), ...[41,49,57,65,73,81].map((f,i) => key(f, 40, i % 2 ? 8 : -8, -6)),
      key(88, 40, -8, -6), key(94, 48, 8, -26), key(110, 0, 0, 0), key(111, 40, -6, -6), key(125, 0, 0, 0)],
    grab: { ...move.script.grab!, from: 17, to: 22 },
  } };
  return move;
}
