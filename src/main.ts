import './style.css';
import { Game } from './core/Game';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) {
  throw new Error('게임 캔버스(#game)를 찾을 수 없습니다.');
}

if (document.body.hasAttribute('data-contact-lab') || location.pathname.endsWith('/contact-lab.html') || new URLSearchParams(location.search).has('contactLab')) {
  void import('./contactLab').then(({ startContactLab }) => startContactLab(canvas));
} else {
  const game = new Game(canvas);
  game.start();
}
