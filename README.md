# UNIQUE BUSAN

부산관광공사 **부산 마이스 얼라이언스** 회원사(유니크베뉴·호텔/숙박·컨벤션시설) 데이터를 지도와 검색으로 탐색하는 서비스입니다.

- 데이터 원본: [공공데이터포털 15160342](https://www.data.go.kr/data/15160342/fileData.do)

## 주요 기능
- 전체 지도 및 검색 패널
- 장소명 검색
- 구별 및 카테고리별 필터
- 장소 상세 설명: 주소, 전화번호, 홈페이지, 소개글

## 기술 구성

| 영역 | 선택 | 비고 |
|---|---|---|
| 프레임워크 | Next.js 15 (App Router) | `app/page.tsx`는 서버 컴포넌트 |
| 언어 | TypeScript 5.7 | `strict` |
| UI | React 19 | |
| 지도 | MapLibre GL JS + OpenFreeMap | 키·환경변수 없음. 벡터 타일 |
| 아이콘 | 인라인 SVG | 아이콘 라이브러리 의존성 없음 |
| 서체 | Noto Sans KR (next/font) | 자체 호스팅 — 런타임 외부 요청 없음 |
| CSV 파싱 | csv-parse + iconv-lite | 빌드 타임 전용 |
| 패키지 매니저 | pnpm 9 | `packageManager` 필드로 고정 |

## 로컬 실행 요구사항

- **Node.js 20 이상** (`engines` 필드로 명시)
- **pnpm 9** — `corepack enable`로 활성화하는 것을 권장합니다

```bash
pnpm install
pnpm data:build     # data/source/*.csv → data/venues.json
pnpm dev            # http://localhost:3000
```

`data/venues.json`이 비어 있으면 지도 대신 안내 화면이 표시됩니다. 지도가 화면 전체를 차지하는 구조라
빈 지도를 띄우면 고장으로 읽히기 때문입니다. 먼저 `data:build`를 실행하세요.

좌표가 없는 장소는 지도에 찍히지 않고 목록에 `좌표 미확보` 태그로 남습니다. 앱은 정상 동작합니다.

## 데이터 갱신 방법

### 파이프라인

```
data/source/*.csv     원본 (CP949). 절대 수정하지 않음
        │
        ├─ scripts/build-venues.ts
        │     CP949 디코딩 → csv-parse → 헤더 매핑 → 정규화 → 소개글 기반 2차 분류
        │
        ├─ scripts/geocode.ts        (OpenStreetMap Nominatim) 주소 → 좌표
        │
data/overrides.json   사람이 교정한 값 (주소 공백, 좌표, URL, 세부분류)
        │
        ▼
data/venues.json      빌드 산출물. 앱은 이것만 읽음
```

### 원본을 새로 받았을 때

```bash
# 1. 새 CSV를 data/source/ 에 넣는다 (파일명 끝 _YYYYMMDD가 데이터 기준일이 됨)
pnpm data:build

# 2. 새로 추가된 장소의 좌표를 받는다
pnpm data:geocode

# 3. 받은 좌표를 venues.json에 반영한다
pnpm data:build
```

## 품질 검사

```bash
pnpm check        # lint → typecheck → build
```

개별 실행:

```bash
pnpm lint         # eslint (next/core-web-vitals)
pnpm typecheck    # 앱 + scripts 양쪽 tsconfig
pnpm build        # 프로덕션 빌드
```

`typecheck`가 `tsconfig.json`과 `tsconfig.scripts.json`을 **모두** 검사한다는 점이 중요합니다. 스크립트는
Node 환경이라 앱과 타입 설정이 다르고, 한쪽만 보면 빌드 스크립트의 타입 오류가 그대로 지나갑니다.=

## 배포

**아직 배포 설정이 없습니다.** CI 워크플로우, `vercel.json`, `Dockerfile` 모두 두지 않았습니다.

배포 시 전제는 두 가지입니다.

1. **`data/venues.json`이 저장소에 커밋되어 있어야 합니다.** 원본 CSV에는 좌표가 없습니다. 좌표는
   로컬에서 `data:geocode`로 받아 `overrides.json`에 커밋한 값이 유일한 출처입니다. 빌드 서버에서
   지오코딩을 돌리면 Nominatim 이용 정책을 위반합니다.
2. **`public/maplibre/`가 빌드 산출물에 포함되어야 합니다.** `pnpm build`가 앞단에서
   `maplibre:worker`를 돌려 워커를 복사하므로 보통은 신경 쓸 것이 없습니다. 다만 이 폴더는
   커밋하지 않으니(생성물), 빌드를 건너뛰고 정적 파일만 올리는 파이프라인은 쓰면 안 됩니다.
3. **런타임에 `https://tiles.openfreemap.org`에 접근할 수 있어야 합니다.** 지도 스타일·타일·글리프를
   여기서 받습니다. 키는 필요 없지만, CSP를 거는 경우 이 도메인을 `connect-src`와 `img-src`에
   허용해야 합니다. 빌드 시점에 넣어야 할 환경변수는 없습니다.

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

데이터를 런타임에 가져오지 않고 API 라우트도 없으므로 정적 호스팅도 가능합니다. 다만 `output: 'export'`는
현재 `next.config.ts`에 설정되어 있지 않으니, 정적 배포하려면 그 옵션을 먼저 켜고 빌드를 확인해야 합니다.

## 프로젝트 구조

```
app/                    Next.js App Router
  page.tsx              서버 컴포넌트. venues.json을 읽고 빈 데이터면 안내 화면
  layout.tsx            메타데이터 (lib/site-config.ts에서 주입)
  globals.css           전역 스타일 전부 (CSS-in-JS 없음)
  components/
    venue-map-shell.tsx 검색 · 필터 · 목록 패널. 모든 상태의 소유자
    venue-map.tsx       MapLibre 제어. 마커 동기화 + 말풍선 마커 위치
    venue-bubble.tsx    말풍선 내용. React가 그리며 지도 라이브러리를 모른다

lib/                    도메인 로직. React 의존성 없음
  venue-types.ts        스키마 단일 출처. 앱과 스크립트가 공유
  venue-data.ts         venues.json 로드. 앱의 유일한 데이터 진입점
  facility.ts           시설 구분 4갈래 + 마커 색. 화면 1차 필터 축
  venue-subtype.ts      소개글 키워드 점수제 2차 분류 (8갈래, 현재 화면 미사용)
  normalize.ts          CSV 오염값 정제 (주소 공백 · URL · 전화번호 · 소개글)
  region.ts             주소 → 구·군 판별
  site-config.ts        사이트 이름 · 설명 · 원본 출처

scripts/                빌드 타임 전용. 앱 번들에 포함되지 않음
  build-venues.ts       CSV → venues.json
  geocode.ts            주소 → 좌표 (OpenStreetMap Nominatim, 키 불필요)
  copy-maplibre-worker.ts  MapLibre 워커를 public/maplibre/로 복사 (dev·build 앞에서 자동)

data/
  source/               원본 CSV (CP949). 수정하지 않음
  overrides.json        사람이 교정한 값. 원본 갱신에도 살아남음
  venues.json           빌드 산출물. 앱은 이것만 읽음
```

의존 방향은 `app/ → lib/` 한 방향입니다. `lib/`는 React를 import하지 않으므로 스크립트에서도 그대로 씁니다.
