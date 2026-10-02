import { AssetLoader } from './rendering/AssetLoader';
import { loadCharacterAssets } from './rendering/CharacterAssets';
import { renderFighter } from './rendering/FighterRenderer';
import { Match } from './combat/Match';
import { NULL_INPUT } from './combat/Fighter';
import { contactPose, type BodyRegion } from './combat/partContact';
import { InputManager } from './input/InputManager';

/** Review surface using the real Match/InputManager/renderer; never changes the shipped defaults. */
export async function startContactLab(canvas: HTMLCanvasElement): Promise<void> {
  document.body.innerHTML = `<main style="max-width:1500px;margin:auto;color:#e9f2ff;font:16px system-ui;padding:12px">
    <h2>2D 접촉 비교판 · 티라노 / 트리케라</h2>
    <p>왼쪽: 기존 전신 판정 · 오른쪽: 파츠 판정 + 제한 스프링 | 효과·카메라 흔들림·소리 OFF</p>
    <p><a href="/contact-lab.html" style="color:#7de">접촉 검수판(기존 아트)</a> · <a href="/contact-lab.html?mouthV2=1" style="color:#7de">별도 티라노 입속 v2 시험판</a></p>
    <div id="controls" style="display:flex;gap:10px;flex-wrap:wrap">
      <button id="reset">대전 초기화</button><button id="swap">공수 교환</button>
      <button id="mirror">좌우 반전</button><button id="boxes">판정 표시 ON/OFF</button>
      <button data-probe="head">머리 접촉 시험</button><button data-probe="torso">몸통 접촉 시험</button>
      <button data-probe="leg">다리 접촉 시험</button><button data-probe="tail">꼬리 접촉 시험</button>
      <button id="pause">일시정지</button>
    </div><p>대전: 1P WASD + F/G/H · 2P 방향키 + J/K/L · 패드는 아무 얼굴 버튼으로 참가. 접촉 시험은 청록색 시험구(실제 기술 아님).</p>
    <div id="surface"></div><pre id="status" style="white-space:pre-wrap"></pre>
    <p>청록: 머리 · 노랑: 몸통 · 보라: 다리 · 초록: 꼬리 · 빨강: 활성 공격 · 흰 사각형: 밀어내기. 접촉 점과 부위는 아래 기록됩니다.</p>
  </main>`;
  document.querySelector('#surface')!.append(canvas);
  canvas.width = 1920; canvas.height = 740;
  canvas.style.cssText = 'width:100%;height:auto;display:block;border:1px solid #53647b';
  const g = canvas.getContext('2d')!;
  const loader = new AssetLoader();
  const mouthV2 = new URLSearchParams(location.search).has('mouthV2');
  const assets = await Promise.all(['tyrannosaurus', 'triceratops'].map(id => loadCharacterAssets(loader, id,
    mouthV2 && id === 'tyrannosaurus' ? 'assets/characters/tyrannosaurus/parts/mouth-v2' : undefined)));
  if (assets.some(a => !a.parts || !a.rig || !a.master)) throw new Error('파일럿 에셋 로드 실패');
  const input = new InputManager();
  let matches: Match[] = [], swapped = false, mirrored = false, debug = true, paused = false;
  let tick = 0;
  let probe: { region: BodyRegion; age: number } | null = null;
  const labels: Record<BodyRegion, string> = { head: '머리', torso: '몸통', leg: '다리', tail: '꼬리' };
  const colors: Record<BodyRegion, string> = { head: '#54e5ff', torso: '#ffd166', leg: '#d393ff', tail: '#8eef99' };
  const logs: string[] = [];
  function reset(): void {
    const ordered = swapped ? [assets[1], assets[0]] : assets;
    matches = [false, true].map(partContacts => {
      const m = new Match('versus', [ordered[0].id, ordered[1].id], [ordered[0], ordered[1]], { partContacts });
      m.phase = 'fight'; m.p1.x = mirrored ? 1260 : 660; m.p2.x = mirrored ? 660 : 1260;
      m.p1.facing = mirrored ? -1 : 1; m.p2.facing = mirrored ? 1 : -1;
      return m;
    });
    probe = null; logs.length = 0; tick = 0;
  }
  reset();
  document.querySelector('#reset')!.addEventListener('click', reset);
  document.querySelector('#swap')!.addEventListener('click', () => { swapped = !swapped; reset(); });
  document.querySelector('#mirror')!.addEventListener('click', () => { mirrored = !mirrored; reset(); });
  document.querySelector('#boxes')!.addEventListener('click', () => { debug = !debug; });
  document.querySelector('#pause')!.addEventListener('click', () => { paused = !paused; input.resume(); });
  function beginProbe(region: BodyRegion): void {
    reset(); probe = { region, age: 0 };
    const target = contactPose(matches[1].p2).hurt.find(c => c.region === region)!;
    const side = mirrored ? -1 : 1;
    const leg = region === 'leg';
    for (const m of matches) m.projectiles.push({ owner: 0, kind: 'light',
      x: target.x + (leg ? side * 220 : 0), y: target.y - (leg ? 0 : 220),
      vx: leg ? -side * 540 : 0, vy: leg ? 0 : 540, gravity: 0,
      rotation: 0, spin: 0, life: 0.65, age: 0, attackId: 900001, spent: false, facing: side,
      spec: { x: 0, y: 0, vx: 0, w: 12, h: 12, life: 0.65, damage: 10 / m.p1.data.damageScale,
        knockback: 0, hitstun: 24, hitstop: 0 } });
  }
  document.querySelectorAll<HTMLButtonElement>('[data-probe]').forEach(b => b.addEventListener('click', () => beginProbe(b.dataset.probe as BodyRegion)));
  function update(): void {
    input.update();
    if (input.anyPressed('pause')) { paused = !paused; input.resume(); }
    if (input.isPaused) paused = true;
    if (paused) return;
    tick++;
    for (const m of matches) {
      m.step(probe ? NULL_INPUT : input, 1 / 60);
      for (const e of m.consumeEvents()) if (e.type === 'hit' || e.type === 'guard') {
        logs.unshift(`${m.p1.partContacts ? '이후' : '이전'}: ${e.region ? labels[e.region] : '전신'} (${e.x.toFixed(1)}, ${e.y.toFixed(1)}) ${e.type}`);
      }
    }
    if (probe && ++probe.age > 180) probe = null;
    (document.querySelector('#status') as HTMLElement).textContent = logs.slice(0, 6).join('\n') || '두 판은 같은 입력을 받습니다. 판정 방식 차이로 위치·명중 결과가 달라질 수 있습니다.';
  }
  function draw(): void {
    g.fillStyle = '#172333'; g.fillRect(0, 0, 1920, 740);
    matches.forEach((m, i) => {
      g.save(); g.beginPath(); g.rect(i * 960, 0, 960, 740); g.clip();
      g.translate(i * 960, 110); g.scale(0.5, 0.5);
      g.fillStyle = '#263d45'; g.fillRect(0, 880, 1920, 400);
      g.strokeStyle = '#8297a2'; g.beginPath(); g.moveTo(0, 880); g.lineTo(1920, 880); g.stroke();
      for (const f of m.fighters) renderFighter(g, f, 880, tick / 60, false);
      // A damaging projectile is gameplay geometry, not a cosmetic effect. Keep it visible.
      for (const p of m.projectiles) {
        if (!p.spec.sprite) {
          g.fillStyle = '#7dffff'; g.beginPath(); g.arc(p.x, p.y + 880, 9, 0, Math.PI * 2); g.fill();
          continue;
        }
        const image = loader.image(p.spec.sprite);
        if (!image) void loader.loadImage(p.spec.sprite);
        const grow = 1 + (p.spec.grow ?? 0) * p.age;
        if (image) g.drawImage(image, p.x - p.spec.w * grow / 2, 880 + p.y - p.spec.h * grow / 2, p.spec.w * grow, p.spec.h * grow);
      }
      if (debug) for (const f of m.fighters) {
        g.save(); g.translate(0, 880); g.lineWidth = 3;
        if (i === 1) {
          const pose = contactPose(f);
          for (const c of pose.hurt) { g.strokeStyle = colors[c.region]; g.beginPath(); g.arc(c.x, c.y, c.r, 0, Math.PI * 2); g.stroke(); }
          if (m.scriptHitboxes(f).length) for (const c of pose.weapon) { g.strokeStyle = '#ff5757'; g.beginPath(); g.arc(c.x, c.y, c.r, 0, Math.PI * 2); g.stroke(); }
          if (f.lastContact) { g.fillStyle = '#fff'; g.beginPath(); g.arc(f.lastContact.x, f.lastContact.y, 7, 0, Math.PI * 2); g.fill(); }
        } else {
          const b = f.hurtbox(); g.strokeStyle = '#54e5ff'; g.strokeRect(b.left, b.top, b.right - b.left, b.bottom - b.top);
          for (const b of m.scriptHitboxes(f)) { g.strokeStyle = '#ff5757'; g.strokeRect(b.left, b.top, b.right - b.left, b.bottom - b.top); }
        }
        g.strokeStyle = '#fff'; g.strokeRect(f.x - m.pushWidth(f) / 2, -160, m.pushWidth(f), 160); g.restore();
      }
      g.restore();
      g.fillStyle = '#eef6ff'; g.font = '24px system-ui'; g.fillText(i ? '이후 · 부위 접촉 / 감쇠 반응' : '이전 · 전신 사각형', i * 960 + 22, 42);
      g.font = '20px system-ui'; g.fillText(`1P HP ${m.p1.health}     2P HP ${m.p2.health}`, i * 960 + 22, 78);
    });
    g.fillStyle = '#9aafc1'; g.font = '20px system-ui';
    g.fillText(probe ? `시험구: ${labels[probe.region]} (실제 기술 아님)` : '같은 입력 · 실제 대전', 22, 710);
  }
  // Review-only automation surface, also used by deterministic video capture.
  Object.assign(window, { contactLab: { matches: () => matches, probe: beginProbe, reset, step: () => { update(); draw(); }, setPaused: (v: boolean) => { paused = v; } } });
  let last = performance.now(), accumulator = 0;
  function frame(now: number): void {
    accumulator += Math.min((now - last) / 1000, 0.1); last = now;
    while (accumulator >= 1 / 60) { update(); accumulator -= 1 / 60; }
    draw(); requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
