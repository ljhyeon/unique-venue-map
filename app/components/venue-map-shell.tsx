'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { FACILITIES, FACILITY_COLOR, type Facility } from '@/lib/facility';
import { siteConfig } from '@/lib/site-config';
import type { RegionSummary, Venue } from '@/lib/venue-types';

import VenueMap from './venue-map';

const ALL = '전체' as const;
type FacilityFilter = typeof ALL | Facility;
type RegionFilter = typeof ALL | string;

type Props = {
  venues: Venue[];
  regions: RegionSummary[];
  facilityCounts: { facility: Facility; count: number }[];
  /** 데이터 출처 안내에 쓰는 값. 전부 빌드된 데이터셋에서 온다. */
  dataInfo: { updatedAt: string; total: number; mapped: number };
};

/** '2026-07-14' → '2026년 7월 14일'. 형식이 다르면 원문 그대로 둔다. */
function formatDate(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일`;
}

export default function VenueMapShell({ venues, regions, facilityCounts, dataInfo }: Props) {
  const [facility, setFacility] = useState<FacilityFilter>(ALL);
  const [region, setRegion] = useState<RegionFilter>(ALL);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);

  /** 리스트에서 고른 경우에만 증가시켜 지도 이동을 유발한다. */
  const [flyToken, setFlyToken] = useState(0);

  const searchRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const aboutRef = useRef<HTMLDivElement | null>(null);
  const infoRef = useRef<HTMLButtonElement | null>(null);

  /** 지역 칩은 건수 내림차순. 데이터에 실제로 있는 구·군만 노출한다. */
  const regionChips = useMemo(
    () => regions.filter((r) => r.count > 0).sort((a, b) => b.count - a.count),
    [regions],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return venues.filter((v) => {
      if (facility !== ALL && v.facility !== facility) return false;
      if (region !== ALL && v.regionName !== region) return false;
      if (!q) return true;
      const hay = [v.name, v.nameEn, v.address, v.addressRaw, v.regionName, v.facility]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [venues, facility, region, query]);

  const selected = useMemo(
    () => venues.find((v) => v.id === selectedId) ?? null,
    [venues, selectedId],
  );

  // 필터에서 빠진 시설이 선택된 채로 남으면 말풍선만 떠 있고 리스트에는 없다.
  useEffect(() => {
    if (selectedId && !filtered.some((v) => v.id === selectedId)) setSelectedId(null);
  }, [filtered, selectedId]);

  // 선택된 행을 목록 가운데로. 핀을 눌러 고른 경우에도 어디인지 보여야 한다.
  useEffect(() => {
    const list = listRef.current;
    if (!list || !selectedId) return;
    const row = list.querySelector<HTMLElement>(`[data-vid="${selectedId}"]`);
    if (!row) return;
    const top = row.offsetTop - list.clientHeight / 2 + row.offsetHeight / 2;
    list.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }, [selectedId]);

  // ⌘K / Ctrl+K → 검색, Esc → 안내 닫기 또는 선택 해제.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
      // 안내가 열려 있으면 Esc는 그것부터 닫는다. 한 번에 둘 다 닫히면
      // 안내를 보려다 선택까지 잃는다.
      if (e.key === 'Escape') {
        if (aboutOpen) setAboutOpen(false);
        else setSelectedId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [aboutOpen]);

  // 안내 팝오버 바깥을 누르면 닫는다. 토글 버튼은 제외한다 — 여기서 먼저 닫으면
  // 이어지는 click이 다시 열어 버튼이 먹통처럼 보인다.
  useEffect(() => {
    if (!aboutOpen) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (aboutRef.current?.contains(t) || infoRef.current?.contains(t)) return;
      setAboutOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [aboutOpen]);

  const pickFromList = (id: string) => {
    setSelectedId(id);
    setFlyToken((n) => n + 1);
  };

  const reset = () => {
    setFacility(ALL);
    setRegion(ALL);
    setQuery('');
    setSelectedId(null);
    searchRef.current?.focus();
  };

  return (
    <>
      <VenueMap
        venues={filtered}
        selected={selected}
        onSelect={setSelectedId}
        flyToken={flyToken}
      />

      <div className="topbar">
        <div className="pill">
          <b>{facility === ALL ? '전체 시설' : facility}</b>
          <span className="sep" />
          <span>
            {region === ALL ? '부산 전역' : region}
            {query.trim() ? ` · "${query.trim()}" 검색` : ''}
          </span>
        </div>
      </div>

      <div className="legend">
        <div className="t">시설 구분</div>
        {FACILITIES.map((f) => (
          <div className="l" key={f}>
            <span className="sw" style={{ background: FACILITY_COLOR[f] }} />
            {f}
          </div>
        ))}
      </div>

      <aside className="panel">
        <div className="brand">
          <b>유니크베뉴</b>

          <button
            ref={infoRef}
            className={aboutOpen ? 'info on' : 'info'}
            onClick={() => setAboutOpen((v) => !v)}
            aria-label="데이터 출처 안내"
            aria-expanded={aboutOpen}
            title="데이터 출처"
            type="button"
          >
            <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <circle cx="9" cy="9" r="7.5" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="9" cy="5.6" r="1" fill="currentColor" />
              <path
                d="M9 8.2v4.6"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>

          {aboutOpen ? (
            <div className="about" ref={aboutRef} role="dialog" aria-label="데이터 출처 안내">
              <h2>데이터 안내</h2>
              <p>
                공공데이터포털에 공개된 <b>{siteConfig.sourceName}</b> 파일데이터를 그대로
                사용합니다.
              </p>

              <dl>
                <dt>제공</dt>
                <dd>부산관광공사 · 공공데이터포털</dd>
                <dt>기준일</dt>
                <dd>{formatDate(dataInfo.updatedAt)}</dd>
                <dt>수록</dt>
                <dd>
                  {dataInfo.total}곳 <span className="sub">(지도 표시 {dataInfo.mapped}곳)</span>
                </dd>
              </dl>

              <p className="note">
                원본에 위·경도가 없어 주소를 좌표로 변환해 지도에 표시합니다. 좌표를 확보하지
                못한 곳은 목록에만 나옵니다. 운영 정보는 바뀔 수 있으니 방문 전 시설에 확인하세요.
              </p>

              <a className="src" href={siteConfig.sourceUrl} target="_blank" rel="noreferrer">
                공공데이터포털에서 원본 보기 ↗
              </a>
            </div>
          ) : null}
        </div>

        <div className="sbox">
          <div className="sfield">
            <svg width="17" height="17" viewBox="0 0 18 18" fill="none" stroke="#002B5C" strokeWidth="1.8">
              <circle cx="7.6" cy="7.6" r="5" />
              <path d="M11.4 11.4 16 16" />
            </svg>
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="시설명, 지역, 주소 검색"
              autoComplete="off"
            />
            {query ? (
              <button
                onClick={() => {
                  setQuery('');
                  searchRef.current?.focus();
                }}
                aria-label="지우기"
                type="button"
              >
                <svg width="15" height="15" viewBox="0 0 16 16">
                  <circle cx="8" cy="8" r="8" fill="#C8C8C8" />
                  <path d="M5.4 5.4l5.2 5.2M10.6 5.4l-5.2 5.2" stroke="#fff" strokeWidth="1.5" />
                </svg>
              </button>
            ) : null}
          </div>
        </div>

        <div className="tabs">
          <button
            className={facility === ALL ? 'tab on' : 'tab'}
            onClick={() => setFacility(ALL)}
            type="button"
          >
            전체<span className="num">{venues.length}</span>
          </button>
          {facilityCounts.map(({ facility: f, count }) => (
            <button
              key={f}
              className={facility === f ? 'tab on' : 'tab'}
              onClick={() => setFacility(f)}
              type="button"
            >
              {f}
              <span className="num">{count}</span>
            </button>
          ))}
        </div>

        <div className="gu">
          <button
            className={region === ALL ? 'chip on' : 'chip'}
            onClick={() => setRegion(ALL)}
            type="button"
          >
            전체 지역
          </button>
          {regionChips.map((r) => (
            <button
              key={r.code}
              className={region === r.name ? 'chip on' : 'chip'}
              onClick={() => setRegion(r.name)}
              type="button"
            >
              {r.name}
            </button>
          ))}
        </div>

        <div className="bar">
          <div className="cnt">
            <b>{filtered.length}</b>개 시설
          </div>
          <button className="rst" onClick={reset} type="button">
            필터 초기화
          </button>
        </div>

        <div className="list" ref={listRef}>
          {filtered.length === 0 ? (
            <div className="empty">
              검색 결과가 없습니다.
              <br />
              다른 키워드나 필터를 시도해 보세요.
            </div>
          ) : (
            filtered.map((v, i) => (
              <button
                key={v.id}
                data-vid={v.id}
                className={selectedId === v.id ? 'row on' : 'row'}
                onClick={() => pickFromList(v.id)}
                type="button"
              >
                <div className="no">{i + 1}</div>
                <div className="main">
                  <h3>{v.name}</h3>
                  <p className="k">
                    <span className="cat">{v.facility}</span>
                    {v.regionName ? ` · ${v.regionName}` : ''}
                  </p>
                  <p className="ad">{v.address || v.addressRaw}</p>
                  {v.phone ? <p className="tl">{v.phone}</p> : null}
                  {!v.coords ? <span className="nocoord">좌표 미확보</span> : null}
                </div>
              </button>
            ))
          )}
        </div>
      </aside>
    </>
  );
}
