/**
 * 걷기 비교용 인게임 캡처 — 동종 미러(1P·2P 모두 티라노)에서 걷는 동안 화면을 연속으로 받는다.
 *
 * 사용: node scripts/shoot-walk.mjs <baseUrl> <outDir>
 * 출력: frames/*.png (Page.startScreencast 프레임) + frames.json(타임스탬프)
 *       walk_1p/ walk_2p/ 로 나뉜다 — 1P가 걸을 때와 2P가 걸을 때를 따로 받는다.
 * 의존성 없음(Node 22 내장 WebSocket + fetch).
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5288/';
const outDir = process.argv[3] ?? '/tmp/walk-shots';
mkdirSync(outDir, { recursive: true });

const CHROME = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const PORT = 9341;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function launch() {
  const child = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, '--window-size=1920,1080',
    '--hide-scrollbars', '--force-device-scale-factor=1', '--no-first-run', '--no-sandbox',
    '--disable-gpu', '--user-data-dir=/tmp/walk-shots-profile', 'about:blank',
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
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('페이지 타깃 없음');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(new Error(data.error.message));
      else resolve(data.result);
      return;
    }
    for (const listener of listeners) listener(data);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const messageId = ++id;
    pending.set(messageId, { resolve, reject });
    ws.send(JSON.stringify({ id: messageId, method, params }));
  });
  const on = (listener) => listeners.push(listener);
  return { ws, send, on };
}

const KEY = {
  KeyF: { key: 'f', code: 'KeyF', windowsVirtualKeyCode: 70, text: 'f' },
  KeyJ: { key: 'j', code: 'KeyJ', windowsVirtualKeyCode: 74, text: 'j' },
  KeyD: { key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68, text: 'd' },
  KeyA: { key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, text: 'a' },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 },
};

async function main() {
  const chrome = await launch();
  const { ws, send, on } = await connect();
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });

  const keyDown = (code) => send('Input.dispatchKeyEvent', { type: 'keyDown', ...KEY[code] });
  const keyUp = (code) => send('Input.dispatchKeyEvent', { type: 'keyUp', ...KEY[code] });
  const key = async (code, holdMs = 80) => { await keyDown(code); await sleep(holdMs); await keyUp(code); await sleep(120); };
  const scene = async () => (await send('Runtime.evaluate', { expression: 'window.__dotScene || ""', returnByValue: true })).result.value;
  const phase = async () => (await send('Runtime.evaluate', { expression: 'window.__dotPhase || ""', returnByValue: true })).result.value;
  const waitScene = async (name, timeout = 12000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if ((await scene()) === name) return true;
      await sleep(120);
    }
    console.log(`! 장면 대기 시간 초과: ${name} (현재 ${await scene()})`);
    return false;
  };
  const advance = async (from, to, keyCode = 'KeyF') => {
    await waitScene(from);
    await sleep(520);
    for (let attempt = 0; attempt < 3; attempt++) {
      await key(keyCode);
      if (await waitScene(to, 2500)) return true;
    }
    return false;
  };

  /** screencast로 1.5초 동안 프레임을 받는다. */
  let recording = null;
  on((event) => {
    if (event.method === 'Page.screencastFrame' && recording) {
      const { data, metadata, sessionId } = event.params;
      recording.frames.push({ data, timestamp: metadata.timestamp });
      void send('Page.screencastFrameAck', { sessionId });
    }
  });
  const record = async (name, holdKey, ms) => {
    const shots = { name, frames: [], start: Date.now() };
    recording = shots;
    await send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
    await keyDown(holdKey);
    await sleep(ms);
    await keyUp(holdKey);
    await send('Page.stopScreencast');
    recording = null;
    const dir = join(outDir, name);
    mkdirSync(dir, { recursive: true });
    shots.frames.forEach((frame, i) => writeFileSync(join(dir, `${String(i).padStart(3, '0')}.png`), Buffer.from(frame.data, 'base64')));
    writeFileSync(join(dir, 'frames.json'), JSON.stringify(shots.frames.map((frame) => frame.timestamp)));
    console.log(`${name}: ${shots.frames.length}프레임`);
  };

  const mirrorUrl = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}mirror=1`;
  await send('Page.navigate', { url: mirrorUrl });
  await waitScene('TitleScene', 15000);
  await sleep(800);
  await advance('TitleScene', 'ModeScene');
  await key('ArrowDown');           // 2인 대전
  await advance('ModeScene', 'CharacterSelectScene');
  await key('KeyD');                // 1P를 2번 칸으로 → 티라노
  await key('KeyF');
  await sleep(400);
  await key('KeyJ');                // 2P 같은 종 확정
  await waitScene('StageSelectScene', 6000);
  await advance('StageSelectScene', 'VsScene');
  await waitScene('BattleScene', 12000);
  for (let i = 0; i < 60 && (await phase()) !== 'fight'; i++) await sleep(120);
  await sleep(500);

  // 서로에게서 멀어지는 쪽으로 걷게 한다(가까워지면 두 공룡이 겹쳐 대조가 안 된다).
  await record('walk_1p', 'KeyA', 1000);
  await sleep(400);
  await record('walk_2p', 'ArrowRight', 1000);

  ws.close();
  chrome.kill('SIGKILL');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
