# 스테고사우루스 파츠 리그 — 12종 확대 2차 묶음

티라노 파츠 v3 / 스피노와 **완전히 같은 방식**(승인 마스터를 결정적으로 절단, 신규 생성 없음).
파이프라인: `../rig_common.py` + `../configs.py` + `../run_species.py`.

## 결과물
- 9조각 RGBA PNG: `farleg_back, nearleg_back, farleg_front, nearleg_front, torso, tailbase, tailtip, head, jaw`
- `rig.json` — 티라노 v1 승인 스키마와 동일 (stage 2048×1536 root(1024,1280), offset/pivot/capRadius/parent/drawOrder)
- `motions.json` — idle/walk/light/strong/special 회전 + root (엔진 인계)
- `pose_idle/walk/light/strong/special.png` + `contact.jpg`
- `mask_overlay.jpg` (소유권 시각화), `idle_vs_master.jpg`
- `ownership.json`

## 4족 리그 구성
- 다리 4파츠: 뒤(near/far) + 앞(near/far). 절단선은 실루엣 실측(y=1150/1200/1240의 다리 사이 간격)을 따라가며, 앞다리 쌍은 비스듬한 선으로 갈라 발이 잘리지 않게 했습니다.
- 꼬리 2분절: tailbase(x≥380) / tailtip(x<380, **테고마이저 4가시 포함**) → 꼬리 휘두르기가 가시까지 함께 돕니다.
- 머리+아래턱 분리(입 벌림 가능).

## 이번 종에서 새로 넣은 처리
1. **등판(붉은 골판)은 몸통 소유**: 목·꼬리 관절 피벗 원판이 골판을 함께 물고 돌아가는 문제가 있어, 붉은색(R>G+25 & R>B+25 & R>110) 픽셀을 head/tail 파츠 마스크에서 제외했습니다. 결과: 실루엣 933,979px 중 골판 212,763px이 전부 torso 소유.
2. **cap은 자기 체인만**: 큰 엉덩이 cap이 이웃 파츠(꼬리 밑면 등)를 삼키지 않도록, cap에서 비(非)체인 파츠 영역을 뺐습니다.
3. **hip/shoulder 정적 밴드(socket)**: 다리가 회전해 비운 자리를 몸통이 채워, 몸통 한가운데로 배경이 비치지 않습니다.

## 검증
- 소유권: 미충전 **0px**, 초과 **0px**.
- 관절 틈(포즈−대기): idle 1,180 / walk 2,695 / light 3,779 / strong 1,884 / special 2,737px — 대부분 원화에 원래 있던 다리 사이 빈틈의 모양 변화이고, 새로 갇힌 구조적 틈은 없습니다.
- 접지: walk 발바닥 y=1278 (y1280 기준 −2px 이내). light 1282 / strong 1281 / special 1278.

## 남은 한계 (다음 다듬기)
- 몸통 단일 파츠 → 상체 숙임은 root/회전으로 처리(엔진 인계).
- special의 root (0,−10)은 '골판 소나기' 리어 동작용 의도된 부양입니다(발이 10px 뜸).
- 목이 torso에 포함 → 머리는 두개골만. 필요하면 목 파츠 추가 가능.

## 다음
벨로키랍토르(같은 파이프라인) → 나머지 종.
