/**
 * 파일럿 빌드: 도트 아트(dev-art/)를 dist로 복사한다.
 * 공개 베타 루트에는 이 경로가 없으므로, 파일럿(/pilot/)에서만 도트 화면이 뜬다.
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const out = join(process.cwd(), 'dist', 'dev-art');
const parts = ['species', 'stages', 'ui', 'palettes'];
mkdirSync(out, { recursive: true });
let copied = 0;
for (const part of parts) {
  const from = join(process.cwd(), 'dev-art', part);
  if (!existsSync(from)) continue;
  cpSync(from, join(out, part), { recursive: true });
  copied++;
}
console.log(`[pilot] dev-art ${copied}개 폴더 → dist/dev-art`);
