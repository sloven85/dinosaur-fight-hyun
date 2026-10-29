#!/usr/bin/env python3
"""따뜻한 인덱스(claw·belly·cream)가 회전된 팔레트를 규칙 안으로 되돌린다.

마스터 확정(2026-10-29): claw·cream은 2P에서도 1P hue ±20°. 몸통 계열만 회전한다.
아티스트 원본은 `<폴더>.artist.json`으로 보존하고, 고친 값은 palettes JSON의
`corrections` 배열에 남긴다(무엇을 왜 바꿨는지 추적).

고치는 방식: hue만 1P hue로 되돌리고, 명도·채도는 아티스트가 정한 2P 값을 유지한다.
사용: python3 scripts/fix-palette-warm.py [--dir dev-art/palettes] [--dry]
"""
import argparse
import colorsys
import json
import os
import sys

WARM_INDEX_KEYS = ('claw', 'belly', 'cream')
WARM_HUE_TOLERANCE = 20.0


def hue_gap(a, b):
    d = abs(a - b) % 360.0
    return min(d, 360.0 - d)


def to_hls(rgb):
    return colorsys.rgb_to_hls(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255)


def from_hls(h, l, s):
    r, g, b = colorsys.hls_to_rgb(h, l, s)
    return [max(0, min(255, round(c * 255))) for c in (r, g, b)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dir', default='dev-art/palettes')
    ap.add_argument('--dry', action='store_true')
    args = ap.parse_args()

    changed_any = False
    for name in sorted(os.listdir(args.dir)):
        if not name.endswith('.json') or name.endswith('.artist.json'):
            continue
        path = os.path.join(args.dir, name)
        palette = json.load(open(path))
        names = palette.get('index_names') or []
        corrections = palette.get('corrections', [])
        changed = False
        for i, (a, b) in enumerate(zip(palette['p1'], palette['p2'])):
            label = names[i] if i < len(names) else f'index{i}'
            if not any(key in label for key in WARM_INDEX_KEYS):
                continue
            ha, _, _ = to_hls(a)
            hb, lb, sb = to_hls(b)
            if hue_gap(ha * 360.0, hb * 360.0) <= WARM_HUE_TOLERANCE:
                continue
            fixed = from_hls(ha, lb, sb)
            corrections.append({
                'index': label, 'from': list(b), 'to': fixed,
                'reason': f'따뜻한 인덱스 hue 유지(1P h{ha * 360:.0f}): 2P h{hb * 360:.0f} → h{ha * 360:.0f}',
            })
            palette['p2'][i] = fixed
            changed = True
            changed_any = True
            print(f'{name}: {label} {tuple(b)} → {tuple(fixed)}')
        if changed and not args.dry:
            original = path.replace('.json', '.artist.json')
            if not os.path.exists(original):
                json.dump(palette, open(original, 'w'), ensure_ascii=False, separators=(',', ':'))
            palette['corrections'] = corrections
            json.dump(palette, open(path, 'w'), ensure_ascii=False, separators=(',', ':'))
    if not changed_any:
        print('고칠 인덱스 없음')


if __name__ == '__main__':
    main()
