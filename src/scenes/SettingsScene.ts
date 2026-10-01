import { ACTIONS, type Action } from '../input/actions';
import { ACTION_LABELS, KEYBOARD_BINDINGS, bindingKeyFor, keyCodeLabel } from '../input/bindings';
import type { PlayerIndex } from '../input/InputManager';
import { BaseScene } from './BaseScene';
import { TitleScene } from './TitleScene';
import { drawText, fillRoundRect } from '../ui/draw';
import { moveListIndex } from '../ui/menu';
import { COLORS, FONTS } from '../ui/theme';

type Mode = 'main' | 'keys';

type RowKind =
  | 'difficulty'
  | 'assist'
  | 'volume'
  | 'shake'
  | 'vibration'
  | 'fullscreen'
  | 'keys1'
  | 'keys2'
  | 'resetKeys'
  | 'back';

interface Row {
  kind: RowKind;
  label: string;
}

const ROWS: Row[] = [
  { kind: 'difficulty', label: 'CPU 난이도' },
  { kind: 'assist', label: '어린이 도움 설정' },
  { kind: 'volume', label: '음량' },
  { kind: 'shake', label: '화면 흔들림' },
  { kind: 'vibration', label: '패드 진동' },
  { kind: 'fullscreen', label: '전체화면' },
  { kind: 'keys1', label: '1P 키 재지정' },
  { kind: 'keys2', label: '2P 키 재지정' },
  { kind: 'resetKeys', label: '키 재지정 초기화' },
  { kind: 'back', label: '돌아가기' },
];

const VOLUME_STEP = 0.1;

/**
 * 계획서 2절 어른용 설정 화면(프롬프트 6: 실제 반영).
 * 난이도·도움·음량·흔들림·진동·전체화면·키 재지정을 바꾸면 즉시 저장·적용된다.
 */
export class SettingsScene extends BaseScene {
  private mode: Mode = 'main';
  private index = 0;
  private keyPlayer: PlayerIndex = 0;
  private keyIndex = 0;
  private capturing: Action | null = null;

  protected tick(_dt: number): void {
    const input = this.context.input;
    if (this.capturing) return; // 키 입력 대기 중에는 메뉴 이동을 막는다.

    if (this.mode === 'keys') {
      this.tickKeys();
      return;
    }

    if (input.anyPressed('cancel')) {
      this.context.setScene(new TitleScene());
      return;
    }
    if (input.anyPressed('up')) this.index = moveListIndex(this.index, ROWS.length, -1);
    if (input.anyPressed('down')) this.index = moveListIndex(this.index, ROWS.length, 1);

    const row = ROWS[this.index];
    if (input.anyPressed('left')) this.adjust(row.kind, -1);
    if (input.anyPressed('right')) this.adjust(row.kind, 1);
    if (input.anyPressed('confirm')) this.activate(row.kind);
  }

  private adjust(kind: RowKind, direction: 1 | -1): void {
    const settings = this.context.settings;
    switch (kind) {
      case 'difficulty':
        settings.update({ cpuDifficulty: settings.difficulty === 'easy' ? 'normal' : 'easy' });
        break;
      case 'assist':
        settings.update({ assist: !settings.assist });
        break;
      case 'volume': {
        const next = clamp01(settings.value.volume + direction * VOLUME_STEP);
        settings.update({ volume: next });
        this.context.audio.setVolume(next);
        break;
      }
      case 'shake':
        settings.update({ screenShake: !settings.value.screenShake });
        break;
      case 'vibration':
        settings.update({ vibration: !settings.value.vibration });
        break;
      case 'fullscreen':
        this.setFullscreen(!settings.value.fullscreen);
        break;
      default:
        break;
    }
  }

  private activate(kind: RowKind): void {
    switch (kind) {
      case 'difficulty':
      case 'assist':
      case 'volume':
      case 'shake':
      case 'vibration':
      case 'fullscreen':
        this.adjust(kind, 1);
        break;
      case 'keys1':
        this.mode = 'keys';
        this.keyPlayer = 0;
        this.keyIndex = 0;
        break;
      case 'keys2':
        this.mode = 'keys';
        this.keyPlayer = 1;
        this.keyIndex = 0;
        break;
      case 'resetKeys':
        this.context.settings.resetKeyMapping();
        this.context.input.setKeyMapping({});
        break;
      case 'back':
        this.context.setScene(new TitleScene());
        break;
    }
  }

  /** 키 재지정 하위 화면: 동작을 고르고 확인을 누르면 다음 키 입력을 잡는다. */
  private tickKeys(): void {
    const input = this.context.input;
    const count = ACTIONS.length + 2; // 동작들 + 초기화 + 뒤로

    if (input.anyPressed('cancel')) {
      this.mode = 'main';
      return;
    }
    if (input.anyPressed('up')) this.keyIndex = moveListIndex(this.keyIndex, count, -1);
    if (input.anyPressed('down')) this.keyIndex = moveListIndex(this.keyIndex, count, 1);
    if (!input.anyPressed('confirm')) return;

    if (this.keyIndex < ACTIONS.length) {
      this.beginCapture(ACTIONS[this.keyIndex]);
    } else if (this.keyIndex === ACTIONS.length) {
      // 이 플레이어의 재지정만 지운다.
      for (const action of ACTIONS) {
        this.context.settings.clearKeyMapping(bindingKeyFor(this.keyPlayer, action));
      }
      this.context.input.setKeyMapping(this.context.settings.value.keyMapping);
    } else {
      this.mode = 'main';
    }
  }

  private beginCapture(action: Action): void {
    this.capturing = action;
    this.context.input.captureNextKey((code) => {
      const settings = this.context.settings;
      settings.setKeyMapping(bindingKeyFor(this.keyPlayer, action), [code]);
      this.context.input.setKeyMapping(settings.value.keyMapping);
      this.capturing = null;
    });
  }

  private setFullscreen(next: boolean): void {
    // 계획서 2절: 전체화면이 실패해도 창 모드에서 계속 플레이한다.
    this.context.settings.update({ fullscreen: next });
    try {
      if (typeof document === 'undefined') return;
      if (next && !document.fullscreenElement) {
        void document.documentElement.requestFullscreen?.();
      } else if (!next && document.fullscreenElement) {
        void document.exitFullscreen?.();
      }
    } catch {
      // 브라우저가 거부해도 설정만 저장하고 넘어간다.
    }
  }

  render(g: CanvasRenderingContext2D, width: number, height: number): void {
    g.fillStyle = COLORS.bg;
    g.fillRect(0, 0, width, height);

    if (this.mode === 'keys') {
      this.renderKeys(g, width, height);
      return;
    }

    drawText(g, '어른 설정', width / 2, 120, { font: FONTS.heading, color: COLORS.text });
    drawText(g, '좌우로 값을 바꾸고, 확인으로 선택합니다', width / 2, 180, {
      font: FONTS.small,
      color: COLORS.textDim,
    });

    const panelX = width / 2 - 520;
    const panelW = 1040;
    const rowH = 66;
    const top = 240;
    fillRoundRect(g, panelX, top - 24, panelW, ROWS.length * rowH + 48, 24, COLORS.panel, COLORS.panelBorder, 3);

    ROWS.forEach((row, i) => {
      const y = top + i * rowH;
      const selected = i === this.index;
      if (selected) {
        fillRoundRect(g, panelX + 12, y - 4, panelW - 24, rowH - 8, 14, 'rgba(255, 209, 102, 0.14)', COLORS.accent, 2);
      }
      drawText(g, row.label, panelX + 40, y + rowH / 2 - 8, {
        font: FONTS.body,
        color: selected ? COLORS.text : COLORS.textDim,
        align: 'left',
      });
      drawText(g, this.rowValue(row.kind), panelX + panelW - 40, y + rowH / 2 - 8, {
        font: FONTS.body,
        color: selected ? COLORS.accent : COLORS.text,
        align: 'right',
      });
    });

    drawText(g, '음원이 없으면 무음으로 진행합니다 · 취소 뒤로', width / 2, height - 60, {
      font: FONTS.small,
      color: COLORS.textDim,
    });
  }

  private renderKeys(g: CanvasRenderingContext2D, width: number, height: number): void {
    const player = this.keyPlayer + 1;
    drawText(g, `${player}P 키 재지정`, width / 2, 110, { font: FONTS.heading, color: COLORS.text });
    drawText(
      g,
      this.capturing
        ? `"${ACTION_LABELS[this.capturing]}" 에 쓸 키를 누르세요`
        : '동작을 고르고 확인을 누른 뒤 새 키를 누릅니다',
      width / 2,
      170,
      { font: FONTS.small, color: this.capturing ? COLORS.accent : COLORS.textDim },
    );

    const panelX = width / 2 - 520;
    const panelW = 1040;
    const rowH = 56;
    const top = 230;
    const count = ACTIONS.length + 2;

    fillRoundRect(g, panelX, top - 20, panelW, count * rowH + 40, 22, COLORS.panel, COLORS.panelBorder, 3);

    ACTIONS.forEach((action, i) => {
      const y = top + i * rowH;
      const selected = i === this.keyIndex;
      if (selected) {
        fillRoundRect(g, panelX + 12, y - 4, panelW - 24, rowH - 8, 12, 'rgba(255, 209, 102, 0.14)', COLORS.accent, 2);
      }
      drawText(g, ACTION_LABELS[action], panelX + 40, y + rowH / 2 - 6, {
        font: FONTS.small,
        color: selected ? COLORS.text : COLORS.textDim,
        align: 'left',
      });
      const capturing = this.capturing === action;
      drawText(g, capturing ? '키 입력 대기…' : this.codesLabel(this.keyPlayer, action), panelX + panelW - 40, y + rowH / 2 - 6, {
        font: FONTS.small,
        color: capturing ? COLORS.accent : COLORS.text,
        align: 'right',
      });
    });

    const extra = [
      { index: ACTIONS.length, label: `${player}P 재지정 초기화` },
      { index: ACTIONS.length + 1, label: '돌아가기' },
    ];
    for (const item of extra) {
      const y = top + item.index * rowH;
      const selected = item.index === this.keyIndex;
      if (selected) {
        fillRoundRect(g, panelX + 12, y - 4, panelW - 24, rowH - 8, 12, 'rgba(255, 209, 102, 0.14)', COLORS.accent, 2);
      }
      drawText(g, item.label, panelX + 40, y + rowH / 2 - 6, {
        font: FONTS.small,
        color: selected ? COLORS.text : COLORS.textDim,
        align: 'left',
      });
    }

    drawText(g, '취소 뒤로', width / 2, height - 50, { font: FONTS.small, color: COLORS.textDim });
  }

  private rowValue(kind: RowKind): string {
    const settings = this.context.settings.value;
    switch (kind) {
      case 'difficulty':
        return settings.cpuDifficulty === 'easy' ? '쉬움' : '보통';
      case 'assist':
        return settings.assist ? '켜짐' : '꺼짐';
      case 'volume':
        return `${Math.round(settings.volume * 100)}%`;
      case 'shake':
        return settings.screenShake ? '켜짐' : '꺼짐';
      case 'vibration':
        return settings.vibration ? '켜짐' : '꺼짐';
      case 'fullscreen':
        return settings.fullscreen ? '켜짐' : '꺼짐';
      case 'keys1':
      case 'keys2':
        return '확인 ›';
      case 'resetKeys':
        return '확인 ›';
      default:
        return '';
    }
  }

  private codesLabel(player: PlayerIndex, action: Action): string {
    const override = this.context.input.currentKeyMapping[bindingKeyFor(player, action)];
    const codes = override && override.length > 0 ? override : KEYBOARD_BINDINGS[player][action];
    return codes.map(keyCodeLabel).join(' / ');
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
