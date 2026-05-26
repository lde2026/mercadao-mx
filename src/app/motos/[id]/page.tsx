'use client';

import { use } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import MobileBottomNav from '@/components/layout/MobileBottomNav';
import MotoGallery from '@/components/listing-detail/MotoGallery';
import ListingStatusBadge from '@/components/ui/ListingStatusBadge';
import FavoriteButton from '@/components/ui/FavoriteButton';
import { useState, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { formatCurrency, formatDate, CATEGORY_LABELS, ENGINE_TYPE_LABELS } from '@/lib/utils';
import { MOCK_USERS } from '@/data/mockData';
import ProposalModal from '@/components/ui/ProposalModal';

export default function MotoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { getListingById, incrementViews } = useApp();
  const listing = getListingById(id);
  const [proposalOpen, setProposalOpen] = useState(false);

  useEffect(() => {
    if (id) incrementViews(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!listing) {
    return (
      <>
        <Header />
        <main className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-black text-slate-900 mb-3">Anúncio não encontrado</h1>
            <p className="text-slate-500 mb-6">Este anúncio não existe ou foi removido.</p>
            <Link href="/motos" className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-6 py-2.5 rounded-xl transition-colors">
              Ver todas as motos
            </Link>
          </div>
        </main>
        <Footer />
        <MobileBottomNav />
      </>
    );
  }
  const seller = MOCK_USERS.find((u) => u.id === listing.userId) ?? MOCK_USERS[0];
  const isSold = listing.status === 'sold';

  const specs = [
    { label: 'Marca', value: listing.brand },
    { label: 'Modelo', value: listing.model },
    { label: 'Ano', value: listing.year },
    { label: 'Cilindrada', value: listing.displacement },
    { label: 'Motor', value: ENGINE_TYPE_LABELS[listing.engineType] },
    { label: 'Modalidade', value: CATEGORY_LABELS[listing.category] },
    { label: 'Documentação', value: listing.documentation },
    { label: 'Conservação', value: listing.condition },
    { label: 'Localização', value: `${listing.city}, ${listing.state}` },
  ];

  return (
    <>
      <Header />
      <main className="min-h-screen pb-20 md:pb-0">
        {/* Sold banner */}
        {isSold && (
          <div className="bg-red-50 border-b border-red-200 py-3">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
              <p className="text-red-600 font-bold text-sm">
                🏁 Esta moto já foi vendida
              </p>
              <Link
                href={`/motos?displacement=${listing.displacement}&category=${listing.category}`}
                className="text-orange-500 hover:text-orange-600 text-sm font-medium transition-colors"
              >
                Ver motos parecidas →
              </Link>
            </div>
          </div>
        )}

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-sm text-slate-400 mb-6">
            <Link href="/motos" className="hover:text-slate-900 transition-colors">Motos</Link>
            <span>/</span>
            <span className="text-slate-600 truncate">{listing.brand} {listing.model}</span>
          </nav>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8">
            {/* Left column */}
            <div>
              <MotoGallery photos={listing.photos} title={listing.title} />

              {/* Description */}
              <div className="mt-6 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <h2 className="text-slate-900 font-bold text-lg mb-3">Descrição</h2>
                <p className="text-slate-600 text-sm leading-relaxed whitespace-pre-line">{listing.description}</p>
              </div>

              {/* Specs */}
              <div className="mt-4 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <h2 className="text-slate-900 font-bold text-lg mb-4">Dados técnicos</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {specs.map((spec) => (
                    <div key={spec.label}>
                      <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">{spec.label}</p>
                      <p className="text-slate-900 font-semibold text-sm">{spec.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right column — sticky */}
            <div className="space-y-4">
              <div className="bg-white border border-slate-200 rounded-2xl p-6 lg:sticky lg:top-20 shadow-sm">
                {/* Imported platform banner */}
                {listing.source === 'imported' && listing.sourceUrl && (
                  <div className="mb-4 bg-amber-50 border-2 border-amber-400 rounded-2xl p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-base">🔗</span>
                      <span className="font-black text-amber-800 text-xs uppercase tracking-widest">
                        Anúncio de outra plataforma
                      </span>
                    </div>
                    <p className="text-amber-700 text-xs leading-relaxed mb-2">
                      Este anúncio foi importado automaticamente pelo Mercadão MX.{' '}
                      {listing.sourcePlatform === 'olx' && 'Fonte: OLX.'}
                      {listing.sourcePlatform === 'facebook' && 'Fonte: Facebook Marketplace.'}
                    </p>
                    <a
                      href={listing.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-amber-700 hover:text-amber-900 font-bold underline underline-offset-2"
                    >
                      Ver anúncio original →
                    </a>
                  </div>
                )}

                {/* Title & Status */}
                <div className="mb-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h1 className="text-slate-900 font-black text-xl leading-snug flex-1">{listing.title}</h1>
                    <FavoriteButton listingId={listing.id} />
                  </div>
                  <ListingStatusBadge status={listing.status} size="md" />
                </div>

                {/* Price */}
                <div className="mb-5">
                  <span className={`text-3xl font-black ${isSold ? 'text-slate-400 line-through' : 'text-orange-500'}`}>
                    {formatCurrency(listing.price)}
                  </span>
                  {listing.acceptsTrade && !isSold && (
                    <span className="ml-3 text-sm text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                      Aceita troca
                    </span>
                  )}
                </div>

                {/* Location */}
                <div className="flex items-center gap-2 text-slate-500 text-sm mb-5">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {listing.city}, {listing.state}
                </div>

                {/* CTAs */}
                {listing.source === 'imported' && listing.sourceUrl ? (
                  <div className="space-y-3">
                    <a
                      href={listing.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full bg-orange-500 hover:bg-orange-600 text-white font-black py-3.5 rounded-xl transition-all hover:shadow-lg hover:shadow-orange-500/25"
                    >
                      🔗 Ver anúncio original
                    </a>
                    <p className="text-center text-slate-400 text-xs">
                      Este anúncio está em outra plataforma. Clique para negociar lá.
                    </p>
                  </div>
                ) : isSold ? (
                  <div className="space-y-3">
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                      <p className="text-red-600 text-sm font-medium">Moto vendida</p>
                    </div>
                    <Link
                      href={`/motos?displacement=${listing.displacement}&category=${listing.category}`}
                      className="block w-full text-center bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl transition-colors"
                    >
                      Ver motos parecidas
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {listing.acceptsProposals && (
                      <button
                        onClick={() => setProposalOpen(true)}
                        className="w-full bg-slate-900 hover:bg-slate-700 text-white font-black py-3.5 rounded-xl transition-all hover:shadow-lg"
                      >
                        💰 Enviar Proposta
                      </button>
                    )}
                    <Link
                      href={`/dashboard/mensagens`}
                      className="block w-full text-center bg-orange-500 hover:bg-orange-600 text-white font-black py-3.5 rounded-xl transition-all hover:shadow-lg hover:shadow-orange-500/25"
                    >
                      💬 Conversar com vendedor
                    </Link>
                  </div>
                )}

                {/* Seller info */}
                <div className="mt-5 pt-5 border-t border-slate-200 flex items-center gap-3">
                  <div className="relative w-10 h-10 rounded-full overflow-hidden bg-slate-100 flex-shrink-0">
                    {seller.avatar && <Image src={seller.avatar} alt={seller.name} fill sizes="40px" className="object-cover" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-slate-900 text-sm font-semibold truncate">{seller.name}</p>
                    <p className="text-slate-400 text-xs">Desde {formatDate(seller.createdAt)}</p>
                  </div>
                </div>

                <p className="text-slate-300 text-xs mt-3 text-center">
                  Publicado em {formatDate(listing.createdAt)} · {listing.views} visualizações
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
      <MobileBottomNav />
      <ProposalModal
        isOpen={proposalOpen}
        onClose={() => setProposalOpen(false)}
        listingTitle={listing.title}
        listingPrice={listing.price}
        onSubmit={(value) => {
          console.log('Proposta enviada:', value);
          setProposalOpen(false);
        }}
      />
    </>
  );
}
