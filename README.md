# Color Tetrix

![Color Tetrix](public/og-cover.png)

테트로미노의 낙하 조작과 색상 연결 퍼즐을 결합한 모바일 중심 퍼즐 액션 게임입니다. 줄을 가득 채워도 사라지지 않으며, 같은 색 셀을 상하좌우로 6개 이상 연결해야 블록을 제거할 수 있습니다.

**Play:** https://color-tetrix-aimho.web.app/

## 핵심 규칙

- 10 × 20 보드에서 기본 테트로미노 7종을 사용합니다.
- 잠긴 조각은 개별 색상 셀로 분리됩니다.
- 같은 색 셀 6개 이상이 상하좌우로 연결되면 동시에 제거됩니다.
- 제거 후 각 열에 중력이 적용되며, 새 연결이 생기면 연쇄가 이어집니다.
- 줄 완성만으로는 블록이 사라지지 않습니다.
- 다음 조각이 생성될 공간이 없으면 게임이 종료됩니다.

## 주요 기능

### 색상 조각과 연쇄

- 한 조각 안에 여러 색이 포함되는 기본 조각
- 5% 확률로 등장하는 단색 조각
- 단색 조각이 8개 동안 나오지 않으면 다음 조각에서 보장
- 삭제 셀 수와 연쇄 단계에 따른 점수 배수
- 삭제량에 따라 강화되는 파편, 화면 충격 및 사운드 연출

### 화살표 이벤트

약 6% 확률로 조각의 한 셀에 방향 화살표가 부여됩니다. 화살표 셀이 색상 연결 또는 다른 화살표 효과로 제거될 때 발동합니다.

- `↑`: 바로 위 행 전체 제거
- `↓`: 바로 아래 행 전체 제거
- `←`: 바로 왼쪽 열 전체 제거
- `→`: 바로 오른쪽 열 전체 제거
- 제거된 행·열에 다른 화살표가 있으면 연속 발동
- 전체 행·열을 가로지르는 점화 빔과 강화된 파편 연출

### Reactor Overdrive

블록을 제거하면 Reactor 게이지가 충전됩니다. 100%에서 게이지를 누르거나 `A` 키를 사용하면 6초 동안 Overdrive가 발동합니다.

- 자동 낙하 일시 정지
- 삭제 점수 2배
- 전용 계기판 상태와 오버드라이브 연출

### 플레이 진행

- 삭제 30셀마다 레벨 상승, 최대 레벨 20
- 레벨에 따라 낙하 속도, 잠금 유예, 배경음 긴장도 상승
- 최고 레벨에 따라 `STANDARD`, `RAPID`, `EXPERT` 페이스 적용
- 누적 삭제 500셀에서 `EMBER`, 2,000셀에서 `AURORA` 테마 해금
- 프로필과 선택 테마는 브라우저에 저장

### DAILY와 온라인 기록

- 한국 시간 날짜를 기준으로 모든 플레이어에게 동일한 조각 순서 제공
- 일반 모드와 DAILY 모드별 TOP 50 기록
- 플레이어 이름을 브라우저에 기억
- 익명 플레이 요약을 이용한 주간 공동 Reactor 목표
- Firestore 보안 규칙과 복합 인덱스 적용

### 모바일 및 오디오

- 모바일 화면에서 정사각 셀 비율을 유지하며 보드 공간 최대화
- iOS Safari 오디오 세션 및 Web Audio 잠금 해제 처리
- 레벨에 따라 속도와 밀도가 변하는 절차적 배경음
- 핀치 및 더블 탭 화면 확대 방지
- 첫 플레이에서 기기별 조작 튜토리얼 제공
- PWA 매니페스트와 오프라인 앱 셸 제공

## 조작법

### 모바일

| 입력 | 동작 |
| --- | --- |
| 보드 탭 | 조각 회전 |
| 좌우 드래그 | 조각 실시간 이동 |
| 아래 드래그 | 소프트 드롭 |
| 보드 최하단 한 셀 영역 터치 | 하드 드롭 |
| 위 스와이프 | HOLD |
| Reactor 게이지 터치 | Overdrive 발동 |

### 데스크톱

| 키 | 동작 |
| --- | --- |
| `←` / `→` | 좌우 이동 |
| `↓` | 소프트 드롭 |
| `↑` / `W` / `X` / `Z` | 회전 |
| `Space` | 하드 드롭 |
| `Shift` / `C` | HOLD |
| `A` | Reactor Overdrive |

O 조각도 형태는 유지한 채 내부 색상과 이벤트 기호가 회전합니다.

## 기술 구성

- Vanilla JavaScript
- HTML Canvas 2D
- Vite 7
- Firebase Hosting
- Cloud Firestore Lite
- Web Audio API
- Service Worker / Web App Manifest
- Capacitor 7 패키징 설정
- Node.js 내장 테스트 러너

## 로컬 실행

### 요구 사항

- Node.js 22.12 이상
- npm

```bash
npm install
npm run dev
```

개발 서버는 기본적으로 `http://localhost:5173`에서 실행됩니다.

## 테스트와 빌드

```bash
npm test
npm run build
npm run preview
```

테스트는 입력, 오디오, 난이도, 조각 생성, 화살표 효과, 음악, 리더보드 데이터 정리 및 진행 시스템을 검증합니다.

## Firebase 배포

Firebase CLI에 로그인하고 프로젝트 접근 권한이 있는 상태에서 실행합니다.

```bash
firebase deploy --only hosting --project color-tetrix-aimho
```

Firestore 규칙과 인덱스까지 함께 배포할 때는 다음 명령을 사용합니다.

```bash
firebase deploy --only firestore,hosting --project color-tetrix-aimho
```

관련 설정 파일:

- `firebase.json`
- `firestore.rules`
- `firestore.indexes.json`
- `.firebaserc`

## 네이티브 앱 패키징 준비

Capacitor 설정은 포함되어 있지만 iOS 및 Android 스토어 바이너리는 아직 생성하거나 배포하지 않습니다.

```bash
npm run cap:add:ios
npm run cap:add:android
npm run cap:sync
```

스토어 제출 전에는 각 플랫폼의 개발자 계정, 앱 서명, 아이콘 및 심사 메타데이터가 추가로 필요합니다.

## 프로젝트 구조

```text
src/
├── main.js          # 게임 루프, 렌더링, 입력 및 UI 흐름
├── events.js        # 화살표 행·열 제거와 연속 발동
├── pieces.js        # 단색 및 이벤트 조각 생성
├── progression.js   # DAILY 시드, Reactor, 프로필과 페이스
├── difficulty.js    # 레벨, 낙하 속도와 연출 강도
├── audio.js         # 모바일 및 Safari 오디오 호환
├── music.js         # 절차적 배경음
├── input.js         # 키보드와 모바일 입력 판정
├── leaderboard.js   # Firestore 점수와 주간 기록
├── pwa.js           # Service Worker 등록
└── style.css        # 반응형 게임 UI

test/                # Node.js 단위 및 회귀 테스트
public/              # 아이콘, OG 이미지, 매니페스트, Service Worker
```

## 현재 범위

구현된 범위는 싱글 플레이 Endless 및 DAILY 모드입니다. 멀티플레이, 아이템, 특수 블록 확장, 앱스토어 출시는 현재 포함하지 않습니다.
