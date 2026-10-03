"""Install approved terminal PNGs verbatim and measure matching rig metadata.
Usage: python3 scripts/install_terminal_art.py reactions.zip fix6.zip winfix.zip
"""
import hashlib,io,json,sys,zipfile
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
SPECIES={'trex':'tyrannosaurus','trike':'triceratops','velo':'velociraptor','spino':'spinosaurus','anky':'ankylosaurus','stego':'stegosaurus','carno':'carnotaurus','pachy':'pachycephalosaurus','theri':'therizinosaurus','dilo':'dilophosaurus','brachio':'brachiosaurus','ptera':'pteranodon'}
def main():
    archives=[zipfile.ZipFile(p) for p in sys.argv[1:]]
    manifest=[]
    for short,id in SPECIES.items():
        folder=ROOT/'public/assets/characters'/id
        rig=json.loads((folder/'rig.json').read_text())
        names=[(0,f'{short}_down_2048x1536.png','down')]
        if short in ['brachio','spino','carno','dilo']:names.append((1,f'{short}_win_2048x1536.png','victory'))
        if short in ['trex','trike']:names.append((2,('trex_victory' if short=='trex' else 'trike_win')+'_2048x1536.png','victory'))
        for archive,name,state in names:
            raw=archives[archive].read(name);im=Image.open(io.BytesIO(raw)).convert('RGBA');alpha=im.getchannel('A')
            box=alpha.getbbox();assert box and im.size==(2048,1536)
            x0,y0,x1,y1=box;assert x1-x0>300 and y1-y0>100
            path=f'poses/{state}.png';(folder/path).write_bytes(raw)
            rig['poses'][state]={'imagePath':path,'rootX':(x0+x1-1)/2,'rootY':y1-1,'usable':True,
                'box':{'minX':x0,'minY':y0,'maxX':x1-1,'maxY':y1-1,'w':x1-x0,'h':y1-y0,'cx':(x0+x1-1)/2,'feet':y1-1,'fill':sum(1 for a in alpha.getdata() if a>0)/(2048*1536)}}
            manifest.append({'id':id,'state':state,'archive':Path(sys.argv[archive+1]).name,'entry':name,'sha256':hashlib.sha256(raw).hexdigest(),'box':box})
        (folder/'rig.json').write_text(json.dumps(rig,ensure_ascii=False,indent=2)+'\n')
    (ROOT/'docs/terminal-art-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    for row in manifest:print(row['id'],row['state'],row['box'],row['sha256'])
if __name__=='__main__':main()
