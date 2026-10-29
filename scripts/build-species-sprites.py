#!/usr/bin/env python3
"""아티스트 12종 1차본(프레임 PNG + anim_all JSON)을 게임이 바로 재생할 수 있는
시트 + manifest로 재포장한다.

계약(디렉터 확정):
  - 셀 502×304, 발 기준선 footY=298, 기준 x anchorX=251
  - 정수배 확대만(×4). 프레임별 맞춤·회전 없음.

이 스크립트가 하는 일:
  1) 프레임마다 알파 실제 경계를 다시 잰다(아티스트 bbox 선언을 믿지 않는다).
  2) 알파 경계로 잘라 8열 격자 시트에 포장한다.
  3) 프레임별 anchor = (anchorX - bbox.x, footY - bbox.y),
     즉 "잘라낸 그림 안에서 발 기준점이 어디인가"를 담는다.
  4) 상태 클립을 게임 상태 이름으로 매핑하고 틱 길이를 계산한다.

사용: python3 scripts/build-species-sprites.py <pkg dir>... --out dev-art/species
"""
import argparse
import json
import os
import sys

from PIL import Image

CELL_W, CELL_H = 502, 304
FOOT_Y = 298
ANCHOR_X = 251
SCALE = 4
COLS = 8

# 아티스트 폴더 → 게임 캐릭터 id
SPECIES = {
    'trex': 'tyrannosaurus',
    'trike': 'triceratops',
    'velo': 'velociraptor',
    'spino': 'spinosaurus',
    'anky': 'ankylosaurus',
    'stego': 'stegosaurus',
    'carno': 'carnotaurus',
    'pachy': 'pachycephalosaurus',
    'theri': 'therizinosaurus',
    'dilo': 'dilophosaurus',
    'brachio': 'brachiosaurus',
    'ptera': 'pteranodon',
}

# 아티스트 클립 → 게임 상태 키(디렉터 지정 10상태)
CLIPS = [
    ('idle', 'idle'),
    ('walk', 'walk'),
    ('jump', 'jump'),
    ('light_attack', 'light'),
    ('heavy_slam', 'strong'),
    ('special', 'special'),
    ('hit', 'hit'),
    ('flail', 'flail'),
    ('down', 'down'),
    ('victory', 'victory'),
]


def alpha_bbox(im):
    """선언값 대신 실제 알파 경계를 잰다. 완전 투명이면 None."""
    return im.getchannel('A').getbbox()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('pkgs', nargs='+')
    ap.add_argument('--out', default='dev-art/species')
    args = ap.parse_args()

    folders = {}
    for pkg in args.pkgs:
        for name in os.listdir(pkg):
            d = os.path.join(pkg, name)
            if os.path.isdir(d) and os.path.isdir(os.path.join(d, 'frames')):
                folders[name] = d

    missing = sorted(set(SPECIES) - set(folders))
    if missing:
        sys.exit(f'12종이 다 모이지 않았습니다: {missing}')

    os.makedirs(args.out, exist_ok=True)
    index = {'version': 1, 'cell': [CELL_W, CELL_H], 'footY': FOOT_Y,
             'anchorX': ANCHOR_X, 'scale': SCALE, 'species': {}}

    for folder, character in sorted(SPECIES.items()):
        src = folders[folder]
        anim = json.load(open(os.path.join(src, f'{folder}_anim_all.json')))
        if anim['cell'] != [CELL_W, CELL_H] or anim['footY'] != FOOT_Y or anim['anchorX'] != ANCHOR_X:
            sys.exit(f'{folder}: 계약 규격과 다른 셀/기준값 {anim["cell"]} {anim["footY"]} {anim["anchorX"]}')

        # 1) 실제 알파 경계로 프레임 수집
        entries = []  # (state, file, image, bbox, lift)
        max_w = max_h = 0
        for art_name, state in CLIPS:
            clip = anim['animations'].get(art_name)
            if not clip:
                sys.exit(f'{folder}: {art_name} 클립이 없습니다')
            for fr in clip['frames']:
                path = os.path.join(src, 'frames', fr['file'])
                im = Image.open(path).convert('RGBA')
                if im.size != (CELL_W, CELL_H):
                    sys.exit(f'{folder}/{fr["file"]}: 셀 크기 {im.size} != ({CELL_W}, {CELL_H})')
                bb = alpha_bbox(im)
                if bb is None:
                    sys.exit(f'{folder}/{fr["file"]}: 완전히 투명한 프레임')
                x0, y0, x1, y1 = bb
                crop = im.crop(bb)
                max_w = max(max_w, x1 - x0)
                max_h = max(max_h, y1 - y0)
                entries.append({'state': state, 'art': art_name, 'file': fr['file'],
                                'image': crop, 'bbox': bb, 'lift': fr.get('airborneLift', 0)})
        max_w += 2
        max_h += 2
        rows = (len(entries) + COLS - 1) // COLS
        sheet = Image.new('RGBA', (COLS * max_w, rows * max_h), (0, 0, 0, 0))

        frames = []
        clips = {}
        for i, e in enumerate(entries):
            col, row = i % COLS, i // COLS
            x0, y0, x1, y1 = e['bbox']
            w, h = x1 - x0, y1 - y0
            sheet.paste(e['image'], (col * max_w, row * max_h))
            frames.append({
                'x': col * max_w, 'y': row * max_h, 'w': w, 'h': h,
                'anchor': {'x': ANCHOR_X - x0, 'y': FOOT_Y - y0},
                'source': e['file'],
            })
            clips.setdefault(e['state'], []).append(i)

        out_clips = {}
        for art_name, state in CLIPS:
            clip = anim['animations'][art_name]
            idxs = clips[state]
            if len(idxs) != len(clip['frames']):
                sys.exit(f'{folder}/{state}: 프레임 수 불일치')
            ms = clip['ms']
            ticks = [max(1, round(v * 60 / 1000)) for v in ms]
            out_clips[state] = {'frames': idxs, 'ticks': ticks,
                                'artMs': ms, 'loop': bool(clip.get('loop')),
                                'art': art_name, 'artLabel': clip.get('label', '')}

        sp_dir = os.path.join(args.out, folder)
        os.makedirs(sp_dir, exist_ok=True)
        sheet.save(os.path.join(sp_dir, 'sheet.png'), optimize=True)
        manifest = {
            'version': 1,
            'character': character,
            'folder': folder,
            'name': anim.get('name', folder),
            'image': 'sheet.png',
            'facing': 'right',
            'scale': SCALE,
            'cell': [CELL_W, CELL_H],
            'footY': FOOT_Y,
            'anchorX': ANCHOR_X,
            'grid': {'cellW': max_w, 'cellH': max_h, 'cols': COLS, 'rows': rows},
            'frames': frames,
            'clips': out_clips,
        }
        with open(os.path.join(sp_dir, 'manifest.json'), 'w') as f:
            json.dump(manifest, f, ensure_ascii=False, separators=(',', ':'))

        # 실측: 프레임별 실루엣 폭·높이·접지 하단 편차(디렉터 손교정 기준과 같은 척도)
        def spread(key):
            rows_ = [frames[i] for i in clips[key]]
            vals = [f['w'] for f in rows_]
            hs = [f['h'] for f in rows_]
            soles = [f['anchor']['y'] for f in rows_]  # 발 기준점에서 위로 자른 높이
            return {'w': [min(vals), max(vals)], 'h': [min(hs), max(hs)],
                    'sole': [min(soles), max(soles)],
                    'top': [min(f['anchor']['y'] - f['h'] for f in rows_),
                            max(f['anchor']['y'] - f['h'] for f in rows_)]}
        m = {'character': character, 'frames': len(frames), 'sheet': list(sheet.size),
             'idle': spread('idle'), 'walk': spread('walk')}
        index['species'][folder] = m

        print(f"{folder:8s} -> {character:18s} {len(frames)}장 시트 {sheet.size[0]}×{sheet.size[1]} "
              f"| walk 폭 {m['walk']['w'][0]}~{m['walk']['w'][1]} 높이 {m['walk']['h'][0]}~{m['walk']['h'][1]}")

    with open(os.path.join(args.out, 'index.json'), 'w') as f:
        json.dump(index, f, ensure_ascii=False, indent=1)
    print(f"\nindex: {args.out}/index.json")


if __name__ == '__main__':
    main()
