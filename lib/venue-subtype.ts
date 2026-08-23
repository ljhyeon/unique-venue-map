/**
 * 유니크베뉴 2차 분류(subtype).
 *
 * 원본 CSV의 `소분류`는 유니크베뉴 / 호텔·숙박 / 컨벤션시설 세 갈래뿐이라,
 * 절반 가까이가 '유니크베뉴' 한 칸에 몰린다. 이 파일은 **소개글(국문/영문)의
 * 키워드**만 근거로 그 안을 공간 성격에 따라 다시 나눈다.
 *
 * 원칙
 *  - 원본에 없는 정보를 만들어내지 않는다. 근거(matched)가 없으면 null(미분류)이다.
 *  - 자동 분류는 어디까지나 초안이다. 확정값은 data/overrides.json의 `subtype`이 이긴다.
 *  - 규칙은 순서대로 평가하지 않고 **점수제**로 겨룬다. 소개글에는 여러 성격이
 *    섞여 있기 마련이라(미술관인데 카페도 있고 야외공간도 있다), 먼저 걸린 규칙이
 *    이기는 방식은 순서에 따라 결과가 뒤집힌다.
 */

export type VenueSubtype =
  | 'culture-art' // 미술관·박물관·공연장 등 문화예술시설
  | 'heritage' // 역사·기념·종교 시설
  | 'waterfront' // 바다·강·항만에 면한 수변시설
  | 'industrial' // 산업유산을 고쳐 쓴 복합문화공간
  | 'leisure' // 레저·테마·전망 시설
  | 'traditional' // 한옥·전통 공간
  | 'nature' // 공원·수목원·자연공간
  | 'sports'; // 경기장·체육시설

export const VENUE_SUBTYPES: VenueSubtype[] = [
  'culture-art',
  'heritage',
  'waterfront',
  'industrial',
  'leisure',
  'traditional',
  'nature',
  'sports',
];

export const SUBTYPE_LABELS: Record<VenueSubtype, string> = {
  'culture-art': '문화·예술',
  heritage: '역사·기념',
  waterfront: '해양·수변',
  industrial: '산업유산 복합공간',
  leisure: '레저·테마',
  traditional: '전통·한옥',
  nature: '자연·공원',
  sports: '스포츠',
};

/**
 * 마커·칩 색. 사이트 팔레트(세이지·크림) 안에서 서로 구분되도록 골랐다.
 * 'none'은 미분류 — 눈에 띄지 않는 회색이어야 한다. 미분류는 강조할 상태가 아니다.
 */
export const SUBTYPE_COLORS: Record<VenueSubtype | 'none', string> = {
  'culture-art': '#7b5ea7',
  heritage: '#a8603d',
  waterfront: '#2f7f9e',
  industrial: '#5c6b73',
  leisure: '#d08a2c',
  traditional: '#9a4b52',
  nature: '#4f8a3d',
  sports: '#2e6b5e',
  none: '#9aa39d',
};

/** 분류 근거를 남기는 이유: 오분류를 사람이 추적해 overrides로 고칠 수 있어야 한다. */
export type SubtypeSource = 'rule' | 'override' | null;

export type SubtypeVerdict = {
  subtype: VenueSubtype | null;
  /** 실제로 걸린 키워드. 빌드 로그와 검수에 쓴다. */
  matched: string[];
  /** 1등 점수와 2등 점수. 차이가 작으면 사람이 봐야 한다. */
  score: number;
  runnerUp: { subtype: VenueSubtype; score: number } | null;
};

type Rule = {
  subtype: VenueSubtype;
  /**
   * weight 2 = 그 성격을 거의 확정짓는 말(‘미술관’, ‘한옥’).
   * weight 1 = 곁들여 나올 수 있는 말(‘전시’, ‘야외’).
   */
  weight: 1 | 2;
  terms: string[];
};

/**
 * 키워드는 **띄어쓰기를 지운 문자열**에 대해 부분일치로 검사한다.
 * 원본 소개글은 공백이 통째로 날아간 행이 많아(`부산시립미술관은1998년개관한`)
 * 단어 경계를 신뢰할 수 없기 때문이다.
 */
const RULES: Rule[] = [
  {
    subtype: 'culture-art',
    weight: 2,
    terms: [
      '미술관',
      '박물관',
      '영화의전당',
      '문화회관',
      '예술회관',
      '아트센터',
      '갤러리',
      '콘서트홀',
      '오페라',
      '도서관',
      'museumofart',
      'artmuseum',
      'artcenter',
      'gallery',
      'concerthall',
      'cinemacenter',
    ],
  },
  {
    subtype: 'culture-art',
    weight: 1,
    terms: ['전시실', '상설전시', '기획전', '공연장', '무대', '영화제', 'exhibitionhall', 'theater', 'filmfestival'],
  },

  {
    subtype: 'heritage',
    weight: 2,
    terms: [
      '기념관',
      '기념공원',
      '추모',
      '유적',
      '사적지',
      '문화재',
      '근대역사관',
      '임시수도',
      '충렬사',
      '사찰',
      '사원',
      '성당',
      'memorial',
      'heritage',
      'historicsite',
      'temple',
    ],
  },
  { subtype: 'heritage', weight: 1, terms: ['6·25', '6.25', '한국전쟁', '참전', '유엔', 'koreanwar', 'veterans'] },

  {
    subtype: 'waterfront',
    weight: 2,
    terms: [
      '요트경기장',
      '마리나',
      '여객터미널',
      '크루즈',
      '등대',
      '해양박물관',
      '수변공원',
      '유람선',
      '선상',
      '부두',
      'marina',
      'yacht',
      'cruise',
      'ferryterminal',
      'lighthouse',
      'maritimemuseum',
    ],
  },
  {
    subtype: 'waterfront',
    weight: 1,
    terms: ['해수욕장', '해변', '바다가', '오션뷰', '광안대교', '해안', 'oceanview', 'beach', 'seaside', 'waterfront'],
  },

  {
    subtype: 'industrial',
    weight: 2,
    terms: [
      '폐공장',
      '옛공장',
      '공장을',
      '창고를',
      '방직',
      '제철',
      '조선소',
      '리노베이션',
      '재생공간',
      '복합문화공간',
      'f1963',
      'factory',
      'warehouse',
      'renovat',
      'repurpos',
    ],
  },
  { subtype: 'industrial', weight: 1, terms: ['산업유산', '도시재생', '탈바꿈', 'industrialheritage', 'urbanregeneration'] },

  {
    subtype: 'leisure',
    weight: 2,
    terms: [
      '아쿠아리움',
      '수족관',
      '테마파크',
      '놀이공원',
      '전망대',
      '스카이워크',
      '케이블카',
      '워터파크',
      '스파',
      '온천',
      '골프',
      'aquarium',
      'themepark',
      'observatory',
      'skywalk',
      'cablecar',
      'waterpark',
      'hotspring',
      'golf',
    ],
  },
  { subtype: 'leisure', weight: 1, terms: ['체험시설', '어트랙션', '전망', 'attraction', 'panoramicview'] },

  {
    subtype: 'traditional',
    weight: 2,
    terms: ['한옥', '고택', '서원', '향교', '전통가옥', '누각', '정자', 'hanok', 'traditionalhouse', 'pavilion'],
  },
  { subtype: 'traditional', weight: 1, terms: ['한복', '다도', '국악', '전통문화', 'teaceremony'] },

  {
    subtype: 'nature',
    weight: 2,
    terms: ['수목원', '식물원', '자연휴양림', '생태공원', '온천천', '숲길', '정원', 'arboretum', 'botanicalgarden', 'ecologicalpark'],
  },
  { subtype: 'nature', weight: 1, terms: ['공원', '산책로', '녹지', 'park', 'garden', 'forest'] },

  {
    subtype: 'sports',
    weight: 2,
    terms: ['경기장', '야구장', '체육관', '스타디움', '아시아드', '월드컵', 'stadium', 'arena', 'gymnasium', 'ballpark'],
  },
];

/** 소개글 정규화: 공백 제거 + 소문자화. 규칙 키워드와 같은 형태로 맞춘다. */
function toHaystack(parts: (string | null | undefined)[]): string {
  return parts
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
    .join(' ')
    .replace(/\s+/g, '')
    .toLowerCase();
}

/**
 * 소개글로 유니크베뉴의 성격을 판정한다.
 *
 * 이름도 함께 넣는 이유: 소개글이 비어 있는 행이 있고, 시설 성격은 이름에
 * 가장 압축적으로 드러난다(`부산시립미술관`). 다만 이름은 소개글보다 짧아
 * 우연 일치 위험이 낮으므로 동일 가중치로 둔다.
 */
export function classifySubtype(input: {
  name: string;
  nameEn?: string | null;
  description?: string | null;
  descriptionEn?: string | null;
}): SubtypeVerdict {
  const hay = toHaystack([input.name, input.nameEn, input.description, input.descriptionEn]);
  if (!hay) return { subtype: null, matched: [], score: 0, runnerUp: null };

  const scores = new Map<VenueSubtype, number>();
  const hits = new Map<VenueSubtype, string[]>();

  for (const rule of RULES) {
    for (const term of rule.terms) {
      if (!hay.includes(term)) continue;
      scores.set(rule.subtype, (scores.get(rule.subtype) ?? 0) + rule.weight);
      hits.set(rule.subtype, [...(hits.get(rule.subtype) ?? []), term]);
    }
  }

  if (scores.size === 0) return { subtype: null, matched: [], score: 0, runnerUp: null };

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const [top, topScore] = ranked[0];

  // weight 1짜리 하나만 걸린 건 근거로 치지 않는다. '공원' 한 단어로 자연·공원을
  // 단정하면, 공원 옆에 있다고 적은 호텔형 소개글까지 끌려 들어온다.
  if (topScore < 2) {
    return { subtype: null, matched: hits.get(top) ?? [], score: topScore, runnerUp: null };
  }

  const second = ranked[1];
  return {
    subtype: top,
    matched: hits.get(top) ?? [],
    score: topScore,
    runnerUp: second ? { subtype: second[0], score: second[1] } : null,
  };
}

export function subtypeLabel(s: VenueSubtype | null): string {
  return s ? SUBTYPE_LABELS[s] : '미분류';
}
