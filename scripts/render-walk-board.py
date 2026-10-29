#!/usr/bin/env python3
"""12종 걷기 8프레임 검수 보드 — 아트 원본 픽셀 그대로(리샘플 없음) 한 장에 붙인다.

각 행이 한 종, 왼쪽부터 walk_00…walk_07. 셀 좌표(502×304) 그대로 붙이고 지면선 297과
기준 x 251을 표시한다. 그림을 줄이거나 늘리지 않으므로 보드에서 잰 값이 게임 값과 같다.

사용: python3 scripts/render-walk-board.py --dir dev-art/species --out evidence/walk-board.png
"""
import argparse
import json
import os

from PIL import Image, ImageDraw

CELL_W, CELL_H = 320, 180    # 기준점 주변 창(ANCHOR_X±160, FOOT_Y-176~+4)
FOOT_Y = 298
ANCHOR_X = 251
GUTTER = 150
ORDER = ['trex', 'trike', 'velo', 'spino', 'anky', 'stego', 'carno', 'pachy', 'theri', 'dilo', 'brachio', 'ptera']
LABEL = {'trex': '티라노', 'trike': '트리케라', 'velo': '벨로키', 'spino': '스피노', 'anky': '안킬로',
         'stego': '스테고', 'carno': '카르노', 'pachy': '파키', 'theri': '테리지노', 'dilo': '딜로포',
         'brachio': '브라키오', 'ptera': '프테라'}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dir', default='dev-art/species')
    ap.add_argument('--out', required=True)
    args = ap.parse_args()

    cols = 8
    width = GUTTER + cols * CELL_W
    height = len(ORDER) * CELL_H
    board = Image.new('RGBA', (width, height), (32, 38, 46, 255))
    draw = ImageDraw.Draw(board)
    for row, folder in enumerate(ORDER):
        top = row * CELL_H
        manifest = json.load(open(os.path.join(args.dir, folder, 'manifest.json')))
        sheet = Image.open(os.path.join(args.dir, folder, manifest['image'])).convert('RGBA')
        draw.text((10, top + 12), LABEL[folder], fill=(255, 255, 255, 255))
        draw.text((10, top + 30), f'{folder} · 40장', fill=(150, 170, 190, 255))
        for col, idx in enumerate(manifest['clips']['walk']['frames']):
            fr = manifest['frames'][idx]
            # 셀 좌표 복원: 크롭 원점 = 기준점 - anchor
            cell_left = ANCHOR_X - fr['anchor']['x']
            cell_top = FOOT_Y - fr['anchor']['y']
            x = GUTTER + col * CELL_W
            draw.rectangle((x, top, x + CELL_W - 1, top + CELL_H - 1), outline=(60, 70, 84, 255))
            ox, oy = ANCHOR_X - 160, FOOT_Y - 176      # 창 원점(셀 좌표)
            draw.line((x, top + FOOT_Y - oy - 1, x + CELL_W, top + FOOT_Y - oy - 1), fill=(190, 60, 60, 255))
            draw.line((x + ANCHOR_X - ox, top, x + ANCHOR_X - ox, top + CELL_H), fill=(70, 90, 110, 255))
            board.alpha_composite(sheet.crop((fr['x'], fr['y'], fr['x'] + fr['w'], fr['y'] + fr['h'])),
                                  (x + cell_left - ox, top + cell_top - oy))
            draw.text((x + 6, top + 6), f'{col}', fill=(230, 220, 90, 255))
    os.makedirs(os.path.dirname(args.out) or '.', exist_ok=True)
    board.save(args.out)
    print(f'{args.out} {board.size}')


if __name__ == '__main__':
    main()
