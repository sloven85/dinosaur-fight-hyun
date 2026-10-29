# 벨로키랍토르 파츠 리그 — 12종 확대 3차 묶음

티라노 v3 / 스피노 / 스테고와 **같은 방식**. 파이프라인: `../rig_common.py` + `../configs.py` + `../run_species.py`.

## 결과물
- 9조각 RGBA PNG: `farleg, nearleg, fararm, neararm, torso, tailbase, tailtip, head, jaw`
- `rig.json` (스키마·좌표계 동일), `motions.json`, `ownership.json`
- `pose_idle/walk/light/strong/special.png` + `contact.jpg`, `mask_overlay.jpg`, `idle_vs_master.jpg`

## 구성
- 2족 + 앞발 2 = 다리2·팔2·꼬리2분절·머리·아래턱·몸통 (티라노와 동일 9조각).
- 꼬리 2분절 분할 x=560 (깃털 끝 = tailtip) → 특수 '번개 왕복'에서 채찍 가능.
- 팔 파츠로 '할퀴기 3연타' / '낫발톱 킥' 동작 가능.

## 검증
- 소유권: 미충전 **0px**, 초과 **0px**.
- 관절 틈(포즈−대기): idle 6,311 / walk 5,574 / light 6,404 / strong 6,313 / special 6,410px — 대기 기준선과 같은 수준(원화에 원래 있는 팔·다리 사이 빈틈). 새로 갇힌 틈 없음.
- 접지: walk 발바닥 y=1273.

## 남은 한계
- 앞발이 몸통에 붙어 있어 팔 파츠 영역이 작습니다 → 큰 할퀴기 각도에서 어깨 미세 이음선 가능(스피노 한계와 동일).
- strong(낫발톱 킥)은 farleg +26°, root (26,−6)로 도약 느낌. 실제 궤도는 엔진이 보간.
