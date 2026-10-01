import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FIXED_DT, ROUND_INTRO_FRAMES } from '../core/constants';
import type { CharacterAssets } from '../rendering/CharacterAssets';
import type { RigData } from '../rendering/rig';
import { Match, type MatchEvent } from './Match';
import { ScriptInput } from './ScriptInput';
import type { AttackKind } from './types';
import type { Action } from '../input/actions';

function realAssets(id: string): CharacterAssets {
  const rig = JSON.parse(readFileSync(`public/assets/characters/${id}/rig.json`, 'utf8')) as RigData;
  return { id, rig, master: null, portrait: null, poses: {} };
}

/** P1이 kind 기술을 쓰고 P2는 guard 입력을 누르고 있는다. P2가 받은 피해·이벤트를 돌려준다. */
function attackGuarded(p1: string, p2: string, kind: AttackKind, guard: Action | null, gapExtra = 40, frames = 200) {
  const match = new Match('versus', [p1, p2], [realAssets(p1), realAssets(p2)]);
  const idle = new ScriptInput();
  for (let i = 0; i < ROUND_INTRO_FRAMES; i++) match.step(idle, FIXED_DT);
  match.consumeEvents();
  match.p1.x = 600;
  match.p2.x = 600 + (match.p1.bodyWidth + match.p2.bodyWidth) / 2 + gapExtra;
  match.p1.meter = 100;
  const input = new ScriptInput();
  if (guard) input.hold(1, guard);
  input.press(0, kind);
  const hp = match.p2.health;
  const events: MatchEvent[] = [];
  let sawGuardState = false;
  for (let i = 0; i < frames; i++) {
    match.step(input, FIXED_DT);
    input.clearPressed();
    if (guard) input.hold(1, guard);
    events.push(...match.consumeEvents());
    sawGuardState ||= match.p2.state === 'guard';
  }
  return { damage: hp - match.p2.health, events, sawGuardState, match };
}

describe('방어(뒤·아래 홀드)', () => {
  it('뒤(상대 반대쪽)를 누르면 약·강 피해 0, 막음 이벤트와 반동', () => {
    for (const kind of ['light', 'heavy'] as const) {
      const r = attackGuarded('carnotaurus', 'triceratops', kind, 'right');
      expect(r.damage).toBe(0);
      expect(r.events.some((e) => e.type === 'guard')).toBe(true);
      expect(r.sawGuardState).toBe(true);
    }
  });

  it('아래를 눌러도 막는다', () => {
    const r = attackGuarded('carnotaurus', 'triceratops', 'light', 'down');
    expect(r.damage).toBe(0);
    expect(r.events.some((e) => e.type === 'guard')).toBe(true);
  });

  it('특수기는 막아도 20%만 들어간다', () => {
    const open = attackGuarded('velociraptor', 'triceratops', 'special', null, 60);
    const blocked = attackGuarded('velociraptor', 'triceratops', 'special', 'right', 60);
    expect(blocked.damage).toBeGreaterThan(0);
    expect(blocked.damage).toBeLessThan(open.damage * 0.35);
  });

  it('잡기 기술(티라노 물고 흔들기·트리케라 퍼올리기·프테라 납치)은 방어를 뚫는다', () => {
    expect(attackGuarded('tyrannosaurus', 'triceratops', 'heavy', 'right').damage).toBeGreaterThan(0);
    expect(attackGuarded('triceratops', 'tyrannosaurus', 'heavy', 'right').damage).toBeGreaterThan(0);
    expect(attackGuarded('pteranodon', 'triceratops', 'special', 'right', 150).damage).toBeGreaterThan(0);
  });

  it('방어 자세는 서 있을 때 보인다(guardStance), 공중에서는 막지 못한다', () => {
    const match = new Match('versus', ['tyrannosaurus', 'triceratops']);
    const input = new ScriptInput();
    for (let i = 0; i < ROUND_INTRO_FRAMES; i++) match.step(input, FIXED_DT);
    input.hold(1, 'down');
    match.step(input, FIXED_DT);
    expect(match.p2.guardStance).toBe(true);
    match.p2.onGround = false;
    expect(match.p2.isGuarding(match.p1)).toBe(false);
  });
});

describe('앉아 막기와 상단·하단(A단계)', () => {
  it('중단은 서서도 앉아서도 막힌다', () => {
    expect(attackGuarded('carnotaurus', 'triceratops', 'light', 'right').damage).toBe(0);
    expect(attackGuarded('carnotaurus', 'triceratops', 'light', 'down').damage).toBe(0);
  });

  it('상단(점프 박치기)은 서서 막아야 하고 앉아 막으면 맞는다', () => {
    expect(attackGuarded('pachycephalosaurus', 'triceratops', 'heavy', 'right').damage).toBe(0);
    expect(attackGuarded('pachycephalosaurus', 'triceratops', 'heavy', 'down').damage).toBeGreaterThan(0);
  });

  it('하단(물보라 쓸기)은 앉아 막아야 하고 서서 막으면 맞는다', () => {
    expect(attackGuarded('spinosaurus', 'triceratops', 'heavy', 'down', 200).damage).toBe(0);
    expect(attackGuarded('spinosaurus', 'triceratops', 'heavy', 'right', 200).damage).toBeGreaterThan(0);
  });

  it('도움 설정(1P)은 높이와 상관없이 다 막는다', () => {
    const match = new Match('cpu', ['tyrannosaurus', 'triceratops'], undefined, { assist: true });
    expect(match.p1.guardAll).toBe(true);
    expect(match.p2.guardAll).toBe(false);
  });
});
