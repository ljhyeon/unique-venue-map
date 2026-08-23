'use client';

import { useEffect, useRef, useState } from 'react';

import type { Venue } from '@/lib/venue-types';

/** 표기용으로 스킴과 끝 슬래시를 뗀다. 링크 자체는 원본 URL을 쓴다. */
function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

/**
 * 외부 길찾기 링크. 지도는 OpenFreeMap이라 자체 길찾기가 없어 밖으로 넘긴다.
 * 좌표가 있으면 좌표로 보낸다 — 이름은 동명 시설에 걸릴 수 있다.
 */
function directionsUrl(venue: Venue): string {
  const dest = venue.coords
    ? `${venue.coords.lat},${venue.coords.lng}`
    : venue.address || venue.addressRaw || venue.name;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
}

type Props = {
  venue: Venue;
  onClose: () => void;
  /** 소개글을 펼치면 높이가 변해 말풍선 위치를 다시 잡아야 한다. */
  onResize?: () => void;
};

/**
 * 지도 위 말풍선.
 *
 * 마커는 지도 SDK가 그리고 말풍선은 React가 그린다. 둘의 연결고리는 좌표뿐이라
 * SDK를 바꿔도 이 컴포넌트는 그대로 쓴다.
 */
export default function VenueBubble({ venue, onClose, onResize }: Props) {
  const [open, setOpen] = useState(false);
  const introRef = useRef<HTMLParagraphElement | null>(null);
  const [overflows, setOverflows] = useState(false);

  // 잘리지도 않는 소개글에 '더보기'를 달면 눌러도 아무 일이 없다.
  useEffect(() => {
    const el = introRef.current;
    if (!el) return;
    setOverflows(el.scrollHeight > el.clientHeight + 1);
  }, [venue.id]);

  // 시설이 바뀌면 펼침 상태를 되돌린다.
  useEffect(() => {
    setOpen(false);
  }, [venue.id]);

  useEffect(() => {
    onResize?.();
  }, [open, onResize]);

  return (
    <div className="iw-wrap">
      <div className="iw">
        <button className="iw-close" onClick={onClose} aria-label="닫기" type="button">
          ✕
        </button>

        <span className="cat">{venue.facility}</span>
        <h2>{venue.name}</h2>
        {venue.nameEn ? <p className="en">{venue.nameEn}</p> : null}

        <div className="divider" />

        <dl>
          <dt>주소</dt>
          <dd>{venue.address || venue.addressRaw}</dd>

          <dt>전화</dt>
          <dd>
            {venue.phone ? (
              <a href={`tel:${venue.phone}`}>{venue.phone}</a>
            ) : (
              <span className="no">정보 없음</span>
            )}
          </dd>

          <dt>홈페이지</dt>
          <dd>
            {venue.website ? (
              <a href={venue.website} target="_blank" rel="noreferrer noopener">
                {displayUrl(venue.website)}
              </a>
            ) : (
              <span className="no">정보 없음</span>
            )}
          </dd>
        </dl>

        {venue.description ? (
          <>
            <p ref={introRef} className={open ? 'intro open' : 'intro'}>
              {venue.description}
            </p>
            {overflows ? (
              <button className="more" onClick={() => setOpen((v) => !v)} type="button">
                {open ? '접기' : '소개 더보기'}
              </button>
            ) : null}
          </>
        ) : null}

        <div className="btns">
          <a
            className="p"
            href={directionsUrl(venue)}
            target="_blank"
            rel="noreferrer noopener"
          >
            길찾기
          </a>
          {venue.website ? (
            <a className="s" href={venue.website} target="_blank" rel="noreferrer noopener">
              홈페이지
            </a>
          ) : null}
        </div>
      </div>
      <div className="iw-tip" />
    </div>
  );
}
