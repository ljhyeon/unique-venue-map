export type RegionCode =
  | 'gangseo'
  | 'geumjeong'
  | 'gijang'
  | 'namgu'
  | 'donggu'
  | 'dongnae'
  | 'busanjin'
  | 'buk'
  | 'sasang'
  | 'saha'
  | 'seo'
  | 'suyeong'
  | 'yeonje'
  | 'yeongdo'
  | 'jungu'
  | 'haeundae';

export type Coords = { lat: number; lng: number };

export type { Facility } from './facility';

export type { SubtypeSource, VenueSubtype } from './venue-subtype';

/**
 * 좌표 출처. 원본 CSV에는 위경도가 없으므로 항상 파생값이다.
 * - 'override': overrides.json에 사람이 직접 입력하거나 지오코딩으로 채운 실제 좌표
 * - null       : 아직 좌표가 없음. 지도에 개별 마커로 찍으면 안 된다.
 */
/**
 * 좌표의 출처.
 *  - `osm`      geocode 스크립트가 OpenStreetMap에서 자동 확보
 *  - `override` 사람이 overrides.json에 직접 찍음. 자동값보다 신뢰한다
 */
export type CoordsSource = 'osm' | 'override' | null;

export type Venue = {
  /** 원본 행 순서 기반 안정 ID (001~). */
  id: string;
  /** URL용 슬러그. 국문명에서 생성. */
  slug: string;

  /** 원본 `분류` (현재 전 행이 'MICE회원업체'). UI에 노출하지 않는다. */
  group: string;
  /** 원본 `소분류`. 필터의 기준. */
  /** 화면의 1차 필터 축. 원본 소분과를 4갈래로 통합한 값. */
  facility: import('./facility').Facility;
  /**
   * 유니크베뉴 2차 분류. 원본에 없는 파생값이며 소개글에서 유추한다.
   * category가 '유니크베뉴'가 아니면 항상 null.
   * 근거가 부족하면 null(미분류) — 억지로 채우지 않는다.
   */
  subtype: import('./venue-subtype').VenueSubtype | null;
  subtypeSource: import('./venue-subtype').SubtypeSource;
  /** 자동 분류에 걸린 키워드. 검수용이며 UI에는 쓰지 않는다. */
  subtypeMatched: string[];

  name: string;
  nameEn: string | null;

  /** 정규화를 거친 국문 주소. */
  address: string;
  /** 원본 주소 문자열 그대로. 정규화 결과 검증용. */
  addressRaw: string;
  addressEn: string | null;

  phone: string | null;
  website: string | null;

  description: string | null;
  descriptionEn: string | null;

  regionCode: RegionCode | null;
  regionName: string | null;

  /** null이면 좌표 미확보. 타입으로 드러내 지도에서 실수로 쓰지 못하게 한다. */
  coords: Coords | null;
  coordsSource: CoordsSource;
};

export type RegionSummary = {
  code: RegionCode;
  name: string;
  count: number;
  lat: number;
  lng: number;
};

export type VenueDataset = {
  /** 원본 파일 기준일 (파일명에서 추출). */
  dataUpdatedAt: string;
  /** 빌드 실행 시각. */
  builtAt: string;
  sourceFile: string;
  venues: Venue[];
};

/** overrides.json 구조. 국문 사업장명을 키로 쓴다. */
export type VenueOverride = Partial<{
  address: string;
  addressEn: string;
  name: string;
  nameEn: string;
  phone: string | null;
  website: string | null;
  description: string;
  descriptionEn: string;
  coords: Coords;
  /** coords의 출처. 생략하면 사람이 찍은 값(`override`)으로 본다. */
  coordsSource: 'osm';
  /** 자동 분류를 덮어쓴다. null을 명시하면 '미분류'로 확정한다. */
  subtype: import('./venue-subtype').VenueSubtype | null;
}>;

export type OverridesFile = {
  /** 사람이 읽을 메모. 빌드에서 무시. */
  _note?: string;
  venues: Record<string, VenueOverride>;
};
