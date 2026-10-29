import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

// Hosts the dev/preview server may answer for. The Genspark sandbox serves
// previews through rotating "*.sandbox.*.sspark.ai" hostnames; Vite rejects an
// unknown Host header by default (DNS-rebinding guard), which shows up as
// "Blocked request. This host ... is not allowed.". A leading dot also allows
// every subdomain.
const allowedHosts = ['.sspark.ai'];

/**
 * public/assets 와 public/dev-art 아래 모든 파일의 내용으로 하나의 버전 해시를 만든다.
 * 이 값을 에셋 URL 뒤에 `?v=`로 붙이면, 같은 경로의 파일을 교체해도 URL이
 * 바뀌어 브라우저·엣지 캐시(1년 max-age)가 옛 바이트를 계속 쓰는 문제가 없어진다.
 */
function computeAssetVersion(): string {
  const roots = [join(process.cwd(), 'public', 'assets'), join(process.cwd(), 'public', 'dev-art')];
  const hash = createHash('sha1');
  const walk = (root: string, dir: string): void => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        walk(root, full);
      } else {
        hash.update(relative(root, full));
        hash.update(readFileSync(full));
      }
    }
  };
  let walked = 0;
  for (const root of roots) {
    try {
      walk(root, root);
      walked++;
    } catch {
      // 없는 폴더는 건너뛴다(개발 서버에서 dev-art가 없을 수 있다).
    }
  }
  // 아무것도 못 읽으면 캐시 무효화가 의미 없으므로 고정값을 쓴다.
  return walked === 0 ? 'dev' : hash.digest('hex').slice(0, 12);
}

/**
 * 에셋 버전을 코드에 넘기는 가상 모듈. Vite의 `define`은 개발 서버에서
 * 적용되지 않으므로, dev·build 양쪽에서 동작하는 가상 모듈로 주입한다.
 */
function assetVersionPlugin(version: string, audioFiles: readonly string[]): Plugin {
  const virtualId = 'virtual:asset-version';
  const resolvedId = `\0${virtualId}`;
  return {
    name: 'asset-version',
    resolveId(id) {
      return id === virtualId ? resolvedId : null;
    },
    load(id) {
      return id === resolvedId
        ? `export const ASSET_VERSION = ${JSON.stringify(version)};\nexport const AUDIO_FILES = ${JSON.stringify(audioFiles)};`
        : null;
    },
  };
}

/**
 * public/assets/audio 아래 실제로 있는 음원 파일 목록(public 기준 경로, 예: assets/audio/sfx/ko.mp3).
 * AudioManager가 이 목록에 있는 파일만 요청해, 음원이 없을 때 콘솔에 404가 쌓이지 않게 한다.
 */
function listAudioFiles(): string[] {
  const publicRoot = join(process.cwd(), 'public');
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir).sort()) {
      if (name.startsWith('.')) continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else files.push(relative(publicRoot, full).split('\\').join('/'));
    }
  };
  try {
    walk(join(publicRoot, 'assets', 'audio'));
  } catch {
    // 음원 폴더가 없으면 빈 목록(전부 무음).
  }
  return files;
}

const assetVersion = computeAssetVersion();

// base: './' keeps asset paths relative so the build works both on the
// dev server and from a GitHub Pages project sub-path (e.g., /dinosaur-fight-hyun/).
export default defineConfig({
  base: './',
  plugins: [assetVersionPlugin(assetVersion, listAudioFiles())],
  server: {
    host: true,
    allowedHosts,
  },
  preview: {
    host: true,
    allowedHosts,
  },
  build: {
    rollupOptions: { input: { game: 'index.html' } },
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
  },
});
