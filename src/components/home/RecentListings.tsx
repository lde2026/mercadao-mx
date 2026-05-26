'use client';

import Link from 'next/link';
import { useApp } from '@/context/AppContext';
import MotoCard from '@/components/listings/MotoCard';

export default function RecentListings() {
  const { listings } = useApp();

  const recent = listings
    .filter((l) => l.status === 'active')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6);

  return (
    <section className="py-16 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between mb-8">
          <div>
            <p className="text-orange-500 text-sm font-semibold uppercase tracking-wider mb-1">
              Recém chegadas
            </p>
            <h2 className="text-3xl font-black text-slate-900">Últimos anúncios</h2>
          </div>
          <Link
            href="/motos"
            className="text-slate-500 hover:text-slate-900 text-sm font-medium transition-colors hidden sm:flex items-center gap-1"
          >
            Ver todas
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {recent.map((listing) => (
            <MotoCard key={listing.id} listing={listing} />
          ))}
        </div>

        <div className="text-center sm:hidden">
          <Link
            href="/motos"
            className="inline-block bg-white hover:bg-slate-50 text-slate-900 font-bold px-6 py-3 rounded-xl text-sm border border-slate-200 transition-colors"
          >
            Ver todas as motos →
          </Link>
        </div>
      </div>
    </section>
  );
}
