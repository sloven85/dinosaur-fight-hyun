/**
 * 대전 중 일시정지 메뉴(jk 요청 2026-10-01: 게임 중간에 캐릭터 고르기·메인 화면으로 나갈 수 있어야 한다).
 * 계속하기 / 캐릭터 다시 고르기 / 메인 화면으로. 나가는 항목은 실수 방지를 위해 한 번 더 확인한다.
 * 화면 전환은 하지 않고 "무엇을 골랐는지"만 돌려준다(Game이 실제 전환을 맡는다).
 */
export type PauseChoice = 'resume' | 'characterSelect' | 'title';

export interface PauseMenuInput {
  up: boolean;
  down: boolean;
  confirm: boolean;
  cancel: boolean;
  /** 일시정지 버튼을 다시 누르면 바로 계속한다. */
  pause: boolean;
}

export const PAUSE_ITEMS: ReadonlyArray<{ choice: PauseChoice; label: string }> = [
  { choice: 'resume', label: '계속하기' },
  { choice: 'characterSelect', label: '캐릭터 다시 고르기' },
  { choice: 'title', label: '메인 화면으로' },
];

export class PauseMenu {
  index = 0;
  /** 나가기 확인 중인 항목(없으면 null). */
  confirming: PauseChoice | null = null;
  /** 확인 창의 선택: 0 = 아니오(기본), 1 = 예. */
  confirmIndex = 0;

  reset(): void {
    this.index = 0;
    this.confirming = null;
    this.confirmIndex = 0;
  }

  /** 한 틱 입력을 처리하고, 결정이 났으면 그 선택을 돌려준다. */
  update(input: PauseMenuInput): PauseChoice | null {
    if (this.confirming) {
      if (input.cancel || input.pause) {
        this.confirming = null;
        return null;
      }
      if (input.up || input.down) this.confirmIndex = 1 - this.confirmIndex;
      if (input.confirm) {
        const choice = this.confirming;
        this.confirming = null;
        if (this.confirmIndex === 1) {
          this.reset();
          return choice;
        }
      }
      return null;
    }

    if (input.pause || input.cancel) {
      this.reset();
      return 'resume';
    }
    const count = PAUSE_ITEMS.length;
    if (input.up) this.index = (this.index - 1 + count) % count;
    if (input.down) this.index = (this.index + 1) % count;
    if (input.confirm) {
      const choice = PAUSE_ITEMS[this.index].choice;
      if (choice === 'resume') {
        this.reset();
        return 'resume';
      }
      this.confirming = choice;
      this.confirmIndex = 0;
    }
    return null;
  }
}
