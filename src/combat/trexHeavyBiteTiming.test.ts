import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Match } from './Match';
import { ScriptInput } from './ScriptInput';
import { getMove } from '../data';
import { bitePilotMove } from './bitePilot';
import { FIXED_DT, ROUND_INTRO_FRAMES } from '../core/constants';
import type { CharacterAssets } from '../rendering/CharacterAssets';
import type { RigData } from '../rendering/rig';

/**
 * 티라노 강공격 '꽉 물고 흔들기' 첫 타 시점 (마스터 2026-10-31).
 *
 * 접촉은 f14, 첫 피해는 f41이어서 27프레임 동안 "물었는데 체력이 안 줄던" 구간이 있었다.
 * 첫 타를 물기 접촉으로 당기되 **총 피해량·사거리는 그대로** 둔다.
 * - 첫 피해: 잡기 성공 직후 '꽉 문 자세'(f30)부터 1회 (원래 41)
 *   잡기에 성공하면 엔진이 공격 프레임을 잡기 자세(grab.success=30)로 넘긴다 — 그 사이 프레임은
 *   실행되지 않으므로, 물기 직후의 첫 실행 프레임(31)이 옮길 수 있는 가장 이른 지점이다.
 * - 나머지 흔들기 타격(49·57·65·73·81)과 던지기 피해는 불변 → 합계 14 + 던지기 6 = 20
 * - 잡기 상자·판정 상자는 손대지 않는다(사거리 불변)
 */

function assetsOf(id: string): CharacterAssets {
  const rig = JSON.parse(readFileSync(`public/assets/characters/${id}/rig.json`, 'utf8')) as RigData;
  return { id, rig, master: null, portrait: null, poses: {} };
}

/** 최소 간격에서 강공격을 내고, 체력이 줄어든 프레임과 총 피해를 기록한다. */
function runHeavy(gap: number): { drops: { frame: number; delta: number }[]; total: number; hits: number } {
  const match = new Match('versus', ['tyrannosaurus', 'tyrannosaurus'],
    [assetsOf('tyrannosaurus'), assetsOf('tyrannosaurus')]);
  const idle = new ScriptInput();
  for (let i = 0; i < ROUND_INTRO_FRAMES; i++) match.step(idle, FIXED_DT);
  // 접촉 게이트와 같은 최소 간격 조건.
  const center = 960;
  match.p1.x = center - gap / 2;
  match.p2.x = center + gap / 2;
  match.p1.facing = 1;
  match.p2.facing = -1;

  const input = new ScriptInput();
  input.press(0, 'heavy');
  match.step(input, FIXED_DT);
  input.clearPressed();

  const drops: { frame: number; delta: number }[] = [];
  let hits = 0;
  let total = 0;
  for (let i = 0; i < 160; i++) {
    const health = match.p2.health;
    match.step(input, FIXED_DT);
    if (match.p2.health < health) {
      const frame = match.p1.attack ? match.p1.attack.frame : -1;
      drops.push({ frame, delta: health - match.p2.health });
      total += health - match.p2.health;
    }
    hits += match.consumeEvents().filter((event) => event.type === 'hit').length;
  }
  return { drops, total, hits };
}

describe('티라노 강공격 — 첫 타가 물기 접촉에 붙는다(피해·사거리 불변)', () => {
  const move = getMove('tyrannosaurus_heavy');

  it('첫 피해는 물기 자세 직후(30~32)에 들어간다(예전 41 아님)', () => {
    const { drops } = runHeavy(250);
    expect(drops.length).toBeGreaterThan(0);
    const first = drops[0].frame;
    expect(first).toBeGreaterThanOrEqual(30);
    expect(first).toBeLessThanOrEqual(32);
  });

  it('물기 접촉(14) → 첫 피해(31) 사이 빈 구간이 27f에서 17f로 줄었다', () => {
    const { drops } = runHeavy(250);
    const gap = drops[0].frame - move.startupFrames;
    expect(move.startupFrames).toBe(14);
    expect(gap).toBeLessThanOrEqual(18);
  });

  it('총 피해량은 그대로다(흔들기 14 + 던지기 6 = 20, 7회)', () => {
    const { total, hits, drops } = runHeavy(250);
    expect(drops.map((drop) => drop.delta)).toEqual([2, 2, 2, 2, 2, 4, 6]);
    expect(drops.reduce((sum, drop) => sum + drop.delta, 0)).toBe(20);
    expect(total).toBe(20);
    expect(hits).toBe(7);
  });

  it('사거리(잡기 상자·판정 상자)는 손대지 않았다', () => {
    const picked = bitePilotMove(move);
    // 잡기 상자·창은 데이터 원본 그대로(파일럿 변환은 성공 자세 앞당김뿐).
    expect(move.script!.grab).toEqual({
      from: 15, to: 22, box: { x: -40, y: -360, w: 150, h: 300 }, success: 30, miss: 111,
    });
    expect(picked.script!.grab!.box).toEqual(move.script!.grab!.box);
    expect(move.hitboxes[0]).toEqual({ startFrame: 14, endFrame: 19, x: 173, y: -284, width: 165, height: 181 });
    expect(picked.script!.reach).toBe(move.script!.reach);
  });

  it('첫 타는 잡기 자세(성공 프레임)에서만 들어간다 — 잡기 전 프레임에는 걸지 않는다', () => {
    const hits = bitePilotMove(move).script!.hits!;
    expect(hits[0].target).toBe('held');
    expect(hits[0].from).toBeLessThanOrEqual(32);
    expect(hits[0].to).toBe(32);
    expect(hits.slice(1).map((hit) => hit.from)).toEqual([49, 57, 65, 73, 81]);
  });
});
