'use client';

import { useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import FilterSidebar from '@/components/listings/FilterSidebar';
import FilterDrawerMobile from '@/components/listings/FilterDrawerMobile';
import ListingGrid from '@/components/listings/ListingGrid';
import { useApp } from '@/context/AppContext';
import type { ListingFilters } from '@/types';

const INITIAL_FILTERS: ListingFilters = {
  search: '',
  brand: '',
  model: '',
  displacement: '',
  engineType: '',
  category: '',
  productType: '',
  minPrice: '',
  maxPrice: '',
  yearFrom: '',
  yearTo: '',
  city: '',
  state: '',
  status: '',
  sortBy: 'recent',
  showSold: false,
};

const PRODUCT_TYPE_TABS = [
  { value: '', label: 'Tudo', icon: '🏍️' },
  { value: 'moto', label: 'Motos', icon: '🏍️' },
  { value: 'peca', label: 'Peças', icon: '🔧' },
  { value: 'equipamento', label: 'Equipamentos', icon: '⛑️' },
];

export default function MotosContent() {
  const { listings } = useApp();
  const searchParams = useSearchParams();

  const [filters, setFilters] = useState<ListingFilters>(() => ({
    ...INITIAL_FILTERS,
    category: searchParams.get('category') ?? '',
    displacement: searchParams.get('displacement') ?? '',
    brand: searchParams.get('brand') ?? '',
    productType: searchParams.get('productType') ?? '',
  }));
  const [drawerOpen, setDrawerOpen] = useState(false);

  const updateFilters = (partial: Partial<ListingFilters>) => setFilters((p) => ({ ...p, ...partial }));
  const resetFilters = () => setFilters(INITIAL_FILTERS);

  const filtered = useMemo(() => {
    let result = [...listings];

    result = result.filter((l) => l.status !== 'paused');
    if (!filters.showSold) result = result.filter((l) => l.status !== 'sold');
    if (filters.status) result = result.filter((l) => l.status === filters.status);
    if (filters.productType) result = result.filter((l) => l.productType === filters.productType);

    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (l) =>
          l.title.toLowerCase().includes(q) ||
          l.brand.toLowerCase().includes(q) ||
          l.model.toLowerCase().includes(q),
      );
    }
    if (filters.brand) result = result.filter((l) => l.brand === filters.brand);
    if (filters.displacement) result = result.filter((l) => l.displacement === filters.displacement);
    if (filters.engineType) result = result.filter((l) => l.engineType === filters.engineType);
    if (filters.category) result = result.filter((l) => l.category === filters.category);
    if (filters.state) result = result.filter((l) => l.state === filters.state);
    if (filters.minPrice) result = result.filter((l) => l.price >= Number(filters.minPrice));
    if (filters.maxPrice) result = result.filter((l) => l.price <= Number(filters.maxPrice));

    if (filters.sortBy === 'price_asc') result.sort((a, b) => a.price - b.price);
    else if (filters.sortBy === 'price_desc') result.sort((a, b) => b.price - a.price);
    else if (filters.sortBy === 'views') result.sort((a, b) => b.views - a.views);
    else result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return result;
  }, [listings, filters]);

  const hasActiveFilters = Object.entries(filters).some(([k, v]) => {
    if (k === 'sortBy') return v !== 'recent';
    if (k === 'showSold') return v === true;
    return v !== '' && v !== false;
  });

  return (
    <>
      {/* Product type tabs */}
      <div className="bg-white border-b border-slate-200 sticky top-[100px] z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-1 overflow-x-auto py-2 scrollbar-hide">
            {PRODUCT_TYPE_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => updateFilters({ productType: tab.value })}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors flex-shrink-0 ${
                  filters.productType === tab.value
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Page header */}
      <div className="bg-white border-b border-slate-200 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-black text-slate-900">
                {filters.productType === 'moto' ? 'Motos disponíveis' :
                 filters.productType === 'peca' ? 'Peças disponíveis' :
                 filters.productType === 'equipamento' ? 'Equipamentos disponíveis' :
                 'Tudo disponível'}</h1>
              <p className="text-slate-500 text-sm mt-0.5">
                {filtered.length} {filtered.length === 1 ? 'anúncio encontrado' : 'anúncios encontrados'}
              </p>
            </div>
            <button
              onClick={() => setDrawerOpen(true)}
              className="md:hidden flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              Filtros
              {hasActiveFilters && <span className="w-2 h-2 bg-orange-500 rounded-full" />}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex gap-6">
          <div className="hidden md:block">
            <FilterSidebar filters={filters} onChange={updateFilters} onReset={resetFilters} totalCount={filtered.length} />
          </div>
          <div className="flex-1 min-w-0">
            <ListingGrid listings={filtered} />
          </div>
        </div>
      </div>

      <FilterDrawerMobile
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        filters={filters}
        onChange={updateFilters}
        onReset={resetFilters}
        totalCount={filtered.length}
      />
    </>
  );
}
