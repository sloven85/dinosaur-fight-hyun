#!/usr/bin/env python3
"""안킬로 special(구르기) v4 인테이크 — special 클립만 4→6프레임으로 교체한다.

계약(scripts/build-species-sprites.py / intake-trex-walk.py와 동일):
  - 셀 502×304, 발 기준선 footY=298, 기준 x anchorX=251
  - 알파 실제 경계로 자르고 anchor = (251 − bbox.x, 298 − bbox.y)
  - 2P는 **승인된 시트의 1P→2P 색 대응표**로 만든다. 아티스트 _2p 프레임은 다른 변환
    (채널 회전, 예: (78,40,25)→(61,78,25))을 써서 기존 11클립(청록 계열)과 짝이 맞지 않았다
    (p2Palette 전수 치환 테스트 실패) → 시트 전체 규칙을 우선한다.

아틀라스는 8×5(40칸)이 꽉 차 있어 6프레임을 넣을 자리가 없다 → **8×6(48칸)으로 늘리고**
기존 40프레임은 내용만 옮겨 담는다(rect·anchor·클립 순서는 그대로, special만 6칸).

사용: python3 scripts/intake-anky-special.py <zip 푼 폴더>   (예: /tmp/anky_v4/ankyroll_v4)
"""
import json
import sys
from pathlib import Path

from PIL import Image

CELL = (502, 304)
FOOT_Y = 298
ANCHOR_X = 251
SPECIES = Path('dev-art/species/anky')
CLIP_ORDER = ['idle', 'walk', 'jump', 'light', 'strong', 'special', 'hit', 'flail', 'down', 'victory']
# special 6프레임 리듬: 접기 → 반구 → 공 → 공(굴림) → 반구(풀림) → 접기(복귀). 합 700ms.
SPECIAL_ART_MS = [117, 117, 117, 117, 117, 115]


def alpha_bbox(im):
    return im.getchannel('A').getbbox()


def main():
    src = Path(sys.argv[1])
    manifest = json.loads((SPECIES / 'manifest.json').read_text(encoding='utf-8'))
    old_sheet = Image.open(SPECIES / 'sheet.png').convert('RGBA')
    old_sheet2 = Image.open(SPECIES / 'sheet_p2.png').convert('RGBA')

    # 1) 기존 40프레임을 잘라 보관(내용·anchor 그대로).
    existing = []
    for f in manifest['frames']:
        crop = old_sheet.crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h']))
        crop2 = old_sheet2.crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h']))
        existing.append({'clip': f['clip'], 'w': f['w'], 'h': f['h'], 'anchor': dict(f['anchor']),
                         'source': f['source'], 'image': crop, 'image2': crop2})

    # 1b) 승인된 시트에서 1P→2P 색 대응표를 뽑는다(같은 시트 안에서 전수 1:1임을 확인).
    color_map: dict[tuple, tuple] = {}
    for f in manifest['frames']:
        if f['clip'] == 'special':
            continue
        a = old_sheet.crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h']))
        b = old_sheet2.crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h']))
        for (c1, c2) in zip(a.getdata(), b.getdata()):
            if c1[3] == 0:
                continue
            prev = color_map.get(c1[:3])
            assert prev is None or prev == c2[:3], ('2P 표 불일치', c1, prev, c2)
            color_map[c1[:3]] = c2[:3]
    print('1P→2P 색 대응', len(color_map))

    # 2) 새 special 6프레임.
    specials = []
    for i in range(6):
        assert (src / f'frames_1p/anky/anky_special_{i:02d}.png').exists(), i
        assert (src / f'frames_2p/anky/anky_special_{i:02d}.png').exists(), i
        art = Image.open(src / f'frames_1p/anky/anky_special_{i:02d}.png').convert('RGBA')
        assert art.size == CELL, (i, art.size)
        bbox = alpha_bbox(art)
        cropped = art.crop(bbox)
        art2 = cropped.copy()
        px = art2.load()
        for yy in range(art2.size[1]):
            for xx in range(art2.size[0]):
                r, g, b, a = px[xx, yy]
                if a == 0:
                    continue
                if (r, g, b) not in color_map:
                    raise SystemExit(f'2P 표에 없는 색 special_{i:02d}: {(r, g, b)}')
                nr, ng, nb = color_map[(r, g, b)]
                px[xx, yy] = (nr, ng, nb, a)
        specials.append({'clip': 'special', 'w': cropped.size[0], 'h': cropped.size[1],
                         'anchor': {'x': ANCHOR_X - bbox[0], 'y': FOOT_Y - bbox[1]},
                         'source': f'special_{i:02d}.png',
                         'image': cropped, 'image2': art2})

    # 3) 클립 순서대로 42프레임을 8×6 격자에 다시 담는다.
    pool = {}
    for item in existing:
        pool.setdefault(item['clip'], []).append(item)
    ordered = []
    for clip in CLIP_ORDER:
        if clip == 'special':
            ordered.extend(specials)
        else:
            ordered.extend(pool[clip])
    assert len(ordered) == 42, len(ordered)

    # 새 구르기 프레임이 86px 높이라 칸 높이를 85→90으로 늘린다(그림 크기는 그대로).
    cell_w, cell_h = max(188, max(f['w'] for f in ordered)), max(90, max(f['h'] for f in ordered))
    cols, rows = 8, 6
    sheet = Image.new('RGBA', (cell_w * cols, cell_h * rows), (0, 0, 0, 0))
    sheet2 = Image.new('RGBA', (cell_w * cols, cell_h * rows), (0, 0, 0, 0))
    frames = []
    for i, item in enumerate(ordered):
        x = (i % cols) * cell_w
        y = (i // cols) * cell_h
        assert item['image'].size == (item['w'], item['h']), (i, item['image'].size)
        assert item['w'] <= cell_w and item['h'] <= cell_h, (i, item['w'], item['h'])
        sheet.paste(item['image'], (x, y))
        sheet2.paste(item['image2'], (x, y))
        frames.append({'x': x, 'y': y, 'w': item['w'], 'h': item['h'],
                       'anchor': item['anchor'], 'source': item['source'], 'clip': item['clip']})

    # 4) 매니페스트: frames 배열과 clips 인덱스를 새 순서로.
    clips = {}
    start = 0
    for clip in CLIP_ORDER:
        n = sum(1 for f in frames if f['clip'] == clip)
        old = manifest['clips'][clip]
        indices = list(range(start, start + n))
        start += n
        if clip == 'special':
            art_ms = SPECIAL_ART_MS
            ticks = [max(1, round(ms / (1000 / 60))) for ms in art_ms]
        else:
            art_ms = old['artMs']
            ticks = old['ticks']
            assert len(indices) == len(old['frames']), (clip, indices, old['frames'])
        clips[clip] = {'frames': indices, 'ticks': ticks, 'artMs': art_ms,
                       'loop': old['loop'], 'art': old.get('art', clip), 'artLabel': old.get('artLabel', clip)}

    manifest['frames'] = frames
    manifest['clips'] = clips
    manifest['grid'] = {'cellW': cell_w, 'cellH': cell_h, 'cols': cols, 'rows': rows}

    sheet.save(SPECIES / 'sheet.png')
    sheet2.save(SPECIES / 'sheet_p2.png')
    (SPECIES / 'manifest.json').write_text(
        json.dumps(manifest, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print('frames', len(frames), 'special', len(specials),
          'sheet', sheet.size,
          'special w/h', [f"{f['w']}x{f['h']}" for f in specials])


main()
