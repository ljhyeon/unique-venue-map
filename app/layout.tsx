import type { Metadata } from 'next';
import { Noto_Sans_KR } from 'next/font/google';

import './globals.css';
import { siteConfig } from '@/lib/site-config';

/**
 * 핸드오프 지정 서체. 400/500/700/900을 모두 쓴다(브랜드바 로고가 900).
 * next/font가 자체 호스팅하므로 런타임에 외부 요청이 없다.
 */
const notoSansKr = Noto_Sans_KR({
  subsets: ['latin'],
  weight: ['400', '500', '700', '900'],
  variable: '--font-noto-sans-kr',
  display: 'swap',
});

export const metadata: Metadata = {
  title: siteConfig.title,
  description: siteConfig.description,
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={notoSansKr.variable}>
      <body>{children}</body>
    </html>
  );
}
