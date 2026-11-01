/**
 * 기술 한 번의 인게임 프레임 리드백 — 파일럿 빌드(dist)에서 1P 종을 골라 기술을 쓰고
 * rAF마다 캔버스를 toDataURL로 받는다(Page.screencast보다 위상이 고르다).
 *
 * 사용: node scripts/shoot-move-frames.mjs <url> <outDir> --species=ankylosaurus --button=KeyH [--wait=14000] [--ms=2600]
 * 출력: <outDir>/NNN.png + stamps.json
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const URL = args[0];
const OUT = args[1];
const opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? '1'];
}));
const PORT = Number(opt.port ?? 9394);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn('/usr/bin/google-chrome', [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--window-size=1920,1080', '--hide-scrollbars',
  '--force-device-scale-factor=1', '--no-first-run', '--no-sandbox', '--disable-gpu',
  `--user-data-dir=/tmp/profile-${PORT}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
chrome.stderr.on('data', () => {});
for (let i = 0; i < 80; i++) { await sleep(250); try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) break; } catch { /* 준비 중 */ } }

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
let id = 0; const pending = new Map();
ws.addEventListener('message', (e) => {
  const d = JSON.parse(e.data);
  if (d.id && pending.has(d.id)) { const { resolve, reject } = pending.get(d.id); pending.delete(d.id); d.error ? reject(new Error(d.error.message)) : resolve(d.result); }
});
const send = (m, p = {}) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result.value;

await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });

const KEY = { KeyF: [70, 'f'], KeyG: [71, 'g'], KeyH: [72, 'h'], KeyJ: [74, 'j'], KeyD: [68, 'd'],
  ArrowLeft: [37, 'ArrowLeft'], ArrowRight: [39, 'ArrowRight'], ArrowDown: [40, 'ArrowDown'] };
const kd = (c) => send('Input.dispatchKeyEvent', { type: 'keyDown', code: c, key: KEY[c][1], windowsVirtualKeyCode: KEY[c][0] });
const ku = (c) => send('Input.dispatchKeyEvent', { type: 'keyUp', code: c, key: KEY[c][1], windowsVirtualKeyCode: KEY[c][0] });
const key = async (c, hold = 90) => { await kd(c); await sleep(hold); await ku(c); await sleep(420); };
const scene = async () => (await ev('window.__dotScene || ""')) || '';
const waitScene = async (name, ms = 20000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if ((await scene()).toLowerCase().startsWith(name.toLowerCase())) return;
    await sleep(200);
  }
  throw new Error(`scene ${name} timeout, now=${await scene()}`);
};

const SPECIES = ['tyrannosaurus', 'triceratops', 'velociraptor', 'spinosaurus', 'ankylosaurus', 'stegosaurus',
  'carnotaurus', 'pachycephalosaurus', 'therizinosaurus', 'dilophosaurus', 'brachiosaurus', 'pteranodon'];
const speciesIdx = Math.max(0, SPECIES.indexOf(opt.species ?? 'ankylosaurus'));

await send('Page.navigate', { url: URL });
await waitScene('title', 30000);
await key('KeyF');                       // 제목 → 모드
await waitScene('mode');
await key('ArrowDown');                  // 2인 대전(상대가 가만히 있는다)
await key('KeyF');
await waitScene('character');
for (let i = 0; i < speciesIdx; i++) await key('KeyD');
await key('KeyF');                       // 1P 확정
await key('KeyJ');                       // 2P 확정(기본 티라노)
await waitScene('stage');
await key('KeyF');                       // 경기장 확정
await waitScene('battle', 40000);
await sleep(Number(opt.wait ?? 14000));  // 계기 충전(특수기는 100 필요)

const startRec = `(()=>{const c=document.getElementById('game');window.__rec=[];window.__recOn=true;
const loop=()=>{if(!window.__recOn)return;window.__rec.push([performance.now(),c.toDataURL('image/png')]);requestAnimationFrame(loop);};requestAnimationFrame(loop);return true;})()`;
await ev(startRec);
await sleep(220);
const button = opt.button ?? 'KeyH';
await kd(button); await sleep(110); await ku(button);
await sleep(Number(opt.ms ?? 2600));
await ev('window.__recOn=false');
const n = await ev('window.__rec.length');
mkdirSync(OUT, { recursive: true });
const stamps = [];
for (let i = 0; i < n; i++) {
  const item = await ev(`(function(){const r=window.__rec[${i}];return r?r:null;})()`);
  if (!item) continue;
  stamps.push(item[0]);
  writeFileSync(`${OUT}/${String(i).padStart(3, '0')}.png`, Buffer.from(item[1].split(',')[1], 'base64'));
}
writeFileSync(`${OUT}/stamps.json`, JSON.stringify(stamps));
console.log('frames', stamps.length, 'scene', await scene());
ws.close(); chrome.kill('SIGKILL');
