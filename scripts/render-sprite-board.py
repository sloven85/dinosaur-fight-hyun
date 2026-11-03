#!/usr/bin/env python3
"""납품된 12종 시트를 그대로 읽어 (1) 상태 보드 PNG, (2) 손교정 계측표(MD/CSV)를 만든다.

보드는 게임이 재생하는 것과 같은 등록 규칙(anchor/footY)으로 그린다. 즉 보드에서
발이 선 아래로 내려가 있으면 게임에서도 그만큼 떠 있거나 파고든 것이다.

사용: python3 scripts/render-sprite-board.py --art dev-art/species --out <dir>
"""
import argparse
import json
import os

from PIL import Image, ImageDraw

STATES = [('idle', '대기'), ('walk', '걷기'), ('jump', '점프'), ('light', '약'), ('strong', '강'),
          ('special', '특수'), ('hit', '피격'), ('flail', '공중버둥'), ('down', '다운'), ('victory', '승리')]
FOOT_Y = 298
ANCHOR_X = 251
THRESHOLD = {'w': 2, 'h': 6, 'x': 2}


def load(folder, art):
    with open(os.path.join(art, folder, 'manifest.json')) as f:
        m = json.load(f)
    img = Image.open(os.path.join(art, folder, m['image'])).convert('RGBA')
    return m, img


def metrics(m):
    """프레임별 실루엣 폭·높이·몸 중심 x·접지 하단(셀 좌표) 편차."""
    out = {}
    for state, _ in STATES:
        clip = m['clips'][state]
        rows = [m['frames'][i] for i in clip['frames']]
        w = [f['w'] for f in rows]
        h = [f['h'] for f in rows]
        # 몸 중심: (그림 왼쪽 + 폭/2)를 셀 기준 x로 되돌린 뒤 251과 비교
        cx = [(ANCHOR_X - f['anchor']['x']) + f['w'] / 2 - ANCHOR_X for f in rows]
        # 접지 하단: 잘라낸 그림의 맨 아래가 셀에서 몇 행인지
        sole = [FOOT_Y - f['anchor']['y'] + f['h'] for f in rows]
        out[state] = {
            'frames': len(rows),
            'w': [min(w), max(w)], 'dw': max(w) - min(w),
            'h': [min(h), max(h)], 'dh': max(h) - min(h),
            'cx': [min(cx), max(cx)], 'dx': max(cx) - min(cx),
            'sole': [min(sole), max(sole)], 'dsole': max(sole) - min(sole),
            'soleOff': max(abs(s - FOOT_Y) for s in sole),
        }
    return out


def draw_board(folders, art, out, states, name):
    """셀 크기를 계약 그대로(502×304) 써서 자르거나 줄이지 않고 한 프레임씩 붙인다."""
    cell_w, cell_h = 502, 304
    head = 24
    cols = len(states)
    width = 90 + cols * cell_w
    height = head + len(folders) * cell_h + 8
    board = Image.new('RGB', (width, height), (24, 32, 40))
    d = ImageDraw.Draw(board)
    for c, (state, label) in enumerate(states):
        d.text((90 + c * cell_w + 10, 6), f'{label} ({state})', fill=(220, 230, 240))
    for r, folder in enumerate(folders):
        m, img = load(folder, art)
        y0 = head + r * cell_h
        row_ground = y0 + FOOT_Y - 4
        d.text((6, y0 + cell_h // 2 - 6), m['name'][:9], fill=(180, 200, 215))
        d.text((6, y0 + cell_h // 2 + 6), folder, fill=(110, 130, 148))
        d.line([(88, row_ground), (width, row_ground)], fill=(70, 90, 108))
        d.line([(0, y0 + cell_h - 1), (width, y0 + cell_h - 1)], fill=(40, 52, 64))
        for c, (state, _) in enumerate(states):
            clip = m['clips'][state]
            idx = clip['frames'][len(clip['frames']) // 2]
            f = m['frames'][idx]
            crop = img.crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h']))
            cx = 90 + c * cell_w + ANCHOR_X
            left = cx - f['anchor']['x']
            top = row_ground - f['anchor']['y']
            board.paste(crop, (int(left), int(top)), crop)
            d.line([(90 + c * cell_w, y0), (90 + c * cell_w, y0 + cell_h)], fill=(40, 52, 64))
            # 발 기준점 표식(게임이 맞추는 바로 그 점)
            d.line([(cx - 3, row_ground), (cx + 3, row_ground)], fill=(255, 120, 120))
    path = os.path.join(out, name)
    board.save(path)
    print('board', path, board.size)


def write_table(folders, art, out):
    rows = []
    lines = ['| 종 | 상태 | 프레임 | 폭 편차 | 높이 편차 | x 흔들림 | 접지 하단 | 판정 |',
             '| --- | --- | --- | --- | --- | --- | --- | --- |']
    for folder in folders:
        m, _ = load(folder, art)
        mm = metrics(m)
        for state, label in [('idle', '대기'), ('walk', '걷기')]:
            v = mm[state]
            ok = v['dw'] <= THRESHOLD['w'] and v['dh'] <= THRESHOLD['h'] and v['dx'] <= THRESHOLD['x'] and v['soleOff'] <= 1
            lines.append(f"| {m['name']} | {label} | {v['frames']} | {v['dw']}px | {v['dh']}px | {v['dx']:.1f}px | "
                         f"{v['sole'][0]}~{v['sole'][1]} (기준 298) | {'통과' if ok else '미달'} |")
            rows.append([folder, m['name'], state, v['frames'], v['dw'], v['dh'], round(v['dx'], 1),
                         v['sole'][0], v['sole'][1], v['soleOff'], 'PASS' if ok else 'FAIL'])
    with open(os.path.join(out, 'sprite-metrics.md'), 'w') as f:
        f.write('# 12종 1차본 실측 (1배 도트 기준 · 화면 ×4)\n\n')
        f.write('통과 기준: 걷기 폭 편차 ≤2px, 높이 편차 ≤6px, x 흔들림 ≤2px, 접지 하단 = 298.\n\n')
        f.write('\n'.join(lines) + '\n')
    with open(os.path.join(out, 'sprite-metrics.csv'), 'w') as f:
        f.write('folder,name,state,frames,dw,dh,dx,sole_min,sole_max,sole_off,verdict\n')
        for r in rows:
            f.write(','.join(str(x) for x in r) + '\n')
    print('table', os.path.join(out, 'sprite-metrics.md'))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--art', default='dev-art/species')
    ap.add_argument('--out', default='/tmp/rev')
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    folders = ['trex', 'trike', 'velo', 'spino', 'anky', 'stego', 'carno', 'pachy', 'theri', 'dilo', 'brachio', 'ptera']
    draw_board(folders, args.art, args.out,
               [('idle', '대기'), ('walk', '걷기'), ('jump', '점프'), ('flail', '공중버둥')], 'sprite-board-move.png')
    draw_board(folders, args.art, args.out,
               [('light', '약'), ('strong', '강'), ('special', '특수')], 'sprite-board-attack.png')
    draw_board(folders, args.art, args.out,
               [('hit', '피격'), ('down', '다운'), ('victory', '승리')], 'sprite-board-reaction.png')
    write_table(folders, args.art, args.out)


if __name__ == '__main__':
    main()
