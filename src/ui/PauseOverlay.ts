import type { PauseReason } from '../input/InputManager';
import { drawButton, drawText, fillRoundRect } from './draw';
import { PAUSE_ITEMS, type PauseMenu } from './pauseMenu';
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
  drawText(g, '확인(F·J) 또는 일시정지 버튼을 누르면 계속합니다', width / 2, y + 250, {
    font: FONTS.small,
    color: COLORS.accent,
  });
}

/** 대전 중 일시정지 메뉴(계속하기 / 캐릭터 다시 고르기 / 메인 화면으로 + 나가기 확인). */
export function renderPauseMenu(
  g: CanvasRenderingContext2D,
  width: number,
  height: number,
  reason: PauseReason | null,
  menu: PauseMenu,
): void {
  g.fillStyle = COLORS.overlay;
  g.fillRect(0, 0, width, height);

  const panelW = 900;
  const panelH = 640;
  const x = (width - panelW) / 2;
  const y = (height - panelH) / 2;
  fillRoundRect(g, x, y, panelW, panelH, 24, COLORS.panel, COLORS.panelBorder, 4);

  const detail = reason ? REASON_TEXT[reason] : '';
  drawText(g, '일시정지', width / 2, y + 80, { font: FONTS.heading, color: COLORS.text });
  if (detail) drawText(g, detail, width / 2, y + 140, { font: FONTS.small, color: COLORS.textDim });

  if (menu.confirming) {
    const label = menu.confirming === 'title' ? '메인 화면으로 나갈까요?' : '캐릭터를 다시 고를까요?';
    drawText(g, label, width / 2, y + 230, { font: FONTS.body, color: COLORS.accent });
    drawText(g, '지금 경기는 끝납니다', width / 2, y + 280, { font: FONTS.small, color: COLORS.textDim });
    drawButton(g, width / 2 - 260, y + 340, 520, 100, '아니오', menu.confirmIndex === 0);
    drawButton(g, width / 2 - 260, y + 460, 520, 100, '예', menu.confirmIndex === 1);
    return;
  }

  PAUSE_ITEMS.forEach((item, index) => {
    drawButton(g, width / 2 - 300, y + 190 + index * 130, 600, 104, item.label, index === menu.index);
  });
  drawText(g, '위아래 이동 · 확인 F/J · 취소 G/K · 일시정지 버튼으로 바로 계속', width / 2, y + panelH - 40, {
    font: FONTS.small,
    color: COLORS.textDim,
  });
}
