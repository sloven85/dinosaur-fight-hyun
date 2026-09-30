import './style.css';
import { Game } from './core/Game';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) {
  throw new Error('게임 캔버스(#game)를 찾을 수 없습니다.');
}

const game = new Game(canvas);
game.start();
