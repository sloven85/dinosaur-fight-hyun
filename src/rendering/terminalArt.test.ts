import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {CHARACTERS} from '../data';
import manifest from '../../docs/terminal-art-manifest.json';
describe('approved terminal art binding',()=>{
  for(const c of CHARACTERS)it(`${c.id} binds usable down/victory with intact margin and correct feet`,()=>{
    const base=`public/assets/characters/${c.id}`;
    const rig=JSON.parse(readFileSync(`${base}/rig.json`,'utf8'));
    for(const state of ['down','victory']){
      const p=rig.poses[state];expect(p.usable).toBe(true);expect(p.box.minY).toBeGreaterThan(0);
      expect(p.rootY).toBe(p.box.maxY);expect(p.box.w).toBeGreaterThan(300);
      const file=readFileSync(`${base}/${p.imagePath}`);
      const source=manifest.find(m=>m.id===c.id&&m.state===state);
      if(source)expect(createHash('sha256').update(file).digest('hex')).toBe(source.sha256);
    }
  });
});
