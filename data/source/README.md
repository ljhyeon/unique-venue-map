# data/source

공공데이터포털 원본 CSV를 **수정하지 않은 상태로** 이 디렉터리에 둡니다.

- 출처: https://www.data.go.kr/data/15160342/fileData.do
- 파일명 예: `부산관광공사_부산 마이스 얼라이언스_유니크베뉴_20260714.csv`
- 인코딩: CP949 (빌드 스크립트가 자동 감지)

파일명 끝의 `_YYYYMMDD`가 데이터 기준일로 사용됩니다.

CSV를 넣은 뒤:

```bash
pnpm data:build
```

정제·보정이 필요한 값은 이 파일이 아니라 `data/overrides.json`에 기록하세요.
