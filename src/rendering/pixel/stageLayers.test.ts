import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { PixelBackground, DOT_STAGE_LAYER_ART, hasDotStageLayers, layerRef, type PixelStageLayers } from './PixelBackground';
import { STAGES } from '../../data';

/**
 * 사막 경기장 layers.json 404 회귀 방지.
 *
 * 도트 배경 아트가 있는 경기장 목록(DOT_STAGE_LAYER_ART)과 실제 `dev-art/stages/<id>/layers.json`이
 * 정확히 같아야 한다. 목록에 없는 경기장은 layers.json을 요청하지 않으므로 콘솔 404가 0건이 된다.
 * 아티스트가 새 배경을 넣으면 이 테스트가 먼저 실패해 목록 갱신을 강제한다.
 */

const ROOT = 'dev-art/stages';

function stageDirsWithLayers(): string[] {
  return readdirSync(ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => existsSync(`${ROOT}/${name}/layers.json`))
    .sort();
}

describe('도트 배경 레이어 아트 목록', () => {
  it('목록 = dev-art/stages에서 layers.json이 있는 폴더', () => {
    expect([...DOT_STAGE_LAYER_ART].sort()).toEqual(stageDirsWithLayers());
  });

  it('목록의 모든 경기장은 게임 데이터에 있고, 3레이어 PNG가 실제로 있다', () => {
    const ids = new Set(STAGES.map((stage) => stage.id));
    for (const stage of DOT_STAGE_LAYER_ART) {
      expect(ids.has(stage), `${stage}: STAGES에 없는 id`).toBe(true);
      const spec = JSON.parse(readFileSync(`${ROOT}/${stage}/layers.json`, 'utf8')) as PixelStageLayers;
      expect(Number.isFinite(spec.standLine), `${stage}: standLine`).toBe(true);
      for (const name of ['far', 'mid', 'ground'] as const) {
        const file = layerRef(spec.layers[name]).file;
        expect(existsSync(`${ROOT}/${stage}/${file}`), `${stage}/${file}`).toBe(true);
      }
    }
  });

  it('아트가 없는 경기장은 layers.json을 요청하지 않는다(404 0건)', async () => {
    const requested: string[] = [];
    const loader = {
      loadJson: async (path: string) => { requested.push(path); return null; },
      loadImage: async (path: string) => { requested.push(path); return null; },
    };
    const bg = new PixelBackground(loader as never);
    for (const stage of STAGES) {
      if (hasDotStageLayers(stage.id)) continue;
      const ctx = { save() {}, restore() {}, fillRect() {}, drawImage() {}, imageSmoothingEnabled: false } as unknown as CanvasRenderingContext2D;
      expect(bg.render(ctx, stage.id, 900, 960, 1920, 1080, { far: 0.25, mid: 0.6, ground: 1 })).toBe(false);
    }
    await new Promise((r) => setTimeout(r, 0));
    expect(requested).toEqual([]);
    // 아트가 있는 경기장은 반대로 요청이 나간다(게이트가 과하게 막지 않았는지 확인).
    const art = DOT_STAGE_LAYER_ART[0];
    const warm = {
      loadJson: async (path: string) => { requested.push(path); return null; },
      loadImage: async (path: string) => { requested.push(path); return null; },
    };
    new PixelBackground(warm as never).render(
      { save() {}, restore() {}, fillRect() {}, drawImage() {}, imageSmoothingEnabled: false } as unknown as CanvasRenderingContext2D,
      art, 900, 960, 1920, 1080, { far: 0.25, mid: 0.6, ground: 1 },
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(requested).toEqual([`dev-art/stages/${art}/layers.json`]);
  });
});
