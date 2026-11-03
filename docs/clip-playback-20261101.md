# 기술 클립 재생 구간(`clipSpans`) — 안킬로 special · 트리케라 강 (2026-11-01)

## 왜 필요했나

도트 재생기는 공격 그림(클립)을 **기술이 선언한 전체 프레임**에 걸쳐 나눠 그린다(`sampleFighter` →
`sampleSpriteClip(…, stretchTo = script.frames)`). 그래서 기술이 일찍 끝나거나(`end` 사건),
프레임을 건너뛰면(잡기 성공 `grab.success`, 반격 성공 `counter.success`) **클립 뒷장이 그려질 구간이
통째로 사라진다**.

관측된 두 건:

| 기술 | 선언 | 실제로 도는 구간 | 증상 |
|---|---|---|---|
| `ankylosaurus_special` | 146f | 헛휘두름 0~96 (`end@97`) | 클립 6장 중 4장만 재생 |
| `triceratops_heavy` | 104f | 잡기 성공 30~69(`end@70`), 헛방 71~103 | 클립 4장 중 3장만 재생 |

## 고친 방법 (그림만, 판정은 손대지 않는다)

`move.script.clipSpans: [{from, to}, …]` — **이 프레임 구간에서는 클립 처음~끝을 고르게 재생한다.**
구간에 들지 않는 프레임은 예전처럼 기술 전체 길이 기준으로 재생한다(기본값 = 종전 동작).

- 엔진: `moveScript.ts` 에 `ClipSpan`·`clipSpanAt()` + 검증(순서·겹침·범위), `SpeciesSprite.sampleFighter`
  가 구간을 먼저 본다.
- `contactTipArt`(접촉 게이트가 쓰는 그림 주둥이)는 **그대로** — 표 값이 바뀌지 않는다.

### 적용 값

| 기술 | clipSpans | 근거 |
|---|---|---|
| `ankylosaurus_special` | `[{0, 97}]` | 헛휘두름 97f(1.62s) 안에 6장. 반격 성공(100~145)은 종전 재생 그대로 |
| `triceratops_heavy` | `[{30, 70}]`, `[{71, 104}]` | 잡기 성공 30~70, 헛방 71~104 에 각각 4장 |

`ankylosaurus_special` 은 `end@97` 을 **되살렸다**(f3f914f 에서 지웠던 것). 반격 성공은 f100 으로
건너뛰므로 97 을 지나가지 않아 `end` 가 터지지 않고, 후속타(109~116)·궤적(108)·연출(112)은 그대로 산다.

## 계측 (`npx vite-node scripts/probe-clip-playback.ts`)

```
ankylosaurus special: 마지막 f96 · 클립 6/6장 (인덱스 0,1,2,3,4,5) · 피해 7 @f80
ankylosaurus special (반격 성공): 마지막 f145 · 클립 2/6장 (인덱스 4,5) · 피해 29 @f109
triceratops heavy: 마지막 f69 · 클립 4/4장 (인덱스 0,1,2,3) · 피해 19 @f52
```

- 안킬로 헛휘두름: **97프레임**(146 → 기존 길이), 6/6장, 접촉 f80·피해 7 그대로.
- 안킬로 반격 성공: 종전과 동일(후속타 f109, 피해 29).
- 트리케라: 길이 그대로(f69), 4/4장.

감사 도구도 같은 값을 본다(`scripts/clip-truncation-audit.ts`):
`triceratops_heavy 4/4 · ankylosaurus_special 6/6 · tyrannosaurus_heavy 4/4(불변)`.

## 게이트

- 접촉 게이트 `npx vite-node scripts/contact-gate.ts` → **36행 PASS 36 · FAIL 0**, 표 파일 diff 0.
- `npx vitest run` → **769개 통과**(신규 4: `src/combat/trikeHeavyClipPlayback.test.ts`,
  갱신 3: `src/combat/ankySpecialPlayback.test.ts`).
- 캡처: `evidence-arena8/move-evidence.png`(안킬로 구르기 7컷·트리케라 4컷, 인게임 rAF 리드백).

## 남는 것

- 안킬로 반격 성공 실행은 클립 뒤쪽 두 장만 지나간다(그 구간이 100~145로 짧기 때문). 마스터 판정으로
  손대지 않기로 한 기존 동작 그대로다.
- 트리케라 헛방(71~104) 경로는 인게임에서 만들기 어려워 자동 계측으로만 확인했다(구간 규칙 동일).
