#!/usr/bin/env python3
"""걷기 사이클을 **접촉/스윙으로 나눠** 지지점 후퇴량만 잰다 (마스터 지시 2026-10-29).

왜 이 스크립트가 필요한가
-------------------------
이전 게이트는 프레임마다 "지면 밴드의 클러스터"를 하나 골라 x를 비교했다. 그 값은 앞발이
새로 착지하면 크게 튄다(예: 208→279). 그 튐은 **미끄러짐이 아니라 스윙→재착지**일 수 있으므로,
프레임 x의 단순 차이로 미끄러짐을 판정하면 그림을 잘못 고치게 된다.

그래서 여기서는 **접지점에 정체성을 붙여** 잰다.
  1) 프레임마다 지면(마지막 불투명 행 297 + 그 위 1행)에 닿은 불투명 열 클러스터를 찾는다.
  2) 이웃 프레임의 클러스터를 x 근접(≤40아트px)으로 이어 **같은 접지점(track)** 으로 본다.
     · 같은 track이 두 프레임 연속 접지 = **접촉 전이** → 후퇴량 = x_i − x_{i+1} (뒤로 가면 +)
     · 프레임에서 사라지면 = **스윙(발 들기)** 또는 꼬리 들기
     · 새 track이 나타나면 = **재착지**
  3) 접촉 전이의 후퇴량만 모아 평균·산포를 내고, 프레임률로 게임px/s **제안값**을 계산한다.

주의 — 접지점은 발만이 아니다. 4족·긴꼬리 종은 꼬리 끝이 지면에 닿아 클러스터가 3개까지
나온다(reach가 몸 높이까지 올라가는 클러스터 = 꼬리 의심, reach>130). 표에 reach를 같이
남겨 어느 것이 발인지 사람이 확인할 수 있게 했다.

판정 규칙(게이트)
  G1 접지        : 걷기 전 프레임 마지막 불투명 행 = 297
  G2 접촉 후퇴 일정성 : 접촉 전이의 후퇴량이 전부 양수, 산포 ≤ 2아트px
  G3 지지 중 미끄러짐 : 같은 track이 두 프레임 연속 접지한 채 12아트px 초과 이동 = 발이 지지된
                        채 순간이동(스윙 프레임 없이 앞으로 튐)

사용:
  python3 scripts/measure-walk-contact.py --pkg /tmp/v6set [--json out.json]
"""
import argparse
import json
import os
import statistics
import sys

from PIL import Image

GROUND_ROW = 297
BAND_ROWS = 2
MATCH_RANGE = 40
SLIDE_LIMIT = 12
RETREAT_SPREAD = 2
ART_SCALE = 4
WALK_FPS = 12.0
TAIL_REACH = 130
SPECIES = ['trex', 'trike', 'velo', 'spino', 'anky', 'stego',
           'carno', 'pachy', 'theri', 'dilo', 'brachio', 'ptera']
LABEL = {'trex': '티라노', 'trike': '트리케라', 'velo': '벨로키', 'spino': '스피노', 'anky': '안킬로',
         'stego': '스테고', 'carno': '카르노', 'pachy': '파키', 'theri': '테리지노', 'dilo': '딜로포',
         'brachio': '브라키오', 'ptera': '프테라'}


def ground_clusters(im):
    """지면 밴드에 닿은 불투명 열 클러스터. reach = 클러스터 위로 이어진 세로 길이."""
    alpha = im.getchannel('A')
    w, _h = im.size
    px = alpha.load()
    bbox = alpha.getbbox()
    if bbox is None:
        return None, []
    bottom = bbox[3] - 1
    columns = [x for x in range(w)
               if any(px[x, y] > 0 for y in range(max(0, bottom - BAND_ROWS + 1), bottom + 1))]
    groups = []
    for x in columns:
        if groups and x - groups[-1][1] <= 1:
            groups[-1][1] = x
        else:
            groups.append([x, x])
    out = []
    for x0, x1 in groups:
        reach = 0
        y = bottom
        while y >= 0 and any(px[xx, y] > 0 for xx in range(x0, x1 + 1)):
            reach += 1
            y -= 1
        out.append({'x0': x0, 'x1': x1, 'cx': (x0 + x1) / 2, 'w': x1 - x0 + 1,
                    'reach': reach, 'tail': reach > TAIL_REACH})
    return bottom, out


def build_tracks(walk):
    """이웃 프레임 클러스터를 x 근접으로 이어 track을 만든다."""
    tracks = []
    active = []      # 마지막 프레임에서 살아 있는 track 인덱스
    for i, fr in enumerate(walk):
        fresh = []
        taken = set()
        for c in fr['clusters']:
            best, best_d = None, None
            for ti in active:
                if ti in taken:
                    continue
                last = tracks[ti]['points'][-1]
                d = abs(c['cx'] - last['cx'])
                if d <= MATCH_RANGE and (best_d is None or d < best_d):
                    best, best_d = ti, d
            if best is None:
                tracks.append({'points': []})
                best = len(tracks) - 1
            taken.add(best)
            tracks[best]['points'].append({'frame': i, 'cx': c['cx'], 'w': c['w'], 'reach': c['reach'],
                                           'tail': c['tail']})
            fresh.append(best)
        active = fresh
    for n, t in enumerate(tracks):
        t['id'] = n
    return tracks


def measure(files):
    """files = [(이름, 이미지)] 또는 [(이름, 이미지, (셀x오프셋, 셀y오프셋))].

    시트 크롭으로 잴 때는 오프셋으로 셀 좌표를 복원한다(프레임마다 크롭 원점이 다르므로
    오프셋 없이 비교하면 발 x가 어긋난다). 패키지 원본 셀은 오프셋 0.
    """
    walk = []
    for item in files:
        name, im = item[0], item[1]
        xoff, yoff = item[2] if len(item) > 2 else (0, 0)
        bottom, clusters = ground_clusters(im)
        for c in clusters:
            c['x0'] += xoff; c['x1'] += xoff; c['cx'] += xoff
        walk.append({'frame': name, 'bottom': None if bottom is None else bottom + yoff,
                     'clusters': clusters})
    tracks = build_tracks(walk)

    contacts, slides = [], []
    for t in tracks:
        pts = t['points']
        for a, b in zip(pts, pts[1:]):
            if b['frame'] != a['frame'] + 1:
                continue
            dx = a['cx'] - b['cx']
            contacts.append({'track': t['id'], 'from': a['frame'], 'to': b['frame'],
                             'dx': round(dx, 1), 'tail': b['tail']})
            if abs(dx) > SLIDE_LIMIT:
                slides.append({'track': t['id'], 'from': a['frame'], 'to': b['frame'], 'dx': round(dx, 1)})

    feet_contacts = [c for c in contacts if not c['tail']]
    retreats = [c['dx'] for c in feet_contacts]
    spread = (max(retreats) - min(retreats)) if len(retreats) > 1 else 0.0
    ground_ok = all(w['bottom'] == GROUND_ROW for w in walk)
    g2 = bool(retreats) and min(retreats) > 0 and spread <= RETREAT_SPREAD
    return {
        'groundOk': ground_ok,
        'frames': [{'frame': w['frame'], 'bottom': w['bottom'],
                    'points': [{'cx': round(c['cx'], 1), 'w': c['w'], 'reach': c['reach'],
                                'tail': c['tail']} for c in w['clusters']]} for w in walk],
        'tracks': [{'id': t['id'], 'points': [{'frame': p['frame'], 'cx': round(p['cx'], 1)} for p in t['points']],
                    'span': round(max(p['cx'] for p in t['points']) - min(p['cx'] for p in t['points']), 1),
                    'frames': len(t['points']), 'tail': t['points'][0]['tail']} for t in tracks],
        'contacts': contacts,
        'retreats': retreats,
        'retreatMedian': round(statistics.median(retreats), 2) if retreats else None,
        'retreatSpread': round(spread, 1),
        'slides': slides,
        'contactPairs': len(feet_contacts),
        'sustainedFeet': sum(1 for t in tracks if not t['points'][0]['tail'] and len(t['points']) >= 2),
        'gate': {'G1_ground': ground_ok, 'G2_contactConstant': g2, 'G3_noSlideWhileGrounded': not slides},
        'pass': bool(ground_ok and g2 and not slides),
        'proposedSpeed': (round(statistics.median([r for r in retreats if 0 < r <= SLIDE_LIMIT]) * ART_SCALE * WALK_FPS, 1)
                          if any(0 < r <= SLIDE_LIMIT for r in retreats) else None),
    }


def load_pkg(pkg):
    out = {}
    for sp in SPECIES:
        d = os.path.join(pkg, sp, 'frames')
        if not os.path.isdir(d):
            continue
        files = sorted(f for f in os.listdir(d) if f.startswith('walk_') and f.endswith('.png'))
        out[sp] = [(f, Image.open(os.path.join(d, f)).convert('RGBA')) for f in files]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--pkg', required=True)
    ap.add_argument('--json', default='')
    args = ap.parse_args()
    frames = load_pkg(args.pkg)
    if not frames:
        sys.exit(f'{args.pkg} 에서 걷기 프레임을 찾지 못했습니다.')
    result = {'artScale': ART_SCALE, 'walkFps': WALK_FPS, 'pkg': args.pkg, 'species': {}}
    print(f"{'종':10}{'접점tracks':>10}{'연속접촉쌍':>10}{'접촉후퇴(아트px)':>26}{'산포':>7}{'슬라이드':>8}  판정")
    for sp in SPECIES:
        if sp not in frames:
            continue
        m = measure(frames[sp])
        result['species'][sp] = m
        r = '-' if not m['retreats'] else f"{m['retreats']} 중앙{m['retreatMedian']}"
        print(f"{LABEL[sp]:10}{len(m['tracks']):>10}{m['contactPairs']:>10}{r:>26}"
              f"{m['retreatSpread']:>7}{len(m['slides']):>8}  {'PASS' if m['pass'] else 'FAIL'}")

    print('\n[프레임별 접지점] x(아트px)·reach 세로길이, *꼬리 의심(reach>130)')
    for sp in SPECIES:
        if sp not in result['species']:
            continue
        m = result['species'][sp]
        cells = []
        for fr in m['frames']:
            pts = ' '.join(f"{int(p['cx'])}{'*' if p['tail'] else ''}({p['reach']})" for p in fr['points'])
            cells.append(f"{fr['frame'].replace('walk_', '').replace('.png', '')}: {pts}")
        print(f"  {LABEL[sp]:10} " + ' | '.join(cells))

    print('\n[track] 같은 접지점으로 이어진 x 계열 — span = 접지 중 이동폭')
    for sp in SPECIES:
        if sp not in result['species']:
            continue
        m = result['species'][sp]
        print(f"  {LABEL[sp]:10} " + ' · '.join(
            f"T{t['id']}{'*' if t['tail'] else ''}:{t['frames']}프레임 span{t['span']}" for t in m['tracks']))

    print('\n[접촉 전이] 같은 track 두 프레임 연속 — 후퇴량 부호 +면 뒤로')
    for sp in SPECIES:
        if sp not in result['species']:
            continue
        m = result['species'][sp]
        txt = ' · '.join(f"{c['from']}→{c['to']} Δ{c['dx']:+.0f}" + ('*' if c['tail'] else '') for c in m['contacts'])
        print(f"  {LABEL[sp]:10} " + (txt or '연속 접촉 쌍 없음'))

    print('\n[속도 제안값] 접촉 후퇴 중앙값 × 4게임px × 12fps — **적용 아님, 마스터 승인 대기**')
    for sp in SPECIES:
        if sp not in result['species']:
            continue
        m = result['species'][sp]
        val = '계산 불가(연속 접지 후퇴 없음)' if m['proposedSpeed'] is None else f"{m['proposedSpeed']:.0f} 게임px/s"
        print(f"  {LABEL[sp]:10} {val}")

    if args.json:
        with open(args.json, 'w') as f:
            json.dump(result, f, ensure_ascii=False, indent=1)
        print(f'\nJSON: {args.json}')


if __name__ == '__main__':
    main()
