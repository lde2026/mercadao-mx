import type { MotoListing } from '@/types';
import MotoCard from './MotoCard';
import EmptyState from '@/components/ui/EmptyState';
import Link from 'next/link';

interface Props {
  listings: MotoListing[];
}

export default function ListingGrid({ listings }: Props) {
  if (listings.length === 0) {
    return (
      <EmptyState
        icon={
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
        title="Nenhuma moto encontrada"
        description="Tente ajustar os filtros ou buscar por outra cilindrada."
        action={
          <Link
            href="/motos"
            className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-colors"
          >
            Ver todas as motos
          </Link>
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {listings.map((listing) => (
        <MotoCard key={listing.id} listing={listing} />
      ))}
    </div>
  );
}
