'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRef } from 'react';
import { useApp } from '@/context/AppContext';
import { formatCurrency, CATEGORY_LABELS } from '@/lib/utils';
import FavoriteButton from '@/components/ui/FavoriteButton';

function getDaysRemaining(featuredUntil: string): number {
  const diff = new Date(featuredUntil).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export default function SuperDestaque() {
  const { listings } = useApp();
  const scrollRef = useRef<HTMLDivElement>(null);

  const featured = listings
    .filter((l) => l.featured && l.status === 'active' && l.featuredUntil && getDaysRemaining(l.featuredUntil) > 0)
    .sort((a, b) => getDaysRemaining(a.featuredUntil!) - getDaysRemaining(b.featuredUntil!))
    .slice(0, 20);

  if (featured.length === 0) return null;

  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'right' ? 296 : -296, behavior: 'smooth' });
  };

  return (
    <section className="py-10 bg-gradient-to-b from-orange-50/60 to-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-end justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">🔥</span>
              <span className="text-orange-500 text-sm font-semibold uppercase tracking-wider">Em destaque</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900">Super Destaque</h2>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1">
              <button onClick={() => scroll('left')} className="w-8 h-8 rounded-full border border-orange-200 bg-white hover:bg-orange-50 flex items-center justify-center text-slate-500 hover:text-orange-500 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <button onClick={() => scroll('right')} className="w-8 h-8 rounded-full border border-orange-200 bg-white hover:bg-orange-50 flex items-center justify-center text-slate-500 hover:text-orange-500 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
            <Link href="/motos" className="text-slate-500 hover:text-slate-900 text-sm font-medium transition-colors hidden sm:flex items-center gap-1">
              Ver todas
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </Link>
          </div>
        </div>

        {/* Carousel */}
        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto pb-3 -mx-4 px-4 sm:mx-0 sm:px-0 scroll-smooth snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {featured.map((listing) => {
            const daysLeft = getDaysRemaining(listing.featuredUntil!);
            return (
              <div
                key={listing.id}
                className="flex-shrink-0 w-[272px] sm:w-[calc(25%-12px)] snap-start group bg-white rounded-2xl overflow-hidden border-2 border-orange-200 hover:border-orange-400 shadow-md hover:shadow-lg hover:shadow-orange-500/20 transition-all"
              >
                <Link href={`/motos/${listing.id}`} className="block relative">
                  <div className="relative aspect-[16/10] overflow-hidden bg-slate-100">
                    <Image
                      src={listing.mainPhoto}
                      alt={listing.title}
                      fill
                      sizes="(max-width: 640px) 272px, 25vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute top-2 right-2">
                      <FavoriteButton listingId={listing.id} size="sm" />
                    </div>
                    <div className="absolute top-2 left-2">
                      <span className="bg-black/60 backdrop-blur-sm text-white text-xs font-medium px-2 py-0.5 rounded-full">
                        {CATEGORY_LABELS[listing.category]}
                      </span>
                    </div>
                    <div className="absolute bottom-2 left-2">
                      <span className="flex items-center gap-1 bg-orange-500 text-white text-xs font-black px-2 py-0.5 rounded-full shadow-md">
                        🔥 {daysLeft} dia{daysLeft !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                </Link>
                <div className="p-3">
                  <Link href={`/motos/${listing.id}`} className="text-slate-900 font-semibold text-sm leading-snug line-clamp-1 hover:text-orange-500 transition-colors block mb-1">
                    {listing.title}
                  </Link>
                  <p className="text-xs text-slate-400 mb-2">{listing.brand} · {listing.displacement} · {listing.year}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-orange-500 font-black text-base">{formatCurrency(listing.price)}</span>
                    <span className="text-xs text-slate-400">{listing.city}/{listing.state}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="text-center sm:hidden mt-4">
          <Link href="/motos" className="inline-block bg-white hover:bg-orange-50 text-slate-900 font-bold px-6 py-3 rounded-xl text-sm border border-orange-200 transition-colors">
            Ver todos os destaques →
          </Link>
        </div>
      </div>
    </section>
  );
}
