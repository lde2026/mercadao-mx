'use client';

import { useState } from 'react';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import MobileBottomNav from '@/components/layout/MobileBottomNav';

export default function ContatoPage() {
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSent(true);
  };

  return (
    <>
      <Header />
      <main className="min-h-screen bg-white">
        <div className="bg-white border-b border-slate-200 py-10">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 text-center">
            <h1 className="text-3xl font-black text-slate-900 mb-2">Fale com a gente</h1>
            <p className="text-slate-500">Dúvidas, sugestões ou problemas? Estamos aqui para ajudar.</p>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 pb-24 md:pb-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {/* Contact info */}
            <div className="space-y-6">
              <div>
                <h2 className="text-base font-black text-slate-900 mb-4">Contato direto</h2>
                <a
                  href="mailto:contato@mercadaomx.com.br"
                  className="flex items-center gap-3 text-sm text-slate-600 hover:text-orange-500 transition-colors group"
                >
                  <span className="w-9 h-9 bg-orange-50 group-hover:bg-orange-100 rounded-xl flex items-center justify-center transition-colors">
                    <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </span>
                  contato@mercadaomx.com.br
                </a>
              </div>

              <div>
                <h2 className="text-base font-black text-slate-900 mb-4">Horário de atendimento</h2>
                <p className="text-sm text-slate-500">Segunda a Sexta<br />9h – 18h</p>
              </div>

              <div>
                <h2 className="text-base font-black text-slate-900 mb-4">Loja oficial</h2>
                <a
                  href="https://www.lojadoecomerce.com.br"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-orange-500 hover:text-orange-600 font-semibold transition-colors"
                >
                  lojadoecomerce.com.br
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            </div>

            {/* Form */}
            <div className="md:col-span-2">
              {sent ? (
                <div className="text-center py-16">
                  <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-black text-slate-900 mb-2">Mensagem enviada!</h3>
                  <p className="text-slate-500 text-sm">Retornaremos em até 24h no e-mail informado.</p>
                  <button
                    onClick={() => { setSent(false); setForm({ name: '', email: '', subject: '', message: '' }); }}
                    className="mt-6 text-sm text-orange-500 hover:text-orange-600 font-semibold"
                  >
                    Enviar outra mensagem
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">Nome</label>
                      <input
                        type="text"
                        required
                        value={form.name}
                        onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                        placeholder="Seu nome"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-orange-500 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">E-mail</label>
                      <input
                        type="email"
                        required
                        value={form.email}
                        onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                        placeholder="seu@email.com"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-orange-500 transition-colors"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Assunto</label>
                    <input
                      type="text"
                      required
                      value={form.subject}
                      onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
                      placeholder="Como podemos ajudar?"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-orange-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Mensagem</label>
                    <textarea
                      required
                      rows={5}
                      value={form.message}
                      onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))}
                      placeholder="Descreva sua dúvida ou sugestão..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-orange-500 transition-colors resize-none"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black py-3.5 rounded-xl transition-colors shadow-sm shadow-orange-500/20"
                  >
                    Enviar mensagem
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </main>
      <Footer />
      <MobileBottomNav />
    </>
  );
}
