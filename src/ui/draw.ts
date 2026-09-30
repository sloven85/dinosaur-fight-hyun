import { COLORS, FONTS } from './theme';

export interface TextStyle {
  font?: string;
  color?: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
}

export function drawText(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  style: TextStyle = {},
): void {
  g.font = style.font ?? FONTS.body;
  g.fillStyle = style.color ?? COLORS.text;
  g.textAlign = style.align ?? 'center';
  g.textBaseline = style.baseline ?? 'middle';
  g.fillText(text, x, y);
}

export function roundRectPath(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

export function fillRoundRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string | null,
  stroke: string | null = null,
  lineWidth = 4,
): void {
  roundRectPath(g, x, y, w, h, r);
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  if (stroke) {
    g.strokeStyle = stroke;
    g.lineWidth = lineWidth;
    g.stroke();
  }
}

export function drawButton(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  selected: boolean,
): void {
  fillRoundRect(
    g,
    x,
    y,
    w,
    h,
    20,
    selected ? COLORS.accent : COLORS.panel,
    selected ? '#ffffff' : COLORS.panelBorder,
    4,
  );
  drawText(g, label, x + w / 2, y + h / 2, {
    font: FONTS.button,
    color: selected ? COLORS.accentText : COLORS.text,
  });
}
