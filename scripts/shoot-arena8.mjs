/**
 * 경기장 8곳 인게임 캡처 — 한 경기장마다 2인 대전(양쪽 서 있음) 배틀 화면을 찍는다.
 *
 * 사용: node scripts/shoot-arena8.mjs <baseUrl> <outDir> [stage,stage,...]
 * 화면 전환은 파일럿 빌드가 노출하는 window.__dotScene / __dotPhase 로 확인한다(고정 대기 없음).
 * 의존성 없음(Node 22 내장 WebSocket + fetch).
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5199/';
const outDir = process.argv[3] ?? '/tmp/arena8';
const only = process.argv[4] ? process.argv[4].split(',') : null;
mkdirSync(outDir, { recursive: true });

const STAGES = ['jungle', 'volcano', 'desert', 'museum', 'lagoon', 'snow', 'swamp', 'meadow'];
const CHROME = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const PORT = 9334;
// 매 실행마다 새 프로필을 쓴다 — 이전 실행의 HTTP 캐시(특히 404)가 남아 있으면
// 새로 넣은 dev-art 레이어를 못 받아 절차적 배경으로 찍힌다(2026-11-01 실제로 겪음).
const PROFILE = `/tmp/arena8-profile-${process.pid}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch() {
  const child = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--window-size=1920,1080',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--no-first-run',
    '--no-sandbox',
    '--disable-gpu',
    `--user-data-dir=${PROFILE}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  child.stderr.on('data', () => {});
  for (let i = 0; i < 80; i++) {
    await sleep(250);
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) return child;
    } catch { /* 준비 중 */ }
  }
  throw new Error('chrome CDP 준비 실패');
}

async function connect() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  const targets = await res.json();
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('페이지 타깃 없음');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(new Error(data.error.message));
      else resolve(data.result);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const messageId = ++id;
    pending.set(messageId, { resolve, reject });
    ws.send(JSON.stringify({ id: messageId, method, params }));
  });
  return { ws, send };
}

const KEY = {
  KeyF: { key: 'f', code: 'KeyF', windowsVirtualKeyCode: 70, text: 'f' },
  KeyJ: { key: 'j', code: 'KeyJ', windowsVirtualKeyCode: 74, text: 'j' },
  KeyD: { key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68, text: 'd' },
  KeyA: { key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, text: 'a' },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 },
  ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 },
};

async function main() {
  const chrome = await launch();
  const { send } = await connect();
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });

  const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result.value;
  const scene = async () => (await ev('window.__dotScene || ""')) || '';
  const phase = async () => (await ev('window.__dotPhase || ""')) || '';
  const key = async (code, holdMs = 80) => {
    const spec = KEY[code];
    await send('Input.dispatchKeyEvent', { type: 'keyDown', ...spec });
    await sleep(holdMs);
    await send('Input.dispatchKeyEvent', { type: 'keyUp', ...spec });
    await sleep(110);
  };
  const waitScene = async (name, timeout = 12000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if ((await scene()) === name) return true;
      await sleep(120);
    }
    console.log(`! 장면 대기 시간 초과: ${name} (현재 ${await scene()})`);
    return false;
  };
  const shot = async (name) => {
    const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(join(outDir, `${name}.png`), Buffer.from(data, 'base64'));
    console.log(`shot ${name} ${await scene()}`);
  };

  for (const stage of STAGES) {
    if (only && !only.includes(stage)) continue;
    await send('Page.navigate', { url: `${baseUrl}?arena=${stage}` });
    await waitScene('TitleScene', 15000);
    await sleep(900);

    await key('KeyF');
    await waitScene('ModeScene');
    await sleep(420);
    // 2인 대전: 두 사람이 서로 마주 보고 서 있게 한다(CPU 가 움직이지 않도록).
    await key('ArrowDown');
    await sleep(200);
    await key('KeyF');
    await waitScene('CharacterSelectScene');
    await sleep(900);
    await key('KeyF');       // 1P 확정
    await sleep(380);
    await key('KeyJ');       // 2P 확정
    await waitScene('StageSelectScene');
    await sleep(700);

    // 커서는 0에서 시작, 한 줄 4칸: 아래(→+4)로 행을 바꾸고 좌우로 남은 칸을 채운다.
    const index = STAGES.indexOf(stage);
    for (let i = 0; i < Math.floor(index / 4); i++) await key('ArrowDown');
    for (let i = 0; i < index % 4; i++) await key('ArrowRight');
    await sleep(200);
    await key('KeyF');
    await waitScene('VsScene');
    await sleep(400);

    await waitScene('BattleScene', 15000);
    for (let i = 0; i < 60 && (await phase()) !== 'fight'; i++) await sleep(150);
    // 배경 3레이어 로딩·카메라 정착을 기다린 뒤 한 장.
    await sleep(2200);
    await shot(`arena-${stage}`);
  }

  writeFileSync(join(outDir, 'stages.json'), JSON.stringify(STAGES, null, 2));
  chrome.kill('SIGTERM');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
