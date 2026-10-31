/**
 * 안킬로 special(구르기) v4 인게임 캡처 — 파일럿 빌드(dist)에서 1P 안킬로를 골라
 * 계기 100까지 기다린 뒤 특수기를 쓰고 rAF마다 캔버스를 리드백한다.
 *
 * 사용: node scripts/shoot-anky-special.mjs <url> <outDir> [port]
 * 출력: <outDir>/NNN.png (+ stamps.json, performance.now)
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const URL = process.argv[2];
const OUT = process.argv[3];
const PORT = Number(process.argv[4] ?? 9393);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn('/usr/bin/google-chrome', [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--window-size=1920,1080', '--hide-scrollbars',
  '--force-device-scale-factor=1', '--no-first-run', '--no-sandbox', '--disable-gpu',
  `--user-data-dir=/tmp/profile-${PORT}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
chrome.stderr.on('data', () => {});
for (let i = 0; i < 80; i++) { await sleep(250); try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) break; } catch {} }
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
const KEY = { KeyF: [70, 'f'], KeyG: [71, 'g'], KeyH: [72, 'h'], KeyJ: [74, 'j'], KeyS: [83, 's'], KeyD: [68, 'd'],
  ArrowLeft: [37, 'ArrowLeft'], ArrowRight: [39, 'ArrowRight'], ArrowDown: [40, 'ArrowDown'], ArrowUp: [38, 'ArrowUp'] };
const kd = (c) => send('Input.dispatchKeyEvent', { type: 'keyDown', code: c, key: KEY[c][1], windowsVirtualKeyCode: KEY[c][0] });
const ku = (c) => send('Input.dispatchKeyEvent', { type: 'keyUp', code: c, key: KEY[c][1], windowsVirtualKeyCode: KEY[c][0] });
const key = async (c, hold = 90) => { await kd(c); await sleep(hold); await ku(c); await sleep(450); };
const scene = async () => (await ev('window.__dotScene || ""')) || '';
const waitScene = async (name, ms = 15000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = (await scene()).toLowerCase();
    if (s.startsWith(name.toLowerCase())) return s;
    await sleep(200);
  }
  throw new Error(`scene ${name} timeout, now=${await scene()}`);
};
await send('Page.navigate', { url: URL });
await waitScene('title', 30000);
await key('KeyF');
await waitScene('mode');
await key('ArrowDown');
await key('KeyF');
await waitScene('character');
for (let i = 0; i < 4; i++) await key('KeyD'); // 1P: 티라노 → 안킬로(2×6 격자 오른쪽 4칸)
await key('KeyF');
await key('KeyJ'); // 2P 기본(티라노)
await waitScene('stage');
await key('KeyF'); // 경기장 확정
await waitScene('battle', 40000);
await sleep(14000); // 계기 50 → 100 (4/s)
const startRec = `(()=>{const c=document.getElementById('game');window.__rec=[];window.__recOn=true;
const loop=()=>{if(!window.__recOn)return;window.__rec.push([performance.now(),c.toDataURL('image/png')]);requestAnimationFrame(loop);};requestAnimationFrame(loop);return true;})()`;
await ev(startRec);
await kd('KeyH'); await sleep(100); await ku('KeyH');
await sleep(Number(process.env.CAPTURE_MS ?? 2500));
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
