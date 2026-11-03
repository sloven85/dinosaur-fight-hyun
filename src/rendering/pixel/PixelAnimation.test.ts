import { describe, expect, it, vi } from 'vitest';
import example from '../../../docs/pixel-manifest.example.json';
import { Fighter, NULL_INPUT } from '../../combat/Fighter';
import { Match } from '../../combat/Match';
import { getMove } from '../../data';
import { PixelAnimator, clipDuration, drawPixelSample, parsePixelManifest, pixelClipFor,
  samplePixelClip, validateBiteTiming, validatePixelImage, type PixelManifest } from './PixelAnimation';
import { loadPixelAssets, pixelPilotEnabled } from './PixelPilot';

const manifest = (): PixelManifest => parsePixelManifest(structuredClone(example));
const image = { naturalWidth: 768, naturalHeight: 896 } as HTMLImageElement;

describe('pixel manifest contract', () => {
  it('accepts the 4/8/8/3/3 contract with fixed integer scale and exact two-bite timing', () => {
    const m = manifest();
    expect(Object.values(m.clips).map(c => c.sequence.length)).toEqual([4, 8, 8, 3, 3]);
    expect(clipDuration(m.clips.bite)).toBe(30);
    expect(() => validateBiteTiming(m, getMove('tyrannosaurus_light'))).not.toThrow();
    expect(() => validatePixelImage(m, image)).not.toThrow();
  });

  it.each([
    ['version', (m: PixelManifest) => { m.version = 2 as 1; }],
    ['species', (m: PixelManifest) => { m.character = 'other' as 'tyrannosaurus'; }],
    ['fractional scale', (m: PixelManifest) => { m.scale = 1.5; }],
    ['zero scale', (m: PixelManifest) => { m.scale = 0; }],
    ['traversal', (m: PixelManifest) => { m.image = '../other.png'; }],
    ['external URL', (m: PixelManifest) => { m.image = 'https://example.com/a.png'; }],
    ['non PNG', (m: PixelManifest) => { m.image = 'a.svg'; }],
    ['empty frames', (m: PixelManifest) => { m.frames = []; }],
    ['negative rect', (m: PixelManifest) => { m.frames[0].x = -1; }],
    ['zero width', (m: PixelManifest) => { m.frames[0].w = 0; }],
    ['NaN', (m: PixelManifest) => { m.frames[0].h = NaN; }],
    ['anchor outside', (m: PixelManifest) => { m.frames[0].anchor.y = 129; }],
    ['fractional anchor', (m: PixelManifest) => { m.frames[0].anchor.x = 3.5; }],
    ['zero ticks', (m: PixelManifest) => { m.clips.idle.sequence[0].ticks = 0; }],
    ['missing frame', (m: PixelManifest) => { m.clips.walk.sequence[0].frame = 26; }],
    ['empty sequence', (m: PixelManifest) => { m.clips.hit.sequence = []; }],
    ['looping down', (m: PixelManifest) => { m.clips.down.loop = true; }],
    ['non looping walk', (m: PixelManifest) => { m.clips.walk.loop = false; }],
    ['invalid contact', (m: PixelManifest) => { m.biteContactFrames[0] = 26; }],
  ])('rejects %s', (_, change) => {
    const m = manifest(); change(m); expect(() => parsePixelManifest(m)).toThrow();
  });

  it.each([null, [], {}, 'not json'])('rejects missing manifest %j', raw => {
    expect(() => parsePixelManifest(raw)).toThrow();
  });
  it('rejects unloaded and undersized PNGs', () => {
    expect(() => validatePixelImage(manifest(), { naturalWidth: 0, naturalHeight: 0 } as HTMLImageElement)).toThrow();
    expect(() => validatePixelImage(manifest(), { naturalWidth: 700, naturalHeight: 896 } as HTMLImageElement)).toThrow();
  });
  it('rejects changed total or contact duration rather than moving damage', () => {
    const short = manifest(); short.clips.bite.sequence[7].ticks--;
    expect(() => validateBiteTiming(short, getMove('tyrannosaurus_light'))).toThrow();
    const early = manifest(); early.clips.bite.sequence[0].ticks--; early.clips.bite.sequence[7].ticks++;
    expect(() => validateBiteTiming(early, getMove('tyrannosaurus_light'))).toThrow();
  });
});

describe('pixel sampling and registration', () => {
  it('loops exactly at the boundary and holds one-shots forever', () => {
    const m = manifest();
    expect(samplePixelClip(m, 'idle', 39).frame).toBe(3);
    expect(samplePixelClip(m, 'idle', 40).frame).toBe(0);
    expect(samplePixelClip(m, 'walk', 45).frame).toBe(5);
    expect(samplePixelClip(m, 'down', 999999).frame).toBe(25);
    expect(samplePixelClip(m, 'hit', 999999).frame).toBe(22);
    expect(samplePixelClip(m, 'idle', -5).frame).toBe(0);
    expect(samplePixelClip(m, 'idle', NaN).frame).toBe(0);
  });
  it.each([1, -1] as const)('registers feet and nearest-neighbor integer scale facing %s', facing => {
    const g = { save: vi.fn(), restore: vi.fn(), translate: vi.fn(), scale: vi.fn(), drawImage: vi.fn(), imageSmoothingEnabled: true };
    const m = manifest();
    expect(drawPixelSample(g as unknown as CanvasRenderingContext2D, { manifest: m, image },
      samplePixelClip(m, 'walk', 0), 500.3, 880.8, facing)).toBe(true);
    expect(g.translate).toHaveBeenCalledWith(500, 881);
    expect(g.scale).toHaveBeenCalledWith(facing, 1);
    expect(g.imageSmoothingEnabled).toBe(false);
    expect(g.drawImage).toHaveBeenCalledWith(image, 0, 128, 192, 128, -288, -360, 576, 384);
    m.facing = 'left';
    drawPixelSample(g as unknown as CanvasRenderingContext2D, { manifest: m, image }, samplePixelClip(m, 'idle', 0), 0, 0, facing);
    expect(g.scale).toHaveBeenLastCalledWith(-facing, 1);
    expect(g.restore).toHaveBeenCalledTimes(2);
  });
  it('does not render an unready image', () => {
    const m = manifest();
    expect(drawPixelSample({} as CanvasRenderingContext2D, { manifest: m, image: { naturalWidth: 0 } as HTMLImageElement },
      samplePixelClip(m, 'idle', 0), 0, 0, 1)).toBe(false);
  });
  it('resets transitions, preserves the last frozen tick, and replays down after reset', () => {
    const f = new Fighter(0, 'tyrannosaurus', 500, 1), clock = new PixelAnimator(), m = manifest();
    clock.step(f, false);
    for (let i = 0; i < 15; i++) clock.step(f, false);
    expect(clock.sample(m, f)!.frame).toBe(1);
    f.state = 'hit'; clock.step(f, false);
    expect(clock.sample(m, f)!.frame).toBe(20);
    f.hitstopFrames = 1;
    const frozen = f.hitstopFrames > 0; f.step(NULL_INPUT, 1 / 60); clock.step(f, frozen);
    expect(f.hitstopFrames).toBe(0);
    expect(clock.sample(m, f)!.tick).toBe(0);
    f.state = 'down'; clock.step(f, false);
    for (let i = 0; i < 100; i++) clock.step(f, false);
    expect(clock.sample(m, f)!.frame).toBe(25);
    clock.reset(); clock.step(f, false);
    expect(clock.sample(m, f)!.frame).toBe(23);
  });
  it('uses actual attack frame even after jumps and explicitly rejects unsupported states', () => {
    const f = new Fighter(0, 'tyrannosaurus', 500, 1), clock = new PixelAnimator(), m = manifest();
    f.step({ isHeld: () => false, isPressed: (_, action) => action === 'light' }, 1 / 60);
    f.attack!.frame = 12;
    expect(clock.sample(m, f)!.frame).toBe(16);
    f.attack!.frame = 6;
    expect(clock.sample(m, f)!.frame).toBe(14);
    for (const state of ['jump', 'guard', 'crouch', 'victory', 'held', 'stun'] as const) {
      f.state = state; expect(pixelClipFor(f)).toBeNull();
    }
    f.resetForRound(500, 1);
    f.step({ isHeld: () => false, isPressed: (_, action) => action === 'heavy' }, 1 / 60);
    expect(pixelClipFor(f)).toBeNull();
    expect(pixelClipFor(new Fighter(1, 'triceratops', 700, -1))).toBeNull();
  });
});

describe('actual match observation (not pose-only playback)', () => {
  it.each([[false, 1], [false, -1], [true, 1], [true, -1]] as const)('does not change combat with observer, miss=%s facing=%s; contact and hitstop freeze both images', (miss, facing) => {
    const make = () => {
      const match = new Match('versus', ['tyrannosaurus', 'tyrannosaurus'], undefined, { impactTiming: true });
      match.phase = 'fight';
      match.p1.x = facing === 1 ? 600 : 1320;
      match.p2.x = facing === 1 ? (miss ? 1500 : 900) : (miss ? 420 : 1020);
      match.p1.facing = facing; match.p2.facing = facing === 1 ? -1 : 1;
      return match;
    };
    const observed = make(), reference = make(), clocks = [new PixelAnimator(), new PixelAnimator()], m = manifest();
    let damages = 0, frozenSamples = 0;
    for (let tick = 0; tick < 100; tick++) {
      const input = { isHeld: () => false, isPressed: (p: number, a: string) => tick === 0 && p === 0 && a === 'light' };
      const frozen = observed.fighters.map(f => f.hitstopFrames > 0);
      const previous = observed.fighters.map((f, i) => clocks[i].sample(m, f));
      const hp = observed.p2.health;
      observed.step(input, 1 / 60); reference.step(input, 1 / 60);
      observed.fighters.forEach((f, i) => clocks[i].step(f, frozen[i]));
      expect(observed.fighters.map(f => [f.x, f.y, f.health, f.state, f.attack?.frame, f.hitstopFrames])).toEqual(
        reference.fighters.map(f => [f.x, f.y, f.health, f.state, f.attack?.frame, f.hitstopFrames]));
      if (observed.p2.health < hp) {
        damages++;
        expect([14, 16]).toContain(clocks[0].sample(m, observed.p1)!.frame);
        expect(clocks[1].sample(m, observed.p2)!.frame).toBe(20);
      }
      observed.fighters.forEach((f, i) => {
        if (frozen[i]) { expect(clocks[i].sample(m, f)).toEqual(previous[i]); frozenSamples++; }
      });
    }
    expect(damages).toBe(miss ? 0 : 2);
    if (!miss) expect(frozenSamples).toBeGreaterThan(0);
  });
  it('tracks real KO, keeps down fixed, and resets on the next round without changing rules', () => {
    const match = new Match('versus', ['tyrannosaurus', 'tyrannosaurus'], undefined, { impactTiming: true });
    const clock = new PixelAnimator(), m = manifest();
    match.phase = 'fight'; match.p1.x = 600; match.p2.x = 900; match.p2.health = 1;
    let sawDown = false;
    for (let tick = 0; tick < 300 && match.roundNumber === 1; tick++) {
      const frozen = match.p2.hitstopFrames > 0;
      match.step({ isHeld: () => false, isPressed: (p, a) => tick === 0 && p === 0 && a === 'light' }, 1 / 60);
      clock.step(match.p2, frozen);
      if (match.p2.state === 'down') {
        if (!sawDown) expect(clock.sample(m, match.p2)!.frame).toBe(23);
        if (tick > 40) expect(clock.sample(m, match.p2)!.frame).toBe(25);
        sawDown = true;
      }
    }
    expect(sawDown).toBe(true);
    expect(match.roundNumber).toBe(2);
    clock.reset(); clock.step(match.p2, false);
    expect(clock.sample(m, match.p2)!.frame).toBe(0);
  });
});

describe('pilot gating and asset readiness', () => {
  it('requires exact DEV opt-in', () => {
    expect(pixelPilotEnabled(true, '?pixelPilot=1')).toBe(true);
    expect(pixelPilotEnabled(false, '?pixelPilot=1')).toBe(false);
    expect(pixelPilotEnabled(true, '?pixelPilot=0')).toBe(false);
    expect(pixelPilotEnabled(true, '')).toBe(false);
  });
  it('loads sheet relative to manifest only after validation', async () => {
    const loader = { loadJson: vi.fn().mockResolvedValue(manifest()), loadImage: vi.fn().mockResolvedValue(image) };
    await expect(loadPixelAssets(loader)).resolves.toMatchObject({ image });
    expect(loader.loadImage).toHaveBeenCalledWith('dev-art/tyrannosaurus/tyrannosaurus.png');
    loader.loadJson.mockResolvedValue(null); loader.loadImage.mockClear();
    await expect(loadPixelAssets(loader)).rejects.toThrow();
    expect(loader.loadImage).not.toHaveBeenCalled();
  });
  it('rejects missing PNG without pretending to be ready', async () => {
    await expect(loadPixelAssets({ loadJson: vi.fn().mockResolvedValue(manifest()), loadImage: vi.fn().mockResolvedValue(null) })).rejects.toThrow('PNG');
  });
});
