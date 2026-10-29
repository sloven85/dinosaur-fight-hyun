import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { CHARACTERS } from '../../data';
import { ARENA_LEFT, ARENA_RIGHT } from '../../core/constants';
import { PIXEL_ART_SCALE, PIXEL_LAYER_W, PIXEL_VIEW_W } from './PixelBackground';
import { PARALLAX } from './SpriteStage';

/**
 * displayHeight lock (jk 지시 2026-10-29).
 *
 * 판정·몸 크기의 기준인 displayHeight는 **그 종의 아트 실측 키 × 4**여야 한다.
 * 아트가 바뀌면 이 테스트가 먼저 깨져서, 그림만 새로 넣고 판정을 그대로 두는 일을 막는다.
 * 기준 상태는 대기(idle) 클립의 실루엣 최대 높이다 — 서 있는 몸의 키.
 */

const ROOT = 'dev-art/species';
const SCALE = 4;

interface Sheet { width: number; height: number; alpha: Uint8Array }

/** PNG(8bit, non-interlaced)를 zlib로 풀어 alpha 채널만 돌려준다. 외부 패키지 없이 실측하기 위한 것. */
function readSheet(path: string): Sheet {
  const buf = readFileSync(path);
  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = 6;
  const idat: Buffer[] = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8) throw new Error('8bit PNG만 지원');
      colorType = data[9];
      if (data[12] !== 0) throw new Error('interlaced PNG는 지원하지 않습니다');
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const pixels = new Uint8Array(width * height * bpp);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[x] = v & 0xff;
    }
  }
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) alpha[i] = bpp === 4 ? pixels[i * 4 + 3] : 255;
  return { width, height, alpha };
}

/** manifest 프레임 안에서 alpha>8 인 세로 범위 길이. */
function silhouetteHeight(sheet: Sheet, frame: { x: number; y: number; w: number; h: number }): number {
  let top = Infinity;
  let bottom = -1;
  for (let y = 0; y < frame.h; y++) {
    const row = frame.y + y;
    if (row < 0 || row >= sheet.height) continue;
    for (let x = 0; x < frame.w; x++) {
      const col = frame.x + x;
      if (col < 0 || col >= sheet.width) continue;
      if (sheet.alpha[row * sheet.width + col] > 8) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        break;
      }
    }
  }
  return bottom < 0 ? 0 : bottom - top + 1;
}

const index = JSON.parse(readFileSync(`${ROOT}/index.json`, 'utf8'));

describe('displayHeight lock: 종별 아트 실측 키 × 4', () => {
  const byId = new Map(CHARACTERS.map((c) => [c.id, c]));
  const entries = Object.entries<{ character: string }>(index.species);

  it('12종이 모두 아트 실측 키 × 4를 쓴다', () => {
    const rows: string[] = [];
    for (const [folder, entry] of entries) {
      const manifest = JSON.parse(readFileSync(`${ROOT}/${folder}/manifest.json`, 'utf8'));
      const sheet = readSheet(`${ROOT}/${folder}/${manifest.image}`);
      const heights = manifest.clips.idle.frames.map((i: number) => silhouetteHeight(sheet, manifest.frames[i]));
      const art = Math.max(...heights);
      const data = byId.get(entry.character);
      expect(data, `${folder}: characters.json에 ${entry.character} 없음`).toBeDefined();
      rows.push(`${entry.character}\tart ${art}px × ${SCALE} = ${art * SCALE}\tdata ${data!.displayHeight}`);
      expect(data!.displayHeight, `${folder}: 아트 ${art}px×${SCALE}=${art * SCALE}인데 displayHeight=${data!.displayHeight}`)
        .toBe(art * SCALE);
    }
    expect(rows).toHaveLength(12);
  });
});

describe('지면 1.00 시차가 레이어 여백 안에서 성립한다', () => {
  const indexJson = JSON.parse(readFileSync(`${ROOT}/index.json`, 'utf8'));
  const stages = ['jungle', 'volcano'];

  /** 대기 클립에서 기준점(anchorX)보다 앞/뒤로 나간 최대 폭(아트 px). */
  function extents(folder: string) {
    const manifest = JSON.parse(readFileSync(`${ROOT}/${folder}/manifest.json`, 'utf8'));
    const sheet = readSheet(`${ROOT}/${folder}/${manifest.image}`);
    let front = 0;
    let back = 0;
    for (const i of manifest.clips.idle.frames as number[]) {
      const f = manifest.frames[i];
      let minX = Infinity;
      let maxX = -1;
      for (let y = 0; y < f.h; y++) {
        for (let x = 0; x < f.w; x++) {
          if (sheet.alpha[(f.y + y) * sheet.width + f.x + x] > 8) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
        }
      }
      if (maxX >= 0) {
        front = Math.max(front, maxX + 1 - f.anchor.x);
        back = Math.max(back, f.anchor.x - minX);
      }
    }
    return { front, back };
  }

  it('캐릭터 앞끝이 화면 안에 남는 이동 범위에서, 각 레이어가 시차를 여백으로 소화한다', () => {
    const fronts = Object.entries<{ character: string }>(indexJson.species).map(([folder]) => extents(folder).front * 4);
    const maxFront = Math.max(...fronts);
    // 앞끝이 화면 밖으로 나가지 않는 이동 범위(중점 기준 편차).
    const focusReach = Math.min(960 - (ARENA_LEFT + maxFront), ARENA_RIGHT - maxFront - 960);
    expect(focusReach).toBeGreaterThan(0);

    for (const stage of stages) {
      const spec = JSON.parse(readFileSync(`dev-art/stages/${stage}/layers.json`, 'utf8'));
      for (const [name, coef] of Object.entries(PARALLAX)) {
        const layer = spec.layers[name];
        const pad = typeof layer === 'string' ? 0 : (layer.pad ?? 0);
        const slackArt = (PIXEL_LAYER_W + pad * 2 - PIXEL_VIEW_W) / 2;
        const neededArt = (focusReach * coef) / PIXEL_ART_SCALE;
        expect(neededArt, `${stage}/${name}: 필요한 ${neededArt.toFixed(1)}아트px > 여백 ${slackArt}`)
          .toBeLessThanOrEqual(slackArt);
      }
    }
  });
});
