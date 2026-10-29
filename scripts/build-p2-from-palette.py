#!/usr/bin/env python3
"""아티스트 팔레트 JSON으로 2P 시트를 만든다 — 미러 색의 유일한 출처.

마스터 확정(2026-10-29): 엔진이 색을 회전해 만들지 않는다. 종마다 아티스트가
`dev-art/palettes/<폴더>.json`에 1P/2P 인덱스를 잠그고, 엔진은 그 표를 **그대로** 적용한다.

- 치환은 픽셀 1:1 색 교체만. 알파·실루엣·프레임 사각형 불변(리샘플·회전 없음).
- 시트에 팔레트 밖 색이 하나라도 있으면 실패한다(아트가 인덱스로 잠기지 않았다는 뜻).
- 팔레트가 없는 종은 2P 시트를 만들지 않는다 — 미러는 마커(모양·색)로만 구분된다.

사용: python3 scripts/build-p2-from-palette.py [--dir dev-art/species] [--check]
"""
import argparse
import colorsys
import json
import os
import sys

from PIL import Image


# 미러에서도 따뜻한 톤을 유지해야 하는 인덱스(마스터 확정 2026-10-29):
# claw·belly·cream 은 2P에서도 1P hue의 ±20° 안. 몸통 계열만 회전한다.
WARM_INDEX_KEYS = ('claw', 'belly', 'cream')
WARM_HUE_TOLERANCE = 20.0
BODY_HUE_MIN = 60.0


def hue_of(rgb):
    h, _l, _s = colorsys.rgb_to_hls(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255)
    return h * 360.0


def hue_gap(a, b):
    d = abs(a - b) % 360.0
    return min(d, 360.0 - d)


def check_index_rules(palette_path, palette):
    """색 규칙을 벗어난 팔레트는 빌드를 실패시킨다 — 조용히 넘겨 2P만 어색해지지 않게."""
    names = palette.get('index_names') or []
    problems = []
    for i, (a, b) in enumerate(zip(palette['p1'], palette['p2'])):
        name = names[i] if i < len(names) else f'index{i}'
        gap = hue_gap(hue_of(a), hue_of(b))
        warm = any(key in name for key in WARM_INDEX_KEYS)
        if warm and gap > WARM_HUE_TOLERANCE:
            problems.append(f'{name}: 1P h{hue_of(a):.0f} → 2P h{hue_of(b):.0f} (Δ{gap:.0f}° > {WARM_HUE_TOLERANCE:.0f}°)')
        if not warm and name not in ('outline', 'accent') and gap < BODY_HUE_MIN:
            problems.append(f'{name}: 색상차 {gap:.0f}° < {BODY_HUE_MIN:.0f}°')
    if problems:
        sys.exit(f'{palette_path}: 팔레트 규칙 위반 — ' + ' / '.join(problems))


def build_one(folder_dir, palette, check_only=False):
    sheet_path = os.path.join(folder_dir, 'sheet.png')
    sheet = Image.open(sheet_path).convert('RGBA')
    mapping = {tuple(a): tuple(b) for a, b in zip(palette['p1'], palette['p2'])}
    if len(mapping) != len(palette['p1']):
        sys.exit(f'{folder_dir}: 팔레트에 중복 인덱스가 있습니다')

    pixels = list(sheet.getdata())
    outside = {px[:3] for px in pixels if px[3] > 0} - set(mapping)
    if outside:
        sys.exit(f'{folder_dir}: 팔레트 밖 색 {len(outside)}종 — 아트가 인덱스로 잠기지 않았습니다: {sorted(outside)[:5]}')

    out = Image.new('RGBA', sheet.size, (0, 0, 0, 0))
    out.putdata([(mapping[px[:3]][0], mapping[px[:3]][1], mapping[px[:3]][2], px[3]) if px[3] > 0 else (0, 0, 0, 0)
                 for px in pixels])
    if out.getchannel('A').tobytes() != sheet.getchannel('A').tobytes():
        sys.exit(f'{folder_dir}: 2P 시트 알파가 원본과 다릅니다')
    if not check_only:
        out.save(os.path.join(folder_dir, 'sheet_p2.png'))
    return {'indices': len(palette['p1']), 'colors': len({px[:3] for px in pixels if px[3] > 0})}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dir', default='dev-art/species')
    ap.add_argument('--palettes', default='dev-art/palettes')
    ap.add_argument('--check', action='store_true')
    args = ap.parse_args()

    index = json.load(open(os.path.join(args.dir, 'index.json')))
    done, missing = [], []
    for folder in sorted(index['species']):
        palette_path = os.path.join(args.palettes, f'{folder}.json')
        folder_dir = os.path.join(args.dir, folder)
        manifest_path = os.path.join(folder_dir, 'manifest.json')
        manifest = json.load(open(manifest_path))

        if not os.path.exists(palette_path):
            missing.append(folder)
            # 팔레트가 없으면 2P 시트도 두지 않는다(두 벌 규칙 금지).
            stale = os.path.join(folder_dir, 'sheet_p2.png')
            if os.path.exists(stale) and not args.check:
                os.remove(stale)
            manifest.pop('p2Image', None)
            manifest.pop('p2', None)
            if not args.check:
                json.dump(manifest, open(manifest_path, 'w'), ensure_ascii=False, separators=(',', ':'))
            continue

        palette = json.load(open(palette_path))
        check_index_rules(palette_path, palette)
        stats = build_one(folder_dir, palette, args.check)
        manifest['p2Image'] = 'sheet_p2.png'
        manifest['p2'] = {
            'source': 'artist',
            'palette': os.path.join('dev-art/palettes', f'{folder}.json'),
            'indexNames': palette.get('index_names', []),
            'indices': stats['indices'],
            'colors': [[list(a), list(b)] for a, b in zip(palette['p1'], palette['p2'])],
        }
        if not args.check:
            json.dump(manifest, open(manifest_path, 'w'), ensure_ascii=False, separators=(',', ':'))
        index['species'][folder]['p2Sheet'] = 'sheet_p2.png'
        done.append(f"{folder}({stats['colors']}색)")

    if not args.check:
        json.dump(index, open(os.path.join(args.dir, 'index.json'), 'w'), ensure_ascii=False, indent=1)
    print('2P 시트 생성:', ', '.join(done) if done else '없음')
    print('팔레트 대기(미러는 마커로만 구분):', ', '.join(missing) if missing else '없음')


if __name__ == '__main__':
    main()
