import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Match } from './Match';
import { emptyAssets } from '../rendering/CharacterAssets';
import { applyAffine } from '../rendering/partRig';
import { contactPose, findContact } from './partContact';
import { getMove } from '../data';
import { bitePilotMove } from './bitePilot';

function setup(side: 1 | -1, gap = 540) {
  const ids: [string, string] = ['tyrannosaurus','triceratops'];
  const assets = ids.map(id => {
    const json = (p: string) => JSON.parse(readFileSync(`public/assets/characters/${id}/${p}`, 'utf8'));
    return { ...emptyAssets(id), rig: json('rig.json'), parts: { rig: json('parts/integrated-v3/rig.json'),
      motions: json('parts/integrated-v3/attack_motions.json'), images: {} } };
  });
  const m = new Match('versus', ids, [assets[0],assets[1]], { partContacts: true });m.phase='fight';
  m.p1.x=960-side*gap/2;m.p2.x=960+side*gap/2;m.p1.facing=side;m.p2.facing=-side as 1|-1;
  return m;
}
describe('integrated v3',()=>{
  it('includes single mouth-v2 set and backing, not a duplicated overlay',()=>{
    const m=setup(1),order=m.p1.assets.parts!.rig.drawOrder;
    for(const part of ['backing','mouth','mfloor','lteeth'])expect(order.filter(n=>n===part)).toHaveLength(1);
    expect(m.p2.assets.parts!.rig.hitPivot).toBeDefined();
  });
  for(const side of [1,-1] as const) {
    it(`v3 preserves approved close charge (${side})`,()=>{
      const m=setup(side,300); m.p2.meter=100;
      const hp=m.p1.health;
      for(let i=0;i<180;i++){
        m.step({isHeld:()=>false,isPressed:(p,a)=>i===0&&p===1&&a==='special'},1/60);
        if(i<16)expect(m.p1.health).toBe(hp);
      }
      expect(hp-m.p1.health).toBe(28);
    });
    it(`directional foot pivot follows base attack matrix (${side})`,()=>{
      const m=setup(side),f=m.p2;
      f.scriptVisual={rot:0.13,sx:1.1,sy:0.9,ghost:0,sink:0,parts:{nearleg_front:18},overlays:[]};
      const before=contactPose(f),p=f.assets.parts!.rig.parts.nearleg_front;
      for(const value of [-7,7]){
        f.reaction.leg.value=value;
        const pivot=f.assets.parts!.rig.hitPivot!['nearleg_front'+(value>0?'+':'-')];
        const a=applyAffine(before.matrices.nearleg_front,pivot.x-p.offsetX,pivot.y-p.offsetY);
        const b=applyAffine(contactPose(f).matrices.nearleg_front,pivot.x-p.offsetX,pivot.y-p.offsetY);
        expect(a[0]).toBeCloseTo(b[0]);expect(a[1]).toBeCloseTo(b[1]);
      }
    });
    for(const kind of ['light','heavy'] as const)for(const gap of [540,700])it(`${kind} ${gap}/${side} mouth-only contact, total damage and no acquisition snap`,()=>{
      const m=setup(side,gap),hp=m.p2.health;const hits=[];
      let maxJump=0;
      for(let frame=0;frame<240;frame++){
        const held=m.p1.holding, x=m.p2.x,y=m.p2.y;
        m.step({isHeld:()=>false,isPressed:(p,a)=>frame===0&&p===0&&a===kind},1/60);
        if(!held&&m.p1.holding)maxJump=Math.max(maxJump,Math.hypot(m.p2.x-x,m.p2.y-y));
        hits.push(...m.consumeEvents().filter(e=>e.type==='hit'));
        if(m.p1.scriptVisual?.parts)expect(m.p1.scriptVisual.parts.jaw).toBeGreaterThanOrEqual(-26);
      }
      expect(hp-m.p2.health).toBe(gap===700?0:kind==='light'?11:20);
      expect(hits.length).toBe(gap===700?0:kind==='light'?2:7);
      expect(maxJump).toBeLessThan(3);
      expect(m.p1.holding).toBeNull();expect(m.p2.heldBy).toBeNull();
    });
  }
  it('forehead-only overlap is not a mouth strike',()=>{
    const f=setup(1).p1,pose=contactPose(f),head=pose.hurt.find(c=>c.part==='head')!;
    expect(pose.weapon).toHaveLength(1);
    expect(findContact(pose.weapon,[{x:head.x,y:head.y-40,r:10,part:'head',region:'head'}])).toBeNull();
  });
  it('bite move adaptation preserves damage events',()=>{
    for(const id of ['tyrannosaurus_light','tyrannosaurus_heavy']){
      const a=getMove(id),b=bitePilotMove(a);
      expect(b.script!.hits!.map(h=>h.damage)).toEqual(a.script!.hits!.map(h=>h.damage));
      expect(b.script!.events).toBe(a.script!.events);
    }
  });
});
