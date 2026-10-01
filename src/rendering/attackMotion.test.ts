import { describe, expect, it } from 'vitest';
import { CHARACTERS, getMove } from '../data';
import { ATTACK_STYLES, attackMotion, type AttackStyle } from './attackMotion';
import type { AttackKind } from '../combat/types';

const SIZE = { front: 340, height: 430 };
const KINDS: AttackKind[] = ['light', 'heavy', 'special'];

/** 판정 구간 한가운데 모습. */
function strikeOf(style: AttackStyle, kind: AttackKind) {
  const timing = getMove('tyrannosaurus_' + kind);
  return attackMotion(style, kind, timing, timing.startupFrames + Math.floor(timing.activeFrames / 2), SIZE);
}

describe('공격 동작 모티프(디렉터 결정 2026-10-01)', () => {
  it('12종 모두 공격 모티프가 지정돼 있다', () => {
    for (const c of CHARACTERS) expect(ATTACK_STYLES).toContain(c.attackStyle);
  });

  it('분류: 꼬리형·뿔머리형·발톱형', () => {
    const style = (id: string) => CHARACTERS.find((c) => c.id === id)?.attackStyle;
    for (const id of ['stegosaurus', 'ankylosaurus', 'spinosaurus']) expect(style(id)).toBe('tail');
    for (const id of ['triceratops', 'carnotaurus', 'pachycephalosaurus']) expect(style(id)).toBe('horn');
    for (const id of ['velociraptor', 'therizinosaurus', 'dilophosaurus']) expect(style(id)).toBe('claw');
  });

  it('같은 종 안에서 약·강·특수 동작이 서로 다르다', () => {
    for (const style of ATTACK_STYLES) {
      const sigs = KINDS.map((k) => {
        const m = strikeOf(style, k);
        return [m.dx, m.dy, m.rot, m.sx, m.sy].map((v) => v.toFixed(2)).join(',');
      });
      expect(new Set(sigs).size).toBe(3);
    }
  });

  it('같은 기술이라도 모티프마다 궤적이 다르다', () => {
    for (const kind of KINDS) {
      const sigs = ATTACK_STYLES.map((s) => {
        const m = strikeOf(s, kind);
        return [m.dx, m.dy, m.rot, m.sx, m.pivotX, m.pivotY].map((v) => v.toFixed(1)).join(',');
      });
      expect(new Set(sigs).size).toBe(ATTACK_STYLES.length);
    }
  });

  it('준비 동작은 뒤로/위로 당기고, 판정 구간에 앞으로 뻗는다', () => {
    for (const style of ATTACK_STYLES) {
      for (const kind of KINDS) {
        const t = getMove('tyrannosaurus_' + kind);
        const windup = attackMotion(style, kind, t, t.startupFrames - 1, SIZE);
        const strike = strikeOf(style, kind);
        if (style === 'tail' && kind !== 'light') continue; // 꼬리형은 몸을 틀어 뒤→앞으로 친다
        expect(strike.dx).toBeGreaterThan(windup.dx);
        expect(strike.trail).toBe(1);
      }
    }
  });

  it('꼬리형 강·특수는 몸을 틀어 꼬리를 앞으로 보낸다', () => {
    expect(strikeOf('tail', 'heavy').sx).toBeLessThan(0);
    expect(strikeOf('tail', 'special').sx).toBeLessThan(0);
  });

  it('몸을 틀 때 그림이 종잇장처럼 얇아지지 않는다', () => {
    const t = getMove('tyrannosaurus_heavy');
    const total = t.startupFrames + t.activeFrames + t.recoveryFrames;
    for (let f = 0; f <= total; f++) {
      expect(Math.abs(attackMotion('tail', 'heavy', t, f, SIZE).sx)).toBeGreaterThanOrEqual(0.75);
    }
  });

  it('발톱형은 위로 들었다가 아래로 내려친다', () => {
    const t = getMove('tyrannosaurus_heavy');
    const windup = attackMotion('claw', 'heavy', t, t.startupFrames - 1, SIZE);
    const strike = strikeOf('claw', 'heavy');
    expect(windup.dy).toBeLessThan(0);
    expect(strike.rot).toBeGreaterThan(windup.rot);
  });

  it('회복이 끝나면 원래 자세로 돌아온다', () => {
    const t = getMove('tyrannosaurus_special');
    const end = t.startupFrames + t.activeFrames + t.recoveryFrames;
    for (const style of ATTACK_STYLES) {
      const m = attackMotion(style, 'special', t, end, SIZE);
      expect(Math.abs(m.dx) + Math.abs(m.dy) + Math.abs(m.rot)).toBeLessThan(1e-6);
      expect(m.sx).toBeCloseTo(1, 6);
      expect(m.trail).toBe(0);
    }
  });
});
