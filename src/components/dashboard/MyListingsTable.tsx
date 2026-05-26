'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { MotoListing, ListingStatus } from '@/types';
import { formatCurrency, formatRelativeDate } from '@/lib/utils';
import { useApp } from '@/context/AppContext';
import ListingStatusBadge from '@/components/ui/ListingStatusBadge';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import EmptyState from '@/components/ui/EmptyState';

export default function MyListingsTable() {
  const { getUserListings, updateListingStatus } = useApp();
  const listings = getUserListings();

  const [modal, setModal] = useState<{
    open: boolean;
    type: 'sold' | 'delete' | 'pause' | 'activate';
    listing: MotoListing | null;
  }>({ open: false, type: 'sold', listing: null });

  const openModal = (type: typeof modal.type, listing: MotoListing) => {
    setModal({ open: true, type, listing });
  };

  const handleConfirm = () => {
    if (!modal.listing) return;
    if (modal.type === 'sold') updateListingStatus(modal.listing.id, 'sold');
    if (modal.type === 'pause') updateListingStatus(modal.listing.id, 'paused');
    if (modal.type === 'activate') updateListingStatus(modal.listing.id, 'active');
    setModal((p) => ({ ...p, open: false }));
  };

  if (listings.length === 0) {
    return (
      <EmptyState
        icon={
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        }
        title="Você ainda não anunciou nenhuma moto"
        description="Cadastre sua primeira moto em poucos minutos."
        action={
          <Link
            href="/anunciar"
            className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-colors"
          >
            + Anunciar minha moto
          </Link>
        }
      />
    );
  }

  const MODAL_CONFIG = {
    sold: {
      title: 'Marcar como vendida?',
      description: 'Tem certeza que deseja marcar esta moto como vendida? O anúncio ficará com o selo VENDIDO.',
      confirmLabel: 'Marcar como vendida',
      danger: false,
    },
    pause: {
      title: 'Pausar anúncio?',
      description: 'O anúncio ficará oculto para os compradores. Você pode reativá-lo quando quiser.',
      confirmLabel: 'Pausar',
      danger: false,
    },
    activate: {
      title: 'Reativar anúncio?',
      description: 'O anúncio voltará a aparecer para todos os compradores.',
      confirmLabel: 'Reativar',
      danger: false,
    },
    delete: {
      title: 'Excluir anúncio?',
      description: 'Esta ação não pode ser desfeita. O anúncio e todas as conversas serão excluídos.',
      confirmLabel: 'Excluir',
      danger: true,
    },
  };

  const config = modal.type ? MODAL_CONFIG[modal.type] : MODAL_CONFIG.sold;

  return (
    <>
      <div className="space-y-3">
        {listings.map((listing) => (
          <div
            key={listing.id}
            className={`bg-white border rounded-2xl p-4 flex gap-4 shadow-sm ${
              listing.status === 'sold' ? 'border-slate-200 opacity-75' : 'border-slate-200'
            }`}
          >
            {/* Thumbnail */}
            <Link href={`/motos/${listing.id}`} className="flex-shrink-0">
              <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden bg-slate-100">
                <Image src={listing.mainPhoto} alt={listing.title} fill sizes="96px" className="object-cover" />
                {listing.status === 'sold' && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <span className="text-red-400 font-black text-[10px]">VENDIDA</span>
                  </div>
                )}
              </div>
            </Link>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 mb-1">
                <Link href={`/motos/${listing.id}`} className="text-slate-900 font-semibold text-sm hover:text-orange-500 transition-colors line-clamp-2">
                  {listing.title}
                </Link>
                <span className="text-orange-500 font-black text-sm flex-shrink-0">{formatCurrency(listing.price)}</span>
              </div>

              <div className="flex items-center gap-3 mb-2">
                <ListingStatusBadge status={listing.status} />
                <span className="text-slate-400 text-xs">{formatRelativeDate(listing.createdAt)}</span>
              </div>

              <div className="flex items-center gap-4 text-slate-400 text-xs mb-3">
                <span className="flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  {listing.views} visualizações
                </span>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/motos/${listing.id}`}
                  className="text-xs text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Ver
                </Link>
                {listing.status === 'active' && (
                  <>
                    <button
                      onClick={() => openModal('sold', listing)}
                      className="text-xs text-green-600 hover:text-white bg-green-50 hover:bg-green-500 border border-green-200 hover:border-green-500 px-3 py-1.5 rounded-lg transition-colors font-medium"
                    >
                      Marcar vendida
                    </button>
                    <button
                      onClick={() => openModal('pause', listing)}
                      className="text-xs text-yellow-600 hover:text-white bg-yellow-50 hover:bg-yellow-500 border border-yellow-200 hover:border-yellow-500 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Pausar
                    </button>
                  </>
                )}
                {listing.status === 'paused' && (
                  <button
                    onClick={() => openModal('activate', listing)}
                    className="text-xs text-blue-600 hover:text-white bg-blue-50 hover:bg-blue-500 border border-blue-200 hover:border-blue-500 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Reativar
                  </button>
                )}
                {listing.status === 'sold' && (
                  <button
                    onClick={() => openModal('activate', listing)}
                    className="text-xs text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Reativar anúncio
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <ConfirmationModal
        open={modal.open}
        title={config.title}
        description={config.description}
        confirmLabel={config.confirmLabel}
        danger={config.danger}
        onConfirm={handleConfirm}
        onCancel={() => setModal((p) => ({ ...p, open: false }))}
      />
    </>
  );
}
