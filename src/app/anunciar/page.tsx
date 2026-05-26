import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import MobileBottomNav from '@/components/layout/MobileBottomNav';
import CreateListingWizard from '@/components/create-listing/CreateListingWizard';
import ListingChatWizard from '@/components/create-listing/ListingChatWizard';

interface Props {
  searchParams: Promise<{ mode?: string }>;
}

export default async function AnunciarPage({ searchParams }: Props) {
  const { mode } = await searchParams;
  const isChat = mode === 'chat';

  return (
    <>
      <Header />
      <main className="min-h-screen">
        <div className="bg-white border-b border-slate-200 py-8">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 text-center">
            <h1 className="text-3xl font-black text-slate-900 mb-2">
              {isChat ? '🤖 Cadastro via Chat' : 'Anunciar minha moto'}
            </h1>
            <p className="text-slate-500">
              {isChat
                ? 'Responda as perguntas do MotoBot e o anúncio é criado automaticamente.'
                : 'Cadastre sua moto em poucos minutos e comece a receber propostas.'}
            </p>
            {/* Mode switch */}
            <div className="flex items-center justify-center gap-2 mt-4">
              <a
                href="/anunciar?mode=chat"
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                  isChat
                    ? 'bg-orange-500 text-white border-orange-500'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-orange-300'
                }`}
              >
                🤖 Via Chat
              </a>
              <a
                href="/anunciar?mode=manual"
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                  !isChat
                    ? 'bg-orange-500 text-white border-orange-500'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-orange-300'
                }`}
              >
                📝 Manual
              </a>
            </div>
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 pb-24 md:pb-8">
          {isChat ? <ListingChatWizard /> : <CreateListingWizard />}
        </div>
      </main>
      <Footer />
      <MobileBottomNav />
    </>
  );
}
