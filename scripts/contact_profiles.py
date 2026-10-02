"""Bake conservative interior disks from approved PNG alpha; never edits artwork.
Run: python3 scripts/contact_profiles.py (Pillow, numpy, scipy required).
Disk centers/radii are in original rig stage pixels; runtime uses final part matrices.
"""
import json
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt

ROOT = Path(__file__).resolve().parents[1]

def disks(path, ox=0, oy=0, limit=12):
    mask = np.array(Image.open(path).convert('RGBA'))[:, :, 3] >= 220
    # Sampling at 4px bounds runtime cost; inset disks do not extend into transparent caps.
    dist = distance_transform_edt(np.pad(mask[::4, ::4], 1))[1:-1, 1:-1] * 4
    candidates = dist.copy()
    yy, xx = np.indices(dist.shape)
    out = []
    for _ in range(limit):
        y, x = np.unravel_index(candidates.argmax(), candidates.shape)
        r = min(float(dist[y, x]) - 5, 115)
        if r < 10:
            break
        out.append([int(x * 4 + ox), int(y * 4 + oy), round(r, 1)])
        candidates[(xx-x)**2+(yy-y)**2 < (max(12, r*.85)/4)**2] = 0
    return out

def main():
    result = {}
    for c in json.loads((ROOT/'src/data/characters.json').read_text())['characters']:
        if c['id'] in ('tyrannosaurus', 'triceratops'):
            continue
        folder = ROOT/'public'/c['partsPath']
        rig = json.loads((folder/'rig.json').read_text())
        regions = []
        for name, p in rig['parts'].items():
            region = ('head' if name in ('head','jaw','neck','neck2') else
                      'leg' if 'leg' in name else 'tail' if 'tail' in name else 'torso')
            for x,y,r in disks(folder/(name+'.png'),p['offsetX'],p['offsetY']):
                regions.append([name,region,x,y,r])
        result[c['id']] = regions
    # Flying replacement is approved single-image art; anatomical regions remain explicit.
    flying=[]
    for x,y,r in disks(ROOT/'public/assets/effects/ptera_flying.png',limit=64):
        with Image.open(ROOT/'public/assets/effects/ptera_flying.png') as im: w,h=im.size
        region='head' if x/w>.72 else 'leg' if y/h>.76 else 'torso'
        flying.append(['flight',region,345+x/w*1358,428+y/h*524,r*min(1358/w,524/h)])
    result['pteranodon_flight']=flying
    (ROOT/'src/data/contactProfiles.json').write_text(json.dumps(result,separators=(',',':'))+'\n')
    print({k:len(v) for k,v in result.items()})

if __name__=='__main__':main()
