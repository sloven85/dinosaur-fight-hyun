/**
 * 공개 베타(배포판) 걷기 캡처 — 배포 URL을 헤드리스로 띄워 1P를 왼쪽으로 걷게 하며
 * 캔버스를 rAF마다 그대로 받는다(Page.screencast는 배포판에서 ~9fps라 위상이 뜁니다).
 *
 * 사용: node scripts/shoot-walk-public.mjs <url> <outDir> [leftKey] [port] [holdMs]
 * 출력: <outDir>/walk_1p/*.jpg + frames.json(performance.now, ms)
 * 주의: 배포판에는 __dotScene/__dotPhase 훅이 없어 메뉴를 고정 키 시퀀스로 넘긴다.
 *       (제목 F → 모드 ←아래 2인 → F → 1P F → 2P J → 경기장 F → 대기 → 걷기)
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const URL = process.argv[2]; const OUT = process.argv[3]; const LEFT = process.argv[4] ?? 'ArrowLeft';
const PORT = Number(process.argv[5] ?? 9381); const HOLD = Number(process.argv[6] ?? 2200);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn('/usr/bin/google-chrome', ['--headless=new', `--remote-debugging-port=${PORT}`, '--window-size=1920,1080', '--hide-scrollbars', '--force-device-scale-factor=1', '--no-first-run', '--no-sandbox', '--disable-gpu', `--user-data-dir=/tmp/profile-${PORT}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
chrome.stderr.on('data', () => {});
for (let i = 0; i < 80; i++) { await sleep(250); try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) break; } catch {} }
const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
let id = 0; const pending = new Map();
ws.addEventListener('message', (e) => { const d = JSON.parse(e.data); if (d.id && pending.has(d.id)) { const { resolve, reject } = pending.get(d.id); pending.delete(d.id); d.error ? reject(new Error(d.error.message)) : resolve(d.result); } });
const send = (m, p = {}) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result.value;
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
const KEY = { KeyF: [70, 'f'], KeyJ: [74, 'j'], KeyK: [75, 'k'], KeyA: [65, 'a'], KeyD: [68, 'd'], ArrowLeft: [37, 'ArrowLeft'], ArrowRight: [39, 'ArrowRight'], ArrowDown: [40, 'ArrowDown'] };
const kd = (c) => send('Input.dispatchKeyEvent', { type: 'keyDown', code: c, key: KEY[c][1], windowsVirtualKeyCode: KEY[c][0] });
const ku = (c) => send('Input.dispatchKeyEvent', { type: 'keyUp', code: c, key: KEY[c][1], windowsVirtualKeyCode: KEY[c][0] });
const key = async (c, hold = 90) => { await kd(c); await sleep(hold); await ku(c); await sleep(450); };
await send('Page.navigate', { url: URL });
await sleep(7500);
await key('KeyF'); await key('ArrowDown'); await key('KeyF'); await key('KeyF'); await key('KeyJ'); await key('KeyF');
await sleep(7000);
await ev(`(()=>{const c=document.getElementById('game');window.__rec=[];window.__recOn=true;
const loop=()=>{if(!window.__recOn)return;window.__rec.push([performance.now(),c.toDataURL('image/jpeg',0.95)]);requestAnimationFrame(loop);};requestAnimationFrame(loop);return true;})()`);
await kd(LEFT); await sleep(HOLD); await ku(LEFT);
await ev('window.__recOn=false');
const n = await ev('window.__rec.length');
console.log('frames', n);
mkdirSync(`${OUT}/walk_1p`, { recursive: true });
const stamps = [];
for (let i = 0; i < n; i++) {
  const item = await ev(`(function(){const r=window.__rec[${i}];return r?[r[0],r[1]]:null;})()`);
  if (!item) continue;
  stamps.push(item[0]);
  writeFileSync(`${OUT}/walk_1p/${String(i).padStart(3, '0')}.jpg`, Buffer.from(item[1].split(',')[1], 'base64'));
}
writeFileSync(`${OUT}/walk_1p/frames.json`, JSON.stringify(stamps));
console.log('saved', stamps.length);
ws.close(); chrome.kill('SIGKILL');
