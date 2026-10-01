import { describe, expect, it } from 'vitest';
import { FIXED_DT, ROUND_INTRO_FRAMES } from '../core/constants';
import { Match } from './Match';
import { ScriptInput } from './ScriptInput';
import type { Action } from '../input/actions';

function setup() {
  const match = new Match('versus', ['velociraptor', 'tyrannosaurus']);
  const idle = new ScriptInput();
  for (let i = 0; i < ROUND_INTRO_FRAMES; i++) match.step(idle, FIXED_DT);
  match.p1.x = 500;
  match.p2.x = 1500;
  return match;
}

/** frames 동안 action을 누르고(held) 있다가 뗀다. */
function tapSequence(match: Match, seq: Array<Action | null>) {
  for (const a of seq) {
    const input = new ScriptInput();
    if (a) input.hold(0, a);
    match.step(input, FIXED_DT);
  }
}

describe('대시(앞 두 번)', () => {
  it('앞을 빠르게 두 번 누르면 걷기보다 훨씬 멀리 나간다', () => {
    const walk = setup();
    tapSequence(walk, ['right', 'right', 'right', 'right', 'right', 'right', ...Array(20).fill('right')]);
    const walked = walk.p1.x - 500;

    const dash = setup();
    tapSequence(dash, ['right', 'right', null, null, 'right', ...Array(21).fill(null)]);
    const dashed = dash.p1.x - 500;
    expect(dash.p1.dashForward).toBe(true);
    expect(dashed).toBeGreaterThan(walked * 1.4);
    expect(dashed).toBeGreaterThan(150);
  });

  it('너무 느리게 두 번 누르면 대시가 아니다', () => {
    const m = setup();
    tapSequence(m, ['right', null, ...Array(20).fill(null), 'right']);
    expect(m.p1.dashFrames).toBe(0);
  });

  it('뒤를 두 번 누르면 짧은 백스텝(뒤로 물러남)', () => {
    const m = setup();
    tapSequence(m, ['left', null, 'left']);
    expect(m.p1.dashFrames).toBeGreaterThan(0);
    expect(m.p1.dashForward).toBe(false);
    tapSequence(m, Array(14).fill(null));
    expect(m.p1.x).toBeLessThan(500 - 80);
  });

  it('대시 중 공격을 누르면 바로 기술이 나간다', () => {
    const m = setup();
    tapSequence(m, ['right', null, 'right', null]);
    const input = new ScriptInput();
    input.press(0, 'light');
    m.step(input, FIXED_DT);
    expect(m.p1.state).toBe('attack');
    expect(m.p1.dashFrames).toBe(0);
  });
});
