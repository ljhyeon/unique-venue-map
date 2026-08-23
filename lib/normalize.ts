import { REGIONS } from './region';
import type { RegionCode } from './venue-types';

const CH_DEL = 0x7f;
const CH_BOM = 0xfeff;
const CH_REPLACEMENT = 0xfffd;

/**
 * 제어문자는 공백으로, BOM/치환문자(U+FFFD)는 제거한다.
 * CP949 원본에서 깨진 바이트가 U+FFFD로 들어오는 경우가 있어 걸러낸다.
 */
function stripJunk(s: string): string {
  let out = '';
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    if (code === CH_BOM || code === CH_REPLACEMENT || code === CH_DEL) continue;
    out += code < 0x20 ? ' ' : ch;
  }
  return out;
}

export function cleanText(raw: string | undefined | null): string | null {
  if (raw == null) return null;
  const v = stripJunk(raw).replace(/\s+/g, ' ').trim();
  return v.length > 0 ? v : null;
}

/**
 * 홈페이지 필드 정제.
 *
 * 원본에서 확인된 형태:
 *   www.sciport.or.krhttps://blog.naver.com/sciport2016  → 두 URL이 구분자 없이 연결
 *   www.arbanhotel.com@arbanhotel                        → SNS 핸들이 뒤에 붙음
 *   Http://www.ramadaencorebusanstation.com              → 스킴 대문자
 *
 * 첫 번째 URL만 남기고 스킴을 보정한다. 판별이 불가능하면 null을 반환해
 * 깨진 링크를 화면에 내보내지 않는다.
 */
/**
 * 소개글의 문장부호 뒤에만 공백을 넣는다.
 *
 * 원본 소개글 대부분이 공백 없이 저장돼 있다(`영화의전당은영화,공연,전시…`). 형태소
 * 분석 없이 어절을 복원하는 건 불가능하므로 **문장부호 뒤만** 최소로 손본다.
 * 제대로 된 해결은 카피 정제(에디토리얼)이고, 이건 그때까지의 임시 조치다.
 *
 * 숫자 사이의 점·쉼표(`1,000`, `3.5`)는 건드리지 않는다.
 */
export function looseSentenceSpacing(raw: string | undefined | null): string | null {
  const text = cleanText(raw);
  if (!text) return null;
  return text
    .replace(/([,.!?])(?=[가-힣A-Za-z(])/g, '$1 ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function normalizeUrl(raw: string | undefined | null): string | null {
  const v = cleanText(raw)?.replace(/\s+/g, '');
  if (!v) return null;

  // 두 번째 이후의 스킴에서 잘라낸다 (첫 글자 이후에 등장하는 http만 대상).
  let head = v;
  const second = head.slice(1).search(/https?:\/\//i);
  if (second >= 0) head = head.slice(0, second + 1);

  head = head.replace(/@[\w.-]+$/, ''); // 뒤에 붙은 SNS 핸들
  head = head.replace(/[.,;)]+$/, ''); // 후행 구두점

  if (!head) return null;

  const withScheme = /^https?:\/\//i.test(head) ? head : `https://${head}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  // 점 없는 호스트는 URL로 볼 수 없다 (잘린 문자열 등).
  if (!url.hostname.includes('.')) return null;

  return url.toString().replace(/\/$/, '');
}

/**
 * 전화번호 정제.
 *
 * 원본에서 확인된 형태:
 *   051-1577-9996        → 전국대표번호(1577-9996) 앞에 지역번호가 잘못 붙음
 *   051-123-4567 (내선 2) → 부가정보가 번호에 섞임
 */
export function normalizePhone(raw: string | undefined | null): string | null {
  const text = cleanText(raw);
  if (!text) return null;

  // 괄호 주석과 '내선' 이후를 먼저 떼어낸다. 숫자만 남기면 내선번호가 본번에 붙어버린다.
  const base = text
    .replace(/\([^)]*\)/g, ' ')
    .split(/내선|ext\.?/i)[0]
    .trim();

  const v = base.replace(/[^\d-]/g, '').replace(/^-+|-+$/g, '');
  if (!v) return null;

  const digits = v.replace(/-/g, '');

  // 지역번호 + 전국대표번호(15xx/16xx/18xx). 하이픈 유무와 무관하게 처리한다.
  const bogus = digits.match(/^0\d{1,2}((?:15|16|18)\d{6})$/);
  if (bogus) {
    const n = bogus[1];
    return `${n.slice(0, 4)}-${n.slice(4)}`;
  }

  if (digits.length < 8 || digits.length > 12) return null;

  // 원본에 `051-000-0000` 같은 자리표시 값이 들어 있다. 화면에 걸어두면 사용자가
  // 실제로 전화를 건다. 표시하지 않는 편이 맞다.
  if (/^0\d{1,2}0{6,8}$/.test(digits)) return null;

  return v;
}

const CITY_PREFIXES = ['부산광역시', '부산시', '부산'];

const DISTRICTS_BY_LENGTH: string[] = (Object.keys(REGIONS) as RegionCode[])
  .map((code) => REGIONS[code].name)
  .sort((a, b) => b.length - a.length);

/**
 * 국문 주소의 공백을 보수적으로 복원한다.
 *
 * 원본 다수가 `부산광역시해운대구수영강변대로120` 처럼 공백이 전부 제거된 상태다.
 * 주소를 [시][구·군][나머지] 세 조각으로 자른 뒤, **나머지 조각에만** 세부 규칙을
 * 적용한다. 구 이름을 잘라낸 뒤 처리해야 `동구`가 `동 구`로 깨지지 않는다.
 *
 * 도로명 자체(`수영강변대로`)를 더 쪼개려 하면 오히려 틀리므로 건드리지 않는다.
 * 완전한 표기가 필요한 항목은 data/overrides.json에서 사람이 교정한다.
 */
export function restoreAddressSpacing(raw: string | undefined | null): string | null {
  const original = cleanText(raw);
  if (!original) return null;

  // 부분적으로만 띄어진 주소도 있으므로 일단 전부 붙인 뒤 동일한 규칙으로 재구성한다.
  // 앞머리 우편번호 `(48060)`는 주소가 아니라 메타데이터다. 남겨두면 시 접두사 인식이
  // 통째로 실패해서 뒤의 규칙이 전부 어긋난다.
  const compact = original.replace(/\s+/g, '').replace(/^\(?\d{5}\)?/, '');

  let city = '';
  for (const c of CITY_PREFIXES) {
    if (compact.startsWith(c)) {
      city = c;
      break;
    }
  }
  let rest = compact.slice(city.length);

  let district = '';
  for (const name of DISTRICTS_BY_LENGTH) {
    const i = rest.indexOf(name);
    if (i >= 0) {
      district = rest.slice(0, i + name.length);
      rest = rest.slice(i + name.length);
      break;
    }
  }

  // 부산 주소로 보이지 않으면 손대지 않는다.
  if (!city && !district) return original;

  let tail = rest;

  // 읍/면/동/리 뒤 경계. 구 이름은 이미 분리되었으므로 안전하다.
  // 읍/면/동/리 경계는 **도로명 앞 행정구역 구간에서만** 의미가 있다. 건물명에도 같은
  // 글자가 흔히 들어가므로(`한화리조트` → `한화리 조트`) 도로명+번호 이후에는 적용하지
  // 않는다. 구 이름은 이미 분리되었으므로 이 구간은 안전하다.
  // 문자열을 잘라내면 lookahead가 뒷글자를 못 봐서 `동백로`가 다시 깨진다.
  // 자르지 않고 매치 위치로만 제한한다.
  const roadAt = tail.search(/(?:로|길)\s*\d/);

  // 뒤에 짧은 한글 + 로/길이 이어지면 도로명 내부다(`동백로`의 `동`).
  tail = tail.replace(
    /(읍|면|동|리)(?![가-힣]{0,3}(?:로|길))(?=[\d가-힣])/g,
    (m, g1: string, offset: number) => (roadAt < 0 || offset < roadAt ? `${g1} ` : m),
  );

  // 도로명 뒤 건물번호 앞. 숫자 직후에 로/길이 이어지면 도로명 내부이므로 제외한다.
  // `[가-힣]{0,3}`으로 범위를 제한하지 않으면 문자열 뒤쪽 아무 '로'에나 걸린다.
  tail = tail.replace(/([가-힣])(\d+(?:-\d+)?)(?![가-힣]{0,3}(?:로|길))/g, '$1 $2');

  // 건물번호 뒤 건물명 앞. `17센텀비즈니스호텔` → `17 센텀비즈니스호텔`.
  // 숫자 뒤가 로/길로 이어지면 도로명 내부이므로(`센텀1로`, `196번길`) 건드리지 않는다.
  // 호/층/번지는 앞 숫자에 붙는 단위다. `호텔`은 건물명이므로 제외 대상이 아니다.
  tail = tail.replace(/(\d)(?=[가-힣])(?![가-힣]{0,3}(?:로|길))(?!(?:호(?!텔)|층|번지))/g, '$1 ');

  // 쉼표 뒤 공백. 원본은 `268-32,힐튼부산`처럼 붙여 쓴다.
  tail = tail.replace(/\s*,\s*/g, ', ');

  // 괄호 앞 공백.
  tail = tail.replace(/\s*\(/g, ' (');

  return [city, district, tail]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** URL 슬러그. 한글은 유지하고 공백/기호만 정리한다. */
export function toSlug(name: string, fallback: string): string {
  const s = name
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/[^\w가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || fallback;
}
