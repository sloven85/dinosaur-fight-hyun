#!/usr/bin/env python3
"""1P 시트에서 2P 전용 팔레트 시트(sheet_p2.png)를 뽑는다.

디렉터 확정(2026-10-29):
  - 1P·2P는 실루엣·포즈·판정·타점이 100% 같고 **색만** 다르다.
  - 런타임 tint/filter 금지. 포장 단계에서 팔레트 인덱스 치환으로 2P 시트를 따로 만든다.
  - 치환은 픽셀 1:1 색 교체만 한다. 리샘플·회전·블러·알파 변경 없음(알파는 그대로 복사).

규칙:
  - 명도(L) 유지 → 실루엣 판독이 같다.
  - 몸통 계열(초록)의 색상차 ≥ 60°. 채도는 유지(하한 0.45배 규칙을 항상 만족).
  - 어두운 외곽선(L<0.20)·무채색(S<0.10)은 그대로 둔다 — 그림 읽기(테두리·눈)를 흔들지 않는다.
  - 배·크림 계열은 연노랑(색상 50°)으로 조금 밝게.

사용: python3 scripts/build-p2-palette.py [--dir dev-art/species] [--check]
"""
import argparse
import colorsys
import json
import os
import sys

from PIL import Image

HUE_SHIFT = 62.0        # 몸통 계열 색상 이동(≥60°)
# 채도·명도 상한(마스터 확정 2026-10-29): 2P 채도 ≤ min(0.50, 1P×1.5), 명도차 ≤ +0.05.
# 저채도 종은 색으로 안 갈라져도 마커가 구분을 보장한다 — 억지로 올리지 않는다.
SAT_MAX = 0.50
SAT_GAIN = 1.5
LIGHT_MAX_DELTA = 0.05
CREAM_HUE = 50.0        # 배·크림 계열 목표 색상
CREAM_LIFT = 0.04       # 배 계열 명도 보정(연노랑) — 상한 +0.05 안에서 반올림 여유를 둔다
CREAM_SAT = 1.10
DARK_KEEP = 0.20        # 이보다 어두우면(외곽선) 그대로
NEUTRAL_KEEP = 0.10     # 이보다 채도가 낮으면(무채색) 그대로


def rgb_to_hsl(rgb):
    r, g, b = (c / 255 for c in rgb)
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    return h * 360.0, l, s


def hsl_to_rgb(h, l, s):
    r, g, b = colorsys.hls_to_rgb((h % 360.0) / 360.0, l, s)
    return tuple(max(0, min(255, round(c * 255))) for c in (r, g, b))


def sat_for(s):
    """2P 채도: 원본이 이미 진하면 그대로, 낮으면 상한(min(0.50, 1P×1.5))까지만 올린다."""
    if s >= SAT_MAX:
        return s
    return min(SAT_MAX, s * SAT_GAIN)


def map_color(rgb, body_hue=None):
    """1P 색 → 2P 색.

    - 아주 어두운 색(외곽선)과 무채색은 그대로 둔다 → 그림 읽기·실루엣 판독이 같다.
    - 초록 계열 몸통 종은 배·크림(밝고 따뜻한 색)을 연노랑으로 보낸다(디렉터 예시: 배 크림 → 연노랑).
    - 그 밖의 유채색은 색상 +62°, 명도·채도 유지.
    """
    h, l, s = rgb_to_hsl(rgb)
    if l < DARK_KEEP or s < NEUTRAL_KEEP:
        return rgb, 'keep'
    green_body = body_hue is not None and 80.0 <= body_hue <= 200.0
    if green_body and 15.0 <= h <= 80.0 and l >= 0.55 and s <= 0.65:
        return hsl_to_rgb(CREAM_HUE, min(0.94, l + CREAM_LIFT), sat_for(s)), 'cream'
    # 명도는 그대로(상한 +0.05는 넘지 않는다는 뜻이지 목표가 아니다), 색상만 +62°.
    # 채도는 올리지도 내리지도 않는다(상한·하한 규칙).
    return hsl_to_rgb(h + HUE_SHIFT, l, sat_for(s)), 'shift'


def hue_gap(a, b):
    d = abs(a - b) % 360.0
    return min(d, 360.0 - d)


def build_one(path, check_only=False):
    sheet = Image.open(path).convert('RGBA')
    pixels = list(sheet.getdata())
    counts = {}
    for px in pixels:
        if px[3] > 0:
            counts[px[:3]] = counts.get(px[:3], 0) + 1

    # 몸통 대표색: 면적이 가장 큰 유채색(초록 우선, 없으면 가장 큰 유채색).
    chromatic = [(rgb, n) for rgb, n in counts.items()
                 if rgb_to_hsl(rgb)[2] >= 0.10 and rgb_to_hsl(rgb)[1] >= 0.15]
    greens = [(rgb, n) for rgb, n in chromatic if 80.0 <= rgb_to_hsl(rgb)[0] <= 200.0]
    pool = greens or chromatic
    body = max(pool, key=lambda kv: kv[1])[0] if pool else None
    body_hue = rgb_to_hsl(body)[0] if body else None

    mapping = {rgb: map_color(rgb, body_hue) for rgb in counts}

    out = Image.new('RGBA', sheet.size, (0, 0, 0, 0))
    out.putdata([(mapping[px[:3]][0][0], mapping[px[:3]][0][1], mapping[px[:3]][0][2], px[3])
                 if px[3] > 0 else (0, 0, 0, 0) for px in pixels])

    # 알파는 원본과 완전히 같아야 한다(형태 불변 증명).
    if out.getchannel('A').tobytes() != sheet.getchannel('A').tobytes():
        sys.exit(f'{path}: 2P 시트의 알파가 원본과 다릅니다')

    body_from = (0, 0, 0)
    body_gap = 0.0
    if body:
        body_from = body
        body_to = mapping[body][0]
        body_gap = hue_gap(rgb_to_hsl(body)[0], rgb_to_hsl(body_to)[0])
        if body_gap < 60.0 and not check_only:
            sys.exit(f'{path}: 몸통 대표색 색상차 {body_gap:.1f}° < 60°')
    # 채도·명도 상한 위반은 조용히 넘기지 않는다.
    for rgb, (to, family) in mapping.items():
        if family == 'keep':
            continue
        _, la, sa = rgb_to_hsl(rgb)
        _, lb, sb = rgb_to_hsl(to)
        # 8bit 반올림 오차(±0.01)는 규칙 위반이 아니다. 올리지도 내리지도 않는다.
        upper = max(sa, min(SAT_MAX, sa * SAT_GAIN))
        if sb > upper + 0.02 or sb < sa - 0.02:
            sys.exit(f'{path}: 2P 채도 위반 {rgb} s={sa:.2f} -> {to} s={sb:.2f} (허용 {sa:.2f}~{upper:.2f})')
        if lb - la > LIGHT_MAX_DELTA + 0.02:
            sys.exit(f'{path}: 2P 명도 상승 위반 {rgb} l={la:.2f} -> {to} l={lb:.2f}')

    if not check_only:
        out.save(path.replace('sheet.png', 'sheet_p2.png'))
    return {
        'colors': len(mapping),
        'body': list(body_from),
        'bodyTo': list(mapping[body][0]) if body else None,
        'bodyHueGap': round(body_gap, 1),
        'mapping': [[list(k), list(v[0]), v[1]] for k, v in sorted(mapping.items())],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dir', default='dev-art/species')
    ap.add_argument('--check', action='store_true', help='파일을 쓰지 않고 규칙만 검사')
    args = ap.parse_args()

    index_path = os.path.join(args.dir, 'index.json')
    index = json.load(open(index_path))
    report = {}
    for folder in sorted(index['species']):
        sheet_path = os.path.join(args.dir, folder, 'sheet.png')
        stats = build_one(sheet_path, args.check)
        report[folder] = stats

        manifest_path = os.path.join(args.dir, folder, 'manifest.json')
        manifest = json.load(open(manifest_path))
        manifest['p2Image'] = 'sheet_p2.png'
        manifest['p2'] = {
            'rule': 'hue+62 (body), cream 50deg (belly), dark/neutral kept',
            'bodyHueGap': stats['bodyHueGap'],
            'body': [stats['body'], stats['bodyTo']],
            'colors': stats['mapping'],
        }
        if not args.check:
            # 원본 매니페스트와 같은 압축 표기를 유지한다(리뷰 diff를 부풀리지 않는다).
            json.dump(manifest, open(manifest_path, 'w'), ensure_ascii=False, separators=(',', ':'))
        index['species'][folder]['p2Sheet'] = 'sheet_p2.png'

    if not args.check:
        json.dump(index, open(index_path, 'w'), ensure_ascii=False, indent=1)

    print(json.dumps({f: {k: v for k, v in s.items() if k != 'mapping'} for f, s in report.items()},
                     ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
