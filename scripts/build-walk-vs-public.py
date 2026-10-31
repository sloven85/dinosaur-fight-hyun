#!/usr/bin/env python3
"""걷기 대조판 v2 — 되돌린 빌드 vs 공개 베타 (같은 입력: 서기 1.2초 → 왼쪽 걷기 2.2초).

두 빌드는 아트 방식이 달라(도트 시트 vs 페인팅 렌더) 절대 크기를 서로 비교하지 않는다.
비교하는 것은 **한 빌드 안에서** 걷기와 대기가 같은 크기인가, 걷는 동안 실루엣이
흔들리지 않는가 — 즉 "눈에 띄게 나빠졌는가"의 근거다.

플레이어 검출: 티라노 몸통의 청록 계열을 HSV로 고르고 가장 큰 덩어리만 쓴다.
임계값은 빌드마다 다르다(도트판은 채도가 높고, 페인팅판은 채도 0.2 근처의 어두운 청록).
  rev(도트) hue 133~158 · s>0.33 · v 0.18~0.52
  pub(페인팅) hue 128~158 · s>0.14 · v 0.20~0.45

입력: <revRoot>/{idle,walk}/NNN.png + {idle,walk}.json(performance.now)
출력: 보드 PNG 1장 + 콘솔 측정표
"""
import glob
import json
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

FONT_B = '/usr/share/fonts/truetype/nanum/NanumSquareRoundB.ttf'
FONT_R = '/usr/share/fonts/truetype/nanum/NanumSquareRoundR.ttf'
CROP_W, CROP_UP, CROP_DOWN = 780, 520, 90
SCALE = 0.46
PHASES = 8
THRESH = {
    'rev': (133, 158, 0.33, 0.18, 0.52),
    'pub': (128, 158, 0.14, 0.20, 0.45),
}


def bbox_of(lab, k, sizes):
    ys, xs = np.nonzero(lab == k)
    return {'w': float(xs.max() - xs.min() + 1), 'h': float(ys.max() - ys.min() + 1),
            'top': float(ys.min()), 'ground': float(ys.max()),
            'cx': float((xs.min() + xs.max()) / 2), 'area': int(sizes.max())}


def player_palette(img, pal):
    """도트판: 종 팔레트와 정확히 같은 색만 고른다(배경 레이어는 다른 팔레트를 쓴다)."""
    a = np.asarray(img.convert('RGB'))
    m = np.zeros(a.shape[:2], bool)
    for c in pal:
        m |= np.all(a == np.array(c, np.uint8), axis=-1)
    m[:280] = False
    lab, n = ndimage.label(m)
    if n == 0:
        return None
    sizes = ndimage.sum(m, lab, range(1, n + 1))
    return bbox_of(lab, int(np.argmax(sizes)) + 1, sizes)


def player(img, thr):
    lo, hi, smn, vlo, vhi = thr
    a = np.asarray(img.convert('RGB')).astype(float) / 255.0
    mx = a.max(2); mn = a.min(2); v = mx
    s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    d = mx - mn + 1e-9
    h = np.where(mx == r, ((g - b) / d) % 6,
                 np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    m = (h > lo) & (h < hi) & (s > smn) & (v > vlo) & (v < vhi)
    m[:280] = False  # HUD
    lab, n = ndimage.label(m)
    if n == 0:
        return None
    sizes = ndimage.sum(m, lab, range(1, n + 1))
    return bbox_of(lab, int(np.argmax(sizes)) + 1, sizes)


def measure(root, kind, thr, pal=None):
    files = sorted(glob.glob(f'{root}/{kind}/*.png'))
    stamps = json.load(open(f'{root}/{kind}.json'))
    out = []
    for path, t in zip(files, stamps):
        img = Image.open(path)
        p = player_palette(img, pal) if pal else player(img, thr)
        if p:
            out.append({'path': path, 't': t, **p})
    return out


def pick_phases(frames, count=PHASES):
    """걷기 한 칸 = 83.3ms(12Hz). 첫 걷기 프레임 뒤로 12Hz 간격에 가장 가까운 프레임."""
    if not frames:
        return []
    t0 = frames[0]['t']
    chosen, used = [], set()
    for i in range(count):
        target = t0 + 60 + i * (1000 / 12)
        best = min((f for f in frames if f['path'] not in used), key=lambda f: abs(f['t'] - target))
        used.add(best['path'])
        chosen.append(best)
    return chosen


def crop(path, spot):
    im = Image.open(path).convert('RGB')
    left = int(spot['cx'] - CROP_W // 2)
    top = int(spot['ground'] - CROP_UP)
    left = max(0, min(left, im.width - CROP_W))
    top = max(0, min(top, im.height - CROP_DOWN - 1))
    return im.crop((left, top, left + CROP_W, top + CROP_DOWN + CROP_UP))


def main():
    rev_root, pub_root, out = sys.argv[1], sys.argv[2], sys.argv[3]
    trex = json.load(open('dev-art/species/trex/manifest.json', encoding='utf-8'))
    pal = [tuple(c[0]) for c in trex['p2']['colors']]
    data = {}
    for tag, root in (('pub', pub_root), ('rev', rev_root)):
        thr = THRESH[tag]
        pal_arg = pal if tag == 'rev' else None
        idle_all = measure(root, 'idle', thr, pal_arg)
        idle = idle_all[int(len(idle_all) * 0.4):] or idle_all  # 등장 연출 뒤만
        walk = measure(root, 'walk', thr, pal_arg)
        data[tag] = {'idle': idle, 'walk': walk, 'pick': pick_phases(walk)}
        iw = np.mean([f['w'] for f in idle]); ih = np.mean([f['h'] for f in idle])
        ww = np.array([f['w'] for f in walk]); wh = np.array([f['h'] for f in walk])
        g = np.array([f['ground'] for f in walk])
        print(f"[{tag}] idle n={len(idle)} w={iw:.1f} h={ih:.1f}")
        print(f"[{tag}] walk n={len(walk)} w={ww.min():.0f}~{ww.max():.0f} (mean {ww.mean():.1f}, "
              f"진폭 {100*(ww.max()-ww.min())/ww.mean():.1f}%) h={wh.min():.0f}~{wh.max():.0f} "
              f"접지선 {g.min():.0f}~{g.max():.0f}")
        print(f"[{tag}] 걷기/서기 폭 = {ww.mean()/iw*100:.1f}%  높이 = {wh.mean()/ih*100:.1f}%")

    cell_w = int(CROP_W * SCALE); row_h = int((CROP_UP + CROP_DOWN) * SCALE)
    label_w = 268
    head_h = 158
    thumb_w = 560
    thumb_h = int(1080 * thumb_w / 1920)
    cols = PHASES + 1
    board_w = max(label_w + cell_w * cols + 20, thumb_w * 2 + 48)
    board_h = head_h + thumb_h + 40 + (row_h + 8) * 2 + 24
    board = Image.new('RGB', (board_w, board_h), (10, 16, 20))
    draw = ImageDraw.Draw(board)
    fb = ImageFont.truetype(FONT_B, 26)
    fm = ImageFont.truetype(FONT_B, 19)
    fs = ImageFont.truetype(FONT_R, 16)
    draw.text((16, 10), '티라노 걷기 — 되돌린 빌드 vs 공개 베타 (같은 입력: 서기 1.2초 → 왼쪽 2.2초)',
              font=fb, fill=(240, 236, 222))
    draw.text((16, 46), '위: 같은 순간의 화면. 아래: 왼쪽 첫 칸 = 서기, 나머지 8칸 = 걷기 한 걸음(83.3ms 간격)',
              font=fs, fill=(150, 190, 180))
    draw.text((16, 68), '초록 가로선 = 접지선(모든 칸 같은 높이) · 빨간 선 = 그 빌드의 서기 실루엣 폭·높이 기준',
              font=fs, fill=(150, 190, 180))
    draw.text((16, 90), '두 빌드는 아트 방식이 달라 절대 크기는 비교 대상이 아니다. 한 빌드 안에서 서기↔걷기가 튀는지, 발이 땅에서 뜨는지만 본다.',
              font=fs, fill=(120, 150, 145))

    order = (('pub', '공개 베타', '10/26 빌드 · 도트 0', (206, 186, 146)),
             ('rev', '되돌린 빌드', '걷기 = 기존 마스터 그림', (240, 236, 222)))
    ty = head_h
    for i, (tag, title, sub, color) in enumerate(order):
        mid = data[tag]['walk'][len(data[tag]['walk']) // 2]
        shot = Image.open(mid['path']).convert('RGB').resize((thumb_w, thumb_h), Image.LANCZOS)
        draw.text((18 + i * (thumb_w + 16), ty - 24), title, font=fm, fill=color)
        board.paste(shot, (16 + i * (thumb_w + 16), ty))
        draw.rectangle([16 + i * (thumb_w + 16), ty, 16 + i * (thumb_w + 16) + thumb_w, ty + thumb_h],
                       outline=(40, 60, 60))

    y = head_h + thumb_h + 56
    for tag, title, sub, color in order:
        d = data[tag]
        idle = d['idle']; pick = d['pick']
        idle_ref = idle[len(idle) // 2]
        iw = float(np.mean([f['w'] for f in idle])); ih = float(np.mean([f['h'] for f in idle]))
        rw, rh = idle_ref['w'], idle_ref['h']  # 빨간 기준선은 화면에 보이는 그 서기 프레임 기준
        ww = np.array([f['w'] for f in d['walk']]); wh = np.array([f['h'] for f in d['walk']])
        g = np.array([f['ground'] for f in d['walk']])
        ratio = ww.mean() / iw
        draw.text((14, y + 2), title, font=fm, fill=color)
        draw.text((14, y + 26), sub, font=fs, fill=(140, 160, 155))
        draw.text((14, y + 48), f'서기(표시 프레임) 폭 {rw:.0f} · 높이 {rh:.0f}px', font=fs, fill=(150, 190, 180))
        draw.text((14, y + 70), f'걷기 폭 {ww.min():.0f}~{ww.max():.0f}px (진폭 {100*(ww.max()-ww.min())/ww.mean():.1f}%)',
                  font=fs, fill=(150, 190, 180))
        draw.text((14, y + 92), f'걷기/서기 폭 {ratio*100:.1f}%', font=fs,
                  fill=(120, 210, 170) if abs(ratio - 1) < 0.06 else (230, 120, 90))
        draw.text((14, y + 114), f'높이 {wh.mean()/ih*100:.1f}% · 접지선 흔들 {g.max()-g.min():.0f}px', font=fs,
                  fill=(150, 190, 180))
        cells = [idle[len(idle) // 2]] + pick
        for c, spot in enumerate(cells):
            im = crop(spot['path'], spot).resize((cell_w, row_h), Image.NEAREST)
            x0 = label_w + c * cell_w
            board.paste(im, (x0, y))
            ground_y = y + int(CROP_UP * SCALE)
            draw.line([(x0, ground_y), (x0 + cell_w, ground_y)], fill=(70, 130, 110), width=2)
            half_w = rw * SCALE / 2
            for sign in (-1, 1):
                xx = x0 + cell_w / 2 + sign * half_w
                draw.line([(xx, y + 2), (xx, y + row_h - 2)], fill=(150, 80, 70), width=2)
            draw.line([(x0, ground_y - rh * SCALE), (x0 + cell_w, ground_y - rh * SCALE)], fill=(150, 80, 70), width=2)
            if c:
                draw.line([(x0, y), (x0, y + row_h)], fill=(38, 56, 58), width=1)
        draw.text((label_w + 6, y - 20), '서기', font=fs, fill=(230, 220, 190))
        for c in range(PHASES):
            draw.text((label_w + cell_w * (c + 1) + 6, y - 20), f'{c + 1}', font=fs, fill=(140, 170, 165))
        y += row_h + 8
    board.save(out)
    print('board', out, board.size)


main()
