'use client';

import { MapLibreMap, Marker, NavigationControl, setWorkerUrl } from 'maplibre-gl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import 'maplibre-gl/dist/maplibre-gl.css';

import { FACILITY_COLOR } from '@/lib/facility';
import type { Venue } from '@/lib/venue-types';

import VenueBubble from './venue-bubble';

type Mappable = Venue & { coords: NonNullable<Venue['coords']> };

/** 부산 전역이 잡히는 초기 중심. */
const CENTER = { lat: 35.155, lng: 129.105 };

/**
 * OpenFreeMap 공개 타일. 키도 사용량 등록도 없어 환경변수 없이 그대로 뜬다.
 * 스타일 안에 소스·글리프·스프라이트 URL이 전부 들어 있다.
 */
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

const ZOOM = {
  /** 부산 전역이 한 화면에 들어오는 축척. */
  overview: 11.5,
  /** 시설 하나를 들여다보는 축척. 리스트 선택 이동의 하한이다. */
  focus: 14,
} as const;

/** 좌측 패널에 말풍선이 가리지 않도록 확보하는 여백. 패널 폭(--panel-w 440) + 여유 30. */
const PANEL_SAFE_PX = 470;

/**
 * 타일을 받아 푸는 워커. scripts/copy-maplibre-worker.ts가 여기에 복사해 둔다.
 *
 * 기본값을 쓰면 안 된다 — MapLibre는 워커 주소를 `import.meta.url`로 만드는데,
 * 번들러가 그 값을 빌드 시점의 file:// 경로로 박아 넣어 주소가 빈 문자열이 된다.
 * 그러면 `new Worker('')`가 HTML 문서를 워커로 읽어 죽고, 배경색과 마커만 남은
 * 빈 지도가 나온다. 자세한 사정은 복사 스크립트 주석에 적어 뒀다.
 */
const WORKER_URL = '/maplibre/maplibre-gl-worker.mjs';

function pinSvg(color: string): string {
  return `<svg width="24" height="32" viewBox="0 0 24 32" aria-hidden="true">
    <path d="M12 0C5.4 0 0 5.3 0 11.9C0 20.3 12 32 12 32S24 20.3 24 11.9C24 5.3 18.6 0 12 0Z" fill="${color}"/>
    <circle cx="12" cy="11.6" r="4.4" fill="#fff"/>
  </svg>`;
}

type Props = {
  /** 필터를 통과한 시설. 여기 없는 마커는 지도에서 내린다. */
  venues: Venue[];
  selected: Venue | null;
  onSelect: (id: string | null) => void;
  /** 리스트에서 고른 경우에만 지도를 이동시킨다. 핀 클릭 때는 움직이지 않는다. */
  flyToken: number;
};

export default function VenueMap({ venues, selected, onSelect, flyToken }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);

  /** 시설 id → 마커 + DOM 요소. */
  const markersRef = useRef<Map<string, { marker: Marker; el: HTMLElement }>>(
    new Map(),
  );
  const bubbleMarkerRef = useRef<Marker | null>(null);
  /** 착지 후로 미뤄둔 말풍선 보정의 대상. 리스너가 겹쳐 쌓이는 것을 막는다. */
  const nudgePendingRef = useRef<HTMLElement | null>(null);
  const [bubbleHost, setBubbleHost] = useState<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const mappable = useMemo(
    () => venues.filter((v): v is Mappable => v.coords !== null),
    [venues],
  );

  // 콜백이 매 렌더 바뀌면 마커 클릭 핸들러를 계속 다시 달아야 한다. ref로 고정한다.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  /* ---------- 지도 생성 ---------- */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const markers = markersRef.current;
    setWorkerUrl(WORKER_URL);

    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container: host,
        style: STYLE_URL,
        center: [CENTER.lng, CENTER.lat],
        zoom: ZOOM.overview,
        attributionControl: { compact: true },
      });
    } catch (e) {
      // WebGL이 없는 환경 등. 지도가 화면 대부분이라 빈 회색을 두면 고장으로 읽힌다.
      setError(e instanceof Error ? e.message : '지도를 초기화하지 못했습니다.');
      return;
    }

    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');

    // 빈 곳을 누르면 선택 해제. 마커·말풍선 클릭은 각자 전파를 멈춰 여기까지 오지 않는다.
    map.on('click', () => onSelectRef.current(null));

    mapRef.current = map;
    // 마커는 DOM이라 스타일·타일이 오기 전에 올려도 된다. load를 기다리면
    // 타일이 막힌 망에서 핀까지 통째로 사라진다.
    setReady(true);

    return () => {
      markers.clear();
      bubbleMarkerRef.current = null;
      mapRef.current = null;
      setReady(false);
      map.remove();
    };
  }, []);

  /* ---------- 마커 동기화 ---------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const store = markersRef.current;
    const wanted = new Set(mappable.map((v) => v.id));

    // 사라진 것 내리기
    for (const [id, entry] of store) {
      if (!wanted.has(id)) {
        entry.marker.remove();
        store.delete(id);
      }
    }

    // 새로 들어온 것 올리기
    for (const v of mappable) {
      if (store.has(v.id)) continue;

      const el = document.createElement('div');
      el.className = 'mk';
      el.innerHTML = `${pinSvg(FACILITY_COLOR[v.facility])}<span class="nm"></span>`;
      // 시설명은 textContent로 넣는다. innerHTML에 이어 붙이면 이름의 <, & 가 마크업이 된다.
      const label = el.querySelector('.nm');
      if (label) label.textContent = v.name;

      el.addEventListener('click', (e) => {
        // 마커는 캔버스 컨테이너 안에 있다. 멈추지 않으면 지도 click까지 올라가 곧바로 해제된다.
        e.stopPropagation();
        onSelectRef.current(v.id);
      });

      const marker = new Marker({ element: el, anchor: 'bottom' })
        .setLngLat([v.coords.lng, v.coords.lat])
        .addTo(map);

      store.set(v.id, { marker, el });
    }
  }, [mappable, ready]);

  /* ---------- 선택 표시 ---------- */
  useEffect(() => {
    for (const [id, entry] of markersRef.current) {
      entry.el.classList.toggle('sel', id === selected?.id);
    }
  }, [selected, mappable]);

  /* ---------- 말풍선 마커 ---------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    if (!selected?.coords) {
      bubbleMarkerRef.current?.remove();
      bubbleMarkerRef.current = null;
      setBubbleHost(null);
      return;
    }

    const host = document.createElement('div');
    // 마커끼리는 DOM 순서대로 겹친다. 말풍선은 항상 핀 위에 있어야 한다.
    host.style.zIndex = '1300';
    // 말풍선 안을 누르는 것은 '빈 곳 클릭'이 아니다.
    host.addEventListener('click', (e) => e.stopPropagation());

    const marker = new Marker({ element: host, anchor: 'bottom' })
      .setLngLat([selected.coords.lng, selected.coords.lat])
      .addTo(map);

    bubbleMarkerRef.current = marker;
    setBubbleHost(host);

    return () => {
      marker.remove();
      bubbleMarkerRef.current = null;
    };
  }, [selected, ready]);

  /* ---------- 리스트에서 고른 경우 지도 이동 ---------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !selected?.coords || flyToken === 0) return;

    map.flyTo({
      center: [selected.coords.lng, selected.coords.lat],
      zoom: Math.max(map.getZoom(), ZOOM.focus),
      duration: 700,
    });
  }, [flyToken, selected, ready]);

  /**
   * 말풍선이 좌측 패널 아래로 숨지 않게 민다.
   * 지도 라이브러리의 autoPan에 해당하는 동작을 직접 구현한 것.
   *
   * **카메라가 움직이는 동안에는 절대 밀지 않는다.** 비행 중에 잰 화면 좌표는 목적지가
   * 아니라 지나가는 중간 지점이고, 여기서 panBy를 부르면 그 자체가 새 카메라 애니메이션이라
   * 진행 중인 flyTo를 끊어먹는다. 목적지가 멀수록 중간 지점이 화면 밖으로 크게 벗어나
   * 보정량도 같이 커지므로, 먼 곳을 고를 때만 엉뚱한 데 내리는 것처럼 보인다.
   * 실제로 이 경로는 VenueBubble이 마운트 직후 onResize()를 부르면서 매 선택마다 밟힌다.
   */
  const nudgeIntoView = useCallback(() => {
    const map = mapRef.current;
    if (!map || !bubbleHost) return;

    const apply = () => {
      const rect = bubbleHost.getBoundingClientRect();
      // 이미 지도에서 내린 말풍선. 떼어낸 요소는 0을 돌려준다.
      if (rect.width === 0) return;

      let dx = 0;
      let dy = 0;
      if (rect.left < PANEL_SAFE_PX) dx = rect.left - PANEL_SAFE_PX;
      if (rect.top < 14) dy = rect.top - 14;
      if (dx !== 0 || dy !== 0) map.panBy([dx, dy]);
    };

    if (!map.isMoving()) {
      apply();
      return;
    }

    // 착지 후로 미룬다. 같은 말풍선에 대해서는 한 번만 예약한다.
    if (nudgePendingRef.current === bubbleHost) return;
    nudgePendingRef.current = bubbleHost;
    map.once('moveend', () => {
      if (nudgePendingRef.current === bubbleHost) nudgePendingRef.current = null;
      apply();
    });
  }, [bubbleHost]);

  useEffect(() => {
    if (!bubbleHost) return;
    // 말풍선이 실제로 그려진 뒤에 재야 위치가 맞는다.
    const t = window.setTimeout(nudgeIntoView, 60);
    return () => window.clearTimeout(t);
  }, [bubbleHost, nudgeIntoView]);

  if (error) {
    return (
      <div className="map-fallback">
        <div>
          <h2>지도를 불러오지 못했습니다</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div ref={hostRef} className="map-canvas" />
      {bubbleHost && selected
        ? createPortal(
            <VenueBubble
              venue={selected}
              onClose={() => onSelect(null)}
              onResize={nudgeIntoView}
            />,
            bubbleHost,
          )
        : null}
    </>
  );
}
