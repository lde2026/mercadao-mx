import Link from 'next/link';

export default function HomeCTA() {
  return (
    <section className="py-20 bg-slate-50 border-t border-slate-200">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div className="inline-flex items-center gap-2 bg-orange-50 border border-orange-200 text-orange-600 text-sm font-medium px-4 py-1.5 rounded-full mb-6">
          Venda para quem realmente entende de MX
        </div>
        <h2 className="text-4xl sm:text-5xl font-black text-slate-900 leading-tight mb-5">
          Sua moto merece
          <br />
          <span className="text-orange-500">um comprador certo.</span>
        </h2>
        <p className="text-slate-500 text-lg mb-10 max-w-xl mx-auto">
          Anuncie sua moto em poucos minutos e negocie direto com compradores interessados.
          Sem intermediários, sem complicação.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/anunciar"
            className="flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-black text-base px-8 py-4 rounded-2xl shadow-lg shadow-orange-500/25 transition-all hover:scale-105"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            Anunciar minha moto
          </Link>
          <Link
            href="/motos"
            className="flex items-center justify-center bg-white hover:bg-slate-50 text-slate-900 font-bold text-base px-8 py-4 rounded-2xl border border-slate-200 hover:border-slate-300 transition-all shadow-sm"
          >
            Ver motos disponíveis
          </Link>
        </div>
      </div>
    </section>
  );
}
