import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FIXED_DT, ROUND_INTRO_FRAMES } from '../core/constants';
import { MOVES } from '../data';
import type { CharacterAssets } from '../rendering/CharacterAssets';
import type { RigData } from '../rendering/rig';
import { Match, type MatchEvent } from './Match';
import { sampleChannel, sampleFace, validateScript, type MoveScript } from './moveScript';
import { ScriptInput } from './ScriptInput';
import type { AttackKind } from './types';

function realAssets(id: string): CharacterAssets {
  const rig = JSON.parse(readFileSync(`public/assets/characters/${id}/rig.json`, 'utf8')) as RigData;
  return { id, rig, master: null, portrait: null, poses: {} };
}

interface Run {
  match: Match;
  events: MatchEvent[];
  /** 프레임별 기록. */
  trace: { p1x: number; p2x: number; p2y: number; p2state: string; p2hp: number }[];
}

function run(p1: string, p2: string, kind: AttackKind, gap: number, frames: number, startX = 600): Run {
  const match = new Match('versus', [p1, p2], [realAssets(p1), realAssets(p2)]);
  const idle = new ScriptInput();
  for (let i = 0; i < ROUND_INTRO_FRAMES; i++) match.step(idle, FIXED_DT);
  match.consumeEvents();
  match.p1.x = startX;
  match.p2.x = startX + gap;
  match.p1.meter = 100;
  const input = new ScriptInput();
  input.press(0, kind);
  const events: MatchEvent[] = [];
  const trace: Run['trace'] = [];
  for (let i = 0; i < frames; i++) {
    match.step(input, FIXED_DT);
    input.clearPressed();
    events.push(...match.consumeEvents());
    trace.push({ p1x: match.p1.x, p2x: match.p2.x, p2y: match.p2.y, p2state: match.p2.state, p2hp: match.p2.health });
  }
  return { match, events, trace };
}

const minGap = (a: string, b: string): number => {
  const m = new Match('versus', [a, b], [realAssets(a), realAssets(b)]);
  return (m.p1.bodyWidth + m.p2.bodyWidth) / 2;
};

describe('기술 스크립트 데이터', () => {
  it('moves.json의 모든 스크립트가 형식 검사를 통과한다', () => {
    const errors = MOVES.flatMap((m) => (m.script ? validateScript(m.id, m.script) : []));
    expect(errors).toEqual([]);
  });

  it('파일럿 3종이 스크립트 기술이다', () => {
    const ids = MOVES.filter((m) => m.script).map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining(['tyrannosaurus_heavy', 'stegosaurus_heavy', 'velociraptor_special']));
  });

  it('키프레임 보간: 사이 값·마지막 키 유지·방향은 즉시 전환', () => {
    const s: MoveScript = {
      frames: 30,
      reach: 0,
      keys: [
        { f: 0, x: 0 },
        { f: 10, x: 100, ease: 'linear' },
        { f: 10, face: -1 },
      ],
    };
    expect(sampleChannel(s, 'x', 5)).toBeCloseTo(50);
    expect(sampleChannel(s, 'x', 25)).toBe(100);
    expect(sampleFace(s, 9)).toBe(1);
    expect(sampleFace(s, 10)).toBe(-1);
  });
});

describe('티라노 꽉 물고 흔들기(잡기·던지기)', () => {
  const gap = minGap('tyrannosaurus', 'triceratops') + 40;
  const r = run('tyrannosaurus', 'triceratops', 'heavy', gap, 200);

  it('붙잡아 들어 올린다(held + 공중)', () => {
    const held = r.trace.filter((t) => t.p2state === 'held');
    expect(held.length).toBeGreaterThan(40);
    expect(Math.min(...held.map((t) => t.p2y))).toBeLessThan(-120);
  });

  it('흔들 때 3번, 던질 때 1번 피해(총 20)', () => {
    const hits = r.events.filter((e) => e.type === 'hit');
    expect(hits).toHaveLength(4);
    expect(r.trace[0].p2hp - r.trace[r.trace.length - 1].p2hp).toBe(20);
  });

  it('던진 뒤 넘어졌다가 일어난다', () => {
    const states = r.trace.map((t) => t.p2state);
    const fallen = states.indexOf('fallen');
    expect(fallen).toBeGreaterThan(states.lastIndexOf('held'));
    expect(states[states.length - 1]).toBe('idle');
    expect(r.match.p1.holding).toBeNull();
  });

  it('멀리서 쓰면 헛물고 피해가 없다', () => {
    const miss = run('tyrannosaurus', 'triceratops', 'heavy', 1100, 140, 300);
    expect(miss.trace.some((t) => t.p2state === 'held')).toBe(false);
    expect(miss.trace[0].p2hp).toBe(miss.trace[miss.trace.length - 1].p2hp);
    expect(miss.match.p1.state).toBe('idle');
  });

  it('가드로 막을 수 없다(잡기)', () => {
    const match = new Match('versus', ['tyrannosaurus', 'triceratops'], [realAssets('tyrannosaurus'), realAssets('triceratops')]);
    const idle = new ScriptInput();
    for (let i = 0; i < ROUND_INTRO_FRAMES; i++) match.step(idle, FIXED_DT);
    match.p1.x = 600;
    match.p2.x = 600 + gap;
    const input = new ScriptInput();
    input.hold(1, 'right');
    input.press(0, 'heavy');
    const hp = match.p2.health;
    for (let i = 0; i < 120; i++) {
      match.step(input, FIXED_DT);
      input.clearPressed();
    }
    expect(match.p2.health).toBeLessThan(hp);
  });
});

describe('스테고 골판 발사(투사체)', () => {
  it('중거리(900px) 상대에게 날아가 맞는다', () => {
    const r = run('stegosaurus', 'triceratops', 'heavy', 900, 90);
        expect(r.events.filter((e) => e.type === 'hit')).toHaveLength(1);
    expect(r.trace[0].p2hp - r.trace[r.trace.length - 1].p2hp).toBe(16);
    expect(r.match.projectiles).toHaveLength(0);
  });

  it('스테고 몸은 제자리에 있다(쏘는 기술)', () => {
    const r = run('stegosaurus', 'triceratops', 'heavy', 900, 60);
    expect(Math.max(...r.trace.map((t) => Math.abs(t.p1x - 600)))).toBeLessThan(60);
  });

  it('가드하면 약·강은 피해 0', () => {
    const match = new Match('versus', ['stegosaurus', 'triceratops'], [realAssets('stegosaurus'), realAssets('triceratops')]);
    const idle = new ScriptInput();
    for (let i = 0; i < ROUND_INTRO_FRAMES; i++) match.step(idle, FIXED_DT);
    match.p1.x = 600;
    match.p2.x = 1500;
    const input = new ScriptInput();
    input.hold(1, 'right');
    input.press(0, 'heavy');
    const hp = match.p2.health;
    for (let i = 0; i < 90; i++) {
      match.step(input, FIXED_DT);
      input.clearPressed();
    }
    expect(match.p2.health).toBe(hp);
  });
});

describe('벨로키 번개 왕복(다단히트·잔상·통과)', () => {
  const gap = minGap('velociraptor', 'triceratops') + 60;
  const r = run('velociraptor', 'triceratops', 'special', gap, 160);

  it('5번 맞히고 마지막 타격에 띄워 넘어뜨린다', () => {
    const hits = r.events.filter((e) => e.type === 'hit');
    expect(hits).toHaveLength(5);
    // 5+5+5+5+10 = 30, 벨로키 damageScale 0.86 적용(타격마다 반올림).
    const expected = [5, 5, 5, 5, 10].reduce((sum, d) => sum + Math.round(d * r.match.p1.data.damageScale), 0);
    expect(r.trace[0].p2hp - r.trace[r.trace.length - 1].p2hp).toBe(expected);
    expect(r.trace.some((t) => t.p2y < -60)).toBe(true);
    expect(r.trace.some((t) => t.p2state === 'fallen')).toBe(true);
  });

  it('상대를 통과해 왔다 갔다 한다(한 번 이상 상대 뒤로 넘어감)', () => {
    const crossed = r.trace.some((t) => t.p1x > t.p2x);
    const back = r.trace.findIndex((t) => t.p1x > t.p2x);
    expect(crossed).toBe(true);
    expect(r.trace.slice(back).some((t) => t.p1x < t.p2x)).toBe(true);
  });

  it('공격 중 잔상을 남긴다', () => {
    const match = new Match('versus', ['velociraptor', 'triceratops'], [realAssets('velociraptor'), realAssets('triceratops')]);
    const idle = new ScriptInput();
    for (let i = 0; i < ROUND_INTRO_FRAMES; i++) match.step(idle, FIXED_DT);
    match.p1.meter = 100;
    const input = new ScriptInput();
    input.press(0, 'special');
    let maxGhosts = 0;
    for (let i = 0; i < 40; i++) {
      match.step(input, FIXED_DT);
      input.clearPressed();
      maxGhosts = Math.max(maxGhosts, match.p1.ghosts.length);
    }
    expect(maxGhosts).toBeGreaterThanOrEqual(3);
  });
});
