import type { RegionCode, RegionSummary } from './venue-types';

export const REGIONS: Record<RegionCode, { name: string; lat: number; lng: number }> = {
  gangseo: { name: '강서구', lat: 35.2122, lng: 128.9807 },
  geumjeong: { name: '금정구', lat: 35.2431, lng: 129.0921 },
  gijang: { name: '기장군', lat: 35.2446, lng: 129.2223 },
  namgu: { name: '남구', lat: 35.1368, lng: 129.0844 },
  donggu: { name: '동구', lat: 35.1294, lng: 129.0451 },
  dongnae: { name: '동래구', lat: 35.2051, lng: 129.0836 },
  busanjin: { name: '부산진구', lat: 35.1629, lng: 129.0532 },
  buk: { name: '북구', lat: 35.1972, lng: 128.9903 },
  sasang: { name: '사상구', lat: 35.1526, lng: 128.9912 },
  saha: { name: '사하구', lat: 35.1046, lng: 128.9747 },
  seo: { name: '서구', lat: 35.0948, lng: 129.0247 },
  suyeong: { name: '수영구', lat: 35.1457, lng: 129.1131 },
  yeonje: { name: '연제구', lat: 35.1761, lng: 129.0798 },
  yeongdo: { name: '영도구', lat: 35.0912, lng: 129.0678 },
  jungu: { name: '중구', lat: 35.1062, lng: 129.0323 },
  haeundae: { name: '해운대구', lat: 35.1631, lng: 129.1635 },
};

/**
 * 이름이 긴 것부터 검사한다. '강서구'는 '서구'를, '부산진구'는 '진구'를 포함하므로
 * 객체 선언 순서에 의존하면 조용히 틀린 결과가 나온다.
 */
const MATCH_ORDER: RegionCode[] = (Object.keys(REGIONS) as RegionCode[]).sort(
  (a, b) => REGIONS[b].name.length - REGIONS[a].name.length,
);

/**
 * 주소 문자열에서 구·군을 찾는다. 원본 주소는 공백이 제거되어 있을 수 있으므로
 * 공백을 모두 지운 뒤 비교한다.
 */
export function parseRegion(address: string): RegionCode | null {
  const compact = address.replace(/\s+/g, '');
  return MATCH_ORDER.find((code) => compact.includes(REGIONS[code].name)) ?? null;
}

export function regionName(code: RegionCode | null): string | null {
  return code ? REGIONS[code].name : null;
}

export function summarizeRegions(venues: { regionCode: RegionCode | null }[]): RegionSummary[] {
  return (Object.keys(REGIONS) as RegionCode[])
    .map((code) => ({
      code,
      name: REGIONS[code].name,
      count: venues.filter((v) => v.regionCode === code).length,
      lat: REGIONS[code].lat,
      lng: REGIONS[code].lng,
    }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);
}
