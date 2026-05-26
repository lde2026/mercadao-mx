import Link from 'next/link';

const STEPS = [
  {
    number: '01',
    title: 'Cadastre sua moto',
    description: 'Preencha as informações da moto em 4 passos simples e adicione fotos de qualidade.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    number: '02',
    title: 'Receba mensagens',
    description: 'Compradores interessados entram em contato diretamente pelo chat da plataforma.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
  },
  {
    number: '03',
    title: 'Negocie direto',
    description: 'Converse com o comprador, combine os detalhes e feche o negócio no seu ritmo.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
      </svg>
    ),
  },
  {
    number: '04',
    title: 'Marque como vendida',
    description: 'Quando a venda for concluída, marque a moto como vendida com um clique.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

export default function HowItWorks() {
  return (
    <section className="py-20 bg-white border-y border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <p className="text-orange-500 text-sm font-semibold uppercase tracking-wider mb-2">
            Como funciona
          </p>
          <h2 className="text-3xl sm:text-4xl font-black text-slate-900 mb-4">
            Simples do início ao fim
          </h2>
          <p className="text-slate-500 max-w-xl mx-auto">
            Cadastre sua moto em poucos minutos e comece a receber contatos de compradores sérios.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {STEPS.map((step, idx) => (
            <div key={step.number} className="relative">
              {idx < STEPS.length - 1 && (
                <div className="hidden lg:block absolute top-8 left-full w-full h-px bg-gradient-to-r from-orange-300 to-transparent z-0" />
              )}
              <div className="relative bg-slate-50 border border-slate-200 rounded-2xl p-6 hover:border-orange-300 hover:shadow-md transition-all">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-orange-50 border border-orange-200 rounded-xl flex items-center justify-center text-orange-500">
                    {step.icon}
                  </div>
                  <span className="text-4xl font-black text-slate-200">{step.number}</span>
                </div>
                <h3 className="text-slate-900 font-bold text-base mb-2">{step.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{step.description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center">
          <Link
            href="/anunciar"
            className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-black text-base px-8 py-4 rounded-2xl shadow-lg shadow-orange-500/20 transition-all hover:scale-105"
          >
            Anuncie sua moto em poucos minutos
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}
