import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import MobileBottomNav from '@/components/layout/MobileBottomNav';

export default function PrivacidadePage() {
  return (
    <>
      <Header />
      <main className="min-h-screen bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 pb-24 md:pb-12">
          <h1 className="text-3xl font-black text-slate-900 mb-2">Política de Privacidade</h1>
          <p className="text-slate-400 text-sm mb-8">Última atualização: maio de 2026</p>
          <div className="prose prose-slate max-w-none text-sm leading-relaxed space-y-6 text-slate-600">
            <section>
              <h2 className="text-lg font-black text-slate-900 mb-2">1. Dados Coletados</h2>
              <p>Coletamos: nome, e-mail, telefone e informações dos anúncios que você publica. Também coletamos dados de uso da plataforma para melhorar a experiência.</p>
            </section>
            <section>
              <h2 className="text-lg font-black text-slate-900 mb-2">2. Uso dos Dados</h2>
              <p>Seus dados são usados para: operar sua conta, exibir seus anúncios, enviar notificações relevantes e melhorar a plataforma. Não vendemos seus dados a terceiros.</p>
            </section>
            <section>
              <h2 className="text-lg font-black text-slate-900 mb-2">3. Compartilhamento</h2>
              <p>Dados de contato (telefone, e-mail) são compartilhados com outros usuários apenas quando você demonstra interesse em um anúncio ou recebe uma proposta.</p>
            </section>
            <section>
              <h2 className="text-lg font-black text-slate-900 mb-2">4. Segurança</h2>
              <p>Adotamos medidas técnicas para proteger seus dados. Senhas são armazenadas com criptografia. Recomendamos usar uma senha forte e única.</p>
            </section>
            <section>
              <h2 className="text-lg font-black text-slate-900 mb-2">5. Seus Direitos (LGPD)</h2>
              <p>Você pode solicitar acesso, correção ou exclusão dos seus dados a qualquer momento pelo e-mail <a href="mailto:contato@mercadaomx.com.br" className="text-orange-500 hover:underline">contato@mercadaomx.com.br</a>.</p>
            </section>
            <section>
              <h2 className="text-lg font-black text-slate-900 mb-2">6. Cookies</h2>
              <p>Usamos cookies essenciais para manter sua sessão ativa e preferências salvas. Não usamos cookies de rastreamento de terceiros.</p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
      <MobileBottomNav />
    </>
  );
}
