import type { PauseReason } from '../input/InputManager';
import { drawText, fillRoundRect } from './draw';
import { COLORS, FONTS } from './theme';

const REASON_TEXT: Record<PauseReason, string> = {
  'gamepad-disconnected': '게임패드 연결이 끊어졌습니다.',
  'focus-lost': '창이 활성 상태가 아닙니다.',
  menu: '',
};

export function renderPauseOverlay(
  g: CanvasRenderingContext2D,
  width: number,
  height: number,
  reason: PauseReason | null,
): void {
  g.fillStyle = COLORS.overlay;
  g.fillRect(0, 0, width, height);

  const panelW = 900;
  const panelH = 320;
  const x = (width - panelW) / 2;
  const y = (height - panelH) / 2;
  fillRoundRect(g, x, y, panelW, panelH, 24, COLORS.panel, COLORS.panelBorder, 4);

  const detail = reason ? REASON_TEXT[reason] : '';

  drawText(g, '일시정지', width / 2, detail ? y + 90 : y + 120, {
    font: FONTS.heading,
    color: COLORS.text,
  });
  if (detail) {
    drawText(g, detail, width / 2, y + 175, { font: FONTS.body, color: COLORS.textDim });
  }
  drawText(g, '확인 버튼을 누르면 계속합니다', width / 2, y + 250, {
    font: FONTS.small,
    color: COLORS.accent,
  });
}
