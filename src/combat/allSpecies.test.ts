import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CHARACTERS, getCharacter, getMove } from '../data';
import { emptyAssets } from '../rendering/CharacterAssets';
import { Match } from './Match';
import { NULL_INPUT } from './Fighter';
import { contactPose, findContact, react, supportsContact, expandedContact } from './partContact';
import { type AttackKind } from './types';
import { CONTACT_PROFILES } from './contactProfiles';
import { expandedPilotMove } from './expandedPilot';

const json=(path:string)=>JSON.parse(readFileSync(path,'utf8'));
export function speciesAssets(id:string) {
  const c=getCharacter(id),base=`public/assets/characters/${id}`;
  const dir=['tyrannosaurus','triceratops'].includes(id)?`${base}/parts/integrated-v3`:`public/${c.partsPath}`;
  return {...emptyAssets(id),rig:json(`${base}/rig.json`),parts:{rig:json(`${dir}/rig.json`),motions:json(`${dir}/attack_motions.json`),images:{}}};
}
export function speciesMatch(id:string,side:1|-1=1,gap=500) {
  const m=new Match('versus',[id,'triceratops'],[speciesAssets(id),speciesAssets('triceratops')],{partContacts:true});
  m.phase='fight';m.p1.x=960-side*gap/2;m.p2.x=960+side*gap/2;m.p1.facing=side;m.p2.facing=-side as 1|-1;m.p1.meter=100;
  m.p1.health=m.p2.health=10000;
  return m;
}
const kinds=['light','heavy','special'] as const;
const press=(kind:AttackKind)=>({isHeld:()=>false,isPressed:(p:number,a:string)=>p===0&&a===kind});
describe('all species contact expansion',()=>{
  for(const c of CHARACTERS){
    it(`${c.id}: profiles, mirrored reactions and finite full move poses`,()=>{
      const right=speciesMatch(c.id),left=speciesMatch(c.id,-1);
      expect(supportsContact(right.p1)).toBe(true);
      if(expandedContact(right.p1)){
        for(const p of CONTACT_PROFILES[c.id])expect(right.p1.assets.parts!.rig.parts[p[0]]).toBeDefined();
      }
      for(const region of ['head','torso','leg','tail'] as const){
        const point=contactPose(right.p1).hurt.find(h=>h.region===region);
        if(!point){expect(c.id).toBe('pteranodon');expect(region).toBe('tail');continue;}
        react(right.p1,{...point,t:1,direction:1});
        const lp=contactPose(left.p1).hurt.find(h=>h.region===region)!;
        react(left.p1,{...lp,t:1,direction:-1});
      }
      for(let i=0;i<6;i++){right.p1.step(NULL_INPUT,1/60);left.p1.step(NULL_INPUT,1/60);}
      const a=contactPose(right.p1),b=contactPose(left.p1);
      expect(a.hurt.length).toBe(b.hurt.length);
      a.hurt.forEach((h,i)=>{expect(h.x+b.hurt[i].x).toBeCloseTo(1920);expect(h.y).toBeCloseTo(b.hurt[i].y);});
      for(const kind of kinds){
        const m=speciesMatch(c.id);m.step(press(kind),1/60);
        for(let f=0;f<getMove(c.moves[kind]).script!.frames;f++){
          if(m.p1.attack){m.p1.attack.frame=f;m.p1.applyScriptFrame();}
          const pose=contactPose(m.p1);
          expect(pose.weapon.length).toBeGreaterThan(0);
          for(const h of [...pose.hurt,...pose.weapon]){
            expect(Number.isFinite(h.x)&&Number.isFinite(h.y)&&Number.isFinite(h.r)).toBe(true);
            expect(h.r).toBeGreaterThanOrEqual(0);
          }
        }
      }
    });
    for(const kind of kinds)it(`${c.id}/${kind}: both facings, real match hit windows and no duplicate damage`,()=>{
      const outcomes=[];
      for(const side of [1,-1] as const){
        const samples=[];
        for(const gap of [250,450,540,650,850]){
          const m=speciesMatch(c.id,side,gap),move=getMove(c.moves[kind]);
          let hits=0,damage=0;
          for(let f=0;f<300;f++){
            const hp=m.p2.health;
            m.step(f===0?press(kind):NULL_INPUT,1/60);
            damage+=hp-m.p2.health;
            hits+=m.consumeEvents().filter(e=>e.type==='hit'&&e.player===1).length;
          }
          const script=move.script!;
          const maxEvents=(script.hits?.length??0)+(script.events?.filter(e=>e.type==='throw'||(e.type==='projectile'&&!e.harmless)).length??0);
          expect(hits).toBeLessThanOrEqual(maxEvents);
          samples.push({gap,damage,hits});
        }
        outcomes.push(samples);
      }
      expect(outcomes[0]).toEqual(outcomes[1]);
      expect(outcomes[0].some(s=>s.hits>0)).toBe(true);
      const move=getMove(c.moves[kind]),script=move.script!;
      const allowedDamage=(script.hits??[]).reduce((sum,h)=>sum+Math.round(h.damage*c.damageScale),0)+
        (script.events??[]).reduce((sum,e)=>sum+((e.type==='throw'||e.type==='projectile'&&!e.harmless)?Math.round(e.damage*c.damageScale):0),0);
      for(const s of outcomes[0])expect(s.damage).toBeLessThanOrEqual(allowedDamage);
      const miss=speciesMatch(c.id);
      for(let i=0;i<300;i++){
        // Deliberately outside all rendered attack/projectile paths, including target-following moves.
        miss.p2.y=-4000;miss.p2.onGround=false;miss.p2.vy=0;
        miss.step(i===0?press(kind):NULL_INPUT,1/60);
      }
      expect(miss.p2.health).toBe(10000);
    });
  }
  it('flight replacement has anatomical head/body/leg coverage and obeys its drawn transform',()=>{
    expect(new Set(CONTACT_PROFILES.pteranodon_flight.map(p=>p[1]))).toEqual(new Set(['head','torso','leg']));
    const m=speciesMatch('pteranodon');m.step(press('heavy'),1/60);m.p1.attack!.frame=24;m.p1.applyScriptFrame();
    const pose=contactPose(m.p1);expect(pose.matrices.flight).toEqual(pose.stage);
    expect(pose.hurt.every(h=>h.part==='flight')).toBe(true);
    const w=pose.weapon[0];expect(findContact([w],[{...w,part:'head',region:'head'}])).not.toBeNull();
  });
  it('local trajectory fixes preserve authored damage, timing, events and source data',()=>{
    for(const id of ['spinosaurus','pachycephalosaurus','pteranodon']){
      const original=getMove(`${id}_special`),before=JSON.stringify(original),adapted=expandedPilotMove(original);
      expect(adapted.script!.hits).toBe(original.script!.hits);
      expect(adapted.script!.events).toBe(original.script!.events);
      expect(adapted.script!.grab).toBe(original.script!.grab);
      expect(adapted.script!.frames).toBe(original.script!.frames);
      expect(JSON.stringify(original)).toBe(before);
    }
  });
  it('all 144 pairings accept contact and mirrored narrow phase without missing anatomy',()=>{
    for(const a of CHARACTERS)for(const b of CHARACTERS){
      const m=new Match('versus',[a.id,b.id],[speciesAssets(a.id),speciesAssets(b.id)],{partContacts:true});
      const pa=contactPose(m.p1),pb=contactPose(m.p2);
      const target=pb.hurt[0],weapon=pa.weapon[0];
      const translated=pa.weapon.map(w=>({...w,x:w.x+target.x-weapon.x,y:w.y+target.y-weapon.y}));
      expect(findContact(translated,pb.hurt)).not.toBeNull();
      expect(findContact(translated.map(w=>({...w,x:w.x+10000})),pb.hurt)).toBeNull();
    }
  });
  for(const id of ['ankylosaurus','brachiosaurus'])it(`${id}: ground area doesn't turn into a foot strike and airborne target evades`,()=>{
    const m=speciesMatch(id),kind='special';m.step(press(kind),1/60);
    const hit=m.p1.attack!.move.script!.hits!.find(h=>h.groundOnly)!;
    m.p1.attack!.frame=hit.from-1;m.p1.applyScriptFrame();m.p2.onGround=false;m.p2.y=-500;m.p2.vy=-10;
    const hp=m.p2.health;m.step(NULL_INPUT,1/60);expect(m.p2.health).toBe(hp);
  });
  it('counter success branch lands only once per authored event',()=>{
    for(const side of [1,-1] as const){
      const m=speciesMatch('ankylosaurus',side,450);m.step(press('special'),1/60);
      m.p1.attack!.frame=20;m.p1.applyScriptFrame();expect(m.p1.tryCounter()).toBe(true);
      const hp=m.p2.health;let hits=0;
      for(let i=0;i<180;i++){m.step(NULL_INPUT,1/60);hits+=m.consumeEvents().filter(e=>e.type==='hit'&&e.player===1).length;}
      expect(hits).toBe(1);expect(hp-m.p2.health).toBeGreaterThan(0);
    }
  });
});
