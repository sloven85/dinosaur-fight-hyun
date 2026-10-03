"""Bake only opaque foot-part contours; tails/wings never define ground support."""
import json
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.spatial import ConvexHull
ROOT=Path(__file__).resolve().parents[1]
chars=json.loads((ROOT/'src/data/characters.json').read_text())['characters']
out={}
for id in ['pachycephalosaurus','pteranodon','carnotaurus']:
    c=next(c for c in chars if c['id']==id);folder=ROOT/'public'/c['partsPath'];r=json.loads((folder/'rig.json').read_text())
    out[id]={}
    for name in r['parts']:
        if 'leg' not in name:continue
        a=np.asarray(Image.open(folder/(name+'.png')).convert('RGBA'))[:,:,3];y,x=np.where(a>128)
        # Bottommost opaque band is the foot, not upper-leg/wing pixels.
        keep=y>=y.max()-55;pts=np.stack([x[keep],y[keep]],axis=1)
        out[id][name]=pts[ConvexHull(pts).vertices].tolist()
(ROOT/'src/data/supportContours.json').write_text(json.dumps(out,separators=(',',':'))+'\n')
print({id:{n:len(v) for n,v in legs.items()} for id,legs in out.items()})
