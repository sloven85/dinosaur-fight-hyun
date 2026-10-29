"""Validate artist bytes and adapt metadata only. Never draw/resize/repair the art.

python scripts/prepare-pixel-art.py --source /path/to/extracted/artist --write
python scripts/prepare-pixel-art.py  # revalidate the installed art and generated manifest
Requires Pillow for PNG inspection, not production/runtime.
"""
import argparse
import hashlib
import json
import shutil
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'dev-art' / 'tyrannosaurus'
parser = argparse.ArgumentParser()
parser.add_argument('--source', type=Path, default=DEST)
parser.add_argument('--write', action='store_true')
args = parser.parse_args()
source = args.source
raw = json.loads((source / 'trex_pixel_anim_v2.json').read_text())
assert raw['version'] == 'trex_pixel_v2'
assert raw['cell'] == [208, 136] and raw['footY'] == 128 and raw['contactRow'] == 127
assert raw['sheet'] == 'trex_pixel_sheet_v2.png'
sheet = Image.open(source / raw['sheet']).convert('RGBA')
assert sheet.size == (1664, 680)
names = ['idle', 'walk', 'bite', 'hit', 'down']
counts = [4, 8, 7, 3, 3]
frames, clips, source_clips, metrics = [], {}, {}, {}
colors = set()
contact_discrepancies = []
files = ['trex_pixel_anim_v2.json', raw['sheet']]
for row, (name, count) in enumerate(zip(names, counts)):
    anim = raw['animations'][name]
    assert len(anim['frames']) == count
    durations = [t * 1000 / 60 for t in anim['ticks']] if name == 'bite' else anim['ms']
    assert len(durations) == count and all(0 < ms <= 10000 for ms in durations)
    assert anim['loop'] == (name in ['idle', 'walk'])
    offset = len(frames)
    heights, supports, bbox_differences, ground_gaps = [], [], [], []
    for col, frame in enumerate(anim['frames']):
        filename = f'trex_{name}_{col:02}.png'
        assert frame['file'] == filename
        assert frame['sheetRect'] == [col * 208, row * 136, 208, 136]
        file = 'frames/' + filename
        files.append(file)
        image = Image.open(source / file).convert('RGBA')
        assert image.size == (208, 136)
        box = image.getbbox()
        assert box is not None
        x0, y0, x1, y1 = box
        declared = frame['alphaBBox']
        actual = [x0, y0, x1 - x0, y1 - y0]
        if declared != actual:
            bbox_differences.append({'frame': col, 'declared': declared, 'actual': actual})
        assert 0 < x0 < x1 < 208 and 0 < y0 < y1 < 136
        assert y1 == 128, (name, col, box)
        assert declared == actual, (name, col, declared, actual)
        for contact in frame['contacts']:
            lo, hi = contact.get('soleX', contact.get('x'))
            missing = [x for x in range(lo, hi + 1) if image.getpixel((x, contact['row']))[3] == 0]
            if missing:
                contact_discrepancies.append({'clip': name, 'frame': col, 'contact': contact, 'transparentX': missing})
            # Air-foot extents may span holes; actual support spans may not.
            if contact['kind'] != 'foot_air':
                assert not missing, (name, col, contact)
        ground_gaps.append(128 - y1)
        crop = sheet.crop((col * 208, row * 136, (col + 1) * 208, (row + 1) * 136))
        assert crop.tobytes() == image.tobytes(), (name, col, 'sheet mismatch')
        colors.update(pixel for pixel in image.getdata() if pixel[3] > 0)
        heights.append(y1 - y0)
        support = [x for x in range(208) if image.getpixel((x, y1 - 1))[3] > 0]
        supports.append([min(support), max(support)])
        frames.append({'x': col * 208, 'y': row * 136, 'w': 208, 'h': 136, 'anchor': {'x': 100, 'y': 128}})
    # Cumulative rounding avoids per-frame drift (720ms -> 43 ticks, not 40).
    elapsed, previous = 0, 0
    sequence = []
    for i, ms in enumerate(durations):
        elapsed += ms
        end = round(elapsed * 60 / 1000)
        sequence.append({'frame': offset + i, 'ticks': end - previous})
        previous = end
    clips[name] = {'loop': anim['loop'], 'sequence': sequence}
    source_clips[name] = {'loop': anim['loop'], 'sequence': [{'frame': offset + i, 'ms': ms} for i, ms in enumerate(durations)]}
    metrics[name] = {'heightRangePx': [min(heights), max(heights)], 'heightRangeGamePx': [min(heights) * 4, max(heights) * 4], 'supportXRangesPx': supports, 'groundGapsPx': ground_gaps, 'bboxDifferences': bbox_differences, 'originalMs': sum(durations)}
assert len(colors) == 16, len(colors)
assert raw['animations']['bite']['events']['contact1']['ticks'] == [6, 8]
assert raw['animations']['bite']['events']['contact2']['ticks'] == [12, 15]
assert raw['animations']['bite']['ticks'] == [3, 3, 3, 3, 4, 7, 7]
assert raw['animations']['down']['holdLast'] is True
# The authored v2 sequence already matches the shipped two-contact attack.
clips['bite'] = {'loop': False, 'sequence': [{'frame': 12 + i, 'ticks': n} for i, n in enumerate(raw['animations']['bite']['ticks'])]}
manifest = {'version': 1, 'character': 'tyrannosaurus', 'image': raw['sheet'], 'facing': 'right', 'scale': 4,
    'frames': frames, 'clips': clips, 'biteContactFrames': [14, 16], 'sourceClips': source_clips}
report = {'frames': len(frames), 'paletteColors': len(colors), 'sheetSize': list(sheet.size), 'metrics': metrics, 'contactDiscrepancies': contact_discrepancies,
    'sha256': {file: hashlib.sha256((source / file).read_bytes()).hexdigest() for file in files}}
if args.write:
    DEST.mkdir(parents=True, exist_ok=True)
    for file in files:
        target = DEST / file
        target.parent.mkdir(parents=True, exist_ok=True)
        if (source / file).resolve() != target.resolve():
            shutil.copyfile(source / file, target)
    (DEST / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    (DEST / 'validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
else:
    assert json.loads((DEST / 'manifest.json').read_text()) == manifest
    assert json.loads((DEST / 'validation.json').read_text()) == report
print(json.dumps({'ok': True, 'frames': len(frames), 'colors': len(colors), 'metrics': metrics}, ensure_ascii=False))
