import Link from 'next/link';
import { DISPLACEMENTS } from '@/lib/utils';

export default function DisplacementBrowser() {
  const popular: typeof DISPLACEMENTS = ['50cc', '85cc', '125cc', '250cc', '350cc', '450cc'];
  const all = DISPLACEMENTS.filter((d) => !popular.includes(d));

  return (
    <section className="py-16 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <p className="text-orange-500 text-sm font-semibold uppercase tracking-wider mb-1">Cilindradas</p>
          <h2 className="text-3xl font-black text-slate-900">Busque pela cilindrada</h2>
        </div>

        <div className="mb-4">
          <p className="text-slate-400 text-xs uppercase tracking-wider font-semibold mb-3">Mais populares</p>
          <div className="flex flex-wrap gap-2">
            {popular.map((d) => (
              <Link
                key={d}
                href={`/motos?displacement=${d}`}
                className="bg-orange-50 border border-orange-200 hover:bg-orange-500 hover:border-orange-500 text-orange-600 hover:text-white font-bold text-sm px-4 py-2 rounded-xl transition-all"
              >
                {d}
              </Link>
            ))}
          </div>
        </div>

        <div>
          <p className="text-slate-400 text-xs uppercase tracking-wider font-semibold mb-3">Outras</p>
          <div className="flex flex-wrap gap-2">
            {all.map((d) => (
              <Link
                key={d}
                href={`/motos?displacement=${d}`}
                className="bg-white border border-slate-200 hover:border-slate-400 text-slate-600 hover:text-slate-900 font-medium text-sm px-4 py-2 rounded-xl transition-all"
              >
                {d}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
