import type { Metadata, Viewport } from 'next';
import './globals.css';

const APP_URL = 'https://benfica-ratings-vax7.vercel.app';
const BENFICA_LOGO_URL = 'https://dctsqmibhhrtormygkpg.supabase.co/storage/v1/object/public/players/slb-logo.webp';

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: 'BenficaVote • Avaliação dos Adeptos',
  description: 'Dá notas aos jogadores e ao treinador do SL Benfica após cada jogo.',
  manifest: '/manifest.json',
  openGraph: {
    type: 'website',
    locale: 'pt_PT',
    url: APP_URL,
    siteName: 'BenficaVote',
    title: 'BenficaVote • Avaliação dos Adeptos',
    description: 'Dá notas aos jogadores e ao treinador do SL Benfica após cada jogo.',
    images: [
      {
        url: BENFICA_LOGO_URL,
        width: 512,
        height: 512,
        alt: 'BenficaVote Logo',
      },
    ],
  },
  twitter: {
    card: 'summary',
    title: 'BenficaVote • Avaliação dos Adeptos',
    description: 'Dá notas aos jogadores e ao treinador do SL Benfica após cada jogo.',
    images: [BENFICA_LOGO_URL],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'BenficaVote',
  },
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
};

export const viewport: Viewport = {
  themeColor: '#09090b',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="/icon.svg" />
      </head>
      <body className="bg-[#09090b] text-zinc-100 antialiased selection:bg-red-600 selection:text-white">
        {children}
      </body>
    </html>
  );
}