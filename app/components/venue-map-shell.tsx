'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { FACILITIES, FACILITY_COLOR, type Facility } from '@/lib/facility';
import type { RegionSummary, Venue } from '@/lib/venue-types';

import VenueMap from './venue-map';

const ALL = '전체' as const;
type FacilityFilter = typeof ALL | Facility;
type RegionFilter = typeof ALL | string;

type Props = {
  venues: Venue[];
  regions: RegionSummary[];
  facilityCounts: { facility: Facility; count: number }[];
};

export default function VenueMapShell({ venues, regions, facilityCounts }: Props) {
  const [facility, setFacility] = useState<FacilityFilter>(ALL);
  const [region, setRegion] = useState<RegionFilter>(ALL);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /** 리스트에서 고른 경우에만 증가시켜 지도 이동을 유발한다. */
  const [flyToken, setFlyToken] = useState(0);

  const searchRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

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

  // ⌘K / Ctrl+K → 검색, Esc → 선택 해제.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === 'Escape') setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
