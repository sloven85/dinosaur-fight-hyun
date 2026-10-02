import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Match } from './Match';
import { NULL_INPUT } from './Fighter';
import { emptyAssets } from '../rendering/CharacterAssets';
import { contactPilotMove } from './chargePilot';
import { sampleChannel } from './moveScript';
import { getMove } from '../data';
import { contactPose, findContact } from './partContact';

const ids: [string, string] = ['triceratops', 'tyrannosaurus'];
function make(facing: 1 | -1, gap: number, rangeLane = false) {
  const assets = ids.map(id => {
    const json = (path: string) => JSON.parse(readFileSync(`public/assets/characters/${id}/${path}`, 'utf8'));
    return { ...emptyAssets(id), rig: json('rig.json'), parts: { rig: json('parts/rig/rig.json'),
      motions: json('parts/rig/attack_motions.json'), images: {} } };
  });
  const m = new Match('versus', ids, [assets[0], assets[1]], { partContacts: true });
  m.phase = 'fight'; m.p1.x = 960 - facing * gap / 2; m.p2.x = 960 + facing * gap / 2;
  m.p1.facing = facing; m.p2.facing = -facing as 1 | -1; m.p1.meter = 100;
  // Range fixture only: normal arena clamps root distance before its theoretical range edge.
  if (rangeLane) for (const f of m.fighters) f.clampToArena = () => {};
  return m;
}
const press = { isHeld: () => false, isPressed: (p: number, a: string) => p === 0 && a === 'special' };
describe('triceratops charge startup alignment', () => {
  it('holds xr=0 through frame16, preserves active windows/damage and exact frame40+ endpoint', () => {
    const original = getMove('triceratops_special'), fixed = contactPilotMove(original);
    for (let f = 0; f <= 16; f++) expect(sampleChannel(fixed.script!, 'xr', f)).toBe(0);
    for (let f = 40; f <= 91; f++) for (const ch of ['xr', 'x'] as const)
      expect(sampleChannel(fixed.script!, ch, f)).toBe(sampleChannel(original.script!, ch, f));
    expect(fixed.script!.hits).toEqual(original.script!.hits);
    expect(fixed.script!.reach).toBe(900);
    expect(fixed.script!.frames).toBe(92);
    expect(sampleChannel(original.script!, 'xr', 15)).toBe(0.375);
    expect(contactPilotMove(getMove('tyrannosaurus_special'))).toBe(getMove('tyrannosaurus_special'));
  });
  for (const facing of [1, -1] as const) for (const gap of [180, 250, 280, 300, 310, 320, 600, 1000]) {
    it(`gap ${gap}, facing ${facing}: no startup damage/crossing, exactly one active hit`, () => {
      const m = make(facing, gap); m.step(press, 1 / 60);
      for (let frame = 1; frame < 16; frame++) {
        m.step(NULL_INPUT, 1 / 60);
        expect(m.p2.health).toBe(m.p2.maxHealth);
        expect((m.p2.x - m.p1.x) * facing).toBeGreaterThan(0);
      }
      if (gap <= 320) {
        // Verify genuine overlap at activation, not a late sweep of a startup-only contact.
        m.p1.attack!.frame = 16; m.p1.applyScriptFrame();
        expect(findContact(contactPose(m.p1).weapon, contactPose(m.p2).hurt)).not.toBeNull();
        m.p1.attack!.frame = 15; m.p1.applyScriptFrame();
      }
      const hits = [];
      for (let i = 0; i < 160; i++) {
        m.step(NULL_INPUT, 1 / 60);
        hits.push(...m.consumeEvents().filter(e => e.type === 'hit'));
      }
      expect(hits).toHaveLength(1);
      expect(m.p2.health).toBe(m.p2.maxHealth - Math.round(26 * m.p1.data.damageScale));
    });
  }
  for (const facing of [1, -1] as const) it(`range edge scan is monotone and misses beyond fixed endpoint (${facing})`, () => {
    let missed = false, boundary = 0;
    for (let gap = 1200; gap <= 1900; gap += 10) {
      const m = make(facing, gap, true); m.step(press, 1 / 60);
      for (let i = 0; i < 180; i++) m.step(NULL_INPUT, 1 / 60);
      const hit = m.p2.health < m.p2.maxHealth;
      if (hit) { expect(missed).toBe(false); boundary = gap; } else missed = true;
    }
    expect(boundary).toBe(1590);
    // Original end-of-active pose has the same geometric reach; only its timing was wrong.
    for (const gap of [1590, 1600]) {
      const m = make(facing, gap, true); m.step(press, 1 / 60);
      m.p1.attack = { ...m.p1.attack!, move: getMove('triceratops_special') };
      for (let i = 0; i < 180; i++) m.step(NULL_INPUT, 1 / 60);
      expect(m.p2.health < m.p2.maxHealth).toBe(gap === 1590);
    }
  });
});
