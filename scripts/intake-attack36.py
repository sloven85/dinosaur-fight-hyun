#!/usr/bin/env python3
"""dino_attack36_sheets_v1 인테이크 — 공격 3기술만 8칸 시트 납품으로 갈아끼운다.

하는 일
  1) 종별 기존 시트·manifest에서 공격(light/strong/special) 외 클립은 픽셀 그대로 보존
  2) 납품 frames_1p/<종>/*_{light_attack,heavy_slam,special}_NN.png 8장으로 교체
  3) 칸 502×304 격자로 재포장(bbox 크롭 + anchor = 발 기준점) — 리샘플·확대 없음
  4) 공격 클립 artMs를 기술 위상(startup/active/recovery)에 맞춰 재배분해
     접촉 프레임(=셀 5)이 실제 판정 프레임에 화면에 뜨게 한다
  5) 2P 시트도 같은 격자로 재포장 + 1:1 대응 검증

사용: python3 scripts/intake-attack36.py --root /tmp/intake36 --out dev-art/species [--species trex]
"""
import argparse
import colorsys
import json
import math
import os
import sys

from PIL import Image

CELL_W, CELL_H = 502, 304
FOOT_Y = 298
ANCHOR_X = 251
COLS = 8
ATTACK = [('light', 'light_attack'), ('strong', 'heavy_slam'), ('special', 'special')]
CLIP_ORDER = ['idle', 'walk', 'jump', 'light', 'strong', 'special', 'hit', 'flail', 'down', 'victory']


def recolor(p1):
    """build-p2-all-species.py 와 같은 규칙: 색상 +150°, 채도 상한, 명도 +0.05, 윤곽선 유지."""
    r, g, b = (v / 255 for v in p1)
    h, s, v = colorsys.rgb_to_hsv(r, g, b)
    if v <= 0.22:
        return p1
    h2 = (h + 150 / 360) % 1.0
    s2 = min(0.50, s * 1.25 + 0.05)
    v2 = min(1.0, v + 0.05)
    r2, g2, b2 = colorsys.hsv_to_rgb(h2, s2, v2)
    return round(r2 * 255), round(g2 * 255), round(b2 * 255)


def build_p2(sheet_path, out_path, folder):
    img = Image.open(sheet_path).convert('RGBA')
    mapping = {}
    pal_path = os.path.join('dev-art/palettes', f'{folder}.json')
    if os.path.exists(pal_path):
        pal = json.load(open(pal_path))
        if pal.get('p1') and pal.get('p2') and len(pal['p1']) == len(pal['p2']):
            mapping = {tuple(a): tuple(b) for a, b in zip(pal['p1'], pal['p2'])}
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if not a:
                continue
            rgb = (r, g, b)
            to = mapping.get(rgb)
            if to is None:
                to = recolor(rgb)
            px[x, y] = (to[0], to[1], to[2], a)
    img.save(out_path)


def alpha_bbox(img):
    return img.getchannel('A').getbbox()


def attack_art_ms(moves, kind, n=8):
    """기술 위상에 8칸 시간 경계를 맞춘다: 준비 4칸 / 접촉·유지 2칸 / 회수 2칸.

    경계는 **내림**으로 잡아 접촉 프레임이 반드시 5번 칸(접촉 칸)에 걸리게 한다.
    (반올림하면 경계가 접촉 시각을 살짝 넘어 4번 칸이 그려지는 경우가 생긴다 — ptera 약공격 실측)
    """
    move = moves[kind]
    c = int(move.get('startupFrames', 0))
    hits = [h for h in (move.get('hitboxes') or []) if isinstance(h, dict)]
    if hits:
        c = int(min(h.get('startFrame', c) for h in hits))
    total = int((move.get('script') or {}).get('frames')
                or move['startupFrames'] + move['activeFrames'] + move['recoveryFrames'])
    c = max(1, min(c, total - 1))
    a_end = min(total, max(c + 1, c + max(1, int(move.get('activeFrames', 1)))))
    contact_ms = c * 1000.0 / total
    ready = math.floor(contact_ms / 4 * 10) / 10      # 내림: 경계 ≤ 접촉 시각
    active = (a_end - c) * 1000.0 / total / 2
    used = ready * 4 + active * 2
    rec = max(0.0, (1000.0 - used) / 2)
    ms = [ready] * 4 + [active] * 2 + [rec] * 2
    ms[-1] = max(0.1, 1000.0 - sum(ms[:-1]))
    return ms


def to_ticks(art_ms, total_ticks):
    total_ms = sum(art_ms)
    raw = [max(1, round(total_ticks * m / total_ms)) for m in art_ms]
    diff = total_ticks - sum(raw)
    i = 0
    while diff != 0:
        j = i % len(raw)
        if diff > 0:
            raw[j] += 1
            diff -= 1
        elif raw[j] > 1:
            raw[j] -= 1
            diff += 1
        i += 1
        if i > 1000:
            break
    return raw


def pack(frames, out_sheet, out_p2=None):
    """frames: [(source, crop_img, anchor)] → (sheet, p2sheet, rects)"""
    rows = math.ceil(len(frames) / COLS)
    sheet = Image.new('RGBA', (COLS * CELL_W, rows * CELL_H), (0, 0, 0, 0))
    p2 = Image.new('RGBA', sheet.size, (0, 0, 0, 0)) if out_p2 else None
    rects = []
    for i, (source, crop, crop2, anchor) in enumerate(frames):
        cx, cy = (i % COLS) * CELL_W, (i // COLS) * CELL_H
        crop = crop.convert('RGBA')
        sheet.paste(crop, (cx, cy))
        if p2 is not None:
            p2.paste(crop2.convert('RGBA'), (cx, cy))
        rects.append({'x': cx, 'y': cy, 'w': crop.size[0], 'h': crop.size[1],
                      'anchor': dict(anchor), 'source': source})
    sheet.save(out_sheet)
    if p2 is not None:
        p2.save(out_p2)
    return rects


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', default='/tmp/intake36')
    ap.add_argument('--out', default='dev-art/species')
    ap.add_argument('--species', default='')
    args = ap.parse_args()

    moves_all = {m['id']: m for m in json.load(open('src/data/moves.json'))['moves']}
    idx_path = os.path.join(args.out, 'index.json')
    index = json.load(open(idx_path))
    only = set(args.species.split(',')) if args.species else None

    for folder, entry in sorted(index['species'].items()):
        if only and folder not in only:
            continue
        char = entry['character']
        d = os.path.join(args.out, folder)
        man = json.load(open(os.path.join(d, 'manifest.json')))
        sheet = Image.open(os.path.join(d, man['image'])).convert('RGBA')
        sheet2 = Image.open(os.path.join(d, man['p2Image'])).convert('RGBA') if man.get('p2Image') else None

        # 기존 클립별 프레임(공격 외)을 그대로 크롭해 보존
        per_clip_old = {c: list(man['clips'][c]['frames']) for c in CLIP_ORDER}

        moves = {}
        for kind, art in ATTACK:
            mv = moves_all.get(f'{char}_{kind}') or moves_all.get(f"{char}_{'heavy' if kind == 'strong' else kind}")
            if mv is None:
                raise SystemExit(f'{char}_{kind} 기술 데이터 없음')
            moves[kind] = mv

        packed = []
        clip_frames = {}
        for c in CLIP_ORDER:
            if c in dict(ATTACK).keys():
                art = dict(ATTACK)[c]
                crops = []
                for i in range(8):
                    fn = f'{folder}_{art}_{i:02d}.png'
                    p1 = os.path.join(args.root, 'frames_1p', folder, fn)
                    p2 = os.path.join(args.root, 'frames_2p', folder, fn)
                    if not os.path.exists(p1):
                        raise SystemExit(f'없음: {p1}')
                    im1 = Image.open(p1).convert('RGBA')
                    im2 = Image.open(p2).convert('RGBA') if os.path.exists(p2) else None
                    if im1.size != (CELL_W, CELL_H):
                        raise SystemExit(f'{fn} 크기 {im1.size}')
                    bb = alpha_bbox(im1)
                    if bb is None:
                        raise SystemExit(f'{fn} 빈 프레임')
                    bb2 = alpha_bbox(im2) if im2 else bb
                    if bb2 != bb:
                        raise SystemExit(f'{fn} 1P/2P 실루엣 불일치 {bb} vs {bb2}')
                    # 발 기준선까지 투명 여백을 포함해 자른다 → anchor.y === h (접지 게이트)
                    box = (bb[0], bb[1], bb[2], FOOT_Y)
                    crop = im1.crop(box)
                    crop2 = im2.crop(box) if im2 else None
                    anchor = {'x': ANCHOR_X - bb[0], 'y': crop.size[1]}
                    crops.append((f'{art}_{i:02d}.png', crop, crop2, anchor))
                start = len(packed)
                packed.extend(crops)
                clip_frames[c] = list(range(start, start + 8))
            else:
                start = len(packed)
                for fi in per_clip_old[c]:
                    fr = man['frames'][fi]
                    box = (fr['x'], fr['y'], fr['x'] + fr['w'], fr['y'] + fr['h'])
                    crop = sheet.crop(box)
                    crop2 = sheet2.crop(box) if sheet2 else None
                    packed.append((fr['source'], crop, crop2, fr['anchor']))
                clip_frames[c] = list(range(start, start + len(per_clip_old[c])))

        rects = pack(packed, os.path.join(d, 'sheet.png'))
        # 2P는 1P를 프로젝트 규칙으로 1:1 치환해 만든다(아티스트 팔레트 JSON이 있으면 그 표).
        # 납품 frames_2p는 종마다 치환 규칙이 달라 그대로 섞으면 '색 하나→두 색' 충돌이 난다.
        build_p2(os.path.join(d, 'sheet.png'), os.path.join(d, 'sheet_p2.png'), folder)

        man['frames'] = rects
        for c in CLIP_ORDER:
            clip = man['clips'][c]
            clip['frames'] = clip_frames[c]
            if c in ('light', 'strong', 'special'):
                kind = c
                art_ms = attack_art_ms(moves, kind)
                total_ticks = max(8, sum(clip['ticks'])) if clip.get('ticks') else 16
                clip['ticks'] = to_ticks(art_ms, total_ticks)
                clip['artMs'] = [round(m, 1) for m in art_ms]
            else:
                if len(clip['ticks']) != len(clip_frames[c]) or len(clip['artMs']) != len(clip_frames[c]):
                    raise SystemExit(f'{folder} {c} 기존 프레임 수와 ticks 길이 불일치')
        rows = math.ceil(len(rects) / COLS)
        man['grid'] = {'cellW': CELL_W, 'cellH': CELL_H, 'cols': COLS, 'rows': rows}
        json.dump(man, open(os.path.join(d, 'manifest.json'), 'w'), ensure_ascii=False)
        entry['frames'] = len(rects)
        entry['sheet'] = [COLS * CELL_W, rows * CELL_H]
        print(f"{folder}: {len(rects)}프레임 {COLS}×{rows} 시트")

    json.dump(index, open(idx_path, 'w'), ensure_ascii=False)
    print('index.json 갱신')


if __name__ == '__main__':
    sys.exit(main())
