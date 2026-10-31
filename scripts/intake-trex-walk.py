#!/usr/bin/env python3
"""티라노 걷기 8칸(비디오 모션 경로 v1) 인테이크 — 시트의 걷기 슬롯만 교체한다.

계약(스크립트 build-species-sprites.py와 동일):
  - 셀 502×304, 발 기준선 footY=298, 기준 x anchorX=251
  - 프레임은 아티스트 선언 bbox가 아니라 알파 실제 경계로 자른다
  - anchor = (anchorX - bbox.x, footY - bbox.y) = "잘라낸 그림 안에서 발 기준점"

이 스크립트는 걷기 클립만 갈아 끼운다(idle·공격·승리 클립과 시트 격자는 그대로).
1P 시트는 그대로, 2P 시트는 아티스트가 준 _2p 프레임(알파 동일·2P 팔레트 치환)으로 교체.

사용: python3 scripts/intake-trex-walk.py <zip 푼 폴더>
"""
import json
import sys
from pathlib import Path

from PIL import Image

CELL = (502, 304)
FOOT_Y = 298
ANCHOR_X = 251
SPECIES = Path('dev-art/species/trex')


def alpha_bbox(im):
    return im.getchannel('A').getbbox()


def main():
    src = Path(sys.argv[1])
    manifest = json.loads((SPECIES / 'manifest.json').read_text(encoding='utf-8'))
    walk = manifest['clips']['walk']['frames']
    assert len(walk) == 8, walk

    sheet = Image.open(SPECIES / 'sheet.png').convert('RGBA')
    sheet2 = Image.open(SPECIES / 'sheet_p2.png').convert('RGBA')
    cell_w, cell_h = manifest['grid']['cellW'], manifest['grid']['cellH']
    cols = manifest['grid']['cols']

    for step, index in enumerate(walk):
        frame = manifest['frames'][index]
        slot_x = (index % cols) * cell_w
        slot_y = (index // cols) * cell_h
        # 1) 슬롯을 비운다(이전 그림의 잔여 픽셀이 남지 않게).
        for sheet_image in (sheet, sheet2):
            sheet_image.paste((0, 0, 0, 0), (slot_x, slot_y, slot_x + cell_w, slot_y + cell_h))

        # 2) 1P/2P 프레임을 알파 경계로 잘라 같은 슬롯에 놓는다.
        for suffix, sheet_image in (('', sheet), ('_2p', sheet2)):
            art = Image.open(src / f'trex_walk_{step:02d}{suffix}.png').convert('RGBA')
            assert art.size == CELL, (step, art.size)
            bbox = alpha_bbox(art)
            cropped = art.crop(bbox)
            sheet_image.paste(cropped, (slot_x, slot_y))
            if suffix == '':
                frame['w'], frame['h'] = cropped.size
                frame['anchor'] = {'x': ANCHOR_X - bbox[0], 'y': FOOT_Y - bbox[1]}
                frame['source'] = f'walk_{step:02d}.png'
            else:
                # 2P는 알파가 같아야 한다(같은 그림의 팔레트 치환).
                assert alpha_bbox(art) == bbox, (step, '2P 알파 불일치')

    sheet.save(SPECIES / 'sheet.png')
    sheet2.save(SPECIES / 'sheet_p2.png')
    # 원본과 같은 한 줄 압축 형식으로 쓴다(포맷 변경이 diff에 섞이지 않게).
    (SPECIES / 'manifest.json').write_text(
        json.dumps(manifest, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    for index in walk:
        frame = manifest['frames'][index]
        print(f"walk {frame['source']}: {frame['w']}×{frame['h']} anchor {frame['anchor']}")


main()
