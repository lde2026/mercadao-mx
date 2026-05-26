'use client';

import { useEffect } from 'react';
import type { ListingFilters } from '@/types';
import { BRANDS, DISPLACEMENTS, STATES } from '@/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  filters: ListingFilters;
  onChange: (filters: Partial<ListingFilters>) => void;
  onReset: () => void;
  totalCount: number;
}

export default function FilterDrawerMobile({
  open,
  onClose,
  filters,
  onChange,
  onReset,
  totalCount,
}: Props) {
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-80 max-w-[90vw] bg-white border-r border-slate-200 flex flex-col transition-transform duration-300 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="text-slate-900 font-bold">Filtros</h2>
          <div className="flex items-center gap-3">
            <button onClick={onReset} className="text-slate-400 hover:text-orange-500 text-xs font-medium transition-colors">
              Limpar
            </button>
            <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-900 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Search */}
          <FilterSection label="Busca">
            <input
              type="text"
              placeholder="Marca, modelo, título..."
              value={filters.search}
              onChange={(e) => onChange({ search: e.target.value })}
              className="w-full bg-white border border-slate-200 text-slate-900 placeholder-slate-400 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500 transition-colors"
            />
          </FilterSection>

          <FilterSection label="Marca">
            <select
              value={filters.brand}
              onChange={(e) => onChange({ brand: e.target.value })}
              className="w-full bg-white border border-slate-200 text-slate-900 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500 transition-colors"
            >
              <option value="">Todas as marcas</option>
              {BRANDS.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </FilterSection>

          <FilterSection label="Cilindrada">
            <select
              value={filters.displacement}
              onChange={(e) => onChange({ displacement: e.target.value })}
              className="w-full bg-white border border-slate-200 text-slate-900 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500 transition-colors"
            >
              <option value="">Todas</option>
              {DISPLACEMENTS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </FilterSection>

          <FilterSection label="Tipo de motor">
            <div className="flex gap-2">
              {[
                { value: 'two_stroke', label: '2 Tempos' },
                { value: 'four_stroke', label: '4 Tempos' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() =>
                    onChange({ engineType: filters.engineType === opt.value ? '' : opt.value })
                  }
                  className={`flex-1 text-sm font-medium px-3 py-2 rounded-lg transition-colors ${
                    filters.engineType === opt.value
                      ? 'bg-orange-500 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </FilterSection>

          <FilterSection label="Faixa de preço">
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Mín R$"
                value={filters.minPrice}
                onChange={(e) => onChange({ minPrice: e.target.value })}
                className="w-1/2 bg-white border border-slate-200 text-slate-900 placeholder-slate-400 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500 transition-colors"
              />
              <input
                type="number"
                placeholder="Máx R$"
                value={filters.maxPrice}
                onChange={(e) => onChange({ maxPrice: e.target.value })}
                className="w-1/2 bg-white border border-slate-200 text-slate-900 placeholder-slate-400 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500 transition-colors"
              />
            </div>
          </FilterSection>

          <FilterSection label="Estado">
            <select
              value={filters.state}
              onChange={(e) => onChange({ state: e.target.value })}
              className="w-full bg-white border border-slate-200 text-slate-900 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500 transition-colors"
            >
              <option value="">Todo o Brasil</option>
              {STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </FilterSection>

          <FilterSection label="Status">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.showSold}
                onChange={(e) => onChange({ showSold: e.target.checked })}
                className="w-5 h-5 accent-orange-500"
              />
              <span className="text-sm text-slate-700">Mostrar motos vendidas</span>
            </label>
          </FilterSection>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200">
          <button
            onClick={onClose}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl text-sm transition-colors"
          >
            Ver {totalCount} {totalCount === 1 ? 'resultado' : 'resultados'}
          </button>
        </div>
      </div>
    </>
  );
}

function FilterSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2">{label}</p>
      {children}
    </div>
  );
}
