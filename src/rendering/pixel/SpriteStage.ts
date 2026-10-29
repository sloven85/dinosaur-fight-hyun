import type { Fighter } from '../../combat/Fighter';
import type { Match } from '../../combat/Match';
import type { AssetLoader } from '../AssetLoader';
import { renderPlaceholder, renderShadow } from '../FighterRenderer';
import { PIXEL_ART_SCALE, PIXEL_VIEW_H, PIXEL_VIEW_W, PixelBackground, pixelScaleFor } from './PixelBackground';
import {
  ART_CLIPS, SPRITE_STATES, STATE_LABELS, SpriteClock, drawSpriteFrame, sampleFighter,
  parseSpriteManifest, type SpriteAssets, type SpriteState,
} from './SpeciesSprite';
import { PLAYER_COLORS, drawGroundRing, drawHeadMarker, markerShapeFor } from './PlayerMarker';

const ROOT = 'dev-art/species/';

// 켜는 조건은 pilotFlag에 있다(BattleScene이 무거운 이 모듈을 정적으로 끌어오지 않게).
export { spriteStageEnabled } from './pilotFlag';

interface IndexEntry { character: string; frames: number; sheet: [number, number] }
interface SpeciesIndex { version: number; cell: [number, number]; footY: number; anchorX: number; scale: number; species: Record<string, IndexEntry> }

async function loadSpecies(loader: AssetLoader, folder: string): Promise<SpriteAssets> {
  const raw = await loader.loadJson<unknown>(`${ROOT}${folder}/manifest.json`);
  if (!raw) throw new Error(`${folder} manifest를 읽지 못했습니다.`);
  const manifest = parseSpriteManifest(raw);
  const image = await loader.loadImage(`${ROOT}${folder}/${manifest.image}`);
  if (!image) throw new Error(`${folder} 시트 PNG를 읽지 못했습니다.`);
  if (manifest.frames.some((f) => f.x + f.w > image.naturalWidth || f.y + f.h > image.naturalHeight)) {
    throw new Error(`${folder} 시트 경계를 벗어난 프레임이 있습니다.`);
  }
  // 2P 팔레트 시트는 같은 크기·같은 프레임 좌표를 전제한다. 어긋나면 아예 쓰지 않는다.
  let p2: SpriteAssets['p2'];
  if (manifest.p2Image) {
    const alt = await loader.loadImage(`${ROOT}${folder}/${manifest.p2Image}`);
    if (alt && alt.naturalWidth === image.naturalWidth && alt.naturalHeight === image.naturalHeight) p2 = alt;
  }
  return { manifest, image, p2 };
}

/**
 * 12종 도트 스프라이트 비교판 (개발 전용).
 * 실제 Match를 그대로 그리고, 그림만 갈아 끼운다 — 판정·피해·사거리·이동은 건드리지 않는다.
 */
export class SpriteStage {
  private readonly byCharacter = new Map<string, string>();
  private readonly species = new Map<string, SpriteAssets>();
  private readonly pendingLoad = new Map<string, Promise<SpriteAssets | null>>();
  private readonly clocks = [new SpriteClock(), new SpriteClock()];
  private readonly panel = document.createElement('section');
  private readonly status = document.createElement('p');
  private readonly diagnostics = document.createElement('p');
  private readonly view = document.createElement('select');
  private readonly effectsInput = document.createElement('input');
  private readonly preview = document.createElement('canvas');
  private readonly previewCaption = document.createElement('p');
  private readonly poseSpecies = document.createElement('select');
  private readonly poseState = document.createElement('select');
  /** 캐릭터 확대 배율. 아트 1px = 화면 4px 고정 — 배경과 같은 격자다. */
  private readonly spriteScale = PIXEL_ART_SCALE;
  private poseFacing: 1 | -1 = 1;
  private poseStep = 0;
  private readonly background: PixelBackground;
  private round = 0;
  /** 동종 미러 경기인가 — 이때만 발밑 링·머리 마커를 그린다(판정·타점은 건드리지 않는다). */
  private mirror = false;
  private disposed = false;

  constructor(private readonly loader: AssetLoader) {
    this.background = new PixelBackground(loader);
    this.buildPanel();
    void this.boot();
  }

  get effects(): boolean { return this.effectsInput.checked; }

  private buildPanel(): void {
    this.panel.setAttribute('aria-label', '12종 도트 스프라이트 비교판');
    this.panel.style.cssText = 'position:fixed;right:8px;top:8px;z-index:22;width:400px;max-height:78vh;overflow:auto;'
      + 'padding:12px;background:#101820ee;color:#fff;font:13px/1.5 system-ui;border:1px solid #637888;border-radius:8px';
    const title = document.createElement('strong');
    title.textContent = '12종 도트 스프라이트 · 개발 비교판';
    // 검수 캡처용: 패널을 한 줄로 접어 화면을 가리지 않게 한다.
    const collapse = document.createElement('button');
    collapse.textContent = '패널 접기';
    collapse.style.cssText = 'float:right;font-size:11px';
    collapse.onclick = () => {
      const folded = this.panel.dataset.folded === '1';
      this.panel.dataset.folded = folded ? '0' : '1';
      for (const child of Array.from(this.panel.children) as HTMLElement[]) {
        if (child === collapse) continue;
        // hidden 속성만으로는 flex/grid 인라인 스타일에 밀리므로 display도 함께 끈다.
        child.hidden = !folded;
        if (folded) child.style.removeProperty('display');
        else child.style.display = 'none';
      }
      collapse.textContent = folded ? '패널 접기' : '패널 펴기';
      this.panel.style.width = folded ? '400px' : '190px';
    };
    const spec = document.createElement('p');
    spec.style.cssText = 'margin:6px 0;color:#9fb4c6;font-size:12px';
    spec.textContent = '셀 502×304 · 발 기준 y=298 · 기준 x=251 · 아트 1px = 화면 4px 고정 · 부위 조합 없음 · 프레임별 맞춤/회전 없음';

    for (const [value, text] of [['pixel', '도트 12종 (신규)'], ['legacy', '기존 부위 렌더러']]) {
      const option = document.createElement('option');
      option.value = value; option.textContent = text; this.view.append(option);
    }
    this.view.setAttribute('aria-label', '렌더러 선택');
    const scaleNote = document.createElement('p');
    scaleNote.style.cssText = 'margin:2px 0;color:#cfe3f2;font-size:12px';
    scaleNote.textContent = `배율 4px 고정 · 캐릭터·배경 같은 격자 · 창 ${PIXEL_VIEW_W}×${PIXEL_VIEW_H}아트px`;
    const effectLabel = document.createElement('label');
    this.effectsInput.type = 'checkbox';
    effectLabel.append(this.effectsInput, ' 연출/흔들림/이펙트 켜기');

    const table = document.createElement('table');
    table.style.cssText = 'border-collapse:collapse;font-size:11px;margin:6px 0;width:100%';
    table.innerHTML = '<thead><tr><th style="text-align:left">상태</th><th>아티스트 클립</th><th>프레임</th></tr></thead>';
    const tbody = document.createElement('tbody');
    for (const state of SPRITE_STATES) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${STATE_LABELS[state]}</td><td style="color:#9fb4c6">${ART_CLIPS[state]}</td><td data-clip="${state}" style="text-align:center">-</td>`;
      tbody.append(tr);
    }
    table.append(tbody);

    const poseLabel = document.createElement('p');
    poseLabel.textContent = '자세 관찰 (실전 판정과 별개)';
    poseLabel.style.cssText = 'margin:8px 0 2px;font-weight:600';
    for (const folder of FOLDER_ORDER) {
      const option = document.createElement('option');
      option.value = folder; option.textContent = FOLDER_LABEL[folder] ?? folder; this.poseSpecies.append(option);
    }
    for (const state of SPRITE_STATES) {
      const option = document.createElement('option');
      option.value = state; option.textContent = STATE_LABELS[state]; this.poseState.append(option);
    }
    this.poseState.value = 'walk';
    this.poseSpecies.onchange = () => { this.ensure(this.poseSpecies.value); this.refreshClipTable(); };
    const flip = document.createElement('button');
    flip.textContent = '방향 반전';
    flip.onclick = () => { this.poseFacing = this.poseFacing === 1 ? -1 : 1; };
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:6px;margin:4px 0';
    row.append(this.poseSpecies, this.poseState, flip);

    // 자세 관찰용 확대판: 480×270 창의 2배(960×540). 실전 배율(4px)은 위 게임 화면에서 본다.
    this.preview.width = 960; this.preview.height = 540;
    this.preview.style.cssText = 'display:block;background:#253140;image-rendering:pixelated;width:100%';
    const viewport = document.createElement('div');
    viewport.style.cssText = 'overflow:auto;max-height:320px';
    viewport.append(this.preview);

    this.status.textContent = '아트 확인 중';
    this.panel.append(title, collapse, spec, this.view, scaleNote, effectLabel, this.status, this.diagnostics, table,
      poseLabel, row, this.previewCaption, viewport);
    document.body.append(this.panel);
  }

  private async boot(): Promise<void> {
    try {
      const raw = await this.loader.loadJson<SpeciesIndex>(`${ROOT}index.json`);
      if (!raw) throw new Error('dev-art/species/index.json이 없습니다.');
      for (const [folder, entry] of Object.entries(raw.species)) this.byCharacter.set(entry.character, folder);
      const total = Object.values(raw.species).reduce((n, s) => n + s.frames, 0);
      this.status.textContent = `${Object.keys(raw.species).length}종 ${total}장 준비 · 판정/피해/사거리는 기존 값 그대로`;
      this.ensure(this.poseSpecies.value);
    } catch (error) {
      this.status.textContent = `아트 미연결 — ${error instanceof Error ? error.message : '파일 확인 실패'} 기존 렌더러로 진행`;
    }
    this.refreshClipTable();
  }

  private refreshClipTable(): void {
    const selected = this.poseSpecies.value;
    const assets = this.species.get(selected);
    for (const cell of this.panel.querySelectorAll<HTMLElement>('[data-clip]')) {
      const state = cell.dataset.clip as SpriteState;
      const clip = assets?.manifest.clips[state];
      cell.textContent = clip ? `${clip.frames.length}장 / ${clip.ticks.reduce((a, b) => a + b, 0)}틱` : '-';
    }
  }

  /** 매치에 필요한 종만 그때그때 받는다. */
  private ensure(folder: string): SpriteAssets | null {
    const loaded = this.species.get(folder);
    if (loaded) return loaded;
    if (!this.pendingLoad.has(folder)) {
      const promise = loadSpecies(this.loader, folder)
        .then((assets) => {
          if (!this.disposed) { this.species.set(folder, assets); this.refreshClipTable(); }
          return assets;
        })
        .catch((error: unknown) => {
          this.status.textContent = `아트 미연결 — ${error instanceof Error ? error.message : '알 수 없는 오류'}`;
          return null;
        })
        .finally(() => { this.pendingLoad.delete(folder); });
      this.pendingLoad.set(folder, promise);
    }
    return null;
  }

  /**
   * 배율: 아트 1px = 화면 4px. 캔버스 폭이 창(480)의 정수배면 그 k를 쓰고, 아니면 4로 고정한다.
   * 어느 쪽이든 정수만 나온다 — 소수 배율로 리샘플하는 경로는 없다.
   */
  private scaleFor(g: CanvasRenderingContext2D): number {
    return pixelScaleFor(g.canvas.width) ?? this.spriteScale;
  }

  private folderFor(fighter: Fighter): string | null {
    return this.byCharacter.get(fighter.data.id) ?? null;
  }

  step(match: Match, frozen: readonly boolean[]): void {
    this.mirror = match.mirrorMatch;
    if (this.round !== match.roundNumber) {
      this.round = match.roundNumber;
      this.clocks.forEach((c) => c.reset());
    }
    match.fighters.forEach((f, i) => {
      this.clocks[i].step(f, frozen[i]);
      const folder = this.folderFor(f);
      if (folder) this.ensure(folder);
    });
    this.poseStep++;
    this.drawPreview();

    if (this.view.value !== 'pixel') { this.diagnostics.textContent = '기존 렌더러 재생 중'; return; }
    this.diagnostics.style.whiteSpace = 'pre-line';
    this.diagnostics.textContent = match.fighters.map((f, i) => {
      const folder = this.folderFor(f);
      const assets = folder ? this.species.get(folder) : null;
      if (!assets) return `${i + 1}P ${f.data.id} · 아트 대기 · 임시 도형`;
      const sample = sampleFighter(assets.manifest, f, this.clocks[i]);
      // 렌더 키(아트 bbox×4)와 판정 키(displayHeight)를 나란히 보여 준다 — 표 없이 판정을 흔들지 않기 위한 표시.
      const art = f.data.artHeight, key = f.data.displayHeight;
      const ratio = key ? `${((art - key) / key * 100 >= 0 ? '+' : '')}${((art - key) / key * 100).toFixed(1)}%` : '-';
      return `${i + 1}P ${f.data.id} · ${STATE_LABELS[sample.state]} ${sample.step + 1}/${assets.manifest.clips[sample.state].frames.length}`
        + ` · HP ${f.health} · 그림 ${art} / 판정 ${key} (${ratio})`;
    }).join('\n');
  }

  private drawPreview(): void {
    const g = this.preview.getContext('2d');
    if (!g) return;
    const assets = this.species.get(this.poseSpecies.value);
    g.clearRect(0, 0, this.preview.width, this.preview.height);
    const groundY = 460;
    const previewScale = pixelScaleFor(this.preview.width) ?? 2;
    g.fillStyle = '#7c8d9c';
    g.fillRect(0, groundY, this.preview.width, 2);
    g.fillStyle = '#33414f';
    g.fillRect(480, 0, 1, this.preview.height);
    if (!assets) {
      this.previewCaption.textContent = `${this.poseSpecies.value}: 아트 로딩 중`;
      return;
    }
    const state = this.poseState.value as SpriteState;
    const clip = assets.manifest.clips[state];
    const step = clip.loop
      ? this.poseStep % clip.frames.length
      : Math.min(clip.frames.length - 1, Math.floor(this.poseStep / 8) % clip.frames.length);
    const frame = assets.manifest.frames[clip.frames[step]];
    drawSpriteFrame(g, assets, frame, 480, groundY, this.poseFacing, previewScale);
    this.previewCaption.textContent = `${assets.manifest.name} · ${STATE_LABELS[state]} ${step + 1}/${clip.frames.length} · `
      + `그림 ${frame.w}×${frame.h}원본 → 화면 ${frame.w * previewScale}×${frame.h * previewScale}px (배율 ${previewScale}) · 기준 x=251/y=298 고정`;
  }

  /** 도트 배경 3레이어를 그렸으면 true(호출부는 기존 배경을 건너뛴다). */
  renderBackground(g: CanvasRenderingContext2D, stage: string, groundY: number,
    focusX: number, width: number, height: number): boolean {
    return this.background.render(g, stage, groundY, focusX, width, height, PARALLAX);
  }

  /**
   * 도트 화면에서는 **항상 true**를 돌려준다(이 캐릭터는 여기서 그린다).
   * 그림이 아직 없거나 프레임을 못 고르면 임시 도형만 그리고 끝낸다 —
   * false를 돌려 파츠 렌더러가 부위를 조립해 그리는 경로를 만들지 않는다(jk 확정 2026-10-29).
   * false는 "이 화면은 도트가 아니다"라는 뜻 하나뿐이다.
   */
  render(g: CanvasRenderingContext2D, fighter: Fighter, groundY: number): boolean {
    if (this.view.value !== 'pixel') return false;
    const feetY = groundY + fighter.y;
    renderShadow(g, fighter, groundY);
    const folder = this.folderFor(fighter);
    const assets = folder ? this.species.get(folder) : null;
    if (!assets) {
      // 아트 준비 전: 파츠 대신 임시 도형. 준비되면 다음 프레임부터 전신 그림으로 바뀐다.
      renderPlaceholder(g, fighter, feetY);
      return true;
    }
    const sample = sampleFighter(assets.manifest, fighter, this.clocks[fighter.player]);
    const frame = assets.manifest.frames[sample.frame];
    if (!frame) return true;
    const scale = this.scaleFor(g);
    const color = fighter.useAlternatePalette ? PLAYER_COLORS.p2 : PLAYER_COLORS.p1;
    // 표식은 캐릭터 뒤(링)·앞(머리 마커)에 둔다. 미러가 아니면 그리지 않는다.
    // 링 72×10아트px, 위쪽을 접지선(=feetY)에 맞추고 두 발 중앙에 둔다.
    if (this.mirror) drawGroundRing(g, fighter.x, feetY, color, scale);
    // 2P는 포장 단계에서 뽑아 둔 팔레트 시트로 같은 프레임을 그린다(모양·크기 동일).
    drawSpriteFrame(g, assets, frame, fighter.x, feetY, fighter.facing, scale, fighter.useAlternatePalette);
    if (this.mirror) {
      const box = {
        left: fighter.x - frame.anchor.x * scale,
        top: feetY - frame.anchor.y * scale,
        right: fighter.x + (frame.w - frame.anchor.x) * scale,
        bottom: feetY + (frame.h - frame.anchor.y) * scale,
      };
      drawHeadMarker(g, box, fighter.facing, color, scale, markerShapeFor(fighter.useAlternatePalette));
    }
    return true;
  }

  dispose(): void {
    this.disposed = true;
    this.background.dispose();
    this.species.clear();
    this.panel.remove();
  }
}

/**
 * 엔진의 시차 계수(jk 확정 2026-10-29): 원경 0.25 / 중경 0.60 / 지면 1.00.
 * 지면이 1.00이어야 접지한 발이 지면 위를 미끄러지지 않는다(카메라 중심 = 두 캐릭터 중점).
 * 0.30이면 지면 텍스처가 캐릭터 이동의 30%만 따라가 발이 흘러 보인다.
 */
export const PARALLAX = { far: 0.25, mid: 0.6, ground: 1 };

const FOLDER_ORDER = ['trex', 'trike', 'velo', 'spino', 'anky', 'stego', 'carno', 'pachy', 'theri', 'dilo', 'brachio', 'ptera'];
const FOLDER_LABEL: Record<string, string> = {
  trex: '티라노', trike: '트리케라', velo: '벨로키', spino: '스피노', anky: '안킬로', stego: '스테고',
  carno: '카르노', pachy: '파키', theri: '테리지노', dilo: '딜로포', brachio: '브라키오', ptera: '프테라',
};

