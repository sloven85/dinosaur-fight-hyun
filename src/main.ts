import './style.css';
import { Game } from './core/Game';
import { ensurePixelFonts } from './rendering/pixel/PixelFont';
import { clearBakedText } from './rendering/pixel/PixelStyle';

// 도트 글꼴(Galmuri 9/11/14)을 먼저 적용한다. 글꼴이 도착하면 폴백 글꼴로 구워 둔 글자 캐시를
// 비워 다음 프레임부터 픽셀 글자로 다시 그린다(그 전 프레임은 짧게 폴백 글자로 보일 수 있다).
void ensurePixelFonts().then((ok) => {
  if (ok) clearBakedText();
});

const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) {
  throw new Error('게임 캔버스(#game)를 찾을 수 없습니다.');
}

if (import.meta.env.DEV && new URLSearchParams(location.search).has('contactAudit')) {
  void import('./contactAudit').then(async ({ createContactAudit }) => {
    const audit = await createContactAudit(new URLSearchParams(location.search).has('mouthV2'));
    Object.assign(window, { contactAudit: audit });
    audit.draw('검수 캡처 전용 · 자동 입력 없음', true, false);
  });
} else if (import.meta.env.DEV && (document.body.hasAttribute('data-contact-lab') || location.pathname.endsWith('/contact-lab.html') || new URLSearchParams(location.search).has('contactLab'))) {
  void import('./contactLab').then(({ startContactLab }) => startContactLab(canvas));
} else {
  const game = new Game(canvas);
  if (import.meta.env.DEV) Object.assign(window, { __reviewGame: game });
  game.start();
}
