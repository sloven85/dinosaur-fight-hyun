import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FIXED_DT, ROUND_INTRO_FRAMES } from '../core/constants';
import { CHARACTERS } from '../data';
import type { CharacterAssets } from '../rendering/CharacterAssets';
import type { RigData } from '../rendering/rig';
import type { AttackKind } from './types';
import { Match } from './Match';
import { ScriptInput } from './ScriptInput';

/** 실제 public/assets의 rig.json(새 아트 실측)으로 에셋을 만든다(이미지는 판정에 불필요). */
function realAssets(id: string): CharacterAssets {
  const rig = JSON.parse(
    readFileSync(`public/assets/characters/${id}/rig.json`, 'utf8'),
  ) as RigData;
  return { id, rig, master: null, portrait: null, poses: {} };
}

/** 밀어내기 최소 간격에 정확히 붙여 세우고 P1이 kind 기술을 쓴다. 피해량을 돌려준다. */
function damageAtMinGap(p1: string, p2: string, kind: AttackKind): number {
  const match = new Match('versus', [p1, p2], [realAssets(p1), realAssets(p2)]);
  const idle = new ScriptInput();
  for (let i = 0; i < ROUND_INTRO_FRAMES; i++) match.step(idle, FIXED_DT);

  const minGap = (match.p1.bodyWidth + match.p2.bodyWidth) / 2;
  match.p1.x = 700;
  match.p2.x = 700 + minGap;
  match.p1.meter = 100;

  const before = match.p2.health;
  const input = new ScriptInput();
  input.press(0, kind);
  match.step(input, FIXED_DT);
  input.clearPressed();
  for (let i = 0; i < 200; i++) match.step(input, FIXED_DT);
  return before - match.p2.health;
}

const IDS = CHARACTERS.map((c) => c.id);

describe('기술 판정: 몸 앞끝 기준(마스터 결정 2026-10-01)', () => {
  for (const kind of ['light', 'heavy', 'special'] as const) {
    it(`최소 간격에서 12×12 전 조합 ${kind} 명중`, () => {
      const misses: string[] = [];
      for (const a of IDS) for (const b of IDS) {
        if (damageAtMinGap(a, b, kind) <= 0) misses.push(`${a}→${b}`);
      }
      expect(misses).toEqual([]);
    });
  }

  it('사거리는 종마다 약 < 강 < 특수 순서다', () => {
    for (const id of IDS) {
      const m = new Match('versus', [id, id], [realAssets(id), realAssets(id)]);
      const f = m.p1;
      // 스크립트 기술(투사체·왕복·잡기)은 사거리가 기술 고유라 순서 비교에서 뺀다.
      const plain = (['light', 'heavy', 'special'] as const).filter((k) => !f.moves[k].script);
      for (let i = 1; i < plain.length; i++) {
        expect(f.reachOf(plain[i - 1])).toBeLessThan(f.reachOf(plain[i]));
      }
      expect(f.reachOf('light')).toBeGreaterThan(f.bodyFront);
    }
  });
});
