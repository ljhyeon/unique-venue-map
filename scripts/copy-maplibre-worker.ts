/**
 * MapLibre 워커를 public/으로 복사한다.
 *
 *   pnpm maplibre:worker      (dev·build 앞에서 자동 실행)
 *
 * 왜 필요한가 — maplibre-gl 6은 워커 스크립트 주소를 `import.meta.url`에서 만든다.
 * 번들러(webpack)는 그 값을 빌드 시점의 `file:///…/node_modules/…` 경로로 박아버리고,
 * MapLibre는 `http(s):`가 아닌 주소를 버려 빈 문자열을 쓴다. 그러면 `new Worker('')`가
 * 현재 HTML 문서를 워커로 읽어 죽고, **타일이 한 장도 그려지지 않는다**(배경색과 마커만
 * 남는다 — 워커 없이도 도는 것들이라 고장이 눈에 잘 안 띈다).
 *
 * 그래서 워커를 직접 서빙하고 `setWorkerUrl()`로 알려준다. 워커는 옆에 있는
 * `maplibre-gl-shared.mjs`를 import하므로 둘을 같은 폴더에 함께 둔다.
 *
 * 복사본은 커밋하지 않는다(.gitignore). 패키지를 올리면 이 스크립트가 새 파일을 가져온다.
 */
import { createRequire } from 'node:module';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** 워커 본체와 그것이 import하는 공용 청크. 하나라도 빠지면 워커가 죽는다. */
const FILES = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];

const OUT_DIR = 'public/maplibre';

const require = createRequire(import.meta.url);
const distDir = join(dirname(require.resolve('maplibre-gl/package.json')), 'dist');

mkdirSync(OUT_DIR, { recursive: true });

for (const name of FILES) {
  copyFileSync(join(distDir, name), join(OUT_DIR, name));
}

// 어디서 온 파일인지 남긴다. public/에 정체불명의 500KB가 굴러다니면 지우고 싶어진다.
const version = JSON.parse(
  readFileSync(require.resolve('maplibre-gl/package.json'), 'utf8'),
).version as string;
writeFileSync(
  join(OUT_DIR, 'README.txt'),
  [
    `maplibre-gl ${version}의 dist에서 복사한 파일입니다. 직접 고치지 마세요.`,
    'scripts/copy-maplibre-worker.ts가 dev·build 앞에서 다시 만듭니다.',
    '',
  ].join('\n'),
);

console.log(`maplibre 워커 복사 완료 → ${OUT_DIR} (maplibre-gl ${version})`);
