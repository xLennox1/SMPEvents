
import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SiteNav } from '@/components/site-nav';
import { SiteFooter } from '@/components/site-footer';

export const metadata: Metadata = {
  title: { default: 'SMPEvents', template: '%s – SMPEvents' },
  description: 'Giveaways, Lootdrops und Lootbox-Events auf WindSMP – mit Streamer-Ranking und Community-Chat.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
};

export const viewport: Viewport = {
  themeColor: '#090b10',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
        >
          Zum Inhalt springen
        </a>
        <SiteNav />
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-6">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
