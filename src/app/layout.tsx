import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';
import { AppProvider } from '@/context/AppContext';

const geist = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  title: 'Mercadão MX — Compre e venda motos off-road',
  description:
    'O marketplace feito para quem vive o mundo off-road. Compre, venda e negocie motos de motocross, enduro e trilha de forma rápida, direta e segura.',
  keywords: 'motocross, enduro, trilha, moto off-road, comprar moto, vender moto',
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon.svg',
    apple: '/icon.svg',
  },
  openGraph: {
    title: 'Mercadão MX',
    description: 'Marketplace de motos off-road',
    images: ['/logo.png'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${geist.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-white text-slate-900 antialiased">
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
