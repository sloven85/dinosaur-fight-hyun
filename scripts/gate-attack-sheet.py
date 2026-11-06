#!/usr/bin/env python3
"""공격 클립 시트 인테이크 게이트 — 마스터 확정 4개 합격선(2026-11-06).

  1) 클립 내 프레임 간 실루엣 높이 편차 ≤ 15%
     편차(%) = (최대높이 - 최소높이) / 최대높이 × 100
  2) 클립 내 팔레트 동일 — 모든 칸의 불투명 RGB 집합이 완전히 같고,
     마스터 아이들 팔레트(dev-art/palettes/<folder>.json p1) 밖 색이 0개
  3) 접촉 프레임 ≥ 1개 — 선언한 접촉 프레임이 클립 안에 있고, 그 칸의
     접촉 픽셀 좌표가 불투명 픽셀
  4) 시트 1장 = 6~8칸

시트 모드(납품 검사):
  python3 scripts/gate-attack-sheet.py --sheet /path/sheet.png --species trex --move light \
      --cols 8 --contact-frame 4 --contact-tip 812,204
  --cols 생략 시 투명 열 간격으로 자동 분할한다.

기준선 모드(현행 아트 실측, 같은 자):
  python3 scripts/gate-attack-sheet.py --manifest dev-art/species --clips light,strong,special \
      --out docs/attack-sheet-gate-baseline-20261106.md

실패하면 조용히 넘기지 않고 수치를 찍고 종료 코드 1을 돌려준다.
"""
import argparse
import glob
import json
import os
import sys

from PIL import Image

HEIGHT_TOL_PCT = 15.0
MIN_CELLS, MAX_CELLS = 6, 8
GAP_COLS = 3  # 자동 분할: 완전 투명 열 3개 이상이면 칸 경계


def opacity_mask(img):
    return img.getchannel('A').point(lambda v: 255 if v > 0 else 0)


def split_cells(img, cols=None, rows=None):
    """칸의 (left, right, top, bottom) 범위 목록. right/bottom은 배타.

    rows/cols 를 주면 균등 분할, 생략하면 완전 투명 행·열(3px 이상)으로 자동 분할.
    """
    w, h = img.size
    if cols and rows:
        if w % cols or h % rows:
            raise SystemExit(f"시트 {w}×{h} 가 {cols}×{rows}칸으로 나눠지지 않습니다")
        cw, ch = w // cols, h // rows
        return [(c * cw, (c + 1) * cw, r * ch, (r + 1) * ch)
                for r in range(rows) for c in range(cols)]

    px = img.load()
    col_on = [any(px[x, y][3] > 0 for y in range(h)) for x in range(w)]
    row_on = [any(px[x, y][3] > 0 for x in range(w)) for y in range(h)]

    def runs(flags):
        out, start, gap = [], None, 0
        for i, on in enumerate(flags):
            if on:
                if start is None:
                    start = i
                gap = 0
            elif start is not None:
                gap += 1
                if gap >= GAP_COLS:
                    out.append((start, i - gap + 1))
                    start, gap = None, 0
        if start is not None:
            out.append((start, len(flags)))
        return out

    cells = []
    for top, bottom in runs(row_on):
        for left, right in runs(col_on):
            # 이 행 띠 안에 실제로 픽셀이 있는 열만 남긴다
            if any(px[x, y][3] > 0 for x in range(left, right) for y in range(top, bottom)):
                cells.append((left, right, top, bottom))
    return cells


def palette_of(crop):
    """불투명 픽셀의 RGB 집합(정렬 튜플)."""
    px = crop.load()
    w, h = crop.size
    colors = set()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > 0:
                colors.add((r, g, b))
    return colors


def solid(crop):
    """alpha>0 픽셀 수 — 알파가 이진인지 확인하는 참고값."""
    return sum(1 for v in crop.getchannel('A').tobytes() if v)


def cell_metrics(img, left, right, top=0, bottom=None):
    bottom = img.size[1] if bottom is None else bottom
    crop = img.crop((left, top, right, bottom))
    bb = crop.getchannel('A').getbbox()
    if bb is None:
        return {'empty': True, 'h': 0, 'w': 0, 'palette': set(), 'bbox': None}
    x0, y0, x1, y1 = bb
    body = solid(crop)
    alpha_levels = len(set(crop.getchannel('A').tobytes()) - {0})
    return {
        'empty': False,
        'h': y1 - y0,
        'w': x1 - x0,
        'bbox': (left + x0, top + y0, left + x1, top + y1),
        'palette': palette_of(crop),
        'solid': body,
        'alpha_levels': alpha_levels,
    }


def load_master_palette(folder):
    path = os.path.join('dev-art/palettes', f'{folder}.json')
    if not os.path.exists(path):
        return None
    data = json.load(open(path))
    return {tuple(c) for c in data.get('p1', [])}


def gate(cells, master_palette=None, contact_frame=None, contact_tip=None,
         contact_px=None, label='', idle_ref=None):
    """4개 합격선 판정. 반환: (rows, failures, detail)"""
    failures = []
    n = len(cells)
    if not (MIN_CELLS <= n <= MAX_CELLS):
        failures.append(f"칸 수 {n} — 6~8칸이어야 함")

    heights = [c['h'] for c in cells if not c['empty']]
    empties = n - len(heights)
    if empties:
        failures.append(f"빈 칸 {empties}개")

    dev = 0.0
    if heights:
        hmax, hmin = max(heights), min(heights)
        dev = round((hmax - hmin) / hmax * 100, 1) if hmax else 0.0
        if dev > HEIGHT_TOL_PCT:
            failures.append(f"높이 편차 {dev}% ({hmin}~{hmax}px) — 15% 초과")

    sets = [frozenset(c['palette']) for c in cells if not c['empty']]
    union = set().union(*sets) if sets else set()
    same_palette = all(s == sets[0] for s in sets) if sets else False
    if not same_palette:
        per = [len(s) for s in sets]
        failures.append(f"칸별 팔레트 불일치 (칸별 색수 {per}, 합집합 {len(union)}색)")
    extra = sorted(union - master_palette) if master_palette else []
    if master_palette is not None and extra:
        failures.append(f"마스터 팔레트 밖 색 {len(extra)}개: {extra[:6]}")

    idle_delta = None
    if idle_ref:
        mean_h = sum(heights) / len(heights) if heights else 0
        idle_delta = round((mean_h - idle_ref) / idle_ref * 100, 1) if idle_ref else None

    contact_ok = None
    if contact_frame is not None:
        if not (1 <= contact_frame <= n):
            failures.append(f"접촉 프레임 {contact_frame} — 1~{n} 밖")
            contact_ok = False
        else:
            c = cells[contact_frame - 1]
            if contact_px is not None:
                contact_ok = contact_px(c)
                if not contact_ok:
                    failures.append(f"접촉 좌표 {contact_tip} 가 불투명 픽셀이 아님")
            else:
                contact_ok = True

    detail = {
        'label': label, 'cells': n, 'heights': heights, 'dev': dev,
        'colors': len(union), 'same_palette': same_palette,
        'extra_colors': extra, 'contact_frame': contact_frame,
        'contact_ok': contact_ok, 'idle_delta': idle_delta, 'idle_ref': idle_ref,
        'bands': [c['bbox'] for c in cells],
    }
    return detail, failures


def tip_checker(img, tip):
    x, y = tip

    def check(_cell):
        px = img.load()
        if 0 <= x < img.size[0] and 0 <= y < img.size[1] and px[x, y][3] > 0:
            return True
        # 3px 이내 불투명 픽셀이면 좌표 보정 안내
        for dy in range(-3, 4):
            for dx in range(-3, 4):
                nx, ny = x + dx, y + dy
                if 0 <= nx < img.size[0] and 0 <= ny < img.size[1] and img.load()[nx, ny][3] > 0:
                    return False
        return False
    return check


def fmt_heights(heights):
    return ' '.join(str(h) for h in heights)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--sheet')
    ap.add_argument('--species', help='폴더명(trex 등) — 마스터 팔레트 조회용')
    ap.add_argument('--move', default='?')
    ap.add_argument('--cols', type=int)
    ap.add_argument('--rows', type=int)
    ap.add_argument('--idle-ref', type=float, help='대기 자세 실루엣 높이(아트px)')
    ap.add_argument('--contact-frame', type=int)
    ap.add_argument('--contact-tip', help='시트 픽셀 좌표 x,y')
    ap.add_argument('--manifest', help='기준선 모드: dev-art/species (폴더)')
    ap.add_argument('--clips', default='light,strong,special')
    ap.add_argument('--out')
    args = ap.parse_args()

    lines, failed = [], 0

    if args.manifest:
        clips = args.clips.split(',')
        header = ['| 종 | 기술 | 칸 | 높이(px) | 클립 편차 | 대기 대비 | 색수 | 팔레트 동일 | 판정 |',
                  '| --- | --- | --- | --- | --- | --- | --- | --- | --- |']
        lines += ['# 공격 클립 시트 게이트 기준선 — 현행 납품 아트', '',
                  f'측정식: 편차(%) = (최대높이−최소높이)/최대높이×100 · 합격선 15% · 칸 6~8 · 팔레트 동일',
                  ''] + header
        for mpath in sorted(glob.glob(os.path.join(args.manifest, '*', 'manifest.json'))):
            folder = os.path.basename(os.path.dirname(mpath))
            man = json.load(open(mpath))
            sheet = Image.open(os.path.join(os.path.dirname(mpath), man['image'])).convert('RGBA')
            master = load_master_palette(folder)
            idx_path = os.path.join(args.manifest, 'index.json')
            idle_ref = None
            if os.path.exists(idx_path):
                s_idx = json.load(open(idx_path))['species'].get(folder)
                if s_idx:
                    idle_ref = sum(s_idx['idle']['h']) / 2
            by_clip = {}
            for fr in man['frames']:
                if fr['clip'] in clips:
                    by_clip.setdefault(fr['clip'], []).append(fr)
            for clip in clips:
                frames = by_clip.get(clip)
                if not frames:
                    continue
                cells = [cell_metrics(sheet, fr['x'], fr['x'] + fr['w'], fr['y'], fr['y'] + fr['h'])
                         for fr in frames]
                detail, fails = gate(cells, master, label=f"{folder} {clip}", idle_ref=idle_ref)
                verdict = 'PASS' if not fails else 'FAIL'
                if fails:
                    failed += 1
                pal = 'O' if detail['same_palette'] and not detail['extra_colors'] else 'X'
                lines.append(f"| {folder} | {clip} | {detail['cells']} | {fmt_heights(detail['heights'])} "
                             f"| {detail['dev']}% | {detail['idle_delta']:+.1f}% | {detail['colors']} | {pal} | {verdict} |")
        lines += ['', f'총 {failed}클립 FAIL / 36클립. '
                      '현행 아트는 기술당 4칸(안킬로 special 6칸)이라 칸 수 기준도 함께 FAIL이다 — '
                      '신규 납품은 6~8칸 시트 1장이어야 한다.', '']
        text = '\n'.join(lines)
        print(text)
        if args.out:
            os.makedirs(os.path.dirname(args.out), exist_ok=True)
            open(args.out, 'w').write(text)
        return 1 if failed else 0

    if not args.sheet:
        ap.error('--sheet 또는 --manifest 가 필요합니다')

    img = Image.open(args.sheet).convert('RGBA')
    cells = split_cells(img, args.cols, args.rows)
    metrics = [cell_metrics(img, l, r, t, b) for l, r, t, b in cells]
    master = load_master_palette(args.species) if args.species else None
    tip = tuple(int(v) for v in args.contact_tip.split(',')) if args.contact_tip else None
    detail, fails = gate(metrics, master, args.contact_frame, tip,
                         tip_checker(img, tip) if tip else None,
                         label=f"{args.species} {args.move}", idle_ref=args.idle_ref)

    print(f"시트: {args.sheet} {img.size[0]}×{img.size[1]}")
    print(f"칸 수: {detail['cells']} ({'6~8 OK' if MIN_CELLS <= detail['cells'] <= MAX_CELLS else 'FAIL'})")
    print(f"높이: {fmt_heights(detail['heights'])} → 편차 {detail['dev']}% "
          f"({'PASS' if detail['dev'] <= HEIGHT_TOL_PCT else 'FAIL'} ≤15%)")
    print(f"팔레트: {detail['colors']}색 · 클립 내 동일 {'PASS' if detail['same_palette'] else 'FAIL'}"
          + (f" · 마스터 밖 {len(detail['extra_colors'])}색" if master else ' · 마스터 팔레트 미지정'))
    if detail['idle_delta'] is not None:
        print(f"대기 대비: {detail['idle_delta']:+.1f}% (대기 {detail['idle_ref']:.0f}px)")
    if args.contact_frame is not None:
        print(f"접촉 프레임 {args.contact_frame}: {'PASS' if detail['contact_ok'] else 'FAIL'}"
              + (f" (팁 {tip})" if tip else ''))
    else:
        print('접촉 프레임: 미지정 — 접촉 프레임·좌표 표를 함께 내야 판정한다')
        fails.append('접촉 프레임 미지정')
    for f in fails:
        print(f"  FAIL — {f}")
    print('판정:', 'PASS' if not fails else 'FAIL')
    return 1 if fails else 0


if __name__ == '__main__':
    sys.exit(main())
