import { describe, expect, it } from 'vitest';
import { PARALLAX, parallaxOffset } from './stageRenderer';
import { STAGES } from '../data';

describe('경기장 배경 시차', () => {
  it('가운데면 움직이지 않고, 먼 겹일수록 덜 움직인다', () => {
    expect(parallaxOffset('sky', 960, 1920)).toBeCloseTo(0);
    const sky = Math.abs(parallaxOffset('sky', 1400, 1920));
    const mid = Math.abs(parallaxOffset('mid', 1400, 1920));
    const ground = Math.abs(parallaxOffset('ground', 1400, 1920));
    expect(sky).toBeLessThan(mid);
    expect(mid).toBeLessThan(ground);
    expect(PARALLAX.ground).toBeLessThan(1);
  });
  it('계획서 경기장 4종(정글·화산·사막 화석지·박물관)과 하늘·중경·바닥 경로', () => {
    expect(STAGES.map((s) => s.id)).toEqual(['jungle', 'volcano', 'desert', 'museum']);
    for (const s of STAGES) for (const l of ['sky', 'mid', 'ground']) expect(s.layerPaths[l]).toContain(`stages/${s.id}/${l}`);
  });
});
