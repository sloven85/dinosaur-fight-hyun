import { describe,expect,it } from 'vitest';
import { CHARACTERS } from '../data';
import { Match } from './Match';
import { NULL_INPUT } from './Fighter';
import { terminalLayout } from '../rendering/terminalPose';
import { readFileSync } from 'node:fs';
describe('terminal pose lifecycle',()=>{
  for(const c of CHARACTERS)for(const player of [0,1] as const)for(const scenario of ['ground','air','hold']){
    it(`${c.id} P${player+1} ${scenario} KO settles and rematches cleanly`,()=>{
      const m=new Match('versus',[c.id,c.id]);m.phase='fight';
      const loser=m.fighters[player],winner=m.fighters[1-player];
      winner.roundWins=1;loser.health=0;
      if(scenario!=='ground'){loser.y=-650;loser.onGround=false;winner.y=-300;winner.onGround=false;}
      if(scenario==='hold'){loser.heldBy=winner;winner.holding=loser;loser.state='held';loser.heldRot=.3;}
      loser.reaction.head.value=18;loser.vx=200;loser.vy=-600;
      m.step(NULL_INPUT,1/60);expect(m.phase).toBe('roundOver');
      expect(loser.state).toBe('down');expect(winner.state).toBe('victory');
      expect(loser.heldBy).toBeNull();expect(winner.holding).toBeNull();
      expect(loser.scriptVisual).toBeNull();expect(loser.heldRot).toBe(0);
      expect(loser.reaction.head.value).toBe(0);expect(loser.vx).toBe(0);
      for(let i=0;i<400;i++)m.step(NULL_INPUT,1/60);
      expect(m.phase).toBe('matchOver');
      for(const f of m.fighters){expect(f.y).toBe(0);expect(f.vy).toBe(0);expect(f.onGround).toBe(true);}
      const rematch=new Match('versus',[c.id,c.id]);
      for(const f of rematch.fighters){expect(f.state).toBe('idle');expect(f.y).toBe(0);expect(f.heldBy).toBeNull();expect(f.scriptVisual).toBeNull();}
    });
  }
  it('uniform end pose fit preserves aspect ratio and all four viewport edges',()=>{
    for(const c of CHARACTERS){
      const rig=JSON.parse(readFileSync(`public/assets/characters/${c.id}/rig.json`,'utf8'));
      for(const state of ['victory','down']){
        const box=rig.poses[state]?.box??rig.master.box;
        for(const x of [100,600,1320,1820])for(const facing of [-1,1]){
          const p=terminalLayout(box,c.displayHeight/rig.master.box.h,x,900,0,facing);
          expect(p.center-box.w*p.scale/2).toBeGreaterThanOrEqual(39.9);
          expect(p.center+box.w*p.scale/2).toBeLessThanOrEqual(1880.1);
          expect(p.feet-box.h*p.scale).toBeGreaterThanOrEqual(179.9);
          expect(p.feet).toBe(900);
        }
      }
    }
  });
});
