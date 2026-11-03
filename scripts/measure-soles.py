#!/usr/bin/env python3
"""프레임별 접지발(두 발) 구간을 실측해 manifest에 적는다.

링·발 기준을 그림에서 직접 재기 위한 것. 아티스트 선언값은 쓰지 않고 알파에서 잰다.
  sole.x = 프레임 사각형 왼쪽에서 잰 접지 띠 중심(아트 px)
  sole.w = 접지 띠 폭(아트 px)

접지 띠 = 프레임 최하단 3행 중 불투명 픽셀이 있는 행 전체.
사용: python3 scripts/measure-soles.py [--dir dev-art/species] [--dry]
"""
import argparse
import json
import os
import sys

from PIL import Image

BAND_ROWS = 3


def measure_frame(sheet, frame):
    x, y, w, h = frame['x'], frame['y'], frame['w'], frame['h']
    band = sheet.crop((x, y + max(0, h - BAND_ROWS), x + w, y + h))
    alpha = band.getchannel('A')
    bb = alpha.getbbox()
    if bb is None:
        return None
    x0, _, x1, _ = bb
    return {'x': round((x0 + x1) / 2), 'w': x1 - x0}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dir', default='dev-art/species')
    ap.add_argument('--dry', action='store_true')
    args = ap.parse_args()

    index = json.load(open(os.path.join(args.dir, 'index.json')))
    report = {}
    for folder in sorted(index['species']):
        manifest_path = os.path.join(args.dir, folder, 'manifest.json')
        manifest = json.load(open(manifest_path))
        sheet = Image.open(os.path.join(args.dir, folder, 'sheet.png')).convert('RGBA')
        missing = []
        for i, frame in enumerate(manifest['frames']):
            sole = measure_frame(sheet, frame)
            if sole is None:
                missing.append(i)
                continue
            frame['sole'] = sole
        report[folder] = {
            'frames': len(manifest['frames']),
            'empty': missing,
            'soleX': [f['sole']['x'] for f in manifest['frames'] if 'sole' in f],
            'soleW': [f['sole']['w'] for f in manifest['frames'] if 'sole' in f],
        }
        if not args.dry:
            # 원본 표기(압축 JSON)를 유지한다.
            json.dump(manifest, open(manifest_path, 'w'), ensure_ascii=False, separators=(',', ':'))

    bad = [f for f, r in report.items() if r['empty']]
    if bad:
        sys.exit(f'접지 띠가 비어 있는 프레임이 있습니다: {bad}')
    for folder, r in report.items():
        print(f"{folder:8} frames {r['frames']:3}  soleX {min(r['soleX'])}~{max(r['soleX'])}  "
              f"soleW {min(r['soleW'])}~{max(r['soleW'])}")


if __name__ == '__main__':
    main()
