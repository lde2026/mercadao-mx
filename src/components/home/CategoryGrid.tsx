import Link from 'next/link';
import type { Category } from '@/types';
import { CATEGORY_LABELS } from '@/lib/utils';

const CATEGORY_DATA: Array<{
  category: Category;
  icon: string;
  description: string;
  displacement: string;
}> = [
  { category: 'motocross', icon: '🏁', description: 'Pistas preparadas, saltos e velocidade', displacement: '85cc–450cc' },
  { category: 'enduro', icon: '🏔️', description: 'Resistência em terrenos extremos', displacement: '125cc–500cc' },
  { category: 'trilha', icon: '🌲', description: 'Aventura off-road em qualquer terreno', displacement: '150cc–450cc' },
  { category: 'infantil', icon: '⭐', description: 'Iniciação segura para crianças', displacement: '50cc–85cc' },
  { category: 'competicao', icon: '🏆', description: 'Motos de alto desempenho competitivo', displacement: '125cc–450cc' },
  { category: 'lazer', icon: '🤙', description: 'Diversão off-road sem compromisso', displacement: '150cc–250cc' },
];

export default function CategoryGrid() {
  return (
    <section className="py-16 bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between mb-8">
          <div>
            <p className="text-orange-500 text-sm font-semibold uppercase tracking-wider mb-1">
              Categorias
            </p>
            <h2 className="text-3xl font-black text-slate-900">Explore por modalidade</h2>
          </div>
          <Link href="/motos" className="text-slate-500 hover:text-slate-900 text-sm font-medium transition-colors hidden sm:block">
            Ver todas →
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {CATEGORY_DATA.map((item) => (
            <Link
              key={item.category}
              href={`/motos?category=${item.category}`}
              className="group bg-white hover:bg-orange-50 border border-slate-200 hover:border-orange-300 rounded-2xl p-4 flex flex-col items-center text-center gap-2 transition-all shadow-sm hover:shadow-md"
            >
              <span className="text-3xl">{item.icon}</span>
              <span className="text-slate-900 font-bold text-sm group-hover:text-orange-500 transition-colors">
                {CATEGORY_LABELS[item.category]}
              </span>
              <span className="text-slate-400 text-xs leading-tight">{item.description}</span>
              <span className="text-orange-500 text-xs font-medium">{item.displacement}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
