/**
 * 주소 → 좌표. 개별 마커를 찍으려면 모든 장소에 위경도가 있어야 한다.
 *
 *   npm run data:geocode
 *
 * OpenStreetMap(Nominatim)을 쓴다. **API 키가 필요 없다.** 지도 타일도 같은 OSM 계보라
 * 핀과 배경이 어긋나지 않는다.
 *
 * 원칙
 *  - 결과는 data/overrides.json의 coords에 쓴다. venues.json은 빌드 산출물이라
 *    덮어써도 곧 사라진다. overrides에 둬야 원본을 새로 받아도 살아남는다.
 *  - **이미 좌표가 있는 항목은 건드리지 않는다.** 사람이 손으로 찍은 값이
 *    API 결과보다 정확한 경우가 많다. 다시 받으려면 --force.
 *  - 부산 범위를 벗어난 좌표는 버린다. 주소가 깨진 행에서 엉뚱한 동명이지를
 *    집어오는 일이 실제로 생긴다.
 *  - 못 찾으면 **비워둔다.** 번길 주소는 OSM에 없는 경우가 많은데, 본번으로
 *    근사하면 100m 넘게 어긋난다. 틀린 핀은 없는 핀보다 나쁘다.
 */
import { readFileSync, writeFileSync } from 'node:fs';

import type { Coords, OverridesFile, VenueDataset } from '../lib/venue-types';

const OVERRIDES_PATH = 'data/overrides.json';
const DATASET_PATH = 'data/venues.json';

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';

/**
 * Nominatim 이용 정책상 초당 1회를 넘기면 안 되고, 실제 연락처가 담긴
 * User-Agent를 요구한다. 지키지 않으면 차단된다.
 */
const RATE_LIMIT_MS = 1_100;
const USER_AGENT = 'unique-busan-venue-map/1.0 (+https://github.com/; contact via repo issues)';

/** 부산 대략 경계. 이 밖으로 나가면 잘못 찾은 것으로 본다. */
const BUSAN_BOX = { minLat: 34.88, maxLat: 35.42, minLng: 128.73, maxLng: 129.32 };

const FORCE = process.argv.includes('--force');

type NominatimDoc = { lat: string; lon: string; display_name?: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function inBusan(c: Coords): boolean {
  return (
    c.lat >= BUSAN_BOX.minLat &&
    c.lat <= BUSAN_BOX.maxLat &&
    c.lng >= BUSAN_BOX.minLng &&
    c.lng <= BUSAN_BOX.maxLng
  );
}

/**
 * 표시용 주소 → 검색용 주소.
 *
 * 건물명·호수·층은 지오코더에 넣으면 오히려 매칭을 방해한다(`해운대해변로 287씨클라우드호텔
 * 617호`). 도로명+건물번호까지만 남긴다.
 *
 * **이 결과는 저장하지 않는다.** 화면에 쓰는 address는 건물명과 호수를 그대로 유지해야
 * 하므로, 잘라낸 문자열은 이 함수 밖으로 나가지 않고 좌표만 돌려받는다.
 */
export function toQuery(address: string): string {
  let s = address.split(',')[0];
  s = s.replace(/^\(?\d{5}\)?\s*/, '');
  const m = s.match(/^(.*?(?:로|길)\s*\d+(?:번길\s*\d+)?(?:-\d+)?)/);
  if (m) s = m[1];
  return s.replace(/\s+/g, ' ').trim();
}

/** 상호명 검색용. 법인격 표기는 OSM에 없으므로 떼어낸다. */
function toNameQuery(name: string): string {
  const bare = name
    .replace(/\((?:재|주|사|유|합)\)|㈜|주식회사|농업회사법인/g, '')
    .replace(/\(.*?\)/g, '')
    .trim();
  return bare ? `부산 ${bare}` : '';
}

async function search(query: string): Promise<NominatimDoc | null> {
  const url = `${ENDPOINT}?${new URLSearchParams({
    format: 'json',
    limit: '1',
    countrycodes: 'kr',
    q: query,
  })}`;

  let res: Response;
  try {
    res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  } catch (e) {
    console.error(`  [네트워크] ${query} — ${(e as Error).message}`);
    return null;
  }
  if (!res.ok) {
    console.error(`  [http ${res.status}] ${query}`);
    return null;
  }
  const json = (await res.json()) as NominatimDoc[];
  return json[0] ?? null;
}

/**
 * 도로명주소 검색 → 실패 시 상호명 검색.
 *
 * 원본 주소는 공백이 날아가 있거나 건물명이 섞여 있어 주소 검색이 자주 빈다.
 * 그럴 때 상호명으로 찾는 편이 실제로 잘 맞는다 — 단, 부산으로 범위를 묶는다.
 */
async function locate(name: string, address: string): Promise<{ c: Coords; via: string } | null> {
  const tries: [string, string][] = [
    [toQuery(address), 'address'],
    [toNameQuery(name), 'keyword'],
  ];

  for (const [query, via] of tries) {
    if (!query.trim()) continue;
    const doc = await search(query);
    await sleep(RATE_LIMIT_MS);
    if (!doc) continue;

    const c: Coords = { lat: Number(doc.lat), lng: Number(doc.lon) };
    if (!Number.isFinite(c.lat) || !Number.isFinite(c.lng)) continue;
    if (!inBusan(c)) {
      console.error(`  [범위밖] ${name} (${via}) → ${c.lat},${c.lng} — 버림`);
      continue;
    }
    return { c, via };
  }
  return null;
}

async function main() {
  const dataset = JSON.parse(readFileSync(DATASET_PATH, 'utf-8')) as VenueDataset;
  if (dataset.venues.length === 0) {
    throw new Error(`${DATASET_PATH}이 비어 있습니다. 먼저 npm run data:build 를 실행하세요.`);
  }

  const overrides = JSON.parse(readFileSync(OVERRIDES_PATH, 'utf-8')) as OverridesFile & {
    [k: string]: unknown;
  };
  overrides.venues ??= {};

  console.error(`OpenStreetMap(Nominatim)으로 ${dataset.venues.length}건을 조회합니다.`);
  console.error(`초당 1회 제한이 있어 최대 ${Math.ceil((dataset.venues.length * 2 * RATE_LIMIT_MS) / 1000 / 60)}분 걸립니다.`);
  console.error('');

  let done = 0;
  let skipped = 0;
  const failed: string[] = [];

  for (const v of dataset.venues) {
    const entry = overrides.venues[v.name] ?? {};

    // 사람이 찍은 좌표는 --force로도 덮지 않는다. 자동값보다 정확하기 때문이다.
    if (entry.coords && entry.coordsSource !== 'osm') {
      skipped += 1;
      continue;
    }
    if (entry.coords && !FORCE) {
      skipped += 1;
      continue;
    }

    const hit = await locate(v.name, v.address || v.addressRaw);
    if (!hit) {
      failed.push(`${v.name} / ${v.address || v.addressRaw}`);
      continue;
    }

    overrides.venues[v.name] = { ...entry, coords: hit.c, coordsSource: 'osm' };
    done += 1;
    console.error(`  ✓ ${v.name} (${hit.via}) ${hit.c.lat.toFixed(5)}, ${hit.c.lng.toFixed(5)}`);
  }

  writeFileSync(OVERRIDES_PATH, `${JSON.stringify(overrides, null, 2)}\n`, 'utf-8');

  console.error('');
  console.error(`좌표 확보 ${done}건 · 기존 유지 ${skipped}건 · 실패 ${failed.length}건`);
  if (failed.length > 0) {
    console.error('');
    console.error('[수동] 아래는 OSM에 없습니다. overrides.json에 coords를 직접 넣어주세요.');
    console.error('       (coordsSource는 적지 마세요 — 손으로 찍은 값으로 보호됩니다)');
    for (const f of failed) console.error(`  · ${f}`);
  }
  console.error('');
  console.error(`이어서 npm run data:build 를 다시 실행해야 venues.json에 좌표가 반영됩니다.`);
  console.error('');
}

main();
