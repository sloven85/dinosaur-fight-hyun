/**
 * 걷기/대기 연속 캡처 — 서기(idle) 1.2초 → 왼쪽 걷기 2.2초를 한 번에 받는다.
 * shoot-walk-public.mjs와 같은 키 시퀀스(제목 F → 모드 ←아래 2인 → F → 1P F → 2P J → 경기장 F)를 쓴다.
 * 캔버스 리드백은 rAF마다 toDataURL('image/png') — 도트 팔레트 실측용이라 JPEG를 쓰지 않는다.
 *
 * 사용: node scripts/shoot-walk-seq.mjs <url> <outDir> [leftKey] [port] [idleMs] [walkMs]
 * 출력: <outDir>/idle/000.png…, <outDir>/walk/000.png…, <outDir>/idle.json, <outDir>/walk.json (performance.now)
 * 빌드 파라미터(내부): 배포판에는 __dotScene 훅이 없으므로 메뉴는 고정 키 시퀀스로만 넘긴다.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const URL = process.argv[2];
const OUT = process.argv[3];
const LEFT = process.argv[4] ?? 'ArrowLeft';
const PORT = Number(process.argv[5] ?? 9391);
const IDLE = Number(process.argv[6] ?? 1200);
const WALK = Number(process.argv[7] ?? 2200);
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
const KEY = { KeyF: [70, 'f'], KeyJ: [74, 'j'], KeyK: [75, 'k'], ArrowLeft: [37, 'ArrowLeft'], ArrowRight: [39, 'ArrowRight'], ArrowDown: [40, 'ArrowDown'] };
const kd = (c) => send('Input.dispatchKeyEvent', { type: 'keyDown', code: c, key: KEY[c][1], windowsVirtualKeyCode: KEY[c][0] });
const ku = (c) => send('Input.dispatchKeyEvent', { type: 'keyUp', code: c, key: KEY[c][1], windowsVirtualKeyCode: KEY[c][0] });
const key = async (c, hold = 90) => { await kd(c); await sleep(hold); await ku(c); await sleep(450); };
await send('Page.navigate', { url: URL });
await sleep(7500);
await key('KeyF'); await key('ArrowDown'); await key('KeyF'); await key('KeyF'); await key('KeyJ'); await key('KeyF');
await sleep(7000);
const startRec = `(()=>{const c=document.getElementById('game');window.__rec=[];window.__recOn=true;
const loop=()=>{if(!window.__recOn)return;window.__rec.push([performance.now(),c.toDataURL('image/png')]);requestAnimationFrame(loop);};requestAnimationFrame(loop);return true;})()`;
const drain = async (dir) => {
  await ev('window.__recOn=false');
  const n = await ev('window.__rec.length');
  mkdirSync(`${dir}`, { recursive: true });
  const stamps = [];
  for (let i = 0; i < n; i++) {
    const item = await ev(`(function(){const r=window.__rec[${i}];return r?r:null;})()`);
    if (!item) continue;
    stamps.push(item[0]);
    writeFileSync(`${dir}/${String(i).padStart(3, '0')}.png`, Buffer.from(item[1].split(',')[1], 'base64'));
  }
  writeFileSync(`${dir}.json`, JSON.stringify(stamps));
  console.log(dir, 'frames', stamps.length);
  return stamps.length;
};
// 1) 대기: 가만히 서서 1.2초
await ev(startRec);
await sleep(IDLE);
await drain(`${OUT}/idle`);
// 2) 걷기: 왼쪽을 2.2초 누른 채
await ev(startRec);
await kd(LEFT); await sleep(WALK); await ku(LEFT);
await drain(`${OUT}/walk`);
ws.close(); chrome.kill('SIGKILL');
