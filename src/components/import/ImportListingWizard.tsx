'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { formatCurrency } from '@/lib/utils';
import { useApp } from '@/context/AppContext';
import { CURRENT_USER } from '@/data/mockData';
import type { MotoListing } from '@/types';

type ImportStep = 'url' | 'loading' | 'preview' | 'success';

type ExtractedData = {
  title: string;
  brand: string;
  model: string;
  year: number;
  displacement: string;
  engineType: string;
  category: string;
  price: number;
  city: string;
  state: string;
  description: string;
  condition: string;
  documentation: string;
  acceptsTrade: boolean;
  acceptsProposals: boolean;
  platform: 'olx' | 'facebook' | 'icarros' | 'other';
  confidence: 'high' | 'medium' | 'low';
  sourceUrl: string;
  sourcePlatform: string;
  source: 'imported';
};

const PLATFORM_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  olx: { label: 'OLX', color: 'bg-purple-100 text-purple-700 border-purple-200', icon: '🛒' },
  facebook: { label: 'Facebook Marketplace', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: '📘' },
  icarros: { label: 'iCarros', color: 'bg-green-100 text-green-700 border-green-200', icon: '🚗' },
  other: { label: 'Outra plataforma', color: 'bg-slate-100 text-slate-700 border-slate-200', icon: '🔗' },
};

const CONFIDENCE_LABELS = {
  high: { label: 'Alta confiança', color: 'text-green-600', icon: '✅' },
  medium: { label: 'Confiança média', color: 'text-yellow-600', icon: '⚠️' },
  low: { label: 'Baixa confiança — revise os dados', color: 'text-orange-600', icon: '⚠️' },
};

export default function ImportListingWizard() {
  const router = useRouter();
  const { addListing } = useApp();
  const [step, setStep] = useState<ImportStep>('url');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [data, setData] = useState<ExtractedData | null>(null);
  const [editableData, setEditableData] = useState<ExtractedData | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleImport = async () => {
    if (!url.trim()) return;
    setError('');
    setStep('loading');

    try {
      const res = await fetch('/api/import-listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        setError(json.error ?? 'Erro ao importar anúncio');
        setStep('url');
        return;
      }

      setData(json.data);
      setEditableData({ ...json.data });
      setStep('preview');
    } catch {
      setError('Falha na conexão. Tente novamente.');
      setStep('url');
    }
  };

  const handlePublish = () => {
    if (!editableData) return;
    const d = editableData;
    const now = new Date().toISOString();
    const newListing: MotoListing = {
      id: `listing-import-${Date.now()}`,
      userId: CURRENT_USER.id,
      productType: 'moto',
      title: d.title,
      description: d.description,
      brand: d.brand as MotoListing['brand'],
      model: d.model,
      year: d.year,
      displacement: d.displacement as MotoListing['displacement'],
      engineType: d.engineType as MotoListing['engineType'],
      category: d.category as MotoListing['category'],
      price: d.price,
      acceptsTrade: d.acceptsTrade,
      acceptsProposals: d.acceptsProposals,
      city: d.city,
      state: d.state,
      documentation: d.documentation,
      condition: d.condition,
      status: 'active',
      photos: ['/placeholder-moto.svg'],
      mainPhoto: '/placeholder-moto.svg',
      views: 0,
      featured: false,
      source: 'imported',
      sourceUrl: d.sourceUrl,
      sourcePlatform: d.sourcePlatform as MotoListing['sourcePlatform'],
      createdAt: now,
      updatedAt: now,
    };
    addListing(newListing);
    setStep('success');
    setTimeout(() => router.push('/motos'), 3000);
  };

  const updateField = (field: keyof ExtractedData, value: unknown) => {
    setEditableData((prev) => prev ? { ...prev, [field]: value } : prev);
  };

  // ── LOADING ──
  if (step === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-6">
        <div className="relative">
          <div className="w-20 h-20 rounded-full border-4 border-orange-100 border-t-orange-500 animate-spin" />
          <span className="absolute inset-0 flex items-center justify-center text-2xl">🤖</span>
        </div>
        <div className="text-center">
          <p className="font-black text-slate-900 text-lg mb-1">Analisando anúncio...</p>
          <p className="text-slate-500 text-sm">A IA está extraindo os dados da plataforma de origem</p>
        </div>
        <div className="flex flex-col gap-2 w-full max-w-xs">
          {['Acessando a URL...', 'Identificando dados da moto...', 'Montando o anúncio...'].map((msg, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-slate-400">
              <span className="w-4 h-4 bg-orange-100 rounded-full flex items-center justify-center text-xs">
                {i + 1}
              </span>
              {msg}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── SUCCESS ──
  if (step === 'success') {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
        <div className="w-20 h-20 bg-green-50 border border-green-200 rounded-full flex items-center justify-center">
          <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-black text-slate-900">Anúncio publicado! 🎉</h2>
        <p className="text-slate-500">O anúncio foi importado e publicado como Mercadão MX.</p>
        <p className="text-slate-400 text-sm">Redirecionando para os anúncios...</p>
      </div>
    );
  }

  // ── PREVIEW ──
  if (step === 'preview' && editableData) {
    const platform = PLATFORM_LABELS[editableData.platform] ?? PLATFORM_LABELS.other;
    const conf = CONFIDENCE_LABELS[editableData.confidence];

    return (
      <div className="space-y-5">
        {/* Header badges */}
        <div className="flex flex-wrap gap-2">
          <span className={`inline-flex items-center gap-1.5 border text-xs font-semibold px-3 py-1 rounded-full ${platform.color}`}>
            {platform.icon} Importado do {platform.label}
          </span>
          <span className={`text-xs font-semibold ${conf.color}`}>
            {conf.icon} {conf.label}
          </span>
        </div>

        {/* Imported listing banner preview */}
        <div className="bg-amber-50 border-2 border-amber-400 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🔗</span>
            <span className="font-black text-amber-800 text-sm uppercase tracking-wide">Anúncio de outra plataforma</span>
          </div>
          <p className="text-amber-700 text-xs leading-relaxed">
            Este anúncio foi importado automaticamente do {platform.label}. O Mercadão MX não é responsável pelo anúncio original.
          </p>
          <a
            href={editableData.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800 font-semibold mt-2 underline underline-offset-2"
          >
            Ver anúncio original →
          </a>
        </div>

        {/* Editable fields */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
          <h3 className="font-black text-slate-900">📋 Dados extraídos — revise e confirme</h3>

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Título</label>
            <input
              value={editableData.title}
              onChange={(e) => updateField('title', e.target.value)}
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-orange-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Marca</label>
              <input value={editableData.brand} onChange={(e) => updateField('brand', e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-orange-500" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Modelo</label>
              <input value={editableData.model} onChange={(e) => updateField('model', e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-orange-500" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Ano</label>
              <input type="number" value={editableData.year} onChange={(e) => updateField('year', Number(e.target.value))}
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-orange-500" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Cilindrada</label>
              <input value={editableData.displacement} onChange={(e) => updateField('displacement', e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-orange-500" />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Preço</label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-semibold">R$</span>
              <input
                type="number"
                value={editableData.price}
                onChange={(e) => updateField('price', Number(e.target.value))}
                className="w-full pl-9 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-orange-500 font-bold"
              />
            </div>
            <p className="text-orange-500 font-black text-lg mt-1">{formatCurrency(editableData.price)}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Cidade</label>
              <input value={editableData.city} onChange={(e) => updateField('city', e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-orange-500" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Estado</label>
              <input value={editableData.state} onChange={(e) => updateField('state', e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-orange-500" />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Descrição</label>
            <textarea
              value={editableData.description}
              onChange={(e) => updateField('description', e.target.value)}
              rows={4}
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-orange-500 resize-none"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <button
            onClick={handlePublish}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black py-4 rounded-2xl transition-all hover:shadow-lg hover:shadow-orange-500/25 text-base"
          >
            🚀 Publicar como Mercadão MX
          </button>
          <button
            onClick={() => { setStep('url'); setData(null); setEditableData(null); }}
            className="w-full text-slate-400 hover:text-slate-600 text-sm py-2 transition-colors"
          >
            Cancelar e importar outro
          </button>
        </div>
      </div>
    );
  }

  // ── URL INPUT ──
  return (
    <div className="space-y-6">
      {/* URL input */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <label className="block text-sm font-semibold text-slate-700 mb-3">
          Cole o link do anúncio
        </label>
        <input
          ref={inputRef}
          type="url"
          value={url}
          onChange={(e) => { setUrl(e.target.value); setError(''); }}
          onKeyDown={(e) => e.key === 'Enter' && handleImport()}
          placeholder="https://..."
          className={`w-full border-2 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none transition-colors ${
            error ? 'border-red-300 focus:border-red-400' : 'border-slate-200 focus:border-orange-500'
          }`}
          autoFocus
        />
        {error && (
          <p className="text-red-500 text-xs mt-2 flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {error}
          </p>
        )}
        <p className="text-slate-400 text-xs mt-2">
          Cole a URL completa do anúncio (começa com https://)
        </p>
      </div>

      <button
        onClick={handleImport}
        disabled={!url.trim()}
        className="w-full bg-slate-900 hover:bg-slate-700 disabled:bg-slate-100 disabled:text-slate-400 text-white font-black py-4 rounded-2xl transition-all text-base flex items-center justify-center gap-2"
      >
        <span className="text-xl">🤖</span>
        Importar com IA
      </button>

      {/* How it works */}
      <div className="bg-slate-50 rounded-2xl p-4 space-y-2">
        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-3">Como funciona</p>
        {[
          'Cole o link do anúncio (a plataforma é detectada automaticamente pela URL)',
          'A IA extrai marca, modelo, ano, preço e localização',
          'Revise os dados e publique com 1 clique',
          'O anúncio aparece com o badge "Outra plataforma" e link para o original',
        ].map((item, i) => (
          <div key={i} className="flex items-start gap-2 text-xs text-slate-500">
            <span className="w-5 h-5 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center font-bold flex-shrink-0 text-[10px]">
              {i + 1}
            </span>
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}
