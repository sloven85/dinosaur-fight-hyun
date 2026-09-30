export type Direction = 'left' | 'right' | 'up' | 'down';

/** 3행 4열 같은 격자 커서를 가장자리에서 반대편으로 감아 이동한다. */
export function moveGridIndex(index: number, rows: number, cols: number, direction: Direction): number {
  const row = Math.floor(index / cols);
  const col = index % cols;

  if (direction === 'left') return row * cols + ((col - 1 + cols) % cols);
  if (direction === 'right') return row * cols + ((col + 1) % cols);
  if (direction === 'up') return ((row - 1 + rows) % rows) * cols + col;
  return ((row + 1) % rows) * cols + col;
}

/** 세로 목록 커서를 감아 이동한다. */
export function moveListIndex(index: number, length: number, delta: number): number {
  return (index + delta + length) % length;
}
