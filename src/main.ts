import './style.css';
import { Game } from './core/Game';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) {
  throw new Error('게임 캔버스(#game)를 찾을 수 없습니다.');
}

if (new URLSearchParams(location.search).has('contactAudit')) {
  void import('./contactAudit').then(async ({ createContactAudit }) => {
    const audit = await createContactAudit(new URLSearchParams(location.search).has('mouthV2'));
    Object.assign(window, { contactAudit: audit });
    audit.draw('검수 캡처 전용 · 자동 입력 없음', true, false);
  });
} else if (document.body.hasAttribute('data-contact-lab') || location.pathname.endsWith('/contact-lab.html') || new URLSearchParams(location.search).has('contactLab')) {
  void import('./contactLab').then(({ startContactLab }) => startContactLab(canvas));
} else {
  const game = new Game(canvas);
  game.start();
}
