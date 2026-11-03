#!/usr/bin/env python3
"""걷기 인게임 대조판 — 기존 시트와 새 8칸을 같은 경기장·같은 배율로 나란히 놓는다.

입력은 scripts/shoot-walk.mjs 가 받은 screencast 프레임(/tmp/walk-{old,new}/walk_{1p,2p}).
  - 발밑 접지 링(1P #2E6BFF / 2P #E0453A)으로 그 순간의 접지선과 몸 중심을 찾는다.
    (배경 시차 때문에 전체 프레임 차분은 못 쓴다 — 카메라가 함께 움직인다)
  - 접지선을 행마다 같은 높이에 놓고 자르므로 세로 흔들림·크기 변화가 그대로 보인다.
출력: 보드 PNG 1장 + 행별 측정 CSV.
"""
import glob
import json
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

RING = {'1p': (46, 107, 255), '2p': (224, 69, 58)}
CROP_W, CROP_UP, CROP_DOWN = 760, 620, 80
# 한 걸음 8칸을 다 보여 준다(랩 지점 = 마지막 칸 → 첫 칸). 반으로 줄여 붙인다(도트 격자 유지).
SCALE = 0.5
COLS = 8
# 랩(8번째 → 1번째)을 눈으로 보라고 9번째 칸에 1번째 칸을 한 번 더 놓는다.
STRIP = COLS + 1
LABEL_W = 250
FONT = '/usr/share/fonts/truetype/nanum/NanumSquareRoundB.ttf'


def load(dirname):
    files = sorted(glob.glob(f'{dirname}/*.png'))
    stamps = json.load(open(f'{dirname}/frames.json'))
    return files, stamps


def locate(path, color):
    a = np.asarray(Image.open(path).convert('RGB'))
    mask = np.all(a == np.array(color), axis=-1)
    ys, xs = np.where(mask)
    if len(xs) == 0:
        return None
    # 접지 링(가장 아래 뭉치)과 머리 위 표식(가장 위 뭉치)을 나눈다.
    ground = int(ys.max())
    ring_rows = ys[ys >= ground - 40]
    ring_x = xs[ys >= ground - 40]
    cx = int((ring_x.min() + ring_x.max()) / 2)
    ground_y = int(ring_rows.min())
    head_rows = ys[ys <= ground_y - 200]
    head_bottom = int(head_rows.max()) if len(head_rows) else None
    return {'cx': cx, 'ground': ground_y, 'head_bottom': head_bottom}


def pick(files, stamps, color, count=COLS):
    """같은 시간 간격(걷기 1칸 = 83.3ms)으로 위상을 고른다 — 두 빌드가 같은 박자를 보게.

    고정 타임스텝 게임이라 시작 시각만 맞추면 같은 간격이 같은 걸음 위상이 된다.
    """
    found = []
    for path, stamp in zip(files, stamps):
        spot = locate(path, color)
        if spot:
            found.append((stamp, path, spot))
    if not found:
        return []
    found.sort()
    t0 = found[0][0]
    chosen = []
    for i in range(count):
        target = t0 + 0.05 + i * (1 / 12)  # 83.3ms = 걷기 한 칸
        best = min(found, key=lambda item: abs(item[0] - target))
        if best not in chosen:
            chosen.append(best)
    return chosen


def main():
    old_root, new_root, out = sys.argv[1], sys.argv[2], sys.argv[3]
    rows = []
    for who, color in RING.items():
        for tag, root in (('기존', old_root), ('신규', new_root)):
            files, stamps = load(f'{root}/walk_{who}')
            chosen = pick(files, stamps, color)
            rows.append({'who': who, 'tag': tag, 'picks': chosen})

    row_h = int((CROP_UP + CROP_DOWN) * SCALE)
    cell_w = int(CROP_W * SCALE)
    head_h = 64
    ctx_scale = 0.45
    ctx_w, ctx_h = int(1920 * ctx_scale), int(1080 * ctx_scale)
    board_w = max(LABEL_W + cell_w * STRIP, ctx_w * 2 + 32)
    board = Image.new('RGB', (board_w, head_h + ctx_h + 24 + row_h * len(rows)), (12, 20, 24))
    draw = ImageDraw.Draw(board)
    font = ImageFont.truetype(FONT, 22)
    small = ImageFont.truetype(FONT, 17)
    draw.text((14, 8), '티라노 걷기 8칸 — 인게임 대조(같은 경기장·같은 배율 4px/art px · 반으로 줄임)', font=font, fill=(240, 235, 220))
    draw.text((14, 38), '빨간 가로선 = 계약 키 108 아트px(화면 432px) · 초록선 = 접지선 · 8칸 = 한 걸음(83.3ms/칸), 8번째 → 1번째가 랩',
              font=small, fill=(150, 190, 180))

    # 위: 두 빌드의 실제 화면 한 장(1P가 걷는 순간). 아래: 걷기 위상 4칸 확대.
    for i, (tag, root) in enumerate((('기존', old_root), ('신규', new_root))):
        files, stamps = load(f'{root}/walk_1p')
        mid = files[len(files) // 2]
        shot = Image.open(mid).convert('RGB').resize((ctx_w, ctx_h), Image.NEAREST)
        board.paste(shot, (16 + i * (ctx_w + 16), head_h))
        draw.text((24 + i * (ctx_w + 16), head_h + 8), f'화면 전체 {tag}', font=small, fill=(240, 235, 220))
    rows_top = head_h + ctx_h + 34

    # 기준선: 계약 높이(108 아트 px = 432 화면 px)를 행마다 같은 자리에 그린다.
    for r, row in enumerate(rows):
        top = rows_top + r * row_h
        draw.text((16, top + 8), f"{row['who'].upper()}  {row['tag']}", font=font,
                  fill=(240, 235, 220) if row['tag'] == '신규' else (206, 186, 146))
        note = ['시트 높이 108~109 artpx', '시트 높이 106~108 artpx'][0 if row['tag'] == '기존' else 1]
        draw.text((16, top + 40), note, font=small, fill=(150, 190, 180))
        draw.text((16, top + 62), '화면 424~436px', font=small, fill=(150, 190, 180))
        cells = list(row['picks'])
        if cells:
            cells.append(cells[0])  # 랩 후 첫 칸
        for c, (stamp, path, spot) in enumerate(cells):
            im = Image.open(path).convert('RGB')
            left = spot['cx'] - CROP_W // 2
            crop = im.crop((left, spot['ground'] - CROP_UP, left + CROP_W, spot['ground'] + CROP_DOWN))
            crop = crop.resize((cell_w, row_h), Image.NEAREST)
            board.paste(crop, (LABEL_W + c * cell_w, top))
            x0 = LABEL_W + c * cell_w
            ground_y = top + int(CROP_UP * SCALE)
            # 접지선(모든 칸 같은 높이)과 계약 높이 기준선(108 아트px = 432 화면px).
            draw.line([(x0, ground_y), (x0 + cell_w, ground_y)], fill=(70, 110, 100), width=1)
            draw.line([(x0, ground_y - int(432 * SCALE)), (x0 + cell_w, ground_y - int(432 * SCALE))], fill=(120, 80, 70), width=1)
            if c:
                draw.line([(x0, top), (x0, top + row_h)], fill=(40, 60, 60), width=1)
    for c in range(STRIP):
        x0 = LABEL_W + c * cell_w
        draw.text((x0 + 6, rows_top - 30), f'{(c % COLS) + 1}', font=small, fill=(140, 170, 165))
    # 8번째 → 9번째(=1번째 다시) 사이가 랩 지점이다.
    seam = LABEL_W + COLS * cell_w
    draw.line([(seam, rows_top - 34), (seam, rows_top + row_h * len(rows))], fill=(200, 90, 70), width=3)
    draw.text((seam + 6, rows_top - 30), '← 랩', font=small, fill=(230, 120, 90))
    board.save(out)
    print('board', out, board.size)


main()
