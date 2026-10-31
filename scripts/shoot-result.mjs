/**
 * 헤드리스 Chrome(CDP)으로 도트 화면 흐름을 한 번에 캡처한다.
 *
 * 사용: node scripts/shoot-dot-flow.mjs <baseUrl> <outDir>
 * 흐름: 타이틀 → 모드 → 캐릭터 선택 → 스테이지 선택 → VS → 대전 → 공격 명중 → 일시정지 → KO → 결과 → 재시작
 * 화면 전환은 파일럿 빌드가 노출하는 window.__dotScene으로 확인한다(고정 대기 없음).
 * 의존성 없음(Node 22 내장 WebSocket + fetch).
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5183/';
const outDir = process.argv[3] ?? '/tmp/dotflow';
// 4번째 인자: 경기장 선택에서 오른쪽으로 누를 횟수(0=정글, 2=사막 …)
const stageSteps = Number(process.argv[4] ?? 0);
mkdirSync(outDir, { recursive: true });

const CHROME = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const PORT = 9333;
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
    '--user-data-dir=/tmp/dotflow-profile',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  child.stderr.on('data', () => {});
  for (let i = 0; i < 60; i++) {
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
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 },
  Escape: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
};

async function main() {
  const chrome = await launch();
  const { ws, send } = await connect();
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });

  const key = async (code, holdMs = 80) => {
    const spec = KEY[code];
    await send('Input.dispatchKeyEvent', { type: 'keyDown', ...spec });
    await sleep(holdMs);
    await send('Input.dispatchKeyEvent', { type: 'keyUp', ...spec });
    await sleep(120);
  };
  const hold = async (code, ms) => {
    const spec = KEY[code];
    await send('Input.dispatchKeyEvent', { type: 'keyDown', ...spec });
    await sleep(ms);
    await send('Input.dispatchKeyEvent', { type: 'keyUp', ...spec });
    await sleep(80);
  };
  const shot = async (name) => {
    const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(join(outDir, `${name}.png`), Buffer.from(data, 'base64'));
    console.log(`shot ${name}`);
  };
  const phase = async () => {
    const { result } = await send('Runtime.evaluate', { expression: 'window.__dotPhase || ""', returnByValue: true });
    return result.value;
  };
  const scene = async () => {
    const { result } = await send('Runtime.evaluate', { expression: 'window.__dotScene || ""', returnByValue: true });
    return result.value;
  };
  const waitScene = async (name, timeout = 12000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if ((await scene()) === name) return true;
      await sleep(150);
    }
    console.log(`! 장면 대기 시간 초과: ${name} (현재 ${await scene()})`);
    return false;
  };
  const open = async (url) => {
    await send('Page.navigate', { url });
    await waitScene('TitleScene', 15000);
    await sleep(900);
  };
  const advance = async (from, to, keyCode = 'KeyF') => {
    await waitScene(from, 12000);
    await sleep(520);
    for (let attempt = 0; attempt < 3; attempt++) {
      await key(keyCode);
      if (await waitScene(to, 2500)) return true;
    }
    console.log(`! ${from} → ${to} 전환 실패`);
    return false;
  };

  const koUrl = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}koShot=1`;
  await open(koUrl);
  await advance('TitleScene', 'ModeScene');
  await advance('ModeScene', 'CharacterSelectScene');
  await advance('CharacterSelectScene', 'StageSelectScene');
  for (let i = 0; i < stageSteps; i++) { await key('KeyD'); await sleep(160); }
  await advance('StageSelectScene', 'VsScene');
  await waitScene('BattleScene');
  for (let i = 0; i < 40 && (await phase()) !== 'fight'; i++) await sleep(150);
  await sleep(300);
  await hold('KeyD', 1100);
  for (let i = 0; i < 40; i++) {
    await key('KeyF', 60);
    await sleep(200);
    if ((await scene()) === 'ResultScene') break;
  }
  await waitScene('ResultScene');
  await sleep(900);
  await shot('result');
  if (stageSteps === 0) {
    // 선택 커서를 한 칸 내려 탭 선택 상태도 한 장 남긴다.
    await key('ArrowDown');
    await sleep(400);
    await shot('result-down');
  }

  ws.close();
  chrome.kill('SIGKILL');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
