import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {Match} from './Match';
import {Fighter,NULL_INPUT} from './Fighter';
import {emptyAssets} from '../rendering/CharacterAssets';
import {getCharacter} from '../data';
import {impactStop} from './impactTiming';
const load=(id:string)=>{const c=getCharacter(id),base=`public/assets/characters/${id}`,dir=['tyrannosaurus','triceratops'].includes(id)?`${base}/parts/integrated-v3`:`public/${c.partsPath}`;const json=(p:string)=>JSON.parse(readFileSync(p,'utf8'));return {...emptyAssets(id),rig:json(`${base}/rig.json`),parts:{rig:json(`${dir}/rig.json`),motions:json(`${dir}/attack_motions.json`),images:{}}};};
describe('impact timing review',()=>{
 it('short weight tiers and no expanded long multi-hit stop',()=>{
  expect(impactStop('tyrannosaurus','light',1,false,false)).toBe(4);
  expect(impactStop('ankylosaurus','heavy',12,false,false)).toBe(7);
  expect(impactStop('triceratops','special',8,false,false)).toBe(6);
  expect(impactStop('tyrannosaurus','heavy',2,false,true)).toBe(2);
  expect(impactStop('ankylosaurus','heavy',12,true,false)).toBe(3);
 });
 it('one press during stop is retained once and never becomes auto-repeat',()=>{
   const f=new Fighter(0,'tyrannosaurus',500,1);f.impactTiming=true;f.hitstopFrames=4;f.state='hit';f.hitstunFrames=6;
  f.step({isHeld:()=>false,isPressed:(_,k)=>k==='light'},1/60);
  let previous=0,starts=0;
  for(let i=0;i<200;i++){f.step(NULL_INPUT,1/60);const id=f.attack?.attackId??0;if(id&&id!==previous)starts++;previous=id;}
  expect(starts).toBe(1);expect(f.state).toBe('idle');
 });
 it('a fresh press overrides the saved press when stop ends',()=>{
  const f=new Fighter(0,'tyrannosaurus',500,1);f.impactTiming=true;f.hitstopFrames=1;
  f.step({isHeld:()=>false,isPressed:(_,k)=>k==='light'},1/60);
  f.step({isHeld:()=>false,isPressed:(_,k)=>k==='heavy'},1/60);
  expect(f.attack?.move.kind).toBe('heavy');
 });
 for (const recovery of [8,9]) it(`only actionable non-stop frame ${recovery} within eight consumes`,()=>{
  const f=new Fighter(0,'tyrannosaurus',500,1);f.impactTiming=true;f.hitstopFrames=1;f.state='hit';f.hitstunFrames=recovery-1;
  f.step({isHeld:()=>false,isPressed:(_,k)=>k==='light'},1/60);
  for(let i=0;i<recovery;i++)f.step(NULL_INPUT,1/60);
  expect(f.attack?.move.kind??null).toBe(recovery===8?'light':null);
 });
 for(const state of ['hit','held'] as const) it(`expires during long ${state} without delayed attack`,()=>{
  const f=new Fighter(0,'tyrannosaurus',500,1);f.impactTiming=true;f.hitstopFrames=1;f.state=state;f.hitstunFrames=30;
  f.step({isHeld:()=>false,isPressed:(_,k)=>k==='light'},1/60);
  for(let i=0;i<40;i++)f.step(NULL_INPUT,1/60);
  f.state='idle';f.step(NULL_INPUT,1/60);expect(f.attack).toBeNull();
 });
 it('another hitstop pauses but does not restart old input age',()=>{
  const f=new Fighter(0,'tyrannosaurus',500,1);f.impactTiming=true;f.hitstopFrames=1;f.state='hit';f.hitstunFrames=8;
  f.step({isHeld:()=>false,isPressed:(_,k)=>k==='light'},1/60);
  for(let i=0;i<7;i++)f.step(NULL_INPUT,1/60);
  f.hitstopFrames=10;for(let i=0;i<10;i++)f.step(NULL_INPUT,1/60);
  f.step(NULL_INPUT,1/60);f.step(NULL_INPUT,1/60);expect(f.attack).toBeNull();
 });
 it('latest press just before expiry replaces the old input',()=>{
  const f=new Fighter(0,'tyrannosaurus',500,1);f.impactTiming=true;f.hitstopFrames=1;f.state='hit';f.hitstunFrames=8;
  f.step({isHeld:()=>false,isPressed:(_,k)=>k==='light'},1/60);
  for(let i=0;i<7;i++)f.step(NULL_INPUT,1/60);
  f.hitstopFrames=1;f.step({isHeld:()=>false,isPressed:(_,k)=>k==='heavy'},1/60);
  f.step(NULL_INPUT,1/60);f.step(NULL_INPUT,1/60);expect(f.attack?.move.kind).toBe('heavy');
 });
 it('holding a button never renews or repeats a press',()=>{
  const f=new Fighter(0,'tyrannosaurus',500,1);f.impactTiming=true;f.hitstopFrames=1;
  f.step({isHeld:()=>true,isPressed:(_,k)=>k==='light'},1/60);
  let starts=0,previous=0;
  for(let i=0;i<240;i++){f.step({isHeld:(_,k)=>k==='light',isPressed:()=>false},1/60);const id=f.attack?.attackId??0;if(id&&id!==previous)starts++;previous=id;}
  expect(starts).toBe(1);
 });
 it('round reset clears the saved press',()=>{
  const f=new Fighter(0,'tyrannosaurus',500,1);f.impactTiming=true;f.hitstopFrames=1;
  f.step({isHeld:()=>false,isPressed:(_,k)=>k==='light'},1/60);
  f.resetForRound(500,1);f.step(NULL_INPUT,1/60);
  expect(f.attack).toBeNull();
 });
 it('standing guard produces guard events, distinct from a crouching miss',()=>{
  const m=new Match('versus',['tyrannosaurus','triceratops'],[load('tyrannosaurus'),load('triceratops')],{partContacts:true,impactTiming:true});
  m.phase='fight';m.p1.x=500;m.p2.x=800;const hp=m.p2.health;const events=[];
  for(let i=0;i<150;i++){
   m.step({isHeld:(p,k)=>p===1&&k==='right',isPressed:(p,k)=>p===0&&i===0&&k==='light'},1/60);
   events.push(...m.consumeEvents());
  }
  expect(events.filter(e=>e.type==='guard')).toHaveLength(2);
  expect(events.some(e=>e.type==='hit')).toBe(false);expect(m.p2.health).toBe(hp);
 });
 it('repeated light input does not leave permanent stop or stun after input ceases',()=>{
  const m=new Match('versus',['tyrannosaurus','triceratops'],[load('tyrannosaurus'),load('triceratops')],{partContacts:true,impactTiming:true});
  m.phase='fight';m.p1.x=500;m.p2.x=1040;m.p2.health=10000;
  for(let i=0;i<720;i++)m.step({isHeld:()=>false,isPressed:(p,k)=>i<360&&i%8===0&&p===0&&k==='light'},1/60);
  expect(m.p1.hitstopFrames).toBe(0);expect(m.p2.hitstopFrames).toBe(0);
  expect(m.p1.state).toBe('idle');expect(m.p2.state).toBe('idle');expect(m.p2.heldBy).toBeNull();
 });
 for(const [id,kind] of [['tyrannosaurus','light'],['tyrannosaurus','heavy'],['triceratops','special'],['ankylosaurus','heavy']] as const)
 for(const side of [1,-1] as const)for(const mode of ['hit','miss','guard','wall'] as const){
  it(`${id}/${kind}/${side}/${mode}: damage preserved and recovery finite`,()=>{
   const results=[];
   for(const candidate of [false,true]){
    const m=new Match('versus',[id,'triceratops'],[load(id),load('triceratops')],{partContacts:true,impactTiming:candidate});m.phase='fight';m.p1.meter=100;
    const gap=mode==='miss'?1800:id==='tyrannosaurus'?540:450;
    m.p1.x=960-side*gap/2;m.p2.x=960+side*gap/2;m.p1.facing=side;m.p2.facing=-side as 1|-1;
    if(mode==='wall'){m.p2.x=side===1?1800:120;m.p1.x=m.p2.x-side*gap;}
    if(mode==='miss'){m.p2.y=-4000;m.p2.onGround=false;}
    const hp=m.p2.health;let hits=0,guards=0;
    for(let i=0;i<240;i++){
     if(mode==='miss'){m.p2.y=-4000;m.p2.vy=0;m.p2.onGround=false;}
     m.step({isHeld:(p,k)=>mode==='guard'&&p===1&&k==='down',isPressed:(p,k)=>i===0&&p===0&&k===kind},1/60);
     for(const e of m.consumeEvents()){if(e.type==='hit')hits++;if(e.type==='guard')guards++;}
    }
    expect(m.p2.heldBy).toBeNull();expect(m.p1.holding).toBeNull();expect(m.p2.hitstopFrames).toBe(0);
    if(mode!=='miss')expect(['idle','crouch','guard']).toContain(m.p2.state);
    results.push({damage:hp-m.p2.health,hits,guards});
   }
   expect(results[1]).toEqual(results[0]);
   if(mode==='miss')expect(results[1].damage).toBe(0);
  });
 }
});
