/**
 * 계획서 16절 프롬프트 6: 먼지·별·충격파 타격 연출.
 *
 * 모든 파티클은 화면에 보이는 연출일 뿐이며 전투 판정(피해·경직·넉백)에
 * 전혀 관여하지 않는다. Match는 "무슨 일이 있었는지"만 event로 알려 주고,
 * 이 모듈은 그 자리에 그림만 뿌린다.
 */

export type EffectKind = 'dust' | 'star' | 'shockwave' | 'spark' | 'slash' | 'feather';

export interface EffectParticle {
  kind: EffectKind;
  /** 화면 좌표(디자인 px). */
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  /** 남은 수명(초). */
  life: number;
  maxLife: number;
  size: number;
  rotation: number;
  spin: number;
  color: string;
}

export interface HitEffectOptions {
  /** 공격 종류에 따라 연출 크기를 나눈다(피해와 무관). */
  kind?: 'light' | 'heavy' | 'special';
  guarded?: boolean;
  /** 맞은 쪽이 밀려나는 방향. */
  direction?: 1 | -1;
  /** 때린 쪽 종 id: 종별 타격 불꽃 색(맞는 순간만 봐도 누가 때렸는지). */
  attackerId?: string;
}

/** 종별 타격 불꽃 색(마스터 결정 2026-10-01). 없으면 기본 흰노랑. */
export const SPECIES_SPARK_COLOR: Record<string, string> = {
  tyrannosaurus: '#7dff8a',
  triceratops: '#ffa63d',
  velociraptor: '#ffe94a',
  spinosaurus: '#7fd8ff',
  ankylosaurus: '#d9a46a',
  stegosaurus: '#ff6b6b',
  carnotaurus: '#ff4d3d',
  pachycephalosaurus: '#f2ead8',
  therizinosaurus: '#c99bff',
  dilophosaurus: '#d4ff4a',
  brachiosaurus: '#9fd0ff',
  pteranodon: '#ff9be0',
};

const MAX_PARTICLES = 420;

const DUST_COLOR = '#cbb68c';
const SPARK_COLOR = '#fff3c4';
const STAR_COLOR = '#ffe066';
const GUARD_COLOR = '#9fd4ff';

export class EffectSystem {
  private particles: EffectParticle[] = [];

  constructor(private readonly random: () => number = Math.random) {}

  get count(): number {
    return this.particles.length;
  }

  clear(): void {
    this.particles.length = 0;
  }

  /** 맞은 지점에 공격 종류에 맞는 연출을 한 묶음 뿌린다. */
  spawnHit(x: number, y: number, options: HitEffectOptions = {}): void {
    const direction = options.direction ?? 1;
    const kind = options.kind ?? 'light';

    if (options.guarded) {
      // 파란 방패 불꽃: 막은 쪽 앞에서 튀는 불꽃 + 고리('팅').
      this.spawnSparks(x, y, 9, GUARD_COLOR, direction);
      this.push({ kind: 'shockwave', x, y, vx: 0, vy: 0, gravity: 0, life: 0.2, maxLife: 0.2, size: 18, rotation: 0, spin: 0, color: GUARD_COLOR });
      this.spawnDust(x, y, 2, 0.5);
      return;
    }

    const color = (options.attackerId && SPECIES_SPARK_COLOR[options.attackerId]) || SPARK_COLOR;
    if (kind === 'special') {
      this.spawnShockwave(x, y, direction);
      this.spawnDust(x, y, 10, 1.3);
      this.spawnSparks(x, y, 10, color, direction);
      this.spawnSparks(x, y, 4, SPARK_COLOR, direction);
    } else if (kind === 'heavy') {
      this.spawnDust(x, y, 7, 1);
      this.spawnSparks(x, y, 7, color, direction);
    } else {
      this.spawnDust(x, y, 3, 0.6);
      this.spawnSparks(x, y, 5, color, direction);
    }
  }

  /** 발밑·착지 먼지. */
  spawnDust(x: number, y: number, count = 5, spread = 1): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.PI + this.random() * Math.PI; // 위쪽 반원
      const speed = (60 + this.random() * 120) * spread;
      this.push({
        kind: 'dust',
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.5,
        gravity: 260,
        life: 0.35 + this.random() * 0.3,
        maxLife: 0.65,
        size: (10 + this.random() * 16) * spread,
        rotation: 0,
        spin: 0,
        color: DUST_COLOR,
      });
    }
  }

  /** 발톱 자국 세 줄(할퀴기·베기). angle = 긋는 방향(라디안). */
  spawnSlash(x: number, y: number, angle = 0.9, size = 120, color = '#ffffff'): void {
    this.push({
      kind: 'slash',
      x,
      y,
      vx: 0,
      vy: 0,
      gravity: 0,
      life: 0.22,
      maxLife: 0.22,
      size,
      rotation: angle,
      spin: 0,
      color,
    });
  }

  /** 흩날리는 깃털(테리지노 회오리). */
  spawnFeathers(x: number, y: number, count = 6, color = '#e9e4f2'): void {
    for (let i = 0; i < count; i++) {
      const angle = this.random() * Math.PI * 2;
      const speed = 80 + this.random() * 160;
      this.push({
        kind: 'feather',
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 80,
        gravity: 120,
        life: 0.7 + this.random() * 0.5,
        maxLife: 1.2,
        size: 12 + this.random() * 8,
        rotation: angle,
        spin: (this.random() - 0.5) * 8,
        color,
      });
    }
  }

  /** 다운·KO 연출의 도는 별. */
  spawnStars(x: number, y: number, count = 6): void {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + this.random() * 0.4;
      this.push({
        kind: 'star',
        x: x + Math.cos(angle) * 30,
        y: y + Math.sin(angle) * 18 - 10,
        vx: Math.cos(angle) * 40,
        vy: -30 - this.random() * 40,
        gravity: 0,
        life: 0.7 + this.random() * 0.5,
        maxLife: 1.2,
        size: 16 + this.random() * 10,
        rotation: angle,
        spin: (this.random() < 0.5 ? -1 : 1) * (3 + this.random() * 3),
        color: STAR_COLOR,
      });
    }
  }

  /** 특수기·포효의 충격파 고리. */
  spawnShockwave(x: number, y: number, direction: 1 | -1 = 1): void {
    this.push({
      kind: 'shockwave',
      x: x + direction * 10,
      y,
      vx: direction * 260,
      vy: 0,
      gravity: 0,
      life: 0.42,
      maxLife: 0.42,
      size: 24,
      rotation: 0,
      spin: 0,
      color: '#ffffff',
    });
  }

  private spawnSparks(
    x: number,
    y: number,
    count: number,
    color: string,
    direction: 1 | -1,
  ): void {
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + (this.random() - 0.5) * 1.6 + (direction === 1 ? 0.6 : -0.6);
      const speed = 260 + this.random() * 260;
      this.push({
        kind: 'spark',
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        gravity: 900,
        life: 0.18 + this.random() * 0.14,
        maxLife: 0.32,
        size: 3 + this.random() * 4,
        rotation: angle,
        spin: 0,
        color,
      });
    }
  }

  private push(particle: EffectParticle): void {
    // 오래 쌓이면 성능이 떨어지므로 오래된 것부터 버린다.
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push(particle);
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.spin * dt;
    }
  }

  /** 화면 좌표 그대로 그린다. fighters 뒤에 그려 먼지가 앞으로 오게 한다. */
  render(g: CanvasRenderingContext2D): void {
    g.save();
    for (const p of this.particles) {
      const t = Math.max(0, Math.min(1, p.life / p.maxLife));
      g.globalAlpha = t;
      switch (p.kind) {
        case 'dust':
          g.fillStyle = p.color;
          g.beginPath();
          g.arc(p.x, p.y, p.size * (1.2 - t * 0.4), 0, Math.PI * 2);
          g.fill();
          break;
        case 'spark':
          drawSpark(g, p);
          break;
        case 'star':
          drawStar(g, p);
          break;
        case 'slash':
          drawSlash(g, p, t);
          break;
        case 'feather':
          g.save();
          g.translate(p.x, p.y);
          g.rotate(p.rotation);
          g.fillStyle = p.color;
          g.beginPath();
          g.ellipse(0, 0, p.size, p.size * 0.32, 0, 0, Math.PI * 2);
          g.fill();
          g.restore();
          break;
        case 'shockwave': {
          const grow = 1 - t;
          g.strokeStyle = p.color;
          g.lineWidth = 8 * t + 2;
          g.beginPath();
          g.ellipse(p.x, p.y, p.size + grow * 130, (p.size + grow * 130) * 0.62, 0, 0, Math.PI * 2);
          g.stroke();
          break;
        }
      }
    }
    g.restore();
  }
}

function drawSpark(g: CanvasRenderingContext2D, p: EffectParticle): void {
  g.strokeStyle = p.color;
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(p.x, p.y);
  g.lineTo(p.x - Math.cos(p.rotation) * p.size * 2.4, p.y - Math.sin(p.rotation) * p.size * 2.4);
  g.stroke();
}

function drawSlash(g: CanvasRenderingContext2D, p: EffectParticle, t: number): void {
  // 나타날 때 길게 그어지고(1-t), 사라질 때 옅어진다.
  const reveal = Math.min(1, (1 - t) * 3 + 0.2);
  g.save();
  g.translate(p.x, p.y);
  g.rotate(p.rotation);
  g.strokeStyle = p.color;
  g.lineCap = 'round';
  for (let i = -1; i <= 1; i++) {
    g.lineWidth = 9 - Math.abs(i) * 2;
    g.beginPath();
    const len = p.size * (1 - Math.abs(i) * 0.15) * reveal;
    g.moveTo(-p.size / 2, i * 26);
    g.quadraticCurveTo(0, i * 26 - 22, -p.size / 2 + len, i * 26);
    g.stroke();
  }
  g.restore();
}

function drawStar(g: CanvasRenderingContext2D, p: EffectParticle): void {
  const outer = p.size;
  const inner = outer * 0.45;
  g.save();
  g.translate(p.x, p.y);
  g.rotate(p.rotation);
  g.fillStyle = p.color;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = (Math.PI * i) / 5 - Math.PI / 2;
    const px = Math.cos(angle) * radius;
    const py = Math.sin(angle) * radius;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
  g.fill();
  g.restore();
}
