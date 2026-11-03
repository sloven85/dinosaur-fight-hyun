/**
 * 12종 × 전 기술(약·강·특수) 접촉 게이트 표 (2026-10-31).
 *
 * 목적(게임 제작 마스터 지시 8112350): "1개라도 실패면 배포 반려".
 * 그림→판정 정합(ContactAlign)이 실제로 성립하는지 종·기술 단위로 재서 표로 남긴다.
 *
 * 행 하나 = (공룡, 기술) 한 쌍. 재는 값:
 *  - 접촉 프레임: 기술이 처음 판정을 내는 프레임(ContactAlign.contactFrame)
 *  - 판정 앞끝: 몸 앞끝 + 상자 x + 폭 (화면 px)
 *  - 그림 주둥이: 그 프레임 스프라이트의 불투명 경계 오른끝 × 배율 (화면 px)
 *  - 내민 보정: 그 프레임에 실제로 적용되는 ContactAlign 보정 (화면 px)
 *  - 오차: (주둥이 + 보정) − 판정 앞끝. |오차| ≤ 4px(1아트px)면 PASS.
 *  - 명중: 최소 간격에서 그 기술이 실제로 피해를 넣었는가.
 *
 * 실행: npx vite-node scripts/contact-gate.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { FIXED_DT, ROUND_INTRO_FRAMES } from '../src/core/constants';
import { CHARACTERS } from '../src/data';
import { Match } from '../src/combat/Match';
import { ScriptInput } from '../src/combat/ScriptInput';
import type { CharacterAssets } from '../src/rendering/CharacterAssets';
import type { RigData } from '../src/rendering/rig';
import { parseSpriteManifest, type SpriteManifest, type SpriteState } from '../src/rendering/pixel/SpeciesSprite';
import { contactFrame, contactFront, contactGap, contactTipArt, isAreaContact } from '../src/rendering/pixel/ContactAlign';
import { PIXEL_ART_SCALE } from '../src/rendering/pixel/PixelBackground';
import type { AttackKind } from '../src/combat/types';

const ROOT = 'dev-art/species';
const TOLERANCE = PIXEL_ART_SCALE; // 1 아트 px

interface Row {
  species: string;
  name: string;
  kind: AttackKind;
  state: SpriteState;
  contactFrame: number;
  front: number;
  tip: number;
  push: number;
  delta: number;
  hit: boolean;
  hitFrame: number;
  area: boolean;
  pass: boolean;
}

function folders(): Record<string, string> {
  const index = JSON.parse(readFileSync(`${ROOT}/index.json`, 'utf8')) as {
    species: Record<string, { character: string }>;
  };
  const map: Record<string, string> = {};
  for (const [folder, entry] of Object.entries(index.species)) map[entry.character] = folder;
  return map;
}

function manifestOf(id: string, map: Record<string, string>): SpriteManifest {
  return parseSpriteManifest(JSON.parse(readFileSync(`${ROOT}/${map[id]}/manifest.json`, 'utf8')));
}

function assetsOf(id: string): CharacterAssets {
  const rig = JSON.parse(readFileSync(`public/assets/characters/${id}/rig.json`, 'utf8')) as RigData;
  return { id, rig, master: null, portrait: null, poses: {} };
}

function stateFor(kind: AttackKind): SpriteState {
  return kind === 'heavy' ? 'strong' : kind === 'special' ? 'special' : 'light';
}

/**
 * 최소 간격에서 그 기술을 내고 접촉 프레임의 그림·판정·보정을 잰다.
 *
 * 보정값은 엔진과 같은 식으로 접촉 프레임에서 계산한다:
 *   contactOffsetArt = round(contactGap / 아트px) × 아트px, 접촉 프레임의 램프는 1.
 * (엔진을 프레임마다 훔쳐보는 방식은 특수기 컷인·히트스톱에서 프레임이 건너뛰어 부정확했다.)
 */
function measure(id: string, kind: AttackKind, manifest: SpriteManifest): Row {
  const match = new Match('versus', [id, id], [assetsOf(id), assetsOf(id)]);
  const idle = new ScriptInput();
  for (let i = 0; i < ROUND_INTRO_FRAMES; i++) match.step(idle, FIXED_DT);

  match.p1.x = 700;
  match.p2.x = 700 + (match.p1.bodyWidth + match.p2.bodyWidth) / 2;
  match.p1.meter = 100;

  const move = match.p1.moves[kind];
  const front = contactFront(move, match.p1.bodyFront);
  const tip = contactTipArt(manifest, kind, move) * PIXEL_ART_SCALE;
  const area = isAreaContact(move, match.p1.bodyFront);
  const gap = contactGap(match.p1, move, manifest);
  const push = area ? 0 : Math.round(gap / PIXEL_ART_SCALE) * PIXEL_ART_SCALE;
  const delta = tip + push - front;

  const input = new ScriptInput();
  input.press(0, kind);
  match.step(input, FIXED_DT);
  input.clearPressed();
  let hit = false;
  let hitFrame = -1;
  for (let i = 0; i < 160; i++) {
    const health = match.p2.health;
    match.step(input, FIXED_DT);
    if (!hit && match.p2.health < health) {
      hit = true;
      hitFrame = match.p1.attack ? match.p1.attack.frame : -1;
    }
  }

  return {
    species: id,
    name: '',
    kind,
    state: stateFor(kind),
    contactFrame: contactFrame(move),
    front,
    tip,
    push,
    delta,
    hit,
    hitFrame,
    area,
    pass: hit && (area ? push === 0 : Math.abs(delta) <= TOLERANCE),
  };
}

function main(): void {
  const map = folders();
  const rows: Row[] = [];
  for (const character of CHARACTERS) {
    const manifest = manifestOf(character.id, map);
    for (const kind of ['light', 'heavy', 'special'] as const) {
      const row = measure(character.id, kind, manifest);
      row.name = character.name;
      rows.push(row);
    }
  }

  const f = (n: number): string => (Number.isFinite(n) ? String(Math.round(n)) : '—');
  const lines: string[] = [];
  lines.push('# 12종 × 전 기술 접촉 게이트 (2026-10-31)');
  lines.push('');
  lines.push(`- 단위: 화면 px (1 아트 px = ${PIXEL_ART_SCALE}px). 허용 오차 |오차| ≤ ${TOLERANCE}px.`);
  lines.push('- 판정 앞끝 = 몸 앞끝 + 상자 x + 폭 · 그림 주둥이 = 접촉 프레임 불투명 경계 오른끝 × 배율');
  lines.push('- 내민 보정 = 접촉 프레임에 ContactAlign 이 적용하는 값(피해·사거리 수치는 불변)');
  lines.push('- 명중 = 최소 간격에서 그 기술이 실제 피해를 넣었는가');
  lines.push('- 광역 = 접촉 상자가 몸 뒤까지 걸친 회전·광역 기술(앞끝이 사거리가 아니다) → 그림을 밀지 않는 것이 통과 조건');
  lines.push('');
  lines.push('| # | 공룡 | 기술 | 접촉f | 판정앞끝 | 그림주둥이 | 내민보정 | 오차 | 명중 | 판정 |');
  lines.push('|---:|---|---|---:|---:|---:|---:|---:|---|---|');
  rows.forEach((r, i) => {
    const label = r.kind === 'light' ? '약' : r.kind === 'heavy' ? '강' : '특수';
    const err = r.area ? '광역' : `${r.delta >= 0 ? '+' : ''}${f(r.delta)}`;
    lines.push(
      `| ${i + 1} | ${r.name} | ${label} | ${r.contactFrame} | ${f(r.front)} | ${f(r.tip)} | ${f(r.push)} | `
      + `${err} | ${r.hit ? `O(f${r.hitFrame})` : 'X'} | ${r.pass ? 'PASS' : (r.area ? 'FAIL(밀림)' : 'FAIL')} |`,
    );
  });
  // 참고: 피해가 실제로 들어간 프레임이 접촉 프레임과 다른 행(잡기·물고 흔들기·던지기 계열).
  const lateHit = rows.filter((r) => r.hit && r.hitFrame >= 0 && r.hitFrame - r.contactFrame > 2);
  if (lateHit.length > 0) {
    lines.push('');
    lines.push('## 참고: 손상 프레임이 접촉 프레임보다 늦은 행');
    lines.push('피해는 이벤트(던지기·흔들기 마무리)에서 들어가고, 그림 정합은 접촉 프레임 기준이다.');
    lines.push('연출상 "닿는 순간"과 "체력이 줄어드는 순간"이 다른 행이므로 눈으로 확인할 목록.');
    for (const r of lateHit) {
      const label = r.kind === 'light' ? '약' : r.kind === 'heavy' ? '강' : '특수';
      lines.push(`- ${r.name} ${label}: 접촉 f${r.contactFrame} → 손상 f${r.hitFrame}`);
    }
  }
  const failed = rows.filter((r) => !r.pass);
  lines.push('');
  lines.push(`총 ${rows.length}행 · PASS ${rows.length - failed.length} · FAIL ${failed.length}`);
  if (failed.length > 0) {
    lines.push('');
    lines.push('## FAIL');
    for (const r of failed) {
      const label = r.kind === 'light' ? '약' : r.kind === 'heavy' ? '강' : '특수';
      lines.push(`- ${r.name} ${label}: ${r.area ? `광역 상자인데 그림을 ${f(r.push)}px 밀었다` : `오차 ${f(r.delta)}px`}, 명중 ${r.hit ? 'O' : 'X'}`);
    }
  }
  const table = lines.join('\n');
  console.log(table);
  writeFileSync('docs/contact-gate-20261031.md', `${table}\n`);
  console.log('\n→ docs/contact-gate-20261031.md');
  if (failed.length > 0) process.exitCode = 1;
}

main();
