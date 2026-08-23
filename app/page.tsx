import {
  getDataset,
  getFacilityCounts,
  getRegionSummaries,
  getVenues,
} from '@/lib/venue-data';
import { siteConfig } from '@/lib/site-config';
import VenueMapShell from './components/venue-map-shell';

export default function Page() {
  const venues = getVenues();
  const { dataUpdatedAt } = getDataset();

  // 지도가 화면 전체를 차지하는 구조라, 빈 데이터일 때 지도만 덩그러니 띄우면
  // 고장으로 읽힌다. 안내 화면을 따로 둔다.
  if (venues.length === 0) {
    return (
      <main className="setup">
        <div>
          <p className="eyebrow">BUSAN UNIQUE VENUE MAP</p>
          <h1>데이터가 아직 없습니다</h1>
          <ol>
            <li>
              공공데이터포털에서 받은 CSV를 <code>data/source/</code>에 넣습니다.
            </li>
            <li>
              <code>npm run data:build</code> — 원본을 정제해 <code>data/venues.json</code>을 만듭니다.
            </li>
            <li>
              <code>npm run data:geocode</code> — 주소를 좌표로 바꿔 지도에 찍을 수 있게 합니다.
            </li>
          </ol>
          <a href={siteConfig.sourceUrl} target="_blank" rel="noreferrer">
            {siteConfig.sourceName} ↗
          </a>
        </div>
      </main>
    );
  }

  return (
    <main>
      <VenueMapShell
        venues={venues}
        regions={getRegionSummaries()}
        facilityCounts={getFacilityCounts()}
      />
    </main>
  );
}
