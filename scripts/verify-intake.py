#!/usr/bin/env python3
"""인테이크 검증기 — 전신 1프레임 아트가 들어올 때 게이트 3개를 통과했는지 잰다.

게이트(마스터 확정 2026-10-29):
  1) 접지: 모든 프레임의 마지막 불투명 행 = 297 (아래 298행이 지면선).
  2) 앞끝 편차: 같은 클립 안 실루엣 앞끝(진행 방향 끝) x의 최대-최소 ≤ 3 아트px.
  3) idle bob: idle 클립 실루엣 높이 진폭 ≤ displayHeight의 5% 그리고 ≤ 6 아트px.

어긋나면 조용히 넘기지 않고 리포트에 FAIL로 찍고 종료 코드 1을 돌려준다.
사용: python3 scripts/verify-intake.py [--dir dev-art/species] [--species trex,stego]
"""
import argparse
import json
import os
import statistics
import sys

from PIL import Image

GROUND_ROW = 297
FRONT_TOL = 3
BOB_ART_PX = 6
BOB_RATIO = 0.05
SOLE_JUMP = 12       # 프레임 간 접지발 이동 상한(아트px) — 순간이동 검출
PALETTE_DIR = 'dev-art/palettes'

# 아티스트 폴더 → 게임 캐릭터 id
SPECIES_IDS = {
    'trex': 'tyrannosaurus', 'trike': 'triceratops', 'velo': 'velociraptor', 'spino': 'spinosaurus',
    'anky': 'ankylosaurus', 'stego': 'stegosaurus', 'carno': 'carnotaurus', 'pachy': 'pachycephalosaurus',
    'theri': 'therizinosaurus', 'dilo': 'dilophosaurus', 'brachio': 'brachiosaurus', 'ptera': 'pteranodon',
}


def frame_metrics(sheet, frame, anchor_x=251, foot_y=298):
    """셀 좌표(502×304)로 환산해 잰다. 시트는 bbox 크롭이라 시트 좌표만으로는 셀을 알 수 없다.

    manifest의 anchor는 `anchor = (anchorX - bbox.x, footY - bbox.y)`이므로
    bbox 원점을 역산해 프레임의 셀 위치를 복원한다.
    """
    cell_left = anchor_x - frame['anchor']['x']
    cell_top = foot_y - frame['anchor']['y']
    box = (frame['x'], frame['y'], frame['x'] + frame['w'], frame['y'] + frame['h'])
    crop = sheet.crop(box)
    bb = crop.getchannel('A').getbbox()
    if bb is None:
        return None
    x0, y0, x1, y1 = bb
    band = crop.crop((0, max(0, y1 - 3), frame['w'], y1))
    band_bb = band.getchannel('A').getbbox()
    sole = None if band_bb is None else {
        'x0': cell_left + band_bb[0], 'x1': cell_left + band_bb[2],
    }
    return {
        'h': y1 - y0,
        'w': x1 - x0,
        'front': cell_left + x1,          # 진행 방향(오른쪽) 끝 — 셀 좌표
        'lastRow': cell_top + y1 - 1,     # 마지막 불투명 행 — 셀 좌표(지면선 298의 바로 위가 297)
        'sole': sole,
    }


def components(crop):
    """불투명 픽셀의 연결 성분 개수(4-이웃). 고아 픽셀 검출용."""
    alpha = crop.getchannel('A')
    w, h = crop.size
    px = alpha.load()
    seen = [[False] * w for _ in range(h)]
    count = 0
    for y in range(h):
        for x in range(w):
            if px[x, y] == 0 or seen[y][x]:
                continue
            count += 1
            stack = [(x, y)]
            seen[y][x] = True
            while stack:
                cx, cy = stack.pop()
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and px[nx, ny] > 0:
                        seen[ny][nx] = True
                        stack.append((nx, ny))
    return count


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dir', default='dev-art/species')
    ap.add_argument('--species', default='')
    args = ap.parse_args()

    index = json.load(open(os.path.join(args.dir, 'index.json')))
    heights = {r['id']: r['displayHeight'] for r in
               json.load(open('src/data/characters.json'))['characters']}
    pick = [s for s in args.species.split(',') if s] or sorted(index['species'])

    failures = []
    print(f"{'종':9}{'접지':>14}{'앞끝 편차':>12}{'idle bob':>16}  판정")
    for folder in pick:
        manifest = json.load(open(os.path.join(args.dir, folder, 'manifest.json')))
        sheet = Image.open(os.path.join(args.dir, folder, 'sheet.png')).convert('RGBA')
        character = manifest['character']
        display = heights.get(character, 0)

        rows = [frame_metrics(sheet, f, manifest['anchorX'], manifest['footY'])
                for f in manifest['frames']]
        crops = [sheet.crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h'])) for f in manifest['frames']]
        # ① 고아 픽셀: 프레임마다 불투명 성분이 1개여야 한다.
        multi = [i for i, c in enumerate(crops) if components(c) != 1]
        # ③ 팔레트 밖 색: 아티스트 팔레트가 있으면 그 표에 있는 색만 허용.
        palette_path = os.path.join(PALETTE_DIR, f'{folder}.json')
        outside = []
        if os.path.exists(palette_path):
            palette = json.load(open(palette_path))
            allowed = {tuple(c) for c in palette['p1']}
            used = {px[:3] for px in sheet.getdata() if px[3] > 0}
            outside = sorted(used - allowed)
        # ② 프레임 간 접지발 이동: 걷기 클립에서 이웃 프레임 간 이동이 상한을 넘으면 순간이동.
        walk = manifest['clips']['walk']['frames']
        sole_x = [rows[i]['sole'] for i in walk]
        jumps = []
        for a, b in zip(sole_x, sole_x[1:]):
            if a is None or b is None:
                continue
            jumps.append(abs((b['x0'] + b['x1']) / 2 - (a['x0'] + a['x1']) / 2))
        worst_jump = max(jumps) if jumps else 0
        bad_ground = sum(1 for r in rows if r['lastRow'] != GROUND_ROW)
        notes = []

        # 2) 앞끝 편차 — 클립별로 잰다(포즈가 바뀌면 앞끝도 바뀌는 게 정상).
        # 앞끝 게이트는 직립 실루엣(idle·walk)에만 건다. 공격은 돌진·휘두름으로 앞끝이
        # 실제로 나가야 하므로 참고값으로만 찍는다.
        front_spread = {}
        for state, clip in manifest['clips'].items():
            fronts = [rows[i]['front'] for i in clip['frames']]
            front_spread[state] = max(fronts) - min(fronts)
        gated = [s for s in ('idle', 'walk') if s in front_spread]
        worst_state = max(gated, key=lambda k: front_spread[k])
        worst_front = front_spread[worst_state]
        attack_front = max((v, k) for k, v in front_spread.items() if k not in ('idle', 'walk'))

        # 3) idle bob
        idle = [rows[i]['h'] for i in manifest['clips']['idle']['frames']]
        bob = max(idle) - min(idle)
        bob_limit = min(BOB_ART_PX, display / 4 * BOB_RATIO)
        bob_ok = bob <= bob_limit + 1e-9

        if bad_ground:
            notes.append(f'접지 이탈 {bad_ground}프레임')
            failures.append((folder, '접지', f'{bad_ground}프레임이 {GROUND_ROW} 아님'))
        if worst_front > FRONT_TOL:
            notes.append(f'앞끝 {worst_front}px({worst_state})')
            failures.append((folder, '앞끝', f'{worst_state} 편차 {worst_front} > {FRONT_TOL}'))
        if not bob_ok:
            notes.append(f'bob {bob}px > {bob_limit:.1f}')
            failures.append((folder, 'idle bob', f'{bob}px > {bob_limit:.1f}px'))
        if multi:
            notes.append(f'고아 {len(multi)}프레임')
            failures.append((folder, '연결성분', f'{len(multi)}프레임이 성분 2개 이상(예: {multi[:5]})'))
        if worst_jump > SOLE_JUMP:
            notes.append(f'접지발 점프 {worst_jump:.0f}px')
            failures.append((folder, '접지발 이동', f'최대 {worst_jump:.0f}px > {SOLE_JUMP}'))
        if outside:
            notes.append(f'팔레트 밖 {len(outside)}색')
            failures.append((folder, '팔레트', f'{len(outside)}색 이탈(예: {outside[:3]})'))

        ground_cell = 'OK' if not bad_ground else f'{bad_ground} FAIL'
        print(f"{folder:9}{ground_cell:>14}{f'{worst_front}px {worst_state}':>12}{f'{bob}px / {bob_limit:.1f}':>16}  "
              f"{'PASS' if not notes else 'FAIL — ' + ', '.join(notes)}"
              f"   (참고 공격 앞끝 최대 {attack_front[0]}px {attack_front[1]})")

    # 접지발 x 표(미끄러짐 판정용) — 걷기 클립.
    print('\n걷기 접지발 x(프레임 순, 아트px / 프레임 내 좌표)')
    for folder in pick:
        manifest = json.load(open(os.path.join(args.dir, folder, 'manifest.json')))
        sheet = Image.open(os.path.join(args.dir, folder, 'sheet.png')).convert('RGBA')
        rows = [frame_metrics(sheet, f, manifest['anchorX'], manifest['footY'])
                for f in manifest['frames']]
        crops = [sheet.crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h'])) for f in manifest['frames']]
        # ① 고아 픽셀: 프레임마다 불투명 성분이 1개여야 한다.
        multi = [i for i, c in enumerate(crops) if components(c) != 1]
        # ③ 팔레트 밖 색: 아티스트 팔레트가 있으면 그 표에 있는 색만 허용.
        palette_path = os.path.join(PALETTE_DIR, f'{folder}.json')
        outside = []
        if os.path.exists(palette_path):
            palette = json.load(open(palette_path))
            allowed = {tuple(c) for c in palette['p1']}
            used = {px[:3] for px in sheet.getdata() if px[3] > 0}
            outside = sorted(used - allowed)
        # ② 프레임 간 접지발 이동: 걷기 클립에서 이웃 프레임 간 이동이 상한을 넘으면 순간이동.
        walk = manifest['clips']['walk']['frames']
        sole_x = [rows[i]['sole'] for i in walk]
        jumps = []
        for a, b in zip(sole_x, sole_x[1:]):
            if a is None or b is None:
                continue
            jumps.append(abs((b['x0'] + b['x1']) / 2 - (a['x0'] + a['x1']) / 2))
        worst_jump = max(jumps) if jumps else 0
        walk = manifest['clips']['walk']['frames']
        soles = []
        for i in walk:
            sole = rows[i]['sole']
            soles.append(None if sole is None else round((sole['x0'] + sole['x1']) / 2))
        print(f'{folder:9} {soles}')

    if failures:
        print('\n실패 목록')
        for folder, gate, why in failures:
            print(f'  - {folder}: {gate} — {why}')
        sys.exit(1)
    print('\n게이트 3개 전부 통과')


if __name__ == '__main__':
    main()
