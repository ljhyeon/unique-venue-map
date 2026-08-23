/**
 * 시설 구분 — 화면의 1차 필터 축.
 *
 * 원본 `소분과`는 다섯 값(`호텔/숙박` 41 · `유니크베뉴` 20 · `호텔` 15 · `컨벤션센터` 2 ·
 * `대학` 2)인데, `호텔`과 `호텔/숙박`은 같은 것을 다르게 적은 것뿐이다. 둘을 합치지
 * 않으면 `호텔` 15건이 통째로 미분류로 떨어진다.
 */
export type Facility = '호텔·숙박' | '유니크베뉴' | '컨벤션센터' | '대학·기관';

/** 탭 순서. 건수와 무관하게 고정한다 — 데이터가 바뀌어도 탭이 움직이면 안 된다. */
export const FACILITIES: Facility[] = ['호텔·숙박', '유니크베뉴', '컨벤션센터', '대학·기관'];

/** 마커·범례 색. 부산관광공사 팔레트. */
export const FACILITY_COLOR: Record<Facility, string> = {
  '호텔·숙박': '#0071CE',
  유니크베뉴: '#FF6A4D',
  컨벤션센터: '#00A6CE',
  '대학·기관': '#002B5C',
};

/** 원본 소분과 → 시설 구분. 공백을 제거해 비교하므로 표기 흔들림에 견딘다. */
const RULES: [RegExp, Facility][] = [
  [/^호텔(\/숙박)?$/, '호텔·숙박'],
  [/^숙박$/, '호텔·숙박'],
  [/^유니크베뉴$/, '유니크베뉴'],
  [/^컨벤션(센터|시설)$/, '컨벤션센터'],
  [/^(대학|기관|대학·기관)$/, '대학·기관'],
];

/**
 * 매칭되지 않으면 null을 돌려준다. 임의로 한 갈래에 몰아넣지 않는다 —
 * 빌드가 경고를 남기고 사람이 규칙을 추가하는 편이 낫다.
 */
export function toFacility(raw: string | null | undefined): Facility | null {
  const v = (raw ?? '').replace(/\s+/g, '');
  if (!v) return null;
  for (const [re, f] of RULES) if (re.test(v)) return f;
  return null;
}
