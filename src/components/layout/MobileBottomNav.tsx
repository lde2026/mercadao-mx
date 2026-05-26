'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import AnunciarModal from '@/components/ui/AnunciarModal';

const NAV_ITEMS = [
  {
    href: '/',
    label: 'Início',
    icon: (active: boolean) => (
      <svg className={`w-6 h-6 ${active ? 'text-orange-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    href: '/motos',
    label: 'Buscar',
    icon: (active: boolean) => (
      <svg className={`w-6 h-6 ${active ? 'text-orange-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
  },
  {
    href: '#anunciar',
    label: 'Anunciar',
    icon: (_active: boolean) => (
      <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
      </svg>
    ),
    highlight: true,
    isModal: true,
  },
  {
    href: '/dashboard/mensagens',
    label: 'Mensagens',
    icon: (active: boolean) => (
      <svg className={`w-6 h-6 ${active ? 'text-orange-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
    badge: 3,
  },
  {
    href: '/dashboard',
    label: 'Perfil',
    icon: (active: boolean) => (
      <svg className={`w-6 h-6 ${active ? 'text-orange-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
];

export default function MobileBottomNav() {
  const pathname = usePathname();
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white border-t border-slate-200 shadow-lg">
        <div className="flex items-center justify-around h-16 px-2">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;

            if (item.highlight && item.isModal) {
              return (
                <button
                  key={item.href}
                  onClick={() => setModalOpen(true)}
                  className="flex flex-col items-center justify-center"
                >
                  <span className="flex items-center justify-center w-14 h-14 bg-orange-500 rounded-2xl shadow-lg shadow-orange-500/40 -mt-5">
                    <Image src="/icon.svg" alt="Anunciar" width={36} height={36} className="w-9 h-9" />
                  </span>
                </button>
              );
            }

            if (item.highlight) {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex flex-col items-center justify-center"
                >
                  <span className="flex items-center justify-center w-12 h-12 bg-orange-500 rounded-full shadow-lg shadow-orange-500/30">
                    {item.icon(isActive)}
                  </span>
                </Link>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex flex-col items-center justify-center gap-0.5 min-w-0 px-1"
              >
                <span className="relative">
                  {item.icon(isActive)}
                  {item.badge && (
                    <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                      {item.badge}
                    </span>
                  )}
                </span>
                <span className={`text-[10px] font-medium truncate ${isActive ? 'text-orange-500' : 'text-slate-400'}`}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      <AnunciarModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
