import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {getCharacter} from '../data';
import {emptyAssets} from '../rendering/CharacterAssets';
import {Match} from './Match';
import {NULL_INPUT} from './Fighter';
import {contactPose,react} from './partContact';
import {canGroundSupport,supportBottom} from './groundSupport';
const json=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
describe('ground support candidate',()=>{
 for(const id of ['pachycephalosaurus','pteranodon','carnotaurus'])for(const side of [1,-1] as const)for(const kind of ['light','heavy','special'] as const){
  it(`${id}/${side}/${kind}: bounded correction, common matrices, no airborne change`,()=>{
   const c=getCharacter(id),a={...emptyAssets(id),rig:json(`public/assets/characters/${id}/rig.json`),parts:{rig:json(`public/${c.partsPath}/rig.json`),motions:json(`public/${c.partsPath}/attack_motions.json`),images:{}}};
   const m=new Match('versus',[id,id],[a,a],{partContacts:true});m.phase='fight';m.p1.facing=side;m.p1.meter=100;m.p1.x=side===1?450:1450;m.p2.x=side===1?1450:450;
   let previous=0;
   for(let i=0;i<180;i++){
    m.step(i===0?{isHeld:()=>false,isPressed:(p,k)=>p===0&&k===kind}:NULL_INPUT,1/60);
    const f=m.p1,raw=contactPose(f,false),pose=contactPose(f);
    if(i===12){const h=pose.hurt.find(h=>h.region==='leg')!;react(f,{...h,t:1,direction:side});}
    if(canGroundSupport(f)){
     expect(Math.abs(f.groundOffset-previous)).toBeLessThanOrEqual(2.000001);
     const before=supportBottom(id,raw.matrices),after=supportBottom(id,pose.matrices);
     expect(Math.abs(after)).toBeLessThanOrEqual(Math.abs(before)+1e-6);
     const dy=pose.stage[5]-raw.stage[5];
     pose.hurt.forEach((h,n)=>expect(h.y-raw.hurt[n].y).toBeCloseTo(dy));
     pose.weapon.forEach((h,n)=>expect(h.y-raw.weapon[n].y).toBeCloseTo(dy));
    }else expect(pose.matrices).toEqual(raw.matrices);
    previous=f.groundOffset;
   }
   m.p1.finishRound('down');expect(m.p1.groundOffset).toBe(0);
  });
 }
});
