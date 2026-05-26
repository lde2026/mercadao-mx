'use client';

import Link from 'next/link';
import Image from 'next/image';
import type { MotoListing } from '@/types';
import { formatCurrency, formatRelativeDate, CATEGORY_LABELS, ENGINE_TYPE_LABELS } from '@/lib/utils';
import ListingStatusBadge from '@/components/ui/ListingStatusBadge';
import FavoriteButton from '@/components/ui/FavoriteButton';

interface Props {
  listing: MotoListing;
}

function getDaysRemaining(featuredUntil: string): number {
  const diff = new Date(featuredUntil).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export default function MotoCard({ listing }: Props) {
  const isSold = listing.status === 'sold';
  const isPaused = listing.status === 'paused';
  const featuredDays = listing.featured && listing.featuredUntil
    ? getDaysRemaining(listing.featuredUntil)
    : 0;
  const showFeatured = listing.featured && featuredDays > 0;

  return (
    <div
      className={`group bg-white rounded-2xl overflow-hidden border transition-all shadow-sm ${
        isSold
          ? 'border-slate-200 opacity-75'
          : isPaused
          ? 'border-slate-300 opacity-85'
          : showFeatured
          ? 'border-orange-300 shadow-md shadow-orange-500/15 hover:shadow-lg hover:shadow-orange-500/25'
          : 'border-slate-200 hover:border-orange-300 hover:shadow-lg hover:shadow-orange-500/10'
      }`}
    >
      {/* Image */}
      <Link href={`/motos/${listing.id}`} className="block relative">
        <div className="relative aspect-[16/10] overflow-hidden bg-slate-100">
          <Image
            src={listing.mainPhoto}
            alt={listing.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className={`object-cover transition-transform duration-500 ${
              !isSold && 'group-hover:scale-105'
            }`}
          />
          {isSold && (
            <div className="absolute inset-0 bg-black/55 flex items-center justify-center">
              <span className="bg-red-500 text-white font-black text-xl tracking-widest px-4 py-1 rotate-[-8deg] shadow-lg">
                VENDIDO
              </span>
            </div>
          )}
          {isPaused && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <span className="bg-yellow-500 text-black font-black text-sm tracking-widest px-3 py-1">
                PAUSADO
              </span>
            </div>
          )}
        </div>

        {/* Favorite button */}
        <div className="absolute top-2 right-2">
          <FavoriteButton listingId={listing.id} size="sm" />
        </div>

        {/* Category badge */}
        <div className="absolute top-2 left-2">
          <span className="bg-black/60 backdrop-blur-sm text-white text-xs font-medium px-2 py-0.5 rounded-full">
            {CATEGORY_LABELS[listing.category]}
          </span>
        </div>

        {/* Featured badge */}
        {showFeatured && (
          <div className="absolute bottom-2 left-2">
            <span className="flex items-center gap-1 bg-orange-500 text-white text-xs font-black px-2 py-0.5 rounded-full shadow-md">
              🔥 Destaque · {featuredDays}d
            </span>
          </div>
        )}
      </Link>

      {/* Imported badge */}
      {listing.source === 'imported' && (
        <div className="px-4 pt-3 pb-0">
          <a
            href={listing.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-300 text-amber-700 text-[10px] font-black px-2 py-0.5 rounded-full hover:bg-amber-100 transition-colors"
          >
            🔗 Anúncio de outra plataforma
          </a>
        </div>
      )}

      {/* Content */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-1">
          <Link
            href={`/motos/${listing.id}`}
            className="text-slate-900 font-semibold text-sm leading-snug line-clamp-2 hover:text-orange-500 transition-colors flex-1"
          >
            {listing.title}
          </Link>
        </div>

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-slate-400 text-xs">
            {listing.brand} · {listing.displacement}
          </span>
          <span className="w-1 h-1 bg-slate-300 rounded-full" />
          <span className="text-slate-400 text-xs">{listing.year}</span>
          <span className="w-1 h-1 bg-slate-300 rounded-full" />
          <span className="text-slate-400 text-xs">{ENGINE_TYPE_LABELS[listing.engineType]}</span>
        </div>

        <div className="flex items-center justify-between mb-3">
          <span className={`text-lg font-black ${isSold ? 'text-slate-400 line-through' : 'text-orange-500'}`}>
            {formatCurrency(listing.price)}
          </span>
          {listing.acceptsTrade && !isSold && (
            <span className="text-xs text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
              Aceita troca
            </span>
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-slate-400 mb-3">
          <span className="flex items-center gap-1">
            <LocationIcon />
            {listing.city}, {listing.state}
          </span>
          <span>{formatRelativeDate(listing.createdAt)}</span>
        </div>

        <div className="flex items-center gap-2">
          <ListingStatusBadge status={listing.status} />
          <div className="flex-1" />
          {isSold ? (
            <Link
              href={`/motos?displacement=${listing.displacement}&category=${listing.category}`}
              className="text-xs text-slate-500 hover:text-orange-500 transition-colors"
            >
              Ver parecidas →
            </Link>
          ) : (
            <Link
              href={`/motos/${listing.id}`}
              className="bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
            >
              Ver detalhes
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function LocationIcon() {
  return (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
