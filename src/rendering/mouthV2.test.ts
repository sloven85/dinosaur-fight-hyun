import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { applyAffine, partTransforms, type PartRigData } from './partRig';
const rig = JSON.parse(readFileSync('public/assets/characters/tyrannosaurus/parts/mouth-v2/rig.json', 'utf8')) as PartRigData;
describe('mouth v2 pilot', () => {
  it('loads back layers before their parents without changing inherited transforms', () => {
    expect(rig.drawOrder.slice(0, 3)).toEqual(['mfloor', 'mouth', 'lteeth']);
    expect(rig.mouthOpenMax).toBe(26);
    expect([rig.parts.jaw.pivotX, rig.parts.jaw.pivotY]).toEqual([1598, 392]);
    for (const jaw of [0, -13, -26]) for (const head of [-12, 0, 12]) {
      const posed = partTransforms(rig, { head, jaw });
      for (const name of ['mfloor', 'mouth', 'lteeth']) {
        const p = rig.parts[name], parent = rig.parts[p.parent!];
        const a = applyAffine(posed[name], 0, 0);
        const b = applyAffine(posed[p.parent!], p.offsetX - parent.offsetX, p.offsetY - parent.offsetY);
        expect(a[0]).toBeCloseTo(b[0]); expect(a[1]).toBeCloseTo(b[1]);
      }
    }
  });
  it('negative jaw angles lower the front mouth point instead of raising it', () => {
    const p = rig.parts.jaw;
    const closed = applyAffine(partTransforms(rig, { jaw: 0 }).jaw, 1845 - p.offsetX, 490 - p.offsetY);
    const open = applyAffine(partTransforms(rig, { jaw: -26 }).jaw, 1845 - p.offsetX, 490 - p.offsetY);
    expect(open[1]).toBeGreaterThan(closed[1]);
  });
});
