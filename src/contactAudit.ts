import { AssetLoader } from './rendering/AssetLoader';
import { loadCharacterAssets } from './rendering/CharacterAssets';
import { Match } from './combat/Match';
import { NULL_INPUT } from './combat/Fighter';
import { contactPose, type BodyRegion } from './combat/partContact';
import { spriteScale } from './rendering/rig';
import type { AttackKind } from './combat/types';
import { CHARACTERS, MOVES } from './data';
import { renderFighter, setOverlayLoader } from './rendering/FighterRenderer';

/** Deterministic review harness: no gameplay changes, no animation wall-clock. */
export async function createContactAudit(mouthV2 = false) {
  const requested=new URLSearchParams(location.search).get('species')??'tyrannosaurus';
  const species=CHARACTERS.some(c=>c.id===requested)?requested:'tyrannosaurus';
  const assets = await Promise.all([species,species==='triceratops'?'tyrannosaurus':'triceratops'].map(id => loadCharacterAssets(new AssetLoader(), id,
    mouthV2 && id === 'tyrannosaurus' ? 'assets/characters/tyrannosaurus/parts/mouth-v2' :
    ['tyrannosaurus','triceratops'].includes(id)?`assets/characters/${id}/parts/integrated-v3`:undefined)));
  let match: Match, frame = 0;
  let events: unknown[] = [];
  const projectileLoader = new AssetLoader();
  setOverlayLoader(projectileLoader);
  await projectileLoader.loadImages([...new Set(MOVES.flatMap(m=>[
    ...(m.script?.overlays??[]).map(o=>o.sprite),
    ...(m.script?.events??[]).flatMap(e=>e.type==='projectile'&&e.sprite?[e.sprite]:[]),
  ]))]);
  function reset(id: number, facing: 1 | -1 = 1, gap = 600) {
    const a = assets[id], b = assets[1 - id];
    match = new Match('versus', [a.id, b.id], [a, b], { partContacts: true });
    match.phase = 'fight'; match.p1.x = 960 - facing * gap / 2; match.p2.x = 960 + facing * gap / 2;
    match.p1.facing = facing; match.p2.facing = -facing as 1 | -1; match.p1.meter = 100;
    events = []; frame = 0;
  }
  reset(0);
  const canvas = document.createElement('canvas'); canvas.width = 1920; canvas.height = 1080;
  document.body.replaceChildren(canvas); canvas.style.cssText = 'width:100%;height:auto';
  const g = canvas.getContext('2d')!;
  function tick(kind?: AttackKind) {
    match.step(kind ? { isHeld: () => false, isPressed: (p, a) => p === 0 && a === kind } : NULL_INPUT, 1 / 60);
    events.push(...match.consumeEvents().map(e => ({ ...e, frame })));
    frame++;
  }
  function regionHit(region: BodyRegion, player: 0 | 1 = 1) {
    const f = match.fighters[player], c = contactPose(f).hurt.find(c => c.region === region)!;
    match.projectiles.push({ owner: (1 - player) as 0 | 1, kind: 'light', x: c.x, y: c.y, vx: 0, vy: 0,
      gravity: 0, rotation: 0, spin: 0, life: 0.1, age: 0, attackId: 999, spent: false, facing: -f.facing as 1 | -1,
      spec: { x: 0, y: 0, vx: 0, w: 2, h: 2, life: 0.1, damage: 10, hitstop: 0, hitstun: 24, knockback: 0 } });
    tick();
  }
  function drawParts(player: number) {
    renderFighter(g,match.fighters[player],0,frame/60,false);
  }
  function draw(label: string, debug = true, close = false, mouth = false) {
    g.fillStyle = '#172333'; g.fillRect(0, 0, 1920, 1080);
    g.fillStyle = '#fff'; g.font = '30px sans-serif'; g.fillText(label, 25, 45);
    g.font = '22px sans-serif';
    g.fillText(`프레임 ${frame} · 입력 중단 후 ${(frame / 60).toFixed(2)}초 · HP ${match.p1.health} / ${match.p2.health} · 효과 OFF`, 25, 83);
    if (close) {
      const f = match.p2, rig = f.assets.parts!.rig;
      const scale = spriteScale(f.data.displayHeight, f.assets.rig!.master.box);
      const head = rig.parts.head;
      // Fixed crop, never track a moving joint (tracking would conceal residual motion).
      const neckX = f.x + f.facing * ((mouth ? 1650 : head.pivotX!) - f.assets.rig!.root.x) * scale;
      const neckY = f.y + ((mouth ? 440 : head.pivotY!) - f.assets.rig!.root.y) * scale;
      const views = [{ x: 0, y: 130, w: 960, h: 880, cx: neckX, cy: neckY, label: '목 · 아트 원본 1px = 영상 1px' },
        { x: 960, y: 130, w: 960, h: 880, cx: f.x, cy: -90, label: '발 · 아트 원본 1px = 영상 1px' }];
      for (const v of views) {
        g.save(); g.beginPath(); g.rect(v.x, v.y, v.w, v.h); g.clip();
        g.translate(v.x + v.w / 2, v.y + v.h / 2); g.scale(1 / scale, 1 / scale); g.translate(-v.cx, -v.cy);
        drawParts(1);
        if (debug) { g.strokeStyle = '#ff6982'; g.lineWidth = scale * 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(1920, 0); g.stroke(); }
        g.restore(); g.fillStyle = '#fff'; g.fillText(v.label, v.x + 15, 118);
      }
    } else {
      g.save(); g.translate(0, 900); drawParts(0); drawParts(1);
      for (const p of match.projectiles) {
        const size = 1 + (p.spec.grow ?? 0) * p.age;
        const image = p.spec.sprite ? projectileLoader.image(p.spec.sprite) : null;
        if (image) g.drawImage(image, p.x - p.spec.w * size / 2, p.y - p.spec.h * size / 2, p.spec.w * size, p.spec.h * size);
        if (debug) { g.strokeStyle = '#87efff'; g.lineWidth = 3; g.strokeRect(p.x - p.spec.w * size / 2, p.y - p.spec.h * size / 2, p.spec.w * size, p.spec.h * size); }
      }
      if (debug) {
        g.strokeStyle = '#fc6'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(1920, 0); g.stroke();
        for (const f of match.fighters) {
          const pose = contactPose(f);
          for (const c of pose.hurt) { g.strokeStyle = '#67d6b9'; g.beginPath(); g.arc(c.x, c.y, c.r, 0, 7); g.stroke(); }
          if (match.scriptHitboxes(f).length) for (const c of pose.weapon) { g.strokeStyle = '#ff667e'; g.beginPath(); g.arc(c.x, c.y, c.r, 0, 7); g.stroke(); }
        }
      }
      g.restore();
    }
    g.fillStyle = '#fff'; g.font = '20px monospace';
    g.fillText(`반응 잔여 ${Object.entries(match.p2.reaction).map(([k, s]) => `${k}=${s.value.toFixed(3)}`).join(' / ')}`, 25, 1050);
  }
  function footDepth() {
    const f = match.p2, temp = document.createElement('canvas'); temp.width = 1920; temp.height = 1080;
    const ctx = temp.getContext('2d', { willReadFrequently: true })!;
    const pose = contactPose(f);
    for (const name of f.assets.parts!.rig.drawOrder.filter(n => n.includes('leg'))) {
      ctx.save(); ctx.translate(0, 900); ctx.transform(...pose.matrices[name]); ctx.drawImage(f.assets.parts!.images[name], 0, 0); ctx.restore();
    }
    const pixels = ctx.getImageData(0, 0, 1920, 1080).data;
    let bottom = 0;
    for (let y = 850; y < 960; y++) for (let x = 0; x < 1920; x++) if (pixels[(y * 1920 + x) * 4 + 3] > 128) bottom = Math.max(bottom, y);
    return bottom - 900;
  }
  return { reset, tick, draw, regionHit, footDepth, canvas, pose: (player:0|1)=>contactPose(match.fighters[player]), match: () => match, events: () => events,
    summary: () => ({ frame, hp: match.p2.health, reactions: match.p2.reaction, events }) };
}
