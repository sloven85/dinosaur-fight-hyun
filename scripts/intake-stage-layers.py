#!/usr/bin/env python3
"""경기장 3레이어 인테이크 검사기 — 아티스트 zip이 오면 이걸로 한 번에 잰다.

계약(2026-11-01 마스터 확정, 이번 새 4곳과 동일 규격):
  far    (원경)  960×360, 알파 없음(RGB), 색 ≤ 28
  mid    (중경)  736×360, RGBA·알파 이진(0/255), 내용 마지막 행 = 298(접지선), 색 ≤ 28
  ground (지면)  832×360, RGBA·알파 이진, 내용 첫 행 = 298, 마지막 행 = 359, 색 ≤ 28
  레이어 폭 = 640 + pad*2 → pad 는 160 / 48 / 96 고정(layers.json).

이 검사기는 **판정하지 않고 잰다**. 어긋난 값을 표에 적고, --write 를 주면 규격 이름으로
`dev-art/stages/<id>/` 에 넣고 layers.json 까지 쓴 뒤, 코드 목록(DOT_STAGE_LAYER_ART)에
추가해야 한다는 안내를 출력한다.

사용:
  python3 scripts/intake-stage-layers.py <받은폴더>                # 검사만
  python3 scripts/intake-stage-layers.py <받은폴더> --write        # dev-art 반영
  python3 scripts/intake-stage-layers.py dev-art/stages --self-test # 기존 6곳 재측정(회귀)
  옵션 --map <납품이름>=<게임id>[,...]   예: --map moon=swamp
"""
import argparse
import glob
import json
import os
import re
import shutil
import sys

import numpy as np
from PIL import Image

SPEC = {
    'far': (960, 360),
    'mid': (736, 360),
    'ground': (832, 360),
}
PADS = {'far': 160, 'mid': 48, 'ground': 96}
STAND_LINE = 298
MAX_COLORS = 28
LAYERS = ('far', 'mid', 'ground')

# {name}_{layer}_{W}x{H}.png / {name}_{layer}_bleed.png / {name}_{layer}.png
NAME_RE = re.compile(r'^(?P<name>[a-z0-9_-]+?)_(?P<layer>far|mid|ground)(?:_(?P<w>\d+)(?:x(?P<h>\d+))?|_bleed)?\.png$', re.I)


def measure(path, layer):
    im = Image.open(path)
    w, h = im.size
    errs, notes = [], []
    exp_w, exp_h = SPEC[layer]
    if (w, h) != (exp_w, exp_h):
        errs.append(f'크기 {w}×{h} ≠ {exp_w}×{exp_h}')

    has_alpha = im.mode in ('RGBA', 'LA', 'P') and ('A' in im.getbands())
    if layer == 'far':
        if has_alpha:
            a = np.array(im.convert('RGBA'))
            if not (a[..., 3] == 255).all():
                errs.append('원경에 투명 픽셀 있음(RGB 불투명이어야 함)')
            rgb = a[..., :3].reshape(-1, 3)
        else:
            rgb = np.array(im.convert('RGB')).reshape(-1, 3)
        colors = len(np.unique(rgb, axis=0))
        if colors > MAX_COLORS:
            errs.append(f'색 {colors} > {MAX_COLORS}')
        return {'file': os.path.basename(path), 'size': (w, h), 'colors': colors,
                'alpha': 'opaque', 'content': (-1, -1), 'errs': errs, 'notes': notes}

    a = np.array(im.convert('RGBA'))
    alpha = a[..., 3]
    uniq = np.unique(alpha)
    if not set(np.unique(uniq).tolist()) <= {0, 255}:
        errs.append(f'알파가 이진이 아님(값 {uniq[:6].tolist()}…)')
    mask = alpha > 0
    if not mask.any():
        errs.append('내용 픽셀 0개(전부 투명)')
        return {'file': os.path.basename(path), 'size': (w, h), 'colors': 0,
                'alpha': 'empty', 'content': (-1, -1), 'errs': errs, 'notes': notes}
    ys = np.where(mask.any(axis=1))[0]
    top, bot = int(ys.min()), int(ys.max())
    colors = len(np.unique(a[..., :3][mask].reshape(-1, 3), axis=0))
    if colors > MAX_COLORS:
        errs.append(f'색 {colors} > {MAX_COLORS}')
    if layer == 'mid':
        if bot != STAND_LINE:
            errs.append(f'중경 내용 마지막 행 {bot} ≠ 접지선 {STAND_LINE}')
    else:
        if top != STAND_LINE:
            errs.append(f'지면 내용 첫 행 {top} ≠ 접지선 {STAND_LINE}')
        if bot != h - 1:
            errs.append(f'지면 내용 마지막 행 {bot} ≠ {h - 1}(아래까지 채워야 함)')
    if top > 0 and layer == 'mid':
        notes.append(f'중경 내용은 {top}행부터')
    return {'file': os.path.basename(path), 'size': (w, h), 'colors': colors,
            'alpha': 'binary', 'content': (top, bot), 'errs': errs, 'notes': notes}


def collect(src):
    stages = {}
    for path in sorted(glob.glob(os.path.join(src, '**', '*.png'), recursive=True)):
        m = NAME_RE.match(os.path.basename(path))
        if not m:
            continue
        stages.setdefault(m.group('name'), {})[m.group('layer')] = path
    return stages


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('--write', action='store_true')
    ap.add_argument('--map', default='')
    ap.add_argument('--self-test', action='store_true')
    args = ap.parse_args()

    mapping = {}
    for pair in filter(None, args.map.split(',')):
        src_name, dst_id = pair.split('=')
        mapping[src_name.strip()] = dst_id.strip()

    stages = collect(args.src)
    if not stages:
        print(f'FAIL  {args.src} 안에서 {{이름}}_{{far|mid|ground}}*.png 를 찾지 못했다')
        return 1

    failures = 0
    print(f'{"납품":12s} {"레이어":7s} {"파일":34s} {"크기":9s} {"색":>4s}  내용Y       판정')
    report = {}
    for name in sorted(stages):
        got = stages[name]
        missing = [l for l in LAYERS if l not in got]
        if missing:
            print(f'{name:12s} {"-":7s} {"누락: " + ",".join(missing):34s}')
            failures += 1
            continue
        rows = {}
        for layer in LAYERS:
            r = measure(got[layer], layer)
            rows[layer] = r
            verdict = 'PASS' if not r['errs'] else 'FAIL: ' + '; '.join(r['errs'])
            if r['errs']:
                failures += 1
            print(f'{name:12s} {layer:7s} {r["file"][:34]:34s} {r["size"][0]}×{r["size"][1]:<4d} '
                  f'{r["colors"]:4d}  {str(r["content"]):11s} {verdict}')
        report[name] = rows

    if args.self_test:
        print()
        print('자기검사: 기존 6곳 재측정 — 화산 중경(끝행 294)만 규격 이전 판이고 나머지는 298')
        for name, rows in report.items():
            mid = rows['mid']
            print(f'  {name}: mid 끝행 {mid["content"][1]}  ground 첫행 {rows["ground"]["content"][0]}  '
                  f'색 {rows["far"]["colors"]}/{mid["colors"]}/{rows["ground"]["colors"]}')

    if args.write and failures == 0:
        for name, rows in report.items():
            target_id = mapping.get(name, name)
            out = os.path.join('dev-art', 'stages', target_id)
            os.makedirs(out, exist_ok=True)
            layers_json = {'stage': target_id, 'native': [640, 360], 'standLine': STAND_LINE,
                           'layers': {}}
            for layer in LAYERS:
                w, h = rows[layer]['size']
                dst_name = f'{target_id}_{layer}_{w}x{h}.png'
                shutil.copyfile(stages[name][layer], os.path.join(out, dst_name))
                layers_json['layers'][layer] = {'file': dst_name, 'pad': PADS[layer]}
            with open(os.path.join(out, 'layers.json'), 'w', encoding='utf-8') as f:
                json.dump(layers_json, f, ensure_ascii=False, indent=1)
                f.write('\n')
            print(f'wrote  dev-art/stages/{target_id}/ ({target_id})')
        print('다음: src/rendering/pixel/PixelBackground.ts 의 DOT_STAGE_LAYER_ART 에 id 추가 '
              '(stageLayers.test.ts 가 디스크와 대조한다)')

    print()
    print(('PASS  전 레이어 규격 일치' if failures == 0 else f'FAIL  {failures}건') + f'  ({args.src})')
    return 0 if failures == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
