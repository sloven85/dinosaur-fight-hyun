import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Fighter, NULL_INPUT } from './Fighter';
import { Match } from './Match';
import { emptyAssets } from '../rendering/CharacterAssets';
import { contactPose, findContact, newReaction, react, REACTION_LIMITS, stepReaction, sweepCircle, sweptRectContact, type BodyRegion } from './partContact';
import { applyAffine } from '../rendering/partRig';

export function pilotAssets(id: string) {
  const base = `public/assets/characters/${id}/`;
  const json = (path: string) => JSON.parse(readFileSync(base + path, 'utf8'));
  return { ...emptyAssets(id), rig: json('rig.json'), parts: {
    rig: json('parts/rig/rig.json'), motions: json('parts/rig/attack_motions.json'), images: {},
  } };
}
const ids: [string, string] = ['tyrannosaurus', 'triceratops'];
function match() {
  const m = new Match('versus', ids, [pilotAssets(ids[0]), pilotAssets(ids[1])], { partContacts: true });
  m.phase = 'fight'; return m;
}
describe('part contact pilot', () => {
  it('sweeps a fast strike through a target and handles relative target movement', () => {
    const a = { x: 0, y: 0, r: 2 }, b = { x: 50, y: 0, r: 3 };
    expect(sweepCircle(a, { ...a, x: 100 }, b, b)).toBeCloseTo(0.45);
    expect(sweepCircle(a, { ...a, x: 100 }, b, { ...b, x: 150 })).toBeNull();
    expect(sweepCircle(a, { ...a, x: 100 }, { ...b, y: 6 }, { ...b, y: 6 })).toBeNull();
  });
  it('selects one earliest body region even when several overlap', () => {
    const c = findContact([{ x: 10, y: 0, r: 10 }], [
      { x: 15, y: 0, r: 10, region: 'head', part: 'head' },
      { x: 16, y: 0, r: 10, region: 'torso', part: 'torso' },
    ]);
    expect(c?.region).toBe('head'); expect(c?.x).toBe(5);
  });
  it('triceratops weapon centers stay on the approved opaque horn/beak pixels', () => {
    const f = new Fighter(0, 'triceratops', 960, 1, pilotAssets('triceratops'));
    f.partContacts = true;
    const pose = contactPose(f), m = pose.matrices.head;
    const part = f.assets.parts!.rig.parts.head;
    const points = [[1920, 600], [1810, 650], [1850, 860]];
    pose.weapon.forEach((c, i) => {
      const p = applyAffine(m, points[i][0] - part.offsetX, points[i][1] - part.offsetY);
      expect(c.x).toBeCloseTo(p[0]); expect(c.y).toBeCloseTo(p[1]);
      expect(c.r).toBeLessThan(8);
    });
  });
  it('fast projectile narrow phase crosses a part but rejects rounded-corner near misses', () => {
    const old = { left: 0, right: 10, top: 0, bottom: 10 };
    const next = { ...old, left: 100, right: 110 };
    const target = [{ x: 50, y: 5, r: 3, region: 'leg' as const, part: 'nearleg' }];
    expect(sweptRectContact(old, next, target, target, 1)?.region).toBe('leg');
    const miss = [{ ...target[0], y: 14 }];
    expect(sweptRectContact(old, next, miss, miss, 1)).toBeNull();
  });
  for (const id of ids) {
    it(`${id}: drawing matrices place every local hurt circle and mirror exactly`, () => {
      const f = new Fighter(0, id, 960, 1, pilotAssets(id)); f.partContacts = true;
      const a = contactPose(f); f.facing = -1; const b = contactPose(f);
      a.hurt.forEach((c, i) => { expect(c.x + b.hurt[i].x).toBeCloseTo(1920); expect(c.y).toBeCloseTo(b.hurt[i].y); });
      expect(new Set(a.hurt.map(c => c.region)).size).toBe(4);
      for (const c of a.hurt) expect(a.matrices[c.part]).toBeDefined();
      const head = f.assets.parts!.rig.parts.head;
      const torso = f.assets.parts!.rig.parts.torso;
      f.reaction.head.value = 12; f.reaction.torso.value = 16;
      const posed = contactPose(f);
      const neck = applyAffine(posed.matrices.head, head.pivotX! - head.offsetX, head.pivotY! - head.offsetY);
      const attachment = applyAffine(posed.matrices.torso, head.pivotX! - torso.offsetX, head.pivotY! - torso.offsetY);
      expect(neck[0]).toBeCloseTo(attachment[0]); expect(neck[1]).toBeCloseTo(attachment[1]);
    });
    it(`${id}: grounded foot anchors do not slide/sink during reactions`, () => {
      const f = new Fighter(0, id, 960, 1, pilotAssets(id)); f.partContacts = true;
      const idle = contactPose(f);
      f.reaction.leg.value = 7; f.reaction.torso.value = 16; f.reaction.head.value = 12;
      const hit = contactPose(f);
      for (const name of f.assets.parts!.rig.drawOrder.filter(n => n.includes('leg'))) {
        const p = f.assets.parts!.rig.parts[name];
        const point = [(p.pivotX! - p.offsetX), p.height - 5] as const;
        const a = applyAffine(idle.matrices[name], ...point), b = applyAffine(hit.matrices[name], ...point);
        expect(b[0]).toBeCloseTo(a[0]); expect(b[1]).toBeCloseTo(a[1]);
      }
    });
  }
  it('springs are region-specific, bounded, settle and cannot cause damage', () => {
    for (const region of ['head', 'torso', 'leg', 'tail'] as BodyRegion[]) {
      const f = match().p2; const hp = f.health;
      react(f, { region, part: region, x: 0, y: 0, direction: 1, t: 0 });
      stepReaction(f.reaction, 1 / 60);
      expect(f.reaction[region].value).not.toBe(0);
      for (let i = 0; i < 120; i++) {
        stepReaction(f.reaction, 1 / 60);
        expect(Math.abs(f.reaction[region].value)).toBeLessThanOrEqual(REACTION_LIMITS[region]);
      }
      expect(f.reaction).toEqual(newReaction()); expect(f.health).toBe(hp);
    }
  });
  for (const facing of [1, -1] as const) for (const [id, kind, hitGap, missGap] of [
    [0, 'light', 630, 660], [0, 'heavy', 660, 690],
    [1, 'light', 620, 650], [1, 'heavy', 540, 570],
  ] as const) it(`observed hit/miss boundary ${id}/${kind}/${facing}`, () => {
    for (const [gap, shouldHit] of [[hitGap, true], [missGap, false]] as const) {
      const order: [string, string] = id === 0 ? ids : [ids[1], ids[0]];
      const m = new Match('versus', order, [pilotAssets(order[0]), pilotAssets(order[1])], { partContacts: true });
      m.phase = 'fight'; m.p1.x = 960 - facing * gap / 2; m.p2.x = 960 + facing * gap / 2;
      m.p1.facing = facing; m.p2.facing = -facing as 1 | -1;
      for (let i = 0; i < 220; i++) m.step({ isHeld: () => false, isPressed: (p, a) => i === 0 && p === 0 && a === kind }, 1 / 60);
      expect(m.p2.health < m.p2.maxHealth).toBe(shouldHit);
    }
  });
  it('pushboxes are narrower than silhouettes, including wall separation', () => {
    const m = match();
    expect(m.pushWidth(m.p1)).toBeLessThan(m.p1.bodyWidth * 0.5);
    m.p1.x = 700; m.p2.x = 900; m.step(NULL_INPUT, 1 / 60);
    expect(m.p1.x).toBe(700); expect(m.p2.x).toBe(900);
    m.p1.x = 0; m.p2.x = 0; m.step(NULL_INPUT, 1 / 60);
    expect(Math.abs(m.p1.x - m.p2.x)).toBeGreaterThanOrEqual((m.pushWidth(m.p1) + m.pushWidth(m.p2)) / 2 - 0.01);
  });
  it('round reset clears reaction and recorded contact', () => {
    const f = match().p1; f.reaction.head.value = 10;
    react(f, { region: 'head', part: 'head', x: 0, y: 0, direction: 1, t: 0 });
    f.resetForRound(500, 1); expect(f.lastContact).toBeNull(); expect(f.reaction).toEqual(newReaction());
  });
  for (const id of ids) for (const region of ['head', 'torso', 'leg'] as BodyRegion[]) {
    it(`${id}: ${region} yields a distinct contact and unchanged damage via projectile resolution`, () => {
      const m = new Match('versus', [ids[0], id], [pilotAssets(ids[0]), pilotAssets(id)], { partContacts: true });
      m.phase = 'fight'; m.p1.x = 500; m.p2.x = 1300;
      const target = contactPose(m.p2).hurt.find(c => c.region === region)!;
      const hp = m.p2.health;
      m.projectiles.push({ owner: 0, kind: 'light', x: target.x, y: target.y, vx: 0, vy: 0,
        gravity: 0, rotation: 0, spin: 0, life: 1, age: 0, attackId: 123, spent: false, facing: 1,
        spec: { x: 0, y: 0, vx: 0, w: 2, h: 2, life: 1, sprite: '',
          damage: 10, hitstop: 0, hitstun: 12, knockback: 0, pierce: true } });
      m.step(NULL_INPUT, 1 / 60);
      expect(m.p2.lastContact?.region).toBe(region);
      expect(m.p2.health).toBe(hp - Math.round(10 * m.p1.data.damageScale));
      for (let i = 0; i < 120; i++) m.step(NULL_INPUT, 1 / 60);
      expect(m.p2.health).toBe(hp - Math.round(10 * m.p1.data.damageScale));
    });
  }
  for (const swapped of [false, true]) for (const facing of [1, -1] as const) {
    for (const kind of ['heavy', 'special'] as const) it(`${kind} completes in pilot (swap=${swapped}, facing=${facing})`, () => {
      const order: [string, string] = swapped ? [ids[1], ids[0]] : ids;
      const m = new Match('versus', order, [pilotAssets(order[0]), pilotAssets(order[1])], { partContacts: true });
      m.phase = 'fight'; m.p1.x = 960 - facing * 300; m.p2.x = 960 + facing * 300;
      m.p1.facing = facing; m.p2.facing = -facing as 1 | -1; m.p1.meter = 100;
      if (swapped && kind === 'heavy') { m.p1.x = 960 - facing * 205; m.p2.x = 960 + facing * 205; }
      for (let i = 0; i < 240; i++) {
        const held = m.p1.holding;
        const beforeX = m.p2.x;
        m.step({ isHeld: () => false, isPressed: (p, a) => i === 0 && p === 0 && a === kind }, 1 / 60);
        if (held && !m.p1.holding) expect(Math.abs(m.p2.x - beforeX)).toBeLessThan(100);
      }
      expect(m.p2.health).toBeLessThan(m.p2.maxHealth);
      expect(m.p1.holding).toBeNull(); expect(m.p2.heldBy).toBeNull();
      expect([m.p1.x, m.p1.y, m.p2.x, m.p2.y].every(Number.isFinite)).toBe(true);
    });
    it(`actual light attacks resolve once per hit window (swap=${swapped}, facing=${facing})`, () => {
      const order: [string, string] = swapped ? [ids[1], ids[0]] : ids;
      const m = new Match('versus', order, [pilotAssets(order[0]), pilotAssets(order[1])], { partContacts: true });
      m.phase = 'fight'; m.p1.x = 960 - facing * 300; m.p2.x = 960 + facing * 300;
      m.p1.facing = facing; m.p2.facing = -facing as 1 | -1;
      const events = [];
      for (let i = 0; i < 80; i++) {
        m.step({ isHeld: () => false, isPressed: (p, a) => i === 0 && p === 0 && a === 'light' }, 1 / 60);
        events.push(...m.consumeEvents().filter(e => e.type === 'hit'));
      }
      expect(events.length).toBeGreaterThan(0);
      expect(events.length).toBeLessThanOrEqual(swapped ? 1 : 2);
      expect(events.every(e => e.region && e.part && Number.isFinite(e.x))).toBe(true);
    });
  }
});
