'use client';

import Link from 'next/link';
import { useRef } from 'react';
import type { MotoListing } from '@/types';
import MotoCard from '@/components/listings/MotoCard';

interface Props {
  title: string;
  subtitle?: string;
  emoji?: string;
  href: string;
  listings: MotoListing[];
  bg?: string;
}

export default function HomeVitrine({ title, subtitle, emoji, href, listings, bg = 'bg-white' }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === 'right' ? 296 : -296, behavior: 'smooth' });
  };

  if (listings.length === 0) return null;

  return (
    <section className={`py-10 ${bg}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-end justify-between mb-6">
          <div>
            {(emoji || subtitle) && (
              <div className="flex items-center gap-2 mb-1">
                {emoji && <span className="text-lg">{emoji}</span>}
                {subtitle && (
                  <span className="text-orange-500 text-sm font-semibold uppercase tracking-wider">
                    {subtitle}
                  </span>
                )}
              </div>
            )}
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900">{title}</h2>
          </div>

          <div className="flex items-center gap-2">
            {/* Scroll arrows — visible on md+ */}
            <div className="hidden sm:flex items-center gap-1">
              <button
                onClick={() => scroll('left')}
                className="w-8 h-8 rounded-full border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center transition-colors text-slate-500 hover:text-slate-900"
                aria-label="Anterior"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={() => scroll('right')}
                className="w-8 h-8 rounded-full border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center transition-colors text-slate-500 hover:text-slate-900"
                aria-label="Próximo"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            <Link
              href={href}
              className="text-slate-500 hover:text-slate-900 text-sm font-medium transition-colors flex items-center gap-1"
            >
              Ver todas
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>

        {/* Carousel */}
        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto pb-3 -mx-4 px-4 sm:mx-0 sm:px-0 scroll-smooth snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {listings.map((listing) => (
            <div key={listing.id} className="flex-shrink-0 w-[272px] sm:w-[calc(25%-12px)] snap-start">
              <MotoCard listing={listing} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
