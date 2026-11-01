# 사막 화석지·공룡 박물관 배경 교체 런북 (2026-11-01)

마스터 판정(8273415): 8곳 중 `desert`(사막 화석지)와 `museum`(공룡 박물관)만 절차적 도트라
그림 배경 6곳과 톤이 섞인다. 두 곳을 **같은 규격 3레이어**로 갈아 끼운 뒤, 8곳을 한 장에 모은
인게임 캡처로 재판정한다. 승인 전이므로 `/pilot/`만 갱신하고 공개 루트는 건드리지 않는다.

## 납품 계약 (아티스트 → 게임)

| 레이어 | 파일 | 크기 | 알파 | 색 | 내용 세로 범위 |
|---|---|---|---|---|---|
| far 원경 | `<id>_far_960x360.png` | 960×360 | 없음(RGB 불투명) | ≤ 28 | 전면 |
| mid 중경 | `<id>_mid_736x360.png` | 736×360 | 0/255 이진 | ≤ 28 | 끝 행 = **298** |
| ground 지면 | `<id>_ground_832x360.png` | 832×360 | 0/255 이진 | ≤ 28 | **298** ~ 359 |

- 게임 stage id 는 `desert`, `museum` — 폴더·파일 이름 모두 이 id를 쓴다.
- 폭 = 640 + pad×2 (pad 160 / 48 / 96 고정). `layers.json` 의 `standLine` = 298.
- 1배본만 넣는다. 엔진이 배율 k(1080에서 3)로 그리고 `imageSmoothingEnabled=false` 다.

## 검사·투입 (한 명령)

```bash
# 1) 압축 풀고 규격만 재기 (아무것도 쓰지 않는다)
python3 scripts/intake-stage-layers.py <받은폴더>
# 2) 규격 PASS 면 dev-art/stages/<id>/ + layers.json 까지 쓴다
python3 scripts/intake-stage-layers.py <받은폴더> --write
# 기존 6곳 회귀(자기검사): 지금은 화산 중경만 294로 규격 이전 판
python3 scripts/intake-stage-layers.py dev-art/stages --self-test
```

납품 이름이 게임 id와 다르면 `--map moon=swamp` 처럼 넘긴다(지난 4곳 때 `moon`→`swamp`).

## 코드 변경 (2줄)

1. `src/rendering/pixel/PixelBackground.ts` — `DOT_STAGE_LAYER_ART` 에 `desert`, `museum` 추가
   (`stageLayers.test.ts` 가 디스크의 `dev-art/stages/*/layers.json` 과 대조하므로 아트 없이 먼저 넣으면 실패한다).
2. `src/scenes/StageSelectScene.ts` — `DOT_STAGE_NOTE` 의 `desert`·`museum` 을 `도트 톤` → `도트 배경`.

빌드 쪽은 손댈 곳이 없다: `scripts/copy-dot-art.mjs` 가 `dev-art/` 폴더를 통째로 `dist` 로 복사한다.

## 검증·납품 순서

```bash
npx vitest run                 # 769 기대
npx tsc --noEmit
npx vite-node scripts/contact-gate.ts   # 접촉 게이트 36/36, 표 값 변화 0 이어야 함
npm run build:pilot
node scripts/shoot-arena8.mjs http://127.0.0.1:5199/ evidence-arena8
# 8칸 시트 합성 → evidence-arena8/arena8-sheet.png (1920×1080, 배율 4)
```

- `/pilot/` 갱신 = `dist` 를 `public/pilot` 에 넣고 main 쪽 deploy 커밋. 공개 루트는
  `deploy-pages.yml` 이 `npm run build`(VITE_DOT_PILOT 없음)로 빌드하므로 그대로 벡터 화면이다.
- 동등성 표(`docs/dot-equivalence-20261031.md`)의 △1(경기장 4곳 절차적 도트)은 이 4곳으로
  해소됐고, 이번 두 곳까지 그림 배경이 되면 15/15 O 다.

## 준비 상태 (2026-11-01 03:40 UTC 기준)

- 검사기 `scripts/intake-stage-layers.py` 작성·자기검사 PASS(4곳 신규 전부 규격 일치, 정글 PASS,
  화산 중경 294만 규격 이전 판으로 FAIL 표기 — 기존 아트, 이번 범위 아님).
- 8곳 목록으로 바꾼 상태의 리허설: `stageLayers.test.ts` 3/3 PASS, `tsc --noEmit` PASS.
  리허설용 임시 아트는 지우고 소스는 되돌렸다(`git status` 깨끗, 새 검사기만 미커밋).
- 캡처 경로 드라이런: `node scripts/shoot-arena8.mjs <url> /tmp/arena8-before desert,museum` →
  두 장 정상(현재는 절차적 도트). 배포 전 확인용.
- 캐시: `ASSET_VERSION` 해시는 `public/assets`·`public/dev-art` 를 훑지만, `dev-art` 는 빌드 뒤에
  복사되므로 새 경로 파일에는 영향 없다. 같은 이름으로 재납품이 오면 버전이 안 바뀌므로
  한 번 강력 새로고침이 필요하다.
