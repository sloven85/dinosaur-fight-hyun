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

## 화산 지대 중경 끝행 294 — 마스터 판정 규칙(2026-11-01)

마스터: 따로 작업하지 않는다. **8곳 캡처에서 원경이 띠처럼 비쳐 보이면 그때 레이어 PNG만** 고치고,
안 보이면 그대로 둔다. 판정은 캡처에서.

측정해 둔 것(참고, 판정 아님):
- 원본: 중경 내용이 294행에서 끝나 295~297 3행이 비고, 그 3행에는 원경이 보인다
  (640열 중 291열에서 위·아래 이웃 색과 Δ>12).
- 현재 캡처(`evidence-arena8/arena-volcano.png`, 배율 3)에서는 그 구간이 지면선 위 9~12px의
  **어두운 띠**로만 읽히고, 행 사이 단차는 ≤14, 지면 경계 단차는 56이다. 즉 띠 자체가
  또렷한 이중 경계를 만들지는 않는다. 최종 판정은 마스터.
- 고칠 경우 범위: `dev-art/stages/volcano/volcano_mid_736x360.png` 한 장(295~297행 채우기).
  코드·판정·다른 경기장은 불변.

## 인테이크 결과 (2026-11-01)

납품 `dino_arena_desert_museum_layers_v1.zip`(8273977, 4.4MB) → `desert`, `museum` 6파일 전부 규격 PASS
(960×360 RGB 불투명 / 736·832×360 RGBA 이진, 중경 끝행 298·지면 298~359, 레이어당 28색, 마젠타 0).
`--write` 로 `dev-art/stages/{desert,museum}/` + `layers.json` 투입, 코드 두 줄 수정.
납품 이름이 이미 게임 id와 같아 `--map` 은 쓰지 않았다. `*_x4.png`·합성본·아티스트 `layers.json`(scrollX 등)은
게임 계약이 아니라 넣지 않았다(시차 0.25/0.60/1.00 은 엔진 `LAYER_PARALLAX` 와 같은 값).

검증: `vitest` **769/769**, `tsc` OK, 접촉 게이트 **36/36 PASS**(`docs/contact-gate-20261031.md` diff 0),
`build:pilot` 성공, 8곳 캡처 재촬영 → `evidence-arena8/arena8-sheet.png`.

### 도중에 드러난 결함 — 새 아트가 안 뜨고 절차적 배경이 찍혔다

첫 캡처에서 사막·박물관만 절차적 도트 그대로였다. 원인은 아트가 아니라 **브라우저 캐시**:
`ASSET_VERSION` 해시가 `public/assets`·`public/dev-art` 만 훑는데 `dev-art` 는 빌드 **뒤에** dist 로
복사되므로 버전이 바뀌지 않는다 → 직전 세션에서 받은 `dev-art/stages/<id>/layers.json` 의 **404 가
같은 URL(`?v=…`)로 캐시**되어 새 파일을 요청하지 않았다. 캡처용 크롬 프로필(`/tmp/arena8-profile`)도 재사용됐다.

수정 2건:
1. `vite.config.ts` — 해시 대상에 저장소 루트 `dev-art/` 추가. 아트를 갈아 끼우면 URL 이 바뀐다.
   (`find` 순서는 정렬 순회라 결정적이다.)
2. `scripts/shoot-arena8.mjs` — 실행마다 새 프로필(`/tmp/arena8-profile-<pid>`).

재빌드 후 8곳 재촬영 → 사막·박물관 모두 아트 표시. **배포 시에도 같은 함정이 있다**: 이전에 `/pilot/` 을
열어 404 를 받은 브라우저는 새 빌드의 버전이 바뀌어야 새 레이어를 받는다(이번 수정으로 해소).
