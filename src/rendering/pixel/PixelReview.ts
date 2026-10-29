/** DEV-only reproducible evidence runner. No combat data, speeds or art are modified. */
import { AssetLoader } from '../AssetLoader';
import { loadCharacterAssets } from '../CharacterAssets';
import { renderFighter, setOverlayLoader } from '../FighterRenderer';
import { Match } from '../../combat/Match';
import { PixelAnimator, drawPixelSample } from './PixelAnimation';
import { loadPixelAssets } from './PixelPilot';
import metadata from '../../../dev-art/tyrannosaurus/trex_pixel_anim_v2.json';

async function main() {
  if (!import.meta.env.DEV) return;
  const canvas = document.querySelector<HTMLCanvasElement>('#review')!;
  const g = canvas.getContext('2d')!;
  const button = document.querySelector<HTMLButtonElement>('#run')!;
  const status = document.querySelector('#status')!;
  const loader = new AssetLoader(); setOverlayLoader(loader);
  const character = await loadCharacterAssets(loader, 'tyrannosaurus');
  const art = await loadPixelAssets(loader);
  if (!character.master || !character.parts || loader.missingFiles.length) throw Error('기존 아트 로딩 불완전');
  const cases = [
    { name: '걷기 오른쪽 3주기 → 정지 → 뒷걸음', facing: 1, walk: true, miss: false, duration: 350 },
    { name: '걷기 왼쪽 3주기 → 정지', facing: -1, walk: true, miss: false, duration: 175 },
    ...[1, -1].flatMap(facing => [false, true].map(miss => ({ name: `${facing === 1 ? '오른쪽' : '왼쪽'} 물기 ${miss ? '헛방' : '명중'}`, facing, miss, walk: false, duration: 150 }))),
  ];
  let match: Match, clocks: PixelAnimator[], index = 0, tick = 0, globalTick = 0;
  let rows: object[] = [];
  function reset() {
    const c = cases[index];
    match = new Match('versus', ['tyrannosaurus', 'tyrannosaurus'], [character, character], { impactTiming: true });
    match.phase = 'fight';
    match.p1.x = c.walk ? (c.facing === 1 ? 300 : 1620) : (c.facing === 1 ? 600 : 1320);
    match.p2.x = c.walk ? (c.facing === 1 ? 950 : 970) : (c.facing === 1 ? (c.miss ? 1500 : 900) : (c.miss ? 420 : 1020));
    match.p1.facing = c.facing as 1 | -1; match.p2.facing = -c.facing as 1 | -1;
    clocks = [new PixelAnimator(), new PixelAnimator()]; tick = 0;
  }
  function frame() {
    const c = cases[index];
    const walking = c.walk && (tick < 140 || (index === 0 && tick >= 175 && tick < 315));
    const direction = (index === 0 && tick >= 175 ? -1 : 1) * c.facing;
    const frozen = match.fighters.map(f => f.hitstopFrames > 0);
    match.step({ isHeld: (p, a) => (p === 0 ? walking : c.walk && tick < 140) && a === ((p === 0 ? direction : c.facing) === 1 ? 'right' : 'left'),
      isPressed: (p, a) => p === 0 && !c.walk && tick === 30 && a === 'light' }, 1 / 60);
    match.fighters.forEach((f, i) => clocks[i].step(f, frozen[i]));
    g.fillStyle = '#172333'; g.fillRect(0, 0, 1920, 1300);
    g.font = '28px sans-serif'; g.fillStyle = '#fff';
    g.fillText(`${c.name} | 1× 60Hz | tick ${tick} | HP ${match.p2.health}`, 24, 38);
    for (let panel = 0; panel < 2; panel++) {
      g.save(); g.translate(panel * 960, 70); g.scale(.5, .5);
      g.strokeStyle = '#8899aa'; g.beginPath(); g.moveTo(0, 850); g.lineTo(1920, 850); g.stroke();
      for (const f of match.fighters) {
        const sample = clocks[f.player].sample(art.manifest, f);
        if (panel === 1 && sample) drawPixelSample(g, art, sample, f.x, 850 + f.y, f.facing);
        else renderFighter(g, f, 850, globalTick / 60, false);
      }
      g.restore(); g.fillStyle = '#fff'; g.fillText(panel ? '도트 v2 · 공통 화면배율 0.5' : '기존 · 공통 화면배율 0.5', panel * 960 + 24, 540);
    }
    const f = match.p1, sample = clocks[0].sample(art.manifest, f);
    g.fillStyle = '#fff'; g.fillText('아래: 도트 4배 확대 · 노랑=바닥 경계 · 빨강=해당 지지 구간 첫 발끝 월드 위치', 24, 610);
    g.strokeStyle = '#ffdc55'; g.beginPath(); g.moveTo(0, 1180); g.lineTo(1920, 1180); g.stroke();
    if (sample) drawPixelSample(g, art, sample, 960, 1180 + f.y, f.facing);
    let support: object | null = null;
    if (sample?.clip === 'walk') {
      const fi = sample.frame - 4;
      const contact = metadata.animations.walk.frames[fi].contacts.find(c => c.kind === 'foot_support')!;
      const toe = contact.soleX[1];
      const worldToe = Math.round(f.x) + f.facing * (toe - 100) * 4;
      support = { frame: fi, leg: contact.leg, toeX: toe, worldToe, groundErrorGamePx: (127 - contact.row) * 4 };
      const key = `${index}:${Math.floor(sample.tick / 43)}:${fi < 4 ? 'near' : 'far'}`;
      if (key !== lastSupport) { anchorToe = worldToe; lastSupport = key; }
      g.strokeStyle = '#ff6666'; g.beginPath(); const mark = 960 + anchorToe - Math.round(f.x); g.moveTo(mark, 1120); g.lineTo(mark, 1230); g.stroke();
      g.fillStyle = '#fff'; g.fillText(`지지발 ${contact.leg} · 구간 첫 위치 대비 ${worldToe - anchorToe}px · 수직오차 0px`, 24, 1270);
    }
    rows.push({ case: index, tick, globalTick, x: f.x, facing: f.facing, state: f.state, hp2: match.p2.health, attackTick: f.attack?.frame ?? null, sample, support });
    match.consumeEvents(); globalTick++; tick++;
    if (tick >= c.duration) { index++; if (index < cases.length) reset(); }
  }
  let lastSupport = '', anchorToe = 0;
  function download(blob: Blob, name: string) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); }
  button.disabled = false; status.textContent = '25장 연결 · 기존 아트 로딩 완료';
  button.onclick = () => {
    button.disabled = true; index = 0; globalTick = 0; rows = []; reset();
    const stream = canvas.captureStream(60), recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 5000000 });
    const chunks: Blob[] = []; recorder.ondataavailable = e => chunks.push(e.data);
    recorder.onstop = () => { download(new Blob(chunks, { type: 'video/webm' }), 'trex-v2-review.webm');
      download(new Blob([JSON.stringify({ cases, rows }, null, 2)], { type: 'application/json' }), 'trex-v2-trace.json');
      stream.getTracks().forEach(t => t.stop()); button.disabled = false; status.textContent = '기록 완료 · 영상과 실측 JSON 내려받음'; };
    recorder.start(); let last = performance.now(), accumulator = 0;
    function loop(now: number) {
      accumulator += now - last; last = now;
      while (accumulator >= 1000 / 60 && index < cases.length) { frame(); accumulator -= 1000 / 60; }
      if (index < cases.length) requestAnimationFrame(loop); else recorder.stop();
    }
    requestAnimationFrame(loop);
  };
}
void main().catch(error => { document.querySelector('#status')!.textContent = String(error); });
