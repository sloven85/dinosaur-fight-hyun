"""Bake opaque leg convex contours for the two missing signed support pivots."""
import json
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.spatial import ConvexHull
ROOT=Path(__file__).resolve().parents[1]
folder=ROOT/'public/assets/characters/triceratops/parts/integrated-v3'
out={}
for name in ['nearleg_back','farleg_front']:
    a=np.asarray(Image.open(folder/(name+'.png')).convert('RGBA'))[:,:,3]
    y,x=np.where(a>128);pts=np.stack([x,y],axis=1)
    out[name]=pts[ConvexHull(pts).vertices].tolist()
(ROOT/'src/data/contactFeet.json').write_text(json.dumps(out,separators=(',',':'))+'\n')
print({n:len(p) for n,p in out.items()})
