'use client';

import type { ListingFilters } from '@/types';
import { BRANDS, DISPLACEMENTS, STATES } from '@/lib/utils';

interface Props {
  filters: ListingFilters;
  onChange: (filters: Partial<ListingFilters>) => void;
  onReset: () => void;
  totalCount: number;
}

export default function FilterSidebar({ filters, onChange, onReset, totalCount }: Props) {
  return (
    <aside className="w-72 flex-shrink-0">
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sticky top-[108px] shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-slate-900 font-bold text-base">Filtros</h2>
          <button
            onClick={onReset}
            className="text-slate-400 hover:text-orange-500 text-xs font-medium transition-colors"
          >
            Limpar tudo
          </button>
        </div>

        <div className="space-y-5">
          {/* Search */}
          <FilterSection label="Busca">
            <input
              type="text"
              placeholder="Marca, modelo, título..."
              value={filters.search}
              onChange={(e) => onChange({ search: e.target.value })}
              className="w-full bg-white border border-slate-200 text-slate-900 placeholder-slate-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500 transition-colors"
            />
          </FilterSection>

          {/* Sort */}
          <FilterSection label="Ordenar por">
            <select
              value={filters.sortBy}
              onChange={(e) => onChange({ sortBy: e.target.value })}
              className="w-full bg-white border border-slate-200 text-slate-900 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500 transition-colors"
            >
              <option value="recent">Mais recentes</option>
              <option value="price_asc">Menor preço</option>
              <option value="price_desc">Maior preço</option>
              <option value="views">Mais vistos</option>
            </select>
          </FilterSection>

          {/* Brand */}
          <FilterSection label="Marca">
            <select
              value={filters.brand}
              onChange={(e) => onChange({ brand: e.target.value })}
              className="w-full bg-white border border-slate-200 text-slate-900 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500 transition-colors"
            >
              <option value="">Todas as marcas</option>
              {BRANDS.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </FilterSection>

          {/* Displacement */}
          <FilterSection label="Cilindrada">
            <select
              value={filters.displacement}
              onChange={(e) => onChange({ displacement: e.target.value })}
              className="w-full bg-white border border-slate-200 text-slate-900 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500 transition-colors"
            >
              <option value="">Todas</option>
              {DISPLACEMENTS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </FilterSection>

          {/* Engine type */}
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
                  className={`flex-1 text-xs font-medium px-2 py-1.5 rounded-lg transition-colors ${
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

          {/* Price range */}
          <FilterSection label="Faixa de preço">
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Mín"
                value={filters.minPrice}
                onChange={(e) => onChange({ minPrice: e.target.value })}
                className="w-1/2 bg-white border border-slate-200 text-slate-900 placeholder-slate-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500 transition-colors"
              />
              <input
                type="number"
                placeholder="Máx"
                value={filters.maxPrice}
                onChange={(e) => onChange({ maxPrice: e.target.value })}
                className="w-1/2 bg-white border border-slate-200 text-slate-900 placeholder-slate-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500 transition-colors"
              />
            </div>
          </FilterSection>

          {/* State */}
          <FilterSection label="Estado">
            <select
              value={filters.state}
              onChange={(e) => onChange({ state: e.target.value })}
              className="w-full bg-white border border-slate-200 text-slate-900 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500 transition-colors"
            >
              <option value="">Todo o Brasil</option>
              {STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </FilterSection>

          {/* Status */}
          <FilterSection label="Status">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.showSold}
                onChange={(e) => onChange({ showSold: e.target.checked })}
                className="w-4 h-4 accent-orange-500"
              />
              <span className="text-sm text-slate-600">Mostrar vendidas</span>
            </label>
          </FilterSection>
        </div>

        <div className="mt-5 pt-4 border-t border-slate-200">
          <p className="text-slate-400 text-xs text-center">
            {totalCount} {totalCount === 1 ? 'anúncio encontrado' : 'anúncios encontrados'}
          </p>
        </div>
      </div>
    </aside>
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
