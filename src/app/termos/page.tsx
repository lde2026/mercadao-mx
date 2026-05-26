import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import MobileBottomNav from '@/components/layout/MobileBottomNav';

export default function TermosPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 pb-24 md:pb-12">
          <h1 className="text-3xl font-black text-slate-900 mb-2">Termos de Uso</h1>
          <p className="text-slate-400 text-sm mb-8">Última atualização: maio de 2026</p>
          <div className="prose prose-slate max-w-none text-sm leading-relaxed space-y-6 text-slate-600">
            <section>
              <h2 className="text-lg font-black text-slate-900 mb-2">1. Aceitação dos Termos</h2>
              <p>Ao acessar e usar o Mercadão MX, você concorda com estes Termos de Uso. Se não concordar, não utilize a plataforma.</p>
            </section>
            <section>
              <h2 className="text-lg font-black text-slate-900 mb-2">2. Sobre a Plataforma</h2>
              <p>O Mercadão MX é um marketplace de anúncios de motos off-road. Atuamos como intermediários entre compradores e vendedores, sem participar das transações financeiras.</p>
            </section>
            <section>
              <h2 className="text-lg font-black text-slate-900 mb-2">3. Cadastro e Conta</h2>
              <p>Para anunciar, você deve criar uma conta com informações verídicas. Você é responsável pela segurança da sua conta e de todas as ações realizadas com ela.</p>
            </section>
            <section>
              <h2 className="text-lg font-black text-slate-900 mb-2">4. Anúncios</h2>
              <p>Os anúncios devem ser precisos e verazes. Não são permitidos anúncios de itens ilegais, roubados ou com informações falsas. Reservamos o direito de remover qualquer anúncio que viole estas diretrizes.</p>
            </section>
            <section>
              <h2 className="text-lg font-black text-slate-900 mb-2">5. Responsabilidade</h2>
              <p>O Mercadão MX não se responsabiliza pela qualidade, legalidade ou veracidade dos anúncios, nem pelas transações realizadas entre usuários. Recomendamos sempre verificar o veículo pessoalmente antes de qualquer negociação.</p>
            </section>
            <section>
              <h2 className="text-lg font-black text-slate-900 mb-2">6. Contato</h2>
              <p>Dúvidas sobre estes Termos? Entre em contato: <a href="mailto:contato@mercadaomx.com.br" className="text-orange-500 hover:underline">contato@mercadaomx.com.br</a></p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
      <MobileBottomNav />
    </>
  );
}
