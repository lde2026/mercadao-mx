'use client';

import { useApp } from '@/context/AppContext';
import ListingGrid from '@/components/listings/ListingGrid';
import EmptyState from '@/components/ui/EmptyState';
import Link from 'next/link';

export default function FavoritosPage() {
  const { listings, favorites } = useApp();
  const favoriteListings = listings.filter((l) => favorites.includes(l.id));

  return (
    <div>
      <h1 className="text-2xl font-black text-slate-900 mb-6">Favoritos</h1>
      {favoriteListings.length === 0 ? (
        <EmptyState
          icon={
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          }
          title="Nenhum favorito ainda"
          description="Salve as motos que você curtiu para encontrá-las facilmente depois."
          action={
            <Link href="/motos" className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-colors">
              Explorar motos
            </Link>
          }
        />
      ) : (
        <ListingGrid listings={favoriteListings} />
      )}
    </div>
  );
}
