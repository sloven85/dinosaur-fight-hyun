#!/usr/bin/env python3
"""아티스트가 팔레트 인덱스로 다시 잠근 프레임으로 시트 픽셀만 교체한다.

- 기하(프레임 사각형·anchor·클립 순서)는 그대로 둔다. 알파가 같으므로 bbox도 같다.
- 1P 시트는 아티스트 1P 프레임으로, 2P 시트는 아티스트 2P 프레임으로 채운다.
- 두 세트의 알파가 1비트라도 다르면 즉시 실패한다(모양 불변 증명).

사용: python3 scripts/apply-indexed-frames.py <frames_dir> <frames_2p_dir> --species trex
"""
import argparse
import json
import os
import sys

from PIL import Image


def bbox_crop(im):
    bb = im.getchannel('A').getbbox()
    if bb is None:
        sys.exit('완전히 투명한 프레임이 있습니다')
    return im.crop(bb)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('frames_1p')
    ap.add_argument('frames_2p')
    ap.add_argument('--species', required=True)
    ap.add_argument('--dir', default='dev-art/species')
    args = ap.parse_args()

    manifest_path = os.path.join(args.dir, args.species, 'manifest.json')
    manifest = json.load(open(manifest_path))
    sheet_path = os.path.join(args.dir, args.species, 'sheet.png')
    sheet = Image.open(sheet_path).convert('RGBA')
    sheet2 = Image.new('RGBA', sheet.size, (0, 0, 0, 0))

    for i, frame in enumerate(manifest['frames']):
        name = frame.get('source')
        if not name:
            sys.exit(f'{i}번 프레임에 source 이름이 없습니다')
        p1 = os.path.join(args.frames_1p, name)
        p2 = os.path.join(args.frames_2p, name)
        for f in (p1, p2):
            if not os.path.exists(f):
                sys.exit(f'없는 프레임: {f}')
        im1 = Image.open(p1).convert('RGBA')
        im2 = Image.open(p2).convert('RGBA')
        if im1.size != im2.size:
            sys.exit(f'{name}: 1P/2P 크기 다름')
        if im1.getchannel('A').tobytes() != im2.getchannel('A').tobytes():
            sys.exit(f'{name}: 1P/2P 알파가 다릅니다(실루엣 불변 위반)')
        c1, c2 = bbox_crop(im1), bbox_crop(im2)
        if c1.size != (frame['w'], frame['h']):
            sys.exit(f'{name}: 크롭 크기 {c1.size} != manifest {frame["w"]}x{frame["h"]}')
        sheet.paste(c1, (frame['x'], frame['y']))
        sheet2.paste(c2, (frame['x'], frame['y']))

    # 알파가 원본 그대로인지 마지막 확인(모양 불변).
    old_alpha = Image.open(sheet_path).convert('RGBA').getchannel('A').tobytes()
    if sheet.getchannel('A').tobytes() != old_alpha:
        sys.exit('교체 후 알파가 달라졌습니다')

    sheet.save(sheet_path)
    sheet2.save(os.path.join(args.dir, args.species, 'sheet_p2.png'))

    colors = {px[:3] for px in sheet.getdata() if px[3] > 0}
    print(f'{args.species}: 프레임 {len(manifest["frames"])}장 교체 · 1P 색 {len(colors)}종 · 2P 시트 생성')


if __name__ == '__main__':
    main()
