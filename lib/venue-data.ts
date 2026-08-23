import dataset from '@/data/venues.json';
import type { RegionSummary, Venue, VenueDataset, VenueSubtype } from './venue-types';
import { FACILITIES, type Facility } from './facility';
import { summarizeRegions } from './region';

/**
 * 데이터는 전적으로 data/venues.json에서 온다.
 * 이 파일은 `npm run data:build`가 원본 CSV로부터 생성한다.
 * 여기에 장소를 직접 적어 넣지 말 것 — 원본에 없는 데이터를 공표하게 된다.
 */
const DATA = dataset as unknown as VenueDataset;

export function getDataset(): VenueDataset {
  return DATA;
}

export function getVenues(): Venue[] {
  return DATA.venues;
}

export function getRegionSummaries(): RegionSummary[] {
  return summarizeRegions(DATA.venues);
}

export function getVenueBySlug(slug: string): Venue | undefined {
  return DATA.venues.find((v) => v.slug === slug);
}

/**
 * 시설 구분별 건수. 탭 순서는 FACILITIES로 고정한다 — 건수순으로 정렬하면
 * 데이터가 갱신될 때마다 탭이 자리를 바꿔 사용자가 위치를 기억할 수 없다.
 *
 * 건수는 **검색·지역 필터와 무관하게 전체 기준**이다. 탭을 누를 때마다 다른 탭의
 * 숫자가 출렁이면 무엇을 고르는지 예측할 수 없다.
 */
export function getFacilityCounts(): { facility: Facility; count: number }[] {
  return FACILITIES.map((facility) => ({
    facility,
    count: DATA.venues.filter((v) => v.facility === facility).length,
  }));
}

/**
 * 유니크베뉴 세부분류별 건수. 데이터에 실제로 존재하는 값만 돌려준다.
 * 미분류(subtype === null)는 별도 항목으로 맨 뒤에 붙인다 — 숨기면 합계가 안 맞는다.
 */
export function getSubtypeCounts(): { subtype: VenueSubtype | null; count: number }[] {
  const counts = new Map<VenueSubtype | null, number>();
  for (const v of DATA.venues) {
    if (v.facility !== '유니크베뉴') continue;
    counts.set(v.subtype, (counts.get(v.subtype) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([subtype, count]) => ({ subtype, count }))
    .sort((a, b) => {
      if (a.subtype === null) return 1;
      if (b.subtype === null) return -1;
      return b.count - a.count;
    });
}

/** 좌표가 확보된 장소만. 지도에 개별 마커를 찍을 때 사용한다. */
export function getMappableVenues(): (Venue & { coords: NonNullable<Venue['coords']> })[] {
  return DATA.venues.filter(
    (v): v is Venue & { coords: NonNullable<Venue['coords']> } => v.coords !== null,
  );
}

/** 데이터가 비어 있는지 (빌드 전 상태인지) 확인. */
export function isDatasetEmpty(): boolean {
  return DATA.venues.length === 0;
}
