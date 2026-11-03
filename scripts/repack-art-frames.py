#!/usr/bin/env python3
"""아티스트의 "완성 프레임 폴더" 납품을 게임 시트 + manifest로 재포장한다.

이전 포장기(build-species-sprites.py)는 아티스트가 준 `*_anim_all.json`(클립·ms 표)을
전제했다. 이번 납품(12종 40장 세트)은 `frames/<클립>_NN.png` + `measure.json` 만 오므로
클립 경계를 **파일 이름**에서 읽고, 프레임 지속시간은 아래 TIMING 표를 쓴다.

지켜야 하는 것(마스터 확정):
  - 전신 1프레임 완성 그림. 잘라서 조립하지 않는다 — 여기서도 알파 bbox 1:1 크롭만 한다.
  - 리샘플·회전·확대 없음. 게임이 정수배(×4)로 그린다.
  - 셀 502×304, 발 기준선 footY=298, 기준 x anchorX=251 (프레임 안 anchor로 환산).
  - 아티스트의 bbox 선언을 믿지 않고 알파에서 다시 잰다.

사용:
  python3 scripts/repack-art-frames.py /tmp/v6set --out dev-art/species
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

SPECIES = {
    'trex': 'tyrannosaurus', 'trike': 'triceratops', 'velo': 'velociraptor', 'spino': 'spinosaurus',
    'anky': 'ankylosaurus', 'stego': 'stegosaurus', 'carno': 'carnotaurus', 'pachy': 'pachycephalosaurus',
    'theri': 'therizinosaurus', 'dilo': 'dilophosaurus', 'brachio': 'brachiosaurus', 'ptera': 'pteranodon',
}
NAMES = {
    'trex': '티라노사우루스', 'trike': '트리케라톱스', 'velo': '벨로키랍토르', 'spino': '스피노사우루스',
    'anky': '안킬로사우루스', 'stego': '스테고사우루스', 'carno': '카르노타우루스', 'pachy': '파키케팔로사우루스',
    'theri': '테리지노사우루스', 'dilo': '딜로포사우루스', 'brachio': '브라키오사우루스', 'ptera': '프테라노돈',
}

# 파일 접두사 → 게임 상태. 아티스트 납품 클립 이름과 1:1.
CLIPS = [
    ('idle', 'idle', True), ('walk', 'walk', True), ('jump', 'jump', False),
    ('light_attack', 'light', False), ('heavy_slam', 'strong', False), ('special', 'special', False),
    ('hit', 'hit', False), ('flail', 'flail', True), ('down', 'down', False), ('victory', 'victory', True),
]
# 프레임 지속(60Hz 틱, artMs는 비율 기준). 걷기 5틱=83.3ms → 12fps 정확히 맞춘다.
TIMING = {
    'idle': [11, 10],
    'walk': [5] * 8,
    'jump': [5, 6, 7, 7],
    'light_attack': [7, 7, 6, 7],
    'heavy_slam': [9, 8, 8, 10],
    'special': [10, 10, 9, 11],
    'hit': [6, 7],
    'flail': [7, 7, 7, 7],
    'down': [9, 10, 10, 30],
    'victory': [12, 12, 12, 12],
}


def collect(src, art_name):
    d = os.path.join(src, 'frames')
    files = sorted(f for f in os.listdir(d) if f.startswith(f'{art_name}_') and f.endswith('.png'))
    return files


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('pkg')
    ap.add_argument('--out', default='dev-art/species')
    ap.add_argument('--species', default='')
    args = ap.parse_args()
    pick = [s for s in args.species.split(',') if s] or sorted(SPECIES)

    index_path = os.path.join(args.out, 'index.json')
    index = json.load(open(index_path)) if os.path.exists(index_path) else {
        'version': 1, 'cell': [CELL_W, CELL_H], 'footY': FOOT_Y, 'anchorX': ANCHOR_X,
        'scale': SCALE, 'species': {}}

    for folder in pick:
        src = os.path.join(args.pkg, folder)
        if not os.path.isdir(src):
            sys.exit(f'{folder}: 납품 폴더가 없습니다 — {src}')
        entries = []
        for art_name, state, loop in CLIPS:
            files = collect(src, art_name)
            if not files:
                sys.exit(f'{folder}: {art_name}_*.png 프레임이 없습니다')
            ticks = TIMING[art_name]
            if len(files) != len(ticks):
                sys.exit(f'{folder}: {art_name} 프레임 {len(files)}장 — 타이밍 표({len(ticks)})와 다릅니다')
            for i, name in enumerate(files):
                im = Image.open(os.path.join(src, 'frames', name)).convert('RGBA')
                if im.size != (CELL_W, CELL_H):
                    sys.exit(f'{folder}/{name}: 셀 크기 {im.size} != ({CELL_W}, {CELL_H})')
                bbox = im.getchannel('A').getbbox()
                if bbox is None:
                    sys.exit(f'{folder}/{name}: 완전 투명 프레임')
                entries.append({'state': state, 'art': art_name, 'file': name,
                                'crop': im.crop(bbox), 'bbox': bbox,
                                'ticks': ticks[i], 'loop': loop})

        grid_w = max(e['bbox'][2] - e['bbox'][0] for e in entries) + 2
        grid_h = max(e['bbox'][3] - e['bbox'][1] for e in entries) + 2
        rows = (len(entries) + COLS - 1) // COLS
        sheet = Image.new('RGBA', (COLS * grid_w, rows * grid_h), (0, 0, 0, 0))

        frames, clips = [], {}
        for i, e in enumerate(entries):
            col, row = i % COLS, i // COLS
            x0, y0, x1, y1 = e['bbox']
            sheet.paste(e['crop'], (col * grid_w, row * grid_h))
            frames.append({'x': col * grid_w, 'y': row * grid_h, 'w': x1 - x0, 'h': y1 - y0,
                           'anchor': {'x': ANCHOR_X - x0, 'y': FOOT_Y - y0},
                           'source': e['file'], 'clip': e['state']})
            clips.setdefault(e['state'], []).append(e)
        # entries는 CLIPS 순서대로 쌓이므로 클립별 프레임 인덱스는 연속 구간이다.
        out_clips = {}
        offset = 0
        for art_name, state, loop in CLIPS:
            group = clips[state]
            out_clips[state] = {
                'frames': list(range(offset, offset + len(group))),
                'ticks': [g['ticks'] for g in group],
                'artMs': [round(g['ticks'] * 1000 / 60) for g in group],
                'loop': loop, 'art': art_name, 'artLabel': state,
            }
            offset += len(group)

        sp_dir = os.path.join(args.out, folder)
        os.makedirs(sp_dir, exist_ok=True)
        sheet.save(os.path.join(sp_dir, 'sheet.png'), optimize=True)

        prev = {}
        manifest_path = os.path.join(sp_dir, 'manifest.json')
        if os.path.exists(manifest_path):
            prev = json.load(open(manifest_path))
        manifest = {
            'version': 1, 'character': SPECIES[folder], 'folder': folder, 'name': NAMES[folder],
            'image': 'sheet.png', 'facing': 'right', 'scale': SCALE,
            'cell': [CELL_W, CELL_H], 'footY': FOOT_Y, 'anchorX': ANCHOR_X,
            'grid': {'cellW': grid_w, 'cellH': grid_h, 'cols': COLS, 'rows': rows},
            'frames': frames, 'clips': out_clips,
        }
        if 'p2Image' in prev:
            manifest['p2Image'] = prev['p2Image']
        if 'p2' in prev:
            manifest['p2'] = prev['p2']
        with open(manifest_path, 'w') as f:
            json.dump(manifest, f, ensure_ascii=False, separators=(',', ':'))

        heights = [frames[i]['h'] for i in out_clips['idle']['frames']]
        index['species'][folder] = {'character': SPECIES[folder], 'frames': len(frames),
                                    'sheet': list(sheet.size),
                                    'idle': {'h': [min(heights), max(heights)]}}
        print(f"{folder:8s} {len(frames):3d}장 시트 {sheet.size[0]}×{sheet.size[1]} "
              f"idle 높이 {min(heights)}~{max(heights)}아트px (×4 = {min(heights)*4}~{max(heights)*4})")

    with open(index_path, 'w') as f:
        json.dump(index, f, ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
