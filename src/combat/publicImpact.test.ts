import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { Match, type MatchEvent } from './Match';
import { Fighter, NULL_INPUT } from './Fighter';
import { emptyAssets } from '../rendering/CharacterAssets';
import { applyImpactRecoil } from '../rendering/FighterRenderer';
import { impactStop } from './impactTiming';

const assets = (id: string) => ({ ...emptyAssets(id),
  rig: JSON.parse(readFileSync(`public/assets/characters/${id}/rig.json`, 'utf8')) });

describe('public impact without contact candidate', () => {
  for (const [id, kind] of [['tyrannosaurus', 'light'], ['tyrannosaurus', 'heavy'],
    ['triceratops', 'special'], ['ankylosaurus', 'heavy']] as const) {
    for (const side of [1, -1] as const) for (const mode of ['hit', 'guard', 'miss', 'wall'] as const) {
      it(`${id}/${kind}/${side}/${mode}: public damage and hit count preserved`, () => {
        const results = [false, true].map(impactTiming => {
          const m = new Match('versus', [id, 'triceratops'], [assets(id), assets('triceratops')], { impactTiming });
          expect(m.fighters.every(f => !f.partContacts)).toBe(true);
          m.phase = 'fight'; m.p1.meter = 100;
          const gap = (m.p1.bodyWidth + m.p2.bodyWidth) / 2 + 30;
          m.p1.x = 960 - side * gap / 2; m.p2.x = 960 + side * gap / 2;
          m.p1.facing = side; m.p2.facing = -side as 1 | -1;
          if (mode === 'wall') { m.p2.x = side === 1 ? 1800 : 120; m.p1.x = m.p2.x - side * gap; }
          const hp = m.p2.health, events: MatchEvent[] = [];
          for (let frame = 0; frame < 300; frame++) {
            if (mode === 'miss') { m.p2.y = -4000; m.p2.vy = 0; m.p2.onGround = false; }
            m.step({ isHeld: (p, k) => mode === 'guard' && p === 1 && k === (side === 1 ? 'right' : 'left'),
              isPressed: (p, k) => frame === 0 && p === 0 && k === kind }, 1 / 60);
            const emitted = m.consumeEvents(); events.push(...emitted);
            // Grab release emits a hit event directly; its attachment/throw pose stays unchanged.
            if (impactTiming && !(id === 'tyrannosaurus' && kind === 'heavy') &&
                emitted.some(e => e.type === 'hit') && m.p2.state !== 'held') {
              expect(Math.abs(m.p2.reaction.torso.value)).toBeGreaterThan(0);
            }
          }
          expect(m.p2.hitstopFrames).toBe(0); expect(m.p2.heldBy).toBeNull(); expect(m.p1.holding).toBeNull();
          return { damage: hp - m.p2.health, hits: events.filter(e => e.type === 'hit').length,
            guards: events.filter(e => e.type === 'guard').length };
        });
        expect(results[1]).toEqual(results[0]);
        if (mode === 'hit') expect(results[1].hits).toBeGreaterThan(0);
        if (mode === 'miss') expect(results[1]).toEqual({ damage: 0, hits: 0, guards: 0 });
        if (mode === 'guard' && kind === 'light') {
          expect(results[1].guards).toBeGreaterThan(0); expect(results[1].hits).toBe(0);
        }
      });
    }
  }

  it('renders recoil on the damage frame without altering collision, then clears on terminal/reset', () => {
    const f = new Fighter(0, 'tyrannosaurus', 500, 1); f.impactTiming = true;
    const box = f.hurtbox(); f.startImpactRecoil('heavy', -1);
    const translate = vi.fn();
    const g = { translate } as unknown as CanvasRenderingContext2D;
    applyImpactRecoil(g, f); expect(translate).toHaveBeenCalledWith(-2, 0);
    expect(f.hurtbox()).toEqual(box); expect(f.x).toBe(500);
    f.state = 'held'; translate.mockClear(); applyImpactRecoil(g, f); expect(translate).not.toHaveBeenCalled();
    f.finishRound('down'); expect(f.reaction.torso.value).toBe(0);
    f.resetForRound(500, 1); f.step(NULL_INPUT, 1 / 60);
    expect(f.reaction.torso.value).toBe(0); expect(f.attack).toBeNull();
  });

  it('does not change the other nine species stop durations', () => {
    for (const id of ['velociraptor', 'spinosaurus', 'stegosaurus', 'carnotaurus', 'pachycephalosaurus',
      'therizinosaurus', 'dilophosaurus', 'brachiosaurus', 'pteranodon']) {
      expect(impactStop(id, 'heavy', 11, false, false)).toBe(11);
    }
  });
});
