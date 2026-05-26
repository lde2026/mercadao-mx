'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { USE_SUPABASE, getSupabase } from '@/lib/supabase';

export default function CadastroPage() {
  const router = useRouter();
  const { login } = useApp();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    setLoading(true);

    if (USE_SUPABASE) {
      const sb = getSupabase();
      if (!sb) { setLoading(false); return; }
      const { error: authError } = await sb.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: { full_name: form.name, phone: form.phone },
        },
      });
      if (authError) {
        setError(authError.message === 'User already registered'
          ? 'Este e-mail já está cadastrado. Tente fazer login.'
          : authError.message);
        setLoading(false);
        return;
      }
      // onAuthStateChange in AppContext handles state update
      router.push('/dashboard');
      return;
    }

    // ── Mock mode ──
    await new Promise((r) => setTimeout(r, 800));
    login({
      name: form.name,
      email: form.email,
      provider: 'email',
    });
    await new Promise((r) => setTimeout(r, 80));
    setLoading(false);
    router.push('/dashboard');
  };

  const handleGoogle = async () => {
    setLoading(true);

    if (USE_SUPABASE) {
      const sb = getSupabase();
      if (!sb) { setLoading(false); return; }
      await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      return;
    }

    // ── Mock mode ──
    await new Promise((r) => setTimeout(r, 600));
    login({
      name: 'Usuário Google',
      email: 'usuario@gmail.com',
      provider: 'google',
    });
    await new Promise((r) => setTimeout(r, 80));
    setLoading(false);
    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Link href="/">
            <Image src="/logo.png" alt="Mercadão MX" width={200} height={113} className="h-[73px] w-auto" />
          </Link>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          <h1 className="text-2xl font-black text-slate-900 mb-1">Criar conta</h1>
          <p className="text-slate-500 text-sm mb-6">Grátis. Compre e venda motos off-road.</p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3 mb-4">
              {error}
            </div>
          )}

          {/* Google */}
          <button
            onClick={handleGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-60 text-slate-700 font-semibold text-sm py-3 rounded-xl transition-colors mb-4"
          >
            <svg className="w-4 h-4" viewBox="0 0 48 48" fill="none">
              <path d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z" fill="#FFC107"/>
              <path d="M6.3 14.7l7 5.1C15.1 16 19.2 13 24 13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 16.3 2 9.6 7.3 6.3 14.7z" fill="#FF3D00"/>
              <path d="M24 46c5.5 0 10.5-1.9 14.3-5.1l-6.6-5.6C29.7 36.9 27 38 24 38c-6 0-10.7-3.2-11.8-7.5l-6.9 5.3C8.7 41.4 15.8 46 24 46z" fill="#4CAF50"/>
              <path d="M44.5 20H24v8.5h11.8c-.6 2.7-2.3 5-4.6 6.5l6.6 5.6C41.2 37.8 44.5 31.5 44.5 24c0-1.3-.2-2.7-.5-4z" fill="#1976D2"/>
            </svg>
            Cadastrar com Google
          </button>

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-xs text-slate-400">ou com e-mail</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Nome completo</label>
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
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">WhatsApp <span className="text-slate-400 font-normal">(opcional)</span></label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                placeholder="(00) 00000-0000"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-orange-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Senha</label>
              <input
                type="password"
                required
                minLength={6}
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                placeholder="Mín. 6 caracteres"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-orange-500 transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-black py-3.5 rounded-xl transition-colors mt-2"
            >
              {loading ? 'Criando conta...' : 'Criar conta grátis'}
            </button>
          </form>

          <p className="text-center text-xs text-slate-400 mt-4">
            Ao criar conta você concorda com os{' '}
            <Link href="/termos" className="text-slate-500 hover:text-orange-500 underline">Termos de Uso</Link>
            {' '}e a{' '}
            <Link href="/privacidade" className="text-slate-500 hover:text-orange-500 underline">Política de Privacidade</Link>
          </p>
        </div>

        <p className="text-center text-sm text-slate-500 mt-6">
          Já tem conta?{' '}
          <Link href="/login" className="text-orange-500 hover:text-orange-600 font-semibold">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}
