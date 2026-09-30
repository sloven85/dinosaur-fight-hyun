# 다이노 파이터즈 (Dino Fighters)

만 4세 조카와 아빠가 같은 PC에서 **게임패드 2개**로 즐기는 **웹 로컬 대전 격투게임**.
설치·로그인·서버 매칭 없이 브라우저에서 웹주소만 열면 바로 플레이한다.

- 플랫폼: PC 브라우저 웹게임 (정적 배포)
- 대전: 한 기기에서 로컬 2인 대전 + 1인 CPU전
- 입력: 게임패드 2개 (보조로 패드+키보드, 키보드 2인)
- 캐릭터: 공룡 12종 (익룡 게스트 프테라노돈 포함)
- 그래픽: 2D HD 카툰 컷아웃 리깅 + 핵심 포즈 스프라이트

> 게임 기획과 그림은 ChatGPT에서 준비하고, 실제 코딩은 GenCode에서 진행한다.
> 기준 문서는 **《다이노 파이터즈 제작 계획서 v1.0 (2026-09-30)》** 이며, 아래 규칙·수치·id·프롬프트 단계는 이 문서를 따른다.

## 기술 스택

- **TypeScript** + **Vite** (빌드/개발 서버)
- **Canvas 2D** 렌더링 (작은 의존성, 설치 불필요한 정적 배포)
- 60Hz 고정 스텝 시뮬레이션과 렌더링 분리

## 실행 방법

```bash
npm install      # 의존성 설치 (최초 1회)
npm run dev      # 개발 서버 실행 후 브라우저에서 안내된 주소 열기
npm run build    # 정적 빌드 (dist/)
npm run preview  # 빌드 결과 미리보기
npm run typecheck
```

## 배포

정적 호스팅(GitHub Pages 등)에 `dist/`를 올린다. `vite.config.ts`의 `base: './'`
설정으로 하위 경로(`/dinosaur-fight-hyun/`)에서도 에셋이 정상 로드된다.

## 폴더 구조 (계획서 14절)

```
index.html
public/assets/
  characters/{id}/parts/   캐릭터 컷아웃 파츠 PNG
  characters/{id}/poses/   강공격·특수기·다운·승리 전용 포즈 PNG
  stages/{stageId}/        경기장 배경 레이어
  ui/  effects/            UI 이미지와 이펙트
  audio/bgm/  audio/sfx/   배경음과 효과음
src/
  core/       게임 루프·상수·GameState
  scenes/     타이틀·선택·대전·결과 화면
  input/      키보드·패드 → 플레이어별 Action
  combat/     기술 상태·가드·판정·피해·게이지·승패
  rendering/  파츠 계층·포즈 전환 (전투 판정과 분리)
  ai/         CPU 판단 (동일 Action 인터페이스)
  ui/         HUD·메뉴
  data/       characters.json / moves.json / stages.json
```

## 진행 상태

- [x] 프롬프트 0 — 환경 확인(Node+Vite+TS+Canvas 2D 확정) 및 프로젝트 스캐폴딩
- [ ] 프롬프트 1 — 입력과 화면 골격
- [ ] 프롬프트 2 — 전투 시험판
- [ ] 프롬프트 3 — 그래픽 시험 적용
- [ ] 프롬프트 4 — 캐릭터 12종과 경기장
- [ ] 프롬프트 5 — CPU와 어린이 설정
- [ ] 프롬프트 6 — 연출과 최종 검수
- [ ] 프롬프트 7 — 배포와 인수

## 알려진 제약

- 실제 PNG 이미지·음원은 아직 포함하지 않는다. 제공 전까지 임시 도형과 무음으로 대체한다.
- 현재 화면은 파이프라인 확인용 임시 타이틀이다.
