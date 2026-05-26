import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import MobileBottomNav from '@/components/layout/MobileBottomNav';
import ImportListingWizard from '@/components/import/ImportListingWizard';

export default function ImportarPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen">
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 py-10">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 text-center">
            <div className="inline-flex items-center gap-2 bg-orange-500/20 border border-orange-500/30 text-orange-400 text-sm font-semibold px-4 py-1.5 rounded-full mb-4">
              <span className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse" />
              Mercadão MX · Importador Automático
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-white mb-3">
              Importar anúncio
            </h1>
            <p className="text-slate-400 text-base leading-relaxed">
              Cole o link de um anúncio do OLX ou Facebook Marketplace.<br />
              A IA extrai os dados automaticamente e publica aqui.
            </p>
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 pb-24 md:pb-8">
          <ImportListingWizard />
        </div>
      </main>
      <Footer />
      <MobileBottomNav />
    </>
  );
}
