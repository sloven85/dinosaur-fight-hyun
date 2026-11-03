import { describe, expect, it } from 'vitest';
import art from '../../../dev-art/tyrannosaurus/manifest.json';
import source from '../../../dev-art/tyrannosaurus/trex_pixel_anim_v2.json';
import { getMove } from '../../data';
import { Fighter, NULL_INPUT } from '../../combat/Fighter';
import { Match } from '../../combat/Match';
import { BASE_MOVE_SPEED } from '../../core/constants';
import { PixelAnimator, clipDuration, parsePixelManifest, samplePixelClip, sampleSourceClip, validateBiteTiming } from './PixelAnimation';

describe('received artist sheet integration', () => {
  const manifest = parsePixelManifest(art);
  it('adapts only metadata and retains scale, anchors, original time and exact contact windows', () => {
    expect(manifest.frames).toHaveLength(25);
    expect(manifest.scale).toBe(4);
    expect(manifest.frames.every(f => f.anchor.x === 100 && f.anchor.y === 128 && f.w === 208 && f.h === 136)).toBe(true);
    expect(() => validateBiteTiming(manifest, getMove('tyrannosaurus_light'))).not.toThrow();
    expect(clipDuration(manifest.clips.bite)).toBe(30);
    expect(manifest.sourceClips!.bite.sequence.reduce((n, s) => n + s.ms, 0)).toBeCloseTo(500);
    expect(manifest.sourceClips!.walk.sequence.map(s => s.ms)).toEqual(source.animations.walk.ms);
    for (const t of [6, 7, 8]) expect(samplePixelClip(manifest, 'bite', t).frame).toBe(14);
    for (const t of [12, 13, 14, 15]) expect(samplePixelClip(manifest, 'bite', t).frame).toBe(16);
    expect(sampleSourceClip(manifest, 'bite', 100).frame).toBe(14);
    expect(sampleSourceClip(manifest, 'bite', 150).frame).toBe(15);
    expect(sampleSourceClip(manifest, 'bite', 200).frame).toBe(16);
  });
  it('holds final down in both source-time and combat-time observation', () => {
    expect(sampleSourceClip(manifest, 'down', 5000).frame).toBe(24);
    expect(samplePixelClip(manifest, 'down', 5000).frame).toBe(24);
  });
  it('does not alter actual walking speed to conceal the stride mismatch', () => {
    const f = new Fighter(0, 'tyrannosaurus', 600, 1), clock = new PixelAnimator();
    const start = f.x;
    for (let t = 0; t < 43; t++) {
      f.step({ ...NULL_INPUT, isHeld: (_, a) => a === 'right' }, 1 / 60);
      clock.step(f, false); clock.sample(manifest, f);
    }
    expect(f.x - start).toBeCloseTo(BASE_MOVE_SPEED * f.data.speedScale * 43 / 60);
    expect(clipDuration(manifest.clips.walk)).toBe(43);
  });
  it('rejects invalid optional original-time metadata', () => {
    const malformed = structuredClone(art); malformed.sourceClips.down.sequence[0].ms = 0;
    expect(() => parsePixelManifest(malformed)).toThrow();
  });
  it.each([[1, false], [-1, false], [1, true], [-1, true]] as const)('v2 real match contact art and damage, facing=%s miss=%s', (facing, miss) => {
    const match = new Match('versus', ['tyrannosaurus', 'tyrannosaurus'], undefined, { impactTiming: true });
    match.phase = 'fight'; match.p1.x = facing === 1 ? 600 : 1320;
    match.p2.x = match.p1.x + facing * (miss ? 900 : 300);
    match.p1.facing = facing; match.p2.facing = facing === 1 ? -1 : 1;
    const clock = new PixelAnimator(), contacts: number[] = [];
    for (let t = 0; t < 100; t++) {
      const hp = match.p2.health, frozen = match.p1.hitstopFrames > 0;
      match.step({ isHeld: () => false, isPressed: (p, a) => t === 0 && p === 0 && a === 'light' }, 1 / 60);
      clock.step(match.p1, frozen);
      if (match.p2.health < hp) contacts.push(clock.sample(manifest, match.p1)!.frame);
    }
    expect(contacts).toEqual(miss ? [] : [14, 16]);
  });
  it('preserves fractional source timing and rejects NaN/Infinity', () => {
    for (const ms of [NaN, Infinity, -1]) {
      const malformed = structuredClone(art); malformed.sourceClips.bite.sequence[0].ms = ms;
      expect(() => parsePixelManifest(malformed)).toThrow();
    }
    for (let t = 0; t < 30; t++) {
      expect(sampleSourceClip(manifest, 'bite', (t + 0.01) * 1000 / 60).frame).toBe(samplePixelClip(manifest, 'bite', t).frame);
    }
  });
});
