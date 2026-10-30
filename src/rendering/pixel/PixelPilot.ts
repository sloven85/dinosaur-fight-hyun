import type { Fighter } from '../../combat/Fighter';
import type { Match } from '../../combat/Match';
import { getMove } from '../../data';
import type { AssetLoader } from '../AssetLoader';
import { renderPlaceholder, renderShadow } from '../FighterRenderer';
import { PixelAnimator, PIXEL_CLIPS, drawPixelSample, parsePixelManifest, pixelClipFor, samplePixelClip, sampleSourceClip,
  validateBiteTiming, validatePixelImage, type PixelAssets, type PixelClipName } from './PixelAnimation';

export function pixelPilotEnabled(dev: boolean, search: string): boolean {
  return dev && new URLSearchParams(search).get('pixelPilot') === '1';
}

export async function loadPixelAssets(loader: Pick<AssetLoader, 'loadJson' | 'loadImage'>,
  path = 'dev-art/tyrannosaurus/manifest.json'): Promise<PixelAssets> {
  const raw = await loader.loadJson<unknown>(path);
  if (!raw) throw new Error('저장된 도트 manifest가 아직 없거나 읽을 수 없습니다.');
  const manifest = parsePixelManifest(raw);
  validateBiteTiming(manifest, getMove('tyrannosaurus_light'));
  const image = await loader.loadImage(path.slice(0, path.lastIndexOf('/') + 1) + manifest.image);
  if (!image) throw new Error('도트 PNG가 아직 준비되지 않았습니다.');
  validatePixelImage(manifest, image);
  return { manifest, image };
}

/** DEV-only observer of the actual match. Does not supply input or alter fighters/rules/settings. */
export class PixelPilot {
  private assets: PixelAssets | null = null;
  private clocks = [new PixelAnimator(), new PixelAnimator()];
  private panel = document.createElement('section');
  private status = document.createElement('p');
  private diagnostics = document.createElement('p');
  private view = document.createElement('select');
  private effectsInput = document.createElement('input');
  private preview = document.createElement('canvas');
  private pose: PixelClipName = 'idle';
  private poseTick = 0;
  private poseSource = true;
  private poseFacing: 1 | -1 = 1;
  private previewStatus = document.createElement('p');
  private disposed = false;
  private loadGeneration = 0;
  private round = 0;

  constructor(loader: AssetLoader) {
    this.panel.setAttribute('aria-label', '티라노 도트 개발 비교판');
    this.panel.style.cssText = 'position:fixed;right:8px;top:8px;z-index:20;width:390px;max-height:72vh;overflow:auto;padding:12px;background:#101820ee;color:white;font:13px system-ui;border:1px solid #637888;border-radius:8px';
    const title = document.createElement('strong');
    title.textContent = '티라노 도트 비교 · 개발 전용';
    const expand = document.createElement('button'); expand.textContent = '관찰창 확대/축소';
    expand.onclick = () => {
      const expanded = this.panel.style.width === '390px';
      this.panel.style.width = expanded ? 'min(880px, calc(100vw - 44px))' : '390px';
      this.panel.style.maxHeight = expanded ? 'calc(100vh - 44px)' : '72vh';
    };
    const note = document.createElement('p');
    note.textContent = '실전 1× · 기존 조작/CPU/판정 그대로. 화면 전환은 같은 경기를 유지합니다.';
    for (const [value, text] of [['pixel', '도트 우선 (미지원은 기존)'], ['legacy', '기존 동작']]) {
      const option = document.createElement('option'); option.value = value; option.textContent = text; this.view.append(option);
    }
    this.view.setAttribute('aria-label', '실전 렌더러');
    const effectLabel = document.createElement('label');
    this.effectsInput.type = 'checkbox';
    // 기본값 켜짐 — 공개판과 같은 연출(피격음·흔들림·KO)을 기본으로 둔다.
    this.effectsInput.checked = true;
    effectLabel.append(this.effectsInput, ' 연출/흔들림 켜기');
    const manifestFile = document.createElement('input'); manifestFile.type = 'file'; manifestFile.accept = '.json';
    manifestFile.setAttribute('aria-label', '도트 manifest JSON');
    const pngFile = document.createElement('input'); pngFile.type = 'file'; pngFile.accept = 'image/png';
    pngFile.setAttribute('aria-label', '도트 PNG 시트');
    const install = document.createElement('button'); install.textContent = '선택한 JSON + PNG 연결';
    install.onclick = () => { void this.load(async () => {
      const json = manifestFile.files?.[0], png = pngFile.files?.[0];
      if (!json || !png) throw new Error('JSON과 PNG를 모두 선택하세요.');
      if (json.size > 1024 * 1024 || png.size > 32 * 1024 * 1024) throw new Error('JSON 1MB / PNG 32MB 이내로 준비하세요.');
      const manifest = parsePixelManifest(JSON.parse(await json.text()));
      validateBiteTiming(manifest, getMove('tyrannosaurus_light'));
      const url = URL.createObjectURL(png);
      try {
        const image = new Image(); image.src = url; await image.decode();
        validatePixelImage(manifest, image);
        return { manifest, image };
      } finally { URL.revokeObjectURL(url); }
    }); };
    const saved = document.createElement('button'); saved.textContent = '저장된 아트 연결/재시도';
    saved.onclick = () => { void this.load(() => loadPixelAssets(loader)); };
    const detail = document.createElement('details');
    const summary = document.createElement('summary'); summary.textContent = '아트 연결 · 자세 관찰 (실전 판정과 별개)';
    const poseSelect = document.createElement('select'); poseSelect.setAttribute('aria-label', '자세 재생');
    const names = ['대기', '걷기', '물기', '피격', '다운'];
    PIXEL_CLIPS.forEach((value, i) => { const option = document.createElement('option'); option.value = value; option.textContent = names[i]; poseSelect.append(option); });
    poseSelect.onchange = () => { this.pose = poseSelect.value as PixelClipName; this.poseTick = 0; };
    const replay = document.createElement('button'); replay.textContent = '자세 다시 재생'; replay.onclick = () => { this.poseTick = 0; };
    const timing = document.createElement('select'); timing.setAttribute('aria-label', '관찰 시간 기준');
    for (const [value, label] of [['source', '원본 시간 (v2 2회 물기 500ms)'], ['combat', '전투 시간 (2회 물기 30틱)']]) {
      const option = document.createElement('option'); option.value = value; option.textContent = label; timing.append(option);
    }
    timing.onchange = () => { this.poseSource = timing.value === 'source'; this.poseTick = 0; };
    const flip = document.createElement('button'); flip.textContent = '관찰 방향 반전'; flip.onclick = () => { this.poseFacing = this.poseFacing === 1 ? -1 : 1; };
    // Technical viewport, not generated art. One canvas pixel is one CSS pixel.
    this.preview.width = 832; this.preview.height = 560;
    this.preview.style.cssText = 'display:block;background:#253140;image-rendering:pixelated';
    const viewport = document.createElement('div'); viewport.style.cssText = 'overflow:auto;max-height:560px'; viewport.append(this.preview);
    detail.append(summary, manifestFile, pngFile, install, saved, poseSelect, timing, replay, flip, this.previewStatus, viewport);
    this.status.textContent = '아트 미연결 — 기존 그림으로 플레이합니다. 새 동작의 자연스러움은 아직 검증할 수 없습니다.';
    this.panel.append(title, expand, note, this.view, effectLabel, this.status, this.diagnostics, detail);
    document.body.append(this.panel);
    void this.load(() => loadPixelAssets(loader));
  }

  get effects(): boolean { return this.effectsInput.checked; }
  private async load(operation: () => Promise<PixelAssets>): Promise<void> {
    const generation = ++this.loadGeneration;
    this.assets = null;
    this.status.textContent = '아트 확인 중 — 준비될 때까지 기존 렌더러 유지';
    try {
      const assets = await operation();
      if (this.disposed || generation !== this.loadGeneration) return;
      this.assets = assets;
      this.poseTick = 0;
      this.status.textContent = `${assets.manifest.frames.length}장 아트 연결 · v2 30틱 2연속 물기(접촉 6–8/12–15). 원본도 500ms 2회. 강/특수·방어·점프·승리는 기존 동작.`;
    } catch (error) {
      if (!this.disposed && generation === this.loadGeneration) {
        this.status.textContent = `아트 미연결 — ${error instanceof Error ? error.message : '파일 확인 실패'} 기존 그림으로 플레이합니다.`;
      }
    }
  }

  step(match: Match, frozen: readonly boolean[]): void {
    if (this.round !== match.roundNumber) {
      this.round = match.roundNumber;
      this.clocks.forEach(clock => clock.reset());
    }
    match.fighters.forEach((f, i) => this.clocks[i].step(f, frozen[i]));
    this.poseTick++;
    this.diagnostics.textContent = match.fighters.map((f, i) => {
      const sample = this.assets ? this.clocks[i].sample(this.assets.manifest, f) : null;
      const newArt = this.view.value === 'pixel' && !!sample;
      return `${i + 1}P ${f.state} · HP ${f.health} · ${newArt ? `도트 ${sample!.clip}[${sample!.frame}]` : '기존'} · 기술틱 ${f.attack?.frame ?? '-'} · 정지 ${f.hitstopFrames}${!pixelClipFor(f) ? ' (미지원 상태)' : ''}`;
    }).join(' / ');
    const g = this.preview.getContext('2d');
    if (g) {
      g.clearRect(0, 0, this.preview.width, this.preview.height);
      g.fillStyle = '#7c8d9c'; g.fillRect(0, 544, 832, 1);
      if (this.assets) {
        const sample = this.poseSource ? sampleSourceClip(this.assets.manifest, this.pose, this.poseTick * 1000 / 60)
          : samplePixelClip(this.assets.manifest, this.pose, this.poseTick);
        drawPixelSample(g, this.assets, sample, 416, 544, this.poseFacing);
        this.previewStatus.textContent = `관찰 전용 · ${this.poseSource ? '원본 ms' : '전투 60Hz'} · ${this.pose} 프레임 ${sample.frame} · ${this.poseFacing === 1 ? '오른쪽' : '왼쪽'} · 4배 (가로 스크롤)`;
      }
      // No fitting/scaling to hide oversized art: the fixed registration viewport may clip it.
    }
  }

  /**
   * 도트 화면에서는 이 캐릭터를 여기서 맡는다(항상 true).
   * 그림이 없거나 이 상태의 클립이 없으면 파츠 렌더러로 넘기지 않고 임시 도형만 그린다(jk 확정 2026-10-29).
   */
  render(g: CanvasRenderingContext2D, fighter: Fighter, groundY: number): boolean {
    if (this.view.value !== 'pixel') return false;
    const frame = this.assets ? this.clocks[fighter.player].sample(this.assets.manifest, fighter) : null;
    if (!this.assets || !frame) {
      renderShadow(g, fighter, groundY);
      renderPlaceholder(g, fighter, groundY + fighter.y);
      return true;
    }
    drawPixelSample(g, this.assets, frame, fighter.x, groundY + fighter.y, fighter.facing);
    return true;
  }

  dispose(): void { this.disposed = true; this.loadGeneration++; this.assets = null; this.panel.remove(); }
}
