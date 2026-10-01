import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getMove } from '../data';
import {
  applyAffine,
  attackPartAngles,
  motionNameFor,
  partTransforms,
  type PartMotionsData,
  type PartRigData,
} from './partRig';

const DIR = 'public/assets/characters/tyrannosaurus/parts/rig';
const rig = JSON.parse(readFileSync(`${DIR}/rig.json`, 'utf8')) as PartRigData;
const motions = JSON.parse(readFileSync(`${DIR}/attack_motions.json`, 'utf8')) as PartMotionsData;

describe('티라노 파츠 리그(승인 파일럿)', () => {
  it('9파츠가 모두 있고 그리기 순서에 빠짐이 없다', () => {
    expect(rig.drawOrder).toHaveLength(9);
    for (const name of rig.drawOrder) expect(rig.parts[name]).toBeDefined();
  });

  it('대기(각도 0)는 각 파츠를 원래 자리(offset)에 놓는다', () => {
    const placed = partTransforms(rig, {});
    for (const name of rig.drawOrder) {
      const p = rig.parts[name];
      expect(applyAffine(placed[name], 0, 0)).toEqual([p.offsetX, p.offsetY]);
    }
  });

  it('회전해도 관절 축(pivot)은 제자리에 있다', () => {
    const placed = partTransforms(rig, { head: 14, jaw: -17 });
    for (const name of ['head', 'jaw']) {
      const p = rig.parts[name];
      const local = [p.pivotX! - p.offsetX, p.pivotY! - p.offsetY] as const;
      const [x, y] = applyAffine(placed[name], local[0], local[1]);
      if (name === 'head') {
        expect(x).toBeCloseTo(p.pivotX!, 6);
        expect(y).toBeCloseTo(p.pivotY!, 6);
      }
    }
  });

  it('자식은 부모 회전을 물려받는다(머리를 돌리면 턱도 따라간다)', () => {
    const still = partTransforms(rig, {});
    const turned = partTransforms(rig, { head: 14 });
    expect(turned.jaw).not.toEqual(still.jaw);
    expect(turned.torso).toEqual(still.torso);
  });

  it('엔진 heavy는 아티스트 strong 프로파일을 쓴다', () => {
    expect(motionNameFor('heavy')).toBe('strong');
    expect(motions.motions.strong).toBeDefined();
  });

  it('판정 구간에 아티스트 각도 100%, 회복 끝에 0으로 돌아온다', () => {
    for (const kind of ['light', 'heavy', 'special'] as const) {
      const profile = motions.motions[motionNameFor(kind)]!;
      const t = getMove(`tyrannosaurus_${kind}`);
      const strike = attackPartAngles(profile, t, t.startupFrames + t.activeFrames - 1);
      for (const [part, deg] of Object.entries(profile.angles)) expect(strike[part]).toBeCloseTo(deg, 6);
      const end = attackPartAngles(profile, t, t.startupFrames + t.activeFrames + t.recoveryFrames);
      for (const deg of Object.values(end)) expect(Math.abs(deg)).toBeLessThan(1e-9);
      // 준비 동작은 반대 방향으로 살짝 당긴다.
      const windup = attackPartAngles(profile, t, t.startupFrames - 1);
      expect(Math.sign(windup.head)).toBe(-Math.sign(profile.angles.head));
    }
  });

  it('파츠 각도에는 몸 이동(root)이 섞이지 않는다 — 몸 변환은 엔진 한 곳에서만', () => {
    const profile = motions.motions.special!;
    const t = getMove('tyrannosaurus_special');
    const strike = attackPartAngles(profile, t, t.startupFrames + 1);
    expect(Object.keys(strike).every((k) => k in rig.parts)).toBe(true);
    // 몸통(뿌리 파츠)은 회전하지 않는다.
    expect(strike.torso ?? 0).toBe(0);
  });
});
