import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { CHARACTERS } from '../../data';
import { ARENA_LEFT, ARENA_RIGHT } from '../../core/constants';
import { PIXEL_ART_SCALE, PIXEL_LAYER_W, PIXEL_VIEW_W } from './PixelBackground';
import { PARALLAX } from './SpriteStage';

/**
 * 그림 크기(artHeight)와 판정 키(displayHeight)를 분리해서 잠근다 (jk 확정 2026-10-29).
 *
 * - `artHeight` = idle 최고 프레임 알파 bbox 높이 × 4 → **렌더 크기**. 아트가 바뀌면 이 테스트가
 *   먼저 깨져서, 그림만 새로 넣고 기준값을 몰래 두는 일을 막는다.
 * - `displayHeight` = **판정 키**. 판정·피해·사거리는 아트 교체에 흔들리지 않아야 하므로,
 *   여기 값을 상수 표로 못 박아 둔다. 그림이 커졌다고 이 표를 고치면 그건 판정 변경이다.
 * - 두 값의 차이는 `scripts/height-ratio-table.py`가 12행 표로 낸다(±2% 확인용).

 * 지금 차이: 티라노만 아트 452 vs 판정 436(+3.7%) — 마스터 판단 대기. 나머지 11종은 0.0%.
 */
const ROOT = 'dev-art/species';
const SCALE = 4;

/** 2026-10-29 기준 판정 키. 아트 교체로 이 값이 움직이면 실패한다. */
const COMBAT_HEIGHT_KEYS: Record<string, number> = {
  tyrannosaurus: 436, triceratops: 360, velociraptor: 344, spinosaurus: 424,
  ankylosaurus: 328, stegosaurus: 408, carnotaurus: 428, pachycephalosaurus: 388,
  therizinosaurus: 448, dilophosaurus: 376, brachiosaurus: 608, pteranodon: 348,
};

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

describe('artHeight lock: 종별 아트 실측 키 × 4', () => {
  const byId = new Map(CHARACTERS.map((c) => [c.id, c]));
  const entries = Object.entries<{ character: string }>(index.species);

  it('12종이 모두 아트 실측 키 × 4를 artHeight로 쓴다', () => {
    const rows: string[] = [];
    for (const [folder, entry] of entries) {
      const manifest = JSON.parse(readFileSync(`${ROOT}/${folder}/manifest.json`, 'utf8'));
      const sheet = readSheet(`${ROOT}/${folder}/${manifest.image}`);
      const heights = manifest.clips.idle.frames.map((i: number) => silhouetteHeight(sheet, manifest.frames[i]));
      const art = Math.max(...heights);
      const data = byId.get(entry.character);
      expect(data, `${folder}: characters.json에 ${entry.character} 없음`).toBeDefined();
      rows.push(`${entry.character}\tart ${art}px × ${SCALE} = ${art * SCALE}\tartHeight ${data!.artHeight}`);
      expect(data!.artHeight, `${folder}: 아트 ${art}px×${SCALE}=${art * SCALE}인데 artHeight=${data!.artHeight}`)
        .toBe(art * SCALE);
    }
    expect(rows).toHaveLength(12);
  });
});

describe('displayHeight는 판정 키다 — 아트 교체로 움직이지 않는다', () => {
  it('12종 판정 키가 2026-10-29 값 그대로다', () => {
    for (const c of CHARACTERS) {
      expect(c.displayHeight, `${c.id}: 판정 키가 바뀌었다 — 그림에 맞춰 다시 잠그면 전투 수치가 흔들린다`)
        .toBe(COMBAT_HEIGHT_KEYS[c.id]);
    }
  });

  it('도트 그리기는 판정 키로 배율을 만들지 않는다', () => {
    // 벡터 리그는 displayHeight/마스터 박스로 축소하지만, 도트 경로는 배율이 4 고정이다.
    // 판정 키가 그림 배율에 섞이면 그림만 바꿨는데 크기가 따라 움직인다.
    const stage = readFileSync('src/rendering/pixel/SpriteStage.ts', 'utf8')
      .split('\n').filter((line) => !line.trimStart().startsWith('//')).join('\n');
    expect(stage).not.toMatch(/spriteScale\(|from '\.\.\/rig'/);
    expect(stage).toMatch(/PIXEL_ART_SCALE/);
    const species = readFileSync('src/rendering/pixel/SpeciesSprite.ts', 'utf8');
    expect(species).not.toMatch(/displayHeight/);
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
