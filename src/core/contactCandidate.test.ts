import { afterEach, describe, expect, it, vi } from 'vitest';
import { contactCandidate } from './contactCandidate';
describe('release candidate opt-in',()=>{
  afterEach(()=>vi.unstubAllGlobals());
  it('leaves normal main-game URLs unchanged',()=>{
    vi.stubGlobal('location',{search:''});expect(contactCandidate()).toBe(false);
    vi.stubGlobal('location',{search:'?contactLab=1'});expect(contactCandidate()).toBe(false);
  });
  it('enables candidate only through its explicit flag',()=>{
    vi.stubGlobal('location',{search:'?contactCandidate=1'});expect(contactCandidate()).toBe(true);
  });
});
