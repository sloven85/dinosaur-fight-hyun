#!/usr/bin/env python3
"""displayHeight(판정 키)와 아트 bbox 높이×4(렌더 크기)를 12행 표로 낸다 (마스터 지시 2026-10-29).

배경
----
`displayHeight`는 **판정 키**다 — 몸통 박스·피격 상자·사거리를 만드는 값이고, 이 값을 바꾸면
전투 수치가 흔들린다. 도트 렌더는 아트 1px = 화면 4px 고정이라 그림 크기는 아트 bbox가 정한다.
둘은 다른 것이므로, 아트를 갈아 끼울 때 판정 키를 그림에 맞춰 다시 잠그면 안 된다.

이 스크립트가 하는 일
  1) 아티스트 `measure.json`의 idle 프레임 bbox 높이(그들의 수치)와 파일 sha256을 읽는다.
  2) 같은 값을 우리 쪽에서 알파로 다시 재서 교차 확인한다.
  3) `characters.json`의 displayHeight와 나란히 놓고 차이(%)를 낸다 — 1~2% 밖이면 마스터 판단.

사용: python3 scripts/height-ratio-table.py --pkg /tmp/v6set [--md out.md]
"""
import argparse
import hashlib
import json
import os

from PIL import Image

SPECIES = ['trex', 'trike', 'velo', 'spino', 'anky', 'stego',
           'carno', 'pachy', 'theri', 'dilo', 'brachio', 'ptera']
LABEL = {'trex': '티라노', 'trike': '트리케라', 'velo': '벨로키', 'spino': '스피노', 'anky': '안킬로',
         'stego': '스테고', 'carno': '카르노', 'pachy': '파키', 'theri': '테리지노', 'dilo': '딜로포',
         'brachio': '브라키오', 'ptera': '프테라'}
CHARACTER = {'trex': 'tyrannosaurus', 'trike': 'triceratops', 'velo': 'velociraptor',
             'spino': 'spinosaurus', 'anky': 'ankylosaurus', 'stego': 'stegosaurus',
             'carno': 'carnotaurus', 'pachy': 'pachycephalosaurus',
             'theri': 'therizinosaurus', 'dilo': 'dilophosaurus',
             'brachio': 'brachiosaurus', 'ptera': 'pteranodon'}
SCALE = 4


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--pkg', default='/tmp/v6set')
    ap.add_argument('--characters', default='src/data/characters.json')
    ap.add_argument('--md', default='')
    args = ap.parse_args()

    data = {c['id']: c for c in json.load(open(args.characters))['characters']}
    rows, hashes = [], {}
    for sp in SPECIES:
        mpath = os.path.join(args.pkg, sp, 'measure.json')
        measure = json.load(open(mpath))
        h = hashlib.sha256(open(mpath, 'rb').read()).hexdigest()
        frame_hashes = sorted(sha256(os.path.join(args.pkg, sp, 'frames', f))
                              for f in sorted(os.listdir(os.path.join(args.pkg, sp, 'frames')))
                              if f.startswith('idle_'))
        hashes[sp] = (h, frame_hashes)
        artist_h = [f['h'] for f in measure['per_frame'] if f['clip'] == 'idle']
        ours = []
        for name in sorted(f for f in os.listdir(os.path.join(args.pkg, sp, 'frames')) if f.startswith('idle_')):
            im = Image.open(os.path.join(args.pkg, sp, 'frames', name)).convert('RGBA')
            bb = im.getchannel('A').getbbox()
            ours.append(bb[3] - bb[1])
        art = max(artist_h) * SCALE
        dh = data[CHARACTER[sp]]['displayHeight']
        diff = (art - dh) / dh * 100
        rows.append({'folder': sp, 'label': LABEL[sp], 'character': CHARACTER[sp],
                     'artistIdle': artist_h, 'oursIdle': ours, 'art': art, 'displayHeight': dh,
                     'diff': round(diff, 1), 'within2': abs(diff) <= 2.0,
                     'agree': max(artist_h) == max(ours)})

    head = f"{'종':10}{'아티스트idle bbox':>18}{'우리재측정':>12}{'×4':>7}{'displayHeight':>15}{'차이':>8}  판정"
    print(head)
    for r in rows:
        print(f"{r['label']:10}{str(r['artistIdle']):>18}{str(r['oursIdle']):>12}{r['art']:>7}"
              f"{r['displayHeight']:>15}{r['diff']:>7.1f}%  {'OK(±2%)' if r['within2'] else '밖 — 마스터 판단'}")
    inside = sum(1 for r in rows if r['within2'])
    print(f"\n±2% 안 {inside}종 / 밖 {12 - inside}종 · 아티스트·엔진 재측정 일치 {sum(1 for r in rows if r['agree'])}/12")
    print('\n출처(파일 해시)')
    for sp in SPECIES:
        h, fh = hashes[sp]
        print(f"  {sp:8s} measure.json {h[:16]}  idle PNG {','.join(x[:8] for x in fh)}")

    if args.md:
        lines = ['# displayHeight(판정 키) vs 아트 bbox×4(렌더 크기)', '',
                 '| 종 | 아티스트 idle bbox(아트px) | 우리 재측정 | 아트×4 | displayHeight(판정) | 차이 |',
                 '|---|---|---|---|---|---|']
        for r in rows:
            lines.append(f"| {r['label']}({r['character']}) | {max(r['artistIdle'])} | {max(r['oursIdle'])} | "
                         f"{r['art']} | {r['displayHeight']} | {r['diff']:+.1f}% |")
        lines += ['', '출처: 아티스트 납품 `measure.json` (셀 502×304, idle 프레임 bbox 높이) — 파일 해시', '']
        for sp in SPECIES:
            h, fh = hashes[sp]
            lines.append(f"- `{sp}` measure.json sha256 `{h}` · idle PNG sha256 {', '.join('`' + x + '`' for x in fh)}")
        open(args.md, 'w').write('\n'.join(lines) + '\n')
        print(f"\nMD: {args.md}")


if __name__ == '__main__':
    main()
