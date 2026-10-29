import { existsSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { Match } from '../../combat/Match';
import { getMove } from '../../data';
import { parseSpriteManifest, spriteSheetFor, type SpriteAssets } from './SpeciesSprite';
import { HEAD_MARKER_SIZE, PLAYER_COLORS, RING_H, RING_W, drawGroundRing, drawHeadMarker, markerShapeFor } from './PlayerMarker';

/**
 * 동종 미러 1P/2P 구분 (jk 확정 2026-10-29).
 *
 * - 실루엣·포즈·판정·타점은 100% 같다. 다른 것은 팔레트 시트와 표식 색뿐이다.
 * - 2P 시트는 포장 단계에서 1:1 팔레트 치환으로 뽑는다(런타임 tint/filter 금지, 리샘플 0).
 */

const ROOT = 'dev-art/species';
const PALETTE_DIR = 'dev-art/palettes';
const FOLDERS = ['trex', 'trike', 'velo', 'spino', 'anky', 'stego', 'carno', 'pachy', 'theri', 'dilo', 'brachio', 'ptera'];

interface Sheet { width: number; height: number; rgba: Uint8Array }

/** PNG(8bit, non-interlaced, RGBA)를 zlib로 풀어 원시 픽셀을 돌려준다. */
function readPng(path: string): Sheet {
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
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    if (bpp === 4) {
      rgba[i * 4] = pixels[i * 4]; rgba[i * 4 + 1] = pixels[i * 4 + 1];
      rgba[i * 4 + 2] = pixels[i * 4 + 2]; rgba[i * 4 + 3] = pixels[i * 4 + 3];
    } else {
      rgba[i * 4] = pixels[i * 3]; rgba[i * 4 + 1] = pixels[i * 3 + 1];
      rgba[i * 4 + 2] = pixels[i * 3 + 2]; rgba[i * 4 + 3] = 255;
    }
  }
  return { width, height, rgba };
}

const manifestOf = (folder: string) =>
  parseSpriteManifest(JSON.parse(readFileSync(`${ROOT}/${folder}/manifest.json`, 'utf8')));

const paletteOf = (folder: string): { p1: number[][]; p2: number[][] } | null => {
  try {
    return JSON.parse(readFileSync(`${PALETTE_DIR}/${folder}.json`, 'utf8'));
  } catch {
    return null;
  }
};

describe('2P 미러 색의 출처는 아티스트 팔레트 하나뿐', () => {
  it.each(FOLDERS)('%s: 팔레트 JSON이 있을 때만 2P 시트가 있다', (folder) => {
    const raw = JSON.parse(readFileSync(`${ROOT}/${folder}/manifest.json`, 'utf8')) as {
      p2Image?: string; p2?: { source?: string };
    };
    const palette = paletteOf(folder);
    expect(existsSync(`${ROOT}/${folder}/sheet_p2.png`)).toBe(!!palette);
    if (palette) {
      expect(raw.p2Image).toBe('sheet_p2.png');
      expect(raw.p2?.source).toBe('artist');
    } else {
      expect(raw.p2Image).toBeUndefined();
      expect(raw.p2).toBeUndefined();
    }
  });

  it.each(FOLDERS.filter((f) => paletteOf(f)))('%s: 1P와 알파가 1비트도 다르지 않다(모양 불변)', (folder) => {
    const a = readPng(`${ROOT}/${folder}/sheet.png`);
    const b = readPng(`${ROOT}/${folder}/sheet_p2.png`);
    expect([b.width, b.height]).toEqual([a.width, a.height]);
    const alpha = (s: Sheet): Buffer => Buffer.from(s.rgba.filter((_v, i) => i % 4 === 3));
    expect(alpha(b).equals(alpha(a))).toBe(true);
  });

  it.each(FOLDERS.filter((f) => paletteOf(f)))('%s: 시트 색이 팔레트 p1 안에만 있고, 2P는 p2 그대로다', (folder) => {
    const palette = paletteOf(folder)!;
    const sheet = readPng(`${ROOT}/${folder}/sheet.png`);
    const alt = readPng(`${ROOT}/${folder}/sheet_p2.png`);
    const allowed = new Map<string, number[]>();
    palette.p1.forEach((rgb, i) => allowed.set(rgb.join(','), palette.p2[i]));

    // 느린 전수 비교 대신 위반만 모아서 한 번에 보고한다.
    let changed = 0;
    const outside = new Set<string>();
    const wrong: string[] = [];
    for (let i = 0; i < sheet.rgba.length; i += 4) {
      if (sheet.rgba[i + 3] === 0) continue;
      const key = `${sheet.rgba[i]},${sheet.rgba[i + 1]},${sheet.rgba[i + 2]}`;
      const target = allowed.get(key);
      if (!target) { outside.add(key); continue; }
      if (alt.rgba[i] !== target[0] || alt.rgba[i + 1] !== target[1] || alt.rgba[i + 2] !== target[2]) {
        if (wrong.length < 3) wrong.push(`${key} -> ${[alt.rgba[i], alt.rgba[i + 1], alt.rgba[i + 2]].join(',')}`);
      }
      if (key !== target.join(',')) changed++;
    }
    expect([...outside]).toEqual([]);
    expect(wrong).toEqual([]);
    expect(changed).toBeGreaterThan(1000);
  });
});

describe('엔진은 2P에만 팔레트 시트를 쓴다', () => {
  const assets = { manifest: { image: 'sheet.png' }, image: { width: 10, height: 10, tag: 'p1' }, p2: { width: 10, height: 10, tag: 'p2' } } as unknown as SpriteAssets & { p2: { tag: string } };

  it('1P는 원본 시트, 2P(미러)는 2P 시트', () => {
    expect(spriteSheetFor(assets, false)).toBe(assets.image);
    expect(spriteSheetFor(assets, true)).toBe(assets.p2);
  });

  it('2P 시트가 없으면 원본으로 그린다(그림이 사라지지 않는다)', () => {
    const bare = { manifest: { image: 'sheet.png' }, image: assets.image } as unknown as SpriteAssets;
    expect(spriteSheetFor(bare, true)).toBe(bare.image);
  });
});

describe('동종 미러 — 판정·타점·실루엣은 같고 색만 다르다', () => {
  const match = new Match('versus', ['tyrannosaurus', 'tyrannosaurus']);
  const [p1, p2] = match.fighters;

  it('미러에서만 2P에 다른 팔레트가 걸린다', () => {
    expect(match.mirrorMatch).toBe(true);
    expect(p1.useAlternatePalette).toBe(false);
    expect(p2.useAlternatePalette).toBe(true);
  });

  it('판정 상자·몸 앞끝·기술 데이터가 두 쪽 모두 같다', () => {
    // 상자는 월드 좌표라 위치·방향만 다르다 — 자기 발 기준(정면 부호 포함)으로 옮겨 비교한다.
    const rel = (f: typeof p1): number[] => {
      const b = f.hurtbox();
      return [b.left - f.x, b.right - f.x, b.top, b.bottom];
    };
    const a = rel(p1);
    const b = rel(p2);
    expect(b).toHaveLength(a.length);
    a.forEach((v, i) => expect(b[i]).toBeCloseTo(v, 6));
    // 몸 앞끝·사거리(판정 계산의 기준값)도 두 쪽이 같다 — 팔레트는 여기에 관여하지 않는다.
    expect(p2.bodyFront).toBeCloseTo(p1.bodyFront, 6);
    for (const kind of ['light', 'heavy', 'special'] as const) {
      expect(p2.reachOf(kind)).toBeCloseTo(p1.reachOf(kind), 6);
    }
    // 타점 창(히트 프레임 구간)은 두 쪽이 같은 기술 데이터를 쓴다.
    const hits = getMove('tyrannosaurus_light').script?.hits ?? [];
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.map((h) => [h.from, h.to])).toEqual(hits.map((h) => [h.from, h.to]));
    expect(p1.data.id).toBe(p2.data.id);
  });

  it('같은 프레임을 쓴다 — 실루엣 좌표가 동일하다', () => {
    const m = manifestOf('trex');
    const idx = m.clips.walk.frames[2];
    const frame = m.frames[idx];
    expect(m.frames[m.clips.walk.frames[2]]).toEqual(frame);
    expect(frame.anchor.y + frame.h).toBeLessThanOrEqual(298 + 400);
  });

  it('표식 색·모양이 1P·2P에서 다르다', () => {
    expect(PLAYER_COLORS.p1).not.toBe(PLAYER_COLORS.p2);
    expect(markerShapeFor(false)).not.toBe(markerShapeFor(true));
    expect(markerShapeFor(false)).toBe('triangle');
    expect(markerShapeFor(true)).toBe('diamond');
  });
});

describe('표식은 아트 격자에만 놓인다', () => {
  function recorder() {
    const rects: number[][] = [];
    const g = {
      save() {}, restore() {},
      set fillStyle(_v: string) {},
      fillRect: (x: number, y: number, w: number, h: number) => rects.push([x, y, w, h]),
    } as unknown as CanvasRenderingContext2D;
    return { g, rects };
  }

  it.each([1, 2, 4, 6])('배율 %i에서 링·마커 좌표가 모두 배율의 배수', (scale) => {
    const { g, rects } = recorder();
    // 일부러 격자에 맞지 않는 좌표를 준다 — 그려지는 쪽이 스스로 격자에 맞춰야 한다.
    drawGroundRing(g, 643.7, 899.4, PLAYER_COLORS.p2, scale);
    drawHeadMarker(g, { left: 400, top: 300, right: 900, bottom: 900 }, 1, PLAYER_COLORS.p1, scale, 'triangle');
    expect(rects.length).toBeGreaterThan(3);
    for (const [x, y, w, h] of rects) {
      expect(x % scale).toBe(0);
      expect(y % scale).toBe(0);
      expect(w % scale).toBe(0);
      expect(h % scale).toBe(0);
    }
  });

  it('링은 72×10아트px이고 위쪽이 접지선에 닿는다', () => {
    const { g, rects } = recorder();
    drawGroundRing(g, 640, 900, PLAYER_COLORS.p2, 4);
    const xs = rects.map((r) => r[0]);
    const ys = rects.map((r) => r[1]);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(640 - (RING_W / 2) * 4);
    expect(Math.max(...xs)).toBeLessThanOrEqual(640 + (RING_W / 2) * 4);
    expect(Math.min(...ys)).toBe(900);                       // 위쪽 = 접지선
    expect(Math.max(...ys)).toBe(900 + RING_H * 4);
  });

  it('머리 마커는 4아트px 상자 안에 그린다', () => {
    const { g, rects } = recorder();
    drawHeadMarker(g, { left: 0, top: 400, right: 100, bottom: 900 }, 1, PLAYER_COLORS.p1, 4, 'triangle');
    // 4×4 아트px 상자 안의 픽셀만 찍는다(삼각 10칸).
    expect(rects).toHaveLength(10);
    const xs = rects.map((r) => r[0] / 4);
    const ys = rects.map((r) => r[1] / 4);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(HEAD_MARKER_SIZE);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(HEAD_MARKER_SIZE);
    for (const [, , w, h] of rects) {
      expect(w).toBe(4);
      expect(h).toBe(4);
    }
  });
});
