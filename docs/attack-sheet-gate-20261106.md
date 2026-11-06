# 공격 클립 시트 인테이크 게이트 (2026-11-06 확정)

마스터 승인 합격선(8969964)을 그대로 코드로 옮긴 것. 납품 시트는 받는 즉시 이 스크립트로
자동 판정하고, 수치가 하나라도 넘으면 실패 수치 그대로 반려한다.

## 합격선 4개

| # | 게이트 | 측정식 | 합격 |
| --- | --- | --- | --- |
| 1 | 클립 내 실루엣 높이 편차 | (최대높이 − 최소높이) / 최대높이 × 100 | ≤ 15.0% |
| 2 | 클립 내 팔레트 동일 | 칸마다 불투명 RGB 집합이 **완전히 같아야** 함 | 완전 일치 |
| 3 | 접촉 프레임 | 선언한 접촉 칸이 1~N 안에 있고, 그 칸의 접촉 픽셀이 불투명 | ≥ 1개 |
| 4 | 시트 1장 칸 수 | 자동 분할된 칸 수 | 6~8 |

높이는 **칸 안 불투명 픽셀 bbox의 세로 길이(아트px)** 다. 셀 여백·그림자·바닥 접지선은
bbox에 들어가지 않는다(불투명 픽셀만). 팔레트는 칸마다 `alpha>0` 픽셀의 RGB 집합이며
마스터 아이들 팔레트(`dev-art/palettes/<folder>.json`의 `p1`) 밖 색이 하나라도 있으면 실패다.

### 제안 — 5번째 확인(마스터 승인 대기)

4개만으로는 **클립 전체가 균일하게 1.3배로 커진 경우**를 잡지 못한다(칸끼리 같으면 1번 통과).
그래서 `클립 평균 높이 vs 그 종 대기 높이` 를 함께 재서 ±15% 를 넘으면 반려하는 5번째 항목을
제안한다. 근거는 "기존 마스터·대기 자세와 같은 개체" 조항이고, 대기 높이는
`dev-art/species/index.json` 의 `idle.h` 평균을 쓴다.

## 시트 규격(엔진 로드 계약)

- 셀 502×304, 1행 배치(6~8칸 → 시트 폭 3012~4016px), `facing: right`
- `anchorX=251`, `footY=298` — 즉 발끝 마지막 불투명 행 = 297, 그 아래 1px는 투명
- 알파는 이진(0 또는 255), 칸 사이 **완전 투명 열 ≥ 3px** (자동 분할 기준)
- 시트 좌→우 = 프레임 재생 순서, 칸 안 그림은 셀 중앙 정렬(중심 x≈251)
- 프레임당 색 수 ≤ 8, 마스터 팔레트 밖 색 0
- 칸 순서 규칙: 준비 2 / 벌림 1~2 / 닫힘 1(접촉) / 유지 1 / 회수 2

## 접촉 표(아티스트 납품) 스키마

```json
{"species":"trex","move":"light","sheet":"trex_light_sheet.png","cells":8,
 "contact_cell":5,"tip":{"sheet_x":2210,"sheet_y":182,"cell_x":204,"cell_y":182},
 "frame_map":[
   {"cell":1,"role":"ready"},{"cell":2,"role":"ready"},{"cell":3,"role":"windup"},
   {"cell":4,"role":"windup"},{"cell":5,"role":"contact"},{"cell":6,"role":"hold"},
   {"cell":7,"role":"recover"},{"cell":8,"role":"recover"}]}
```

- `contact_cell` 은 1-based, `cell_x` 는 그 칸 왼쪽 끝 기준, `sheet_x/y` 는 시트 절대 픽셀.
- 엔진 쪽 `contactTipArt` 는 이 좌표를 칸 좌표로 받아 쓰므로 둘 다 필요하다.

## 사용법

```bash
# 납품 시트 검사
python3 scripts/gate-attack-sheet.py --sheet /path/sheet.png --species trex --move light \
  --cols 8 --contact-frame 5 --contact-tip 2210,182 --idle-ref 110.5

# 현행 아트 기준선(같은 자) — 36클립 표 재생성
python3 scripts/gate-attack-sheet.py --manifest dev-art/species \
  --clips light,strong,special --out docs/attack-sheet-gate-baseline-20261106.md
```

## 기준선 결과(현행 인게임 아트, 2026-11-06)

`docs/attack-sheet-gate-baseline-20261106.md` — **36/36 FAIL**. 칸 수가 4(안킬로 special 6)라
전부 칸 수에서도 걸리지만, 높이 편차만 봐도 33클립이 15% 초과다.
최악: trex strong 44.9%, trike strong 43.3%, brachio special 39.9%, carno strong 31.8%.
높이 편차는 통과하지만 다른 항목에서 걸리는 클립: anky light 2.5%, spino light 1.9%,
stego special 3.9%(칸 수 4), anky special(팔레트 불일치).
