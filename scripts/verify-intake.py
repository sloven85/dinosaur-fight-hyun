#!/usr/bin/env python3
"""인테이크 검증기 — 전신 1프레임 아트가 들어올 때 게이트를 통과했는지 잰다.

게이트(마스터 확정 2026-10-29, 걷기는 2026-10-29 접촉 구간 기준으로 교체):
  1) 접지: 모든 프레임의 마지막 불투명 행 = 297 (아래 298행이 지면선).
  2) 앞끝 편차: 같은 클립 안 실루엣 앞끝(진행 방향 끝) x의 최대-최소 ≤ 3 아트px.
  3) idle bob: idle 클립 실루엣 높이 진폭 ≤ 아트 높이의 5% 그리고 ≤ 6 아트px.
  4) **걷기 접촉 게이트(교체)**: 프레임 x의 단순 차이 대신 접지점에 정체성을 붙여
     "접촉 중 후퇴"만 잰다. 스윙(발 들기·재착지) 프레임의 큰 x 이동은 감점하지 않는다.
     G2 접촉 후퇴 일정성(전부 양수·산포 ≤2아트px) / G3 지지 중 12아트px 초과 이동 금지.
  5) 고아 픽셀(불투명 연결성분 1), 팔레트 밖 색 0.

어긋나면 조용히 넘기지 않고 리포트에 FAIL로 찍고 종료 코드 1을 돌려준다.
접촉/스윙 상세 표는 `scripts/measure-walk-contact.py`가 같은 모듈로 출력한다.
사용: python3 scripts/verify-intake.py [--dir dev-art/species] [--species trex,stego]
"""
import argparse
import importlib.util
import json
import os
import statistics
import sys

from PIL import Image

GROUND_ROW = 297
FRONT_TOL = 3
BOB_ART_PX = 6
BOB_RATIO = 0.05
SOLE_JUMP = 12       # 참고값: 프레임 x 단순 차이의 최대(접촉/스윙을 구분하지 않은 옛 척도)
PALETTE_DIR = 'dev-art/palettes'

# 걷기 접촉 게이트는 measure-walk-contact.py 한 곳에서만 구현한다(같은 자로 재기 위해).
_spec = importlib.util.spec_from_file_location(
    'walkcontact', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'measure-walk-contact.py'))
walkcontact = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(walkcontact)

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
    # bob 한도는 **그림 크기**(artHeight) 기준이다 — 판정 키(displayHeight)와 분리됐다.
    heights = {r['id']: r.get('artHeight', r['displayHeight']) for r in
               json.load(open('src/data/characters.json'))['characters']}
    pick = [s for s in args.species.split(',') if s] or sorted(index['species'])

    failures = []
    print(f"{'종':9}{'접지':>10}{'앞끝 편차':>10}{'idle bob':>14}{'접촉(쌍/후퇴/산포)':>26}  판정")
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
        # ② 걷기 접촉 게이트 — 접지점에 정체성을 붙인다(스윙 프레임은 감점하지 않는다).
        walk = manifest['clips']['walk']['frames']
        files = []
        for i in walk:
            fr = manifest['frames'][i]
            crop = sheet.crop((fr['x'], fr['y'], fr['x'] + fr['w'], fr['y'] + fr['h']))
            files.append((fr.get('source', str(i)), crop,
                          (manifest['anchorX'] - fr['anchor']['x'], manifest['footY'] - fr['anchor']['y'])))
        gait = walkcontact.measure(files)
        # 옛 척도(프레임 x 단순 차이)는 참고 열로만 남긴다 — 접촉/스윙을 구분하지 않기 때문.
        sole_x = [rows[i]['sole'] for i in walk]
        jumps = [abs((b['x0'] + b['x1']) / 2 - (a['x0'] + a['x1']) / 2)
                 for a, b in zip(sole_x, sole_x[1:]) if a and b]
        worst_jump = max(jumps) if jumps else 0
        # 접지 게이트는 **땅에 서 있어야 하는 클립**에만 건다. jump·flail은 공중 포즈다.
        AIRBORNE = {'jump', 'flail'}
        grounded_idx = {i for st, clip in manifest['clips'].items() if st not in AIRBORNE
                        for i in clip['frames']}
        bad_ground = sum(1 for i, r in enumerate(rows) if i in grounded_idx and r['lastRow'] != GROUND_ROW)
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
        if not gait['gate']['G2_contactConstant']:
            notes.append(f"접촉후퇴 불일정({gait['retreats']})")
            failures.append((folder, '걷기 접촉 후퇴',
                             f"접촉 {gait['contactPairs']}쌍, 후퇴 {gait['retreats']} — "
                             f"전부 양수·산포 ≤{walkcontact.RETREAT_SPREAD}아트px 불성립"))
        if gait['slides']:
            notes.append(f"지지중 슬라이드 {len(gait['slides'])}건")
            failures.append((folder, '지지 중 슬라이드',
                             '같은 접지점이 두 프레임 연속 12아트px 초과 이동: '
                             + ', '.join(f"{s['from']}→{s['to']} Δ{s['dx']:+.0f}" for s in gait['slides'][:3])))
        if outside:
            notes.append(f'팔레트 밖 {len(outside)}색')
            failures.append((folder, '팔레트', f'{len(outside)}색 이탈(예: {outside[:3]})'))

        ground_cell = 'OK' if not bad_ground else f'{bad_ground} FAIL'
        contact_cell = (f"{gait['contactPairs']}/8 쌍 " +
                        ('-' if not gait['retreats'] else
                         f"{gait['retreats'][0]:+.1f}..{max(gait['retreats']):+.1f} 산포{gait['retreatSpread']:.1f}"))
        print(f"{folder:9}{ground_cell:>10}{f'{worst_front}px {worst_state}':>10}{f'{bob}px / {bob_limit:.1f}':>14}"
              f"{contact_cell:>26}  "
              f"{'PASS' if not notes else 'FAIL — ' + ', '.join(notes)}"
              f"   (참고 공격 앞끝 최대 {attack_front[0]}px {attack_front[1]}, 옛 x점프 {worst_jump:.0f})")

    # 걷기 접촉/스윙 상세 — 접지점 정체성·후퇴량·게이트 근거(같은 모듈).
    print('\n걷기 접촉 증거(접지점 track / 접촉 전이 후퇴량 / 스윙 프레임은 감점 없음)')
    for folder in pick:
        manifest = json.load(open(os.path.join(args.dir, folder, 'manifest.json')))
        sheet = Image.open(os.path.join(args.dir, folder, 'sheet.png')).convert('RGBA')
        files = []
        for i in manifest['clips']['walk']['frames']:
            fr = manifest['frames'][i]
            crop = sheet.crop((fr['x'], fr['y'], fr['x'] + fr['w'], fr['y'] + fr['h']))
            files.append((fr.get('source', str(i)), crop,
                          (manifest['anchorX'] - fr['anchor']['x'], manifest['footY'] - fr['anchor']['y'])))
        g = walkcontact.measure(files)
        tracks = ' · '.join(f"T{t['id']}{'*' if t['tail'] else ''}:{t['frames']}f/span{t['span']}" for t in g['tracks'])
        print(f'{folder:9} 접점 {len(g["tracks"])}개 [{tracks}]')
        print(f'{"":9} 전이 ' + (' · '.join(f"{c['from']}→{c['to']} Δ{c['dx']:+.0f}" for c in g['contacts']) or '없음')
              + f"  | 속도 제안 {g['proposedSpeed'] if g['proposedSpeed'] is not None else '계산 불가'} (승인 대기)")

    if failures:
        print('\n실패 목록')
        for folder, gate, why in failures:
            print(f'  - {folder}: {gate} — {why}')
        sys.exit(1)
    print('\n게이트 3개 전부 통과')


if __name__ == '__main__':
    main()
