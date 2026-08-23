/**
 * 원본 CSV → data/venues.json 빌드.
 *
 *   npm run data:build
 *
 * 원칙
 *  - 원본(data/source/*.csv)은 절대 수정하지 않는다.
 *  - 사람이 교정한 값은 data/overrides.json에만 둔다. 그래야 원본을 새로 받아도 살아남는다.
 *  - 헤더를 못 찾으면 조용히 빈 값을 넣지 않고 즉시 실패한다.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import iconv from 'iconv-lite';

import {
  cleanText,
  looseSentenceSpacing,
  normalizePhone,
  normalizeUrl,
  restoreAddressSpacing,
  toSlug,
} from '../lib/normalize';
import { REGIONS, parseRegion } from '../lib/region';
import { SUBTYPE_LABELS, VENUE_SUBTYPES, classifySubtype } from '../lib/venue-subtype';
import { FACILITIES, toFacility } from '../lib/facility';
import type { SubtypeSource, VenueSubtype } from '../lib/venue-subtype';
import {
  type OverridesFile,
  type Venue,
  type VenueDataset,
} from '../lib/venue-types';

const SOURCE_DIR = 'data/source';
const OVERRIDES_PATH = 'data/overrides.json';
const OUTPUT_PATH = 'data/venues.json';

// ---------------------------------------------------------------- 1. 원본 로드

function findSourceCsv(): string {
  let entries: string[];
  try {
    entries = readdirSync(SOURCE_DIR);
  } catch {
    throw new Error(
      `${SOURCE_DIR} 디렉터리가 없습니다. 공공데이터포털에서 받은 CSV를 이 경로에 넣어주세요.`,
    );
  }
  const csv = entries.filter((f) => f.toLowerCase().endsWith('.csv')).sort();
  if (csv.length === 0) throw new Error(`${SOURCE_DIR}에 CSV 파일이 없습니다.`);
  if (csv.length > 1) {
    console.error(`[warn] CSV가 여러 개입니다. 가장 앞선 파일을 사용합니다: ${csv[0]}`);
  }
  return join(SOURCE_DIR, csv[0]);
}

/**
 * 공공데이터포털 CSV는 CP949(EUC-KR 확장)인 경우가 많다.
 * UTF-8로 읽었을 때 치환문자가 생기면 CP949로 간주한다.
 * Node의 Buffer#toString은 cp949를 지원하지 않으므로 iconv-lite가 필요하다.
 */
function decodeCsv(buf: Buffer): { text: string; encoding: string } {
  const utf8 = iconv.decode(buf, 'utf-8');
  if (!utf8.includes('�')) return { text: utf8, encoding: 'utf-8' };

  const cp949 = iconv.decode(buf, 'cp949');
  if (cp949.includes('�')) {
    throw new Error('UTF-8/CP949 어느 쪽으로도 온전히 디코딩되지 않았습니다. 원본을 확인하세요.');
  }
  if (!/[가-힣]/.test(cp949)) {
    throw new Error('CP949로 디코딩했지만 한글이 검출되지 않았습니다. 인코딩을 다시 확인하세요.');
  }
  return { text: cp949, encoding: 'cp949' };
}

// ------------------------------------------------------------ 2. 헤더 매핑

/** 헤더 비교용 정규화: 공백·괄호·구분기호 제거. `사업장명(국문)` → `사업장명국문` */
function compactHeader(h: string): string {
  return h.replace(/[\s()[\]{}·・.,_\-/\\]/g, '').toLowerCase();
}

type FieldKey =
  | 'group'
  | 'category'
  | 'name'
  | 'nameEn'
  | 'address'
  | 'addressEn'
  | 'phone'
  | 'website'
  | 'description'
  | 'descriptionEn';

const NAME_STEM = '(?:사업장명|기관명|업체명|시설명|상호명|명칭|상호)';
const DESC_STEM = '(?:소개글|소개내용|소개|설명)';
const ADDR_STEM = '(?:주소|소재지)';

/** 열 이름 후보. 원본 헤더가 조금 바뀌어도 견디되, 못 찾으면 실패한다. */
const FIELD_PATTERNS: Record<FieldKey, RegExp> = {
  group: /^(분류|분과|구분|대분류|대분과)$/,
  category: /^(소분류|소분과|중분류)$/,
  name: new RegExp(`^${NAME_STEM}(국문|한글)?$`),
  nameEn: new RegExp(`^${NAME_STEM}(영문|영어)$`),
  address: new RegExp(`^${ADDR_STEM}(국문|한글)?$`),
  addressEn: new RegExp(`^${ADDR_STEM}(영문|영어)$`),
  phone: /^(전화번호|대표전화|연락처|전화)$/,
  website: /^(홈페이지|누리집|웹사이트|url|사이트)$/,
  description: new RegExp(`^${DESC_STEM}(국문|한글)?$`),
  descriptionEn: new RegExp(`^${DESC_STEM}(영문|영어)$`),
};

const REQUIRED: FieldKey[] = ['category', 'name', 'address'];

function mapHeaders(headers: string[]): Record<FieldKey, string | null> {
  const compact = headers.map(compactHeader);
  const found = {} as Record<FieldKey, string | null>;

  for (const key of Object.keys(FIELD_PATTERNS) as FieldKey[]) {
    const idx = compact.findIndex((h) => FIELD_PATTERNS[key].test(h));
    found[key] = idx >= 0 ? headers[idx] : null;
  }

  const missing = REQUIRED.filter((k) => found[k] === null);
  if (missing.length > 0) {
    throw new Error(
      [
        `필수 컬럼을 찾지 못했습니다: ${missing.join(', ')}`,
        '',
        'CSV에서 읽은 실제 헤더:',
        ...headers.map((h, i) => `  [${i}] ${h}`),
        '',
        `scripts/build-venues.ts의 FIELD_PATTERNS에 위 이름을 추가하세요.`,
      ].join('\n'),
    );
  }
  return found;
}

// ------------------------------------------------------------ 3. 행 → Venue

function loadOverrides(): OverridesFile {
  try {
    const parsed = JSON.parse(readFileSync(OVERRIDES_PATH, 'utf-8')) as OverridesFile;
    return { venues: parsed.venues ?? {} };
  } catch {
    console.error(`[info] ${OVERRIDES_PATH} 없음 — 보정 없이 진행합니다.`);
    return { venues: {} };
  }
}

/** 파일명 끝의 _YYYYMMDD 를 기준일로 사용한다. */
function extractDataDate(filename: string): string {
  const m = filename.match(/(\d{4})(\d{2})(\d{2})\D*\.csv$/i);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : 'unknown';
}

function main() {
  const sourcePath = findSourceCsv();
  const { text, encoding } = decodeCsv(readFileSync(sourcePath));

  const rows = parse(text, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as Record<string, string>[];

  if (rows.length === 0) throw new Error('데이터 행이 없습니다.');

  const cols = mapHeaders(Object.keys(rows[0]));
  const overrides = loadOverrides();
  const get = (row: Record<string, string>, key: FieldKey) =>
    cols[key] ? (row[cols[key] as string] ?? null) : null;

  const usedSlugs = new Set<string>();
  const stats = { noRegion: 0, noWebsite: 0, noDescriptionEn: 0, withCoords: 0, overridden: 0 };

  /** 사람이 검수해야 할 유니크베뉴. 빌드 끝에 한꺼번에 출력한다. */
  const unclassified: string[] = [];
  const ambiguous: string[] = [];

  const venues: Venue[] = rows.map((row, i) => {
    const id = String(i + 1).padStart(3, '0');
    const rawName = cleanText(get(row, 'name')) ?? `(이름 없음 ${id})`;
    const o = overrides.venues[rawName] ?? {};
    if (Object.keys(o).length > 0) stats.overridden += 1;

    const name = o.name ?? rawName;
    const addressRaw = cleanText(get(row, 'address')) ?? '';
    const address = o.address ?? restoreAddressSpacing(addressRaw) ?? '';

    const regionCode = parseRegion(address || addressRaw);
    if (!regionCode) {
      stats.noRegion += 1;
      console.error(`[warn] 구·군 판별 실패: ${name} / "${addressRaw}"`);
    }

    const website = o.website !== undefined ? o.website : normalizeUrl(get(row, 'website'));
    if (!website) stats.noWebsite += 1;

    const descriptionEn = o.descriptionEn ?? cleanText(get(row, 'descriptionEn'));
    if (!descriptionEn) stats.noDescriptionEn += 1;

    const coords = o.coords ?? null;
    if (coords) stats.withCoords += 1;

    let slug = toSlug(name, id);
    while (usedSlugs.has(slug)) slug = `${slug}-${id}`;
    usedSlugs.add(slug);

    const rawCategory = cleanText(get(row, 'category'));
    const facility = toFacility(rawCategory);
    if (!facility) {
      console.error(`[warn] 시설 구분 미매칭 "${rawCategory}" (${name}) → lib/facility.ts의 RULES에 추가하세요`);
    }
    const nameEn = o.nameEn ?? cleanText(get(row, 'nameEn'));
    const description = o.description ?? looseSentenceSpacing(get(row, 'description'));

    // 2차 분류는 유니크베뉴에만 매긴다. 호텔·컨벤션은 원본 소분류로 이미 충분하다.
    let subtype: VenueSubtype | null = null;
    let subtypeSource: SubtypeSource = null;
    let subtypeMatched: string[] = [];

    if (facility === '유니크베뉴') {
      if ('subtype' in o) {
        subtype = o.subtype ?? null;
        subtypeSource = 'override';
      } else {
        const verdict = classifySubtype({ name, nameEn, description, descriptionEn });
        subtype = verdict.subtype;
        subtypeMatched = verdict.matched;
        if (subtype) {
          subtypeSource = 'rule';
          // 1등과 2등이 붙으면 자동 판정을 믿기 어렵다.
          if (verdict.runnerUp && verdict.score - verdict.runnerUp.score <= 1) {
            ambiguous.push(
              `${name} → ${SUBTYPE_LABELS[subtype]}(${verdict.score}) vs ` +
                `${SUBTYPE_LABELS[verdict.runnerUp.subtype]}(${verdict.runnerUp.score})`,
            );
          }
        } else {
          unclassified.push(description ? name : `${name} (소개글 없음)`);
        }
      }
    }

    return {
      id,
      slug,
      group: cleanText(get(row, 'group')) ?? '',
      // 미매칭은 규칙 누락이므로 경고만 남기고 가장 넓은 갈래로 둔다.
      facility: facility ?? '유니크베뉴',
      subtype,
      subtypeSource,
      subtypeMatched,
      name,
      nameEn,
      address,
      addressRaw,
      addressEn: o.addressEn ?? cleanText(get(row, 'addressEn')),
      phone: o.phone !== undefined ? o.phone : normalizePhone(get(row, 'phone')),
      website,
      description,
      descriptionEn,
      regionCode,
      regionName: regionCode ? REGIONS[regionCode].name : null,
      coords,
      // 출처가 없으면 사람이 찍은 값으로 본다. geocode 스크립트만 'osm'을 남긴다.
      coordsSource: coords ? (o.coordsSource ?? 'override') : null,
    };
  });

  const dataset: VenueDataset = {
    dataUpdatedAt: extractDataDate(sourcePath),
    builtAt: new Date().toISOString(),
    sourceFile: sourcePath,
    venues,
  };

  writeFileSync(OUTPUT_PATH, `${JSON.stringify(dataset, null, 2)}\n`, 'utf-8');

  console.error('');
  console.error(`원본      ${sourcePath} (${encoding})`);
  console.error(`기준일    ${dataset.dataUpdatedAt}`);
  console.error(`총 건수   ${venues.length}`);
  console.error(
    `시설 구분 ${FACILITIES.map((f) => `${f} ${venues.filter((v) => v.facility === f).length}`).join(' · ')}`,
  );

  const uniques = venues.filter((v) => v.facility === '유니크베뉴');
  if (uniques.length > 0) {
    const bySubtype = VENUE_SUBTYPES.map((s) => ({
      label: SUBTYPE_LABELS[s],
      n: uniques.filter((v) => v.subtype === s).length,
    }))
      .filter((x) => x.n > 0)
      .map((x) => `${x.label} ${x.n}`)
      .join(' · ');
    console.error(
      `└ 세부분류 ${bySubtype || '(없음)'}` +
        ` · 미분류 ${uniques.filter((v) => v.subtype === null).length}`,
    );
  }

  console.error(`좌표 보유 ${stats.withCoords} / ${venues.length}`);
  console.error(`보정 적용 ${stats.overridden}건`);
  console.error(
    `누락      구·군 ${stats.noRegion} · 홈페이지 ${stats.noWebsite} · 영문소개 ${stats.noDescriptionEn}`,
  );
  console.error(`출력      ${OUTPUT_PATH}`);
  console.error('');

  // 자동 분류는 초안이다. 사람이 볼 목록을 반드시 남긴다.
  if (unclassified.length > 0) {
    console.error(`[검수] 세부분류 미판정 ${unclassified.length}건 — overrides.json의 subtype에 지정하세요:`);
    for (const n of unclassified) console.error(`  · ${n}`);
    console.error('');
  }
  if (ambiguous.length > 0) {
    console.error(`[검수] 판정이 아슬아슬한 ${ambiguous.length}건 — 확인 권장:`);
    for (const n of ambiguous) console.error(`  · ${n}`);
    console.error('');
  }

  // 구·군을 절반 이상 못 읽었다면 파싱이 어긋난 것이다. 조용히 넘기지 않는다.
  if (stats.noRegion > venues.length / 2) {
    throw new Error(
      '구·군 판별 실패가 과반입니다. 컬럼 매핑이나 인코딩이 잘못되었을 가능성이 큽니다.',
    );
  }
}

main();
