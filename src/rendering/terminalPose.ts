import type { Fighter } from '../combat/Fighter';
import { spriteScale, type BoxData } from './rig';

/** Uniform fit into the visible arena; never squash to manufacture a down pose. */
export function terminalLayout(box: BoxData, nominal: number, x: number, groundY: number, lift: number, facing: number) {
  const scale=Math.min(nominal,1600/box.w,Math.max(1,groundY-180)/box.h);
  const half=box.w*scale/2;
  const center=Math.max(40+half,Math.min(1880-half,x));
  return {scale,center,feet:groundY+lift,rootX:(box.minX+box.maxX)/2,rootY:box.maxY,facing};
}

export function renderTerminalPose(g: CanvasRenderingContext2D, f: Fighter, groundY: number): boolean {
  const rig=f.assets.rig;if(!rig)return false;
  const state=f.state==='down'?'down':'victory';
  const entry=rig.poses[state];
  const usable=entry?.usable && entry.box && f.assets.poses[state] && (state==='down'||entry.box.minY>0);
  const image=usable?f.assets.poses[state]:f.assets.master;
  const box=usable?entry!.box:rig.master.box;
  if(!image||!box)return false;
  const p=terminalLayout(box,spriteScale(f.data.displayHeight,rig.master.box),f.x,groundY,f.y,f.facing);
  g.save();g.translate(p.center,p.feet);g.scale(p.facing*p.scale,p.scale);
  g.drawImage(image,-p.rootX,-p.rootY);g.restore();
  return true;
}
