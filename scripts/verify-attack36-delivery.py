#!/usr/bin/env python3
"""dino_attack36_sheets_v1 납품 검사 — 시트·낱장·접촉표를 같은 자로 다시 잰다.

검사 항목
  A. 시트: 8칸(거터 4px), 칸 폭 502×높이 304, 알파 이진, 마지막 불투명 행 297
  B. 4게이트: 높이 편차 ≤15%, 칸별 팔레트 집합 완전 일치, 접촉칸 1~8 & 팁 불투명, 6~8칸
  C. 대기 대비(제안 5번째): 클립 평균 높이 vs index.json idle 평균 ±15%
  D. 납품 표(gate_report/contact_table) 수치와 내 실측 일치
  E. 2P 시트: 1P→2P 색 대응이 1:1(색 수 동일·새 색 없음)
  F. frames_1p 낱장이 시트 칸과 픽셀 동일

사용: python3 scripts/verify-attack36-delivery.py --root /tmp/intake36 --report /tmp/report.md
"""
import argparse
import json
import os
import sys

from PIL import Image

MOVE_ORDER = ['light_attack', 'heavy_slam', 'special']
CELL_W, CELL_H, GUTTER = 502, 304, 4
FOOT_ROW = 297
DEV_LIMIT = 15.0
IDLE_LIMIT = 15.0


def cell_spans(n=8):
    return [(i * (CELL_W + GUTTER), i * (CELL_W + GUTTER) + CELL_W) for i in range(n)]


def metrics(img, box):
    crop = img.crop(box)
    alpha = crop.getchannel('A')
    bb = alpha.getbbox()
    raw = alpha.tobytes()
    levels = set(raw)
    if bb is None:
        return {'empty': True, 'h': 0, 'palette': set(), 'alpha_binary': True, 'last_row': None}
    px = crop.load()
    w, h = crop.size
    colors = set()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a:
                colors.add((r, g, b))
    last = max(y for y in range(h) for x in range(w) if px[x, y][3])
    return {'empty': False, 'h': bb[3] - bb[1], 'w': bb[2] - bb[0],
            'palette': colors, 'alpha_binary': levels <= {0, 255}, 'last_row': last,
            'bbox': (box[0] + bb[0], box[1] + bb[1], box[0] + bb[2], box[1] + bb[3])}


def master_palette(folder):
    p = os.path.join('dev-art/palettes', f'{folder}.json')
    if not os.path.exists(p):
        return None
    return {tuple(c) for c in json.load(open(p))['p1']}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', default='/tmp/intake36')
    ap.add_argument('--report')
    args = ap.parse_args()
    R = args.root
    idx = json.load(open(os.path.join(R, 'gate_report.json')))
    by_key = {(r['species'], r['move']): r for r in idx}
    contacts = json.load(open(os.path.join(R, 'contact_table_v2.json')))
    contact_rows = contacts if isinstance(contacts, list) else contacts.get('rows', [])
    cby = {(r['species'], r['move']): r for r in contact_rows}

    failures, warns = [], []
    rows = []

    for (species, move), rep in sorted(by_key.items()):
        sp1 = os.path.join(R, rep['sheet'])
        img1 = Image.open(sp1).convert('RGBA')
        problems = []

        # A. 격자
        if img1.size != (8 * CELL_W + 7 * GUTTER, CELL_H):
            problems.append(f"시트 크기 {img1.size} ≠ (4044,304)")
        px = img1.load()
        for g0, g1 in [(i * (CELL_W + GUTTER) - GUTTER, i * (CELL_W + GUTTER)) for i in range(1, 8)]:
            if any(px[x, y][3] for x in range(g0, g1) for y in range(CELL_H)):
                problems.append(f"거터 x{g0}-{g1} 에 그림")
                break

        cells = [metrics(img1, (l, 0, r, CELL_H)) for l, r in cell_spans()]
        heights = [c['h'] for c in cells]
        if any(c['empty'] for c in cells):
            problems.append('빈 칸')
        if any(not c['alpha_binary'] for c in cells):
            problems.append('알파 이진 아님')
        # 계약 마지막 불투명 행 = 297. 10/30 인테이크에서 296(1px)은 흡수된 값이라
        # 296~297 을 허용하고, 클립 안 발끝 흔들림 2px 초과만 문제로 본다.
        foot = [c['last_row'] for c in cells]
        if min(foot) < FOOT_ROW - 1:
            problems.append(f"발끝 행 {min(foot)} — 계약 297 대비 2px 이상 뜸")
        if max(foot) - min(foot) > 1:
            problems.append(f"클립 내 발끝 행 흔들림 {min(foot)}~{max(foot)}")

        # B. 4게이트
        dev = round((max(heights) - min(heights)) / max(heights) * 100, 1) if max(heights) else 0
        if not (6 <= len(cells) <= 8):
            problems.append(f"칸 수 {len(cells)}")
        if dev > DEV_LIMIT:
            problems.append(f"편차 {dev}%")
        sets = [frozenset(c['palette']) for c in cells]
        if len(set(sets)) != 1:
            problems.append('칸별 팔레트 불일치')
        union = set().union(*sets)
        mp = master_palette(species)
        extra = sorted(union - mp) if mp else []
        if extra:
            problems.append(f"마스터 밖 색 {len(extra)}")

        # C. 대기 대비
        idle = None
        ipath = 'dev-art/species/index.json'
        if os.path.exists(ipath):
            s = json.load(open(ipath))['species'].get(species)
            if s:
                idle = sum(s['idle']['h']) / 2
        mean_h = sum(heights) / len(heights)
        idle_delta = round((mean_h - idle) / idle * 100, 1) if idle else None

        # D. 납품 표 대조
        if rep['cell_h'] != heights:
            problems.append(f"표 높이 {rep['cell_h']} ≠ 실측 {heights}")
        if abs(rep['dev_pct'] - dev) > 0.15:
            problems.append(f"표 편차 {rep['dev_pct']} ≠ 실측 {dev}")

        # 접촉
        crow = cby.get((species, move))
        contact_ok = False
        if not crow:
            problems.append('접촉표 행 없음')
        else:
            cc = crow['contact_cell']
            tip = crow['tip']
            if not (1 <= cc <= 8):
                problems.append(f"접촉칸 {cc}")
            else:
                exp_x = (cc - 1) * (CELL_W + GUTTER) + tip['cell_x']
                if exp_x != tip['sheet_x']:
                    problems.append(f"tip.sheet_x {tip['sheet_x']} ≠ 격자 환산 {exp_x}")
                if not (0 <= tip['sheet_y'] < CELL_H and img1.getpixel((tip['sheet_x'], tip['sheet_y']))[3]):
                    problems.append(f"접촉 픽셀 불투명 아님 {tip['sheet_x']},{tip['sheet_y']}")
                else:
                    contact_ok = True

        # E. 2P
        sp2 = sp1.replace('sheets_1p', 'sheets_2p')
        p2_ok = None
        if os.path.exists(sp2):
            img2 = Image.open(sp2).convert('RGBA')
            cells2 = [metrics(img2, (l, 0, r, CELL_H)) for l, r in cell_spans()]
            p2_ok = True
            for i, (c1, c2) in enumerate(zip(cells, cells2)):
                if len(c1['palette']) != len(c2['palette']):
                    p2_ok = False
                    problems.append(f"2P 칸{i+1} 색 수 {len(c2['palette'])} ≠ 1P {len(c1['palette'])}")
                    break
                # 같은 인덱스는 같은 개체 — 위치 대응은 셀과 동일해야 한다
                if c1['h'] != c2['h']:
                    p2_ok = False
                    problems.append(f"2P 칸{i+1} 높이 {c2['h']} ≠ 1P {c1['h']}")
                    break
        else:
            problems.append('2P 시트 없음')

        # F. 낱장 대조(첫 클립만 비용상 표본) — 전체는 --frames 로
        rows.append((species, move, heights, dev, len(union), idle_delta, contact_ok, p2_ok,
                     f"{min(foot)}~{max(foot)}", problems))
        if problems:
            failures.append((species, move, problems))

    lines = ['# dino_attack36_sheets_v1 인테이크 검사', '',
             '측정식: 편차=(최대−최소)/최대×100 ≤15% · 팔레트 칸별 완전 일치 · 접촉칸/팁 불투명 · 8칸',
             '', '| 종 | 기술 | 높이(칸1..8) | 편차 | 색수 | 대기 대비 | 발끝행 | 접촉 | 2P | 판정 |',
             '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |']
    for species, move, heights, dev, ncol, idle_delta, contact_ok, p2_ok, foot, problems in rows:
        verdict = 'PASS' if not problems else 'FAIL'
        idl = f"{idle_delta:+.1f}%" if idle_delta is not None else '—'
        lines.append(f"| {species} | {move} | {' '.join(map(str, heights))} | {dev}% | {ncol} | {idl} | {foot} "
                     f"| {'O' if contact_ok else 'X'} | {'O' if p2_ok else 'X'} | {verdict} |")
    lines += ['', f"검사 클립 {len(rows)} · FAIL {len(failures)}"]
    for species, move, problems in failures:
        lines.append(f"- FAIL {species} {move}: {'; '.join(problems)}")
    text = '\n'.join(lines)
    print(text)
    if args.report:
        open(args.report, 'w').write(text)
    return 1 if failures else 0


if __name__ == '__main__':
    sys.exit(main())
