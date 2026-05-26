'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function AnunciarModal({ isOpen, onClose }: Props) {
  const router = useRouter();

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  const go = (path: string) => { onClose(); router.push(path); };

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-sm mx-0 sm:mx-4 p-6 shadow-2xl animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-6 sm:hidden" />
        <h2 className="text-xl font-black text-slate-900 text-center mb-1">Cadastrar anúncio</h2>
        <p className="text-slate-500 text-sm text-center mb-6">Como você prefere cadastrar?</p>

        <div className="space-y-3">
          {/* Chat com IA */}
          <button
            onClick={() => go('/anunciar?mode=chat')}
            className="w-full flex items-center gap-4 bg-orange-50 border-2 border-orange-200 hover:border-orange-500 hover:bg-orange-100 rounded-2xl p-4 transition-all text-left group"
          >
            <div className="w-14 h-14 bg-orange-500 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-orange-500/30 group-hover:scale-105 transition-transform">
              <span className="text-3xl">🤖</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-slate-900">CHAT</p>
              <p className="text-xs text-slate-500 mt-0.5">Responda perguntas e a IA monta o anúncio automaticamente</p>
            </div>
            <ChevronIcon />
          </button>

          {/* Manual */}
          <button
            onClick={() => go('/anunciar?mode=manual')}
            className="w-full flex items-center gap-4 bg-slate-50 border-2 border-slate-200 hover:border-slate-400 hover:bg-slate-100 rounded-2xl p-4 transition-all text-left group"
          >
            <div className="w-14 h-14 bg-slate-800 rounded-2xl flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
              <span className="text-3xl">📝</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-slate-900">MANUAL</p>
              <p className="text-xs text-slate-500 mt-0.5">Preencha os campos do formulário passo a passo</p>
            </div>
            <ChevronIcon />
          </button>

          {/* Importar */}
          <button
            onClick={() => go('/importar')}
            className="w-full flex items-center gap-4 bg-amber-50 border-2 border-amber-200 hover:border-amber-500 hover:bg-amber-100 rounded-2xl p-4 transition-all text-left group"
          >
            <div className="w-14 h-14 bg-amber-500 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-amber-500/30 group-hover:scale-105 transition-transform">
              <span className="text-3xl">🔗</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-slate-900">IMPORTAR</p>
              <p className="text-xs text-slate-500 mt-0.5">Cole o link de OLX, Facebook ou outra plataforma</p>
            </div>
            <ChevronIcon />
          </button>
        </div>

        <button onClick={onClose} className="mt-4 w-full text-center text-sm text-slate-400 hover:text-slate-600 transition-colors py-2">
          Cancelar
        </button>
      </div>
    </div>
  );
}

function ChevronIcon() {
  return (
    <svg className="w-5 h-5 text-slate-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}
