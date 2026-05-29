'use client';

import { useState } from 'react';
import Header from '@/components/layout/Header';
import { OLX_SEARCH_URLS } from '@/lib/olxScraper';

type ScrapeResult = { url: string; title: string; price: number; thumb: string; city: string };
type ImportResult = { url: string; status: 'ok' | 'error'; title?: string; error?: string };

export default function AdminImportPage() {
  const [phase, setPhase] = useState<'idle' | 'searching' | 'importing' | 'done'>('idle');
  const [manualUrls, setManualUrls] = useState('');
  const [found, setFound]           = useState<ScrapeResult[]>([]);
  const [selected, setSelected]     = useState<Set<string>>(new Set());
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const [statusMsg, setStatusMsg]   = useState('');

  // ── Step 1: Search OLX ────────────────────────────────────────────────────

  const handleSearch = async () => {
    setPhase('searching');
    setFound([]);
    setSelected(new Set());
    setStatusMsg('Buscando anúncios no OLX...');
    try {
      const res = await fetch('/api/admin/scrape-olx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ searchUrls: OLX_SEARCH_URLS }),
      });
      const data = await res.json() as { found: number; listings: ScrapeResult[] };
      if (data.listings?.length) {
        setFound(data.listings);
        setSelected(new Set(data.listings.map((l) => l.url)));
        setStatusMsg(`${data.listings.length} anúncios encontrados. Selecione os que deseja importar.`);
      } else {
        setStatusMsg('Nenhum anúncio encontrado (OLX pode estar bloqueando o scraper). Use importação manual.');
      }
    } catch {
      setStatusMsg('Erro ao buscar. Tente a importação manual.');
    }
    setPhase('idle');
  };

  // ── Step 2: Import selected / manual URLs ─────────────────────────────────

  const handleImport = async () => {
    const manualList = manualUrls
      .split('\n')
      .map((u) => u.trim())
      .filter((u) => u.startsWith('http'));

    const urlsToImport = [
      ...Array.from(selected),
      ...manualList,
    ];

    if (urlsToImport.length === 0) {
      setStatusMsg('Nenhuma URL selecionada ou inserida.');
      return;
    }

    setPhase('importing');
    setImportResults([]);
    setStatusMsg(`Importando ${urlsToImport.length} anúncios... (pode levar alguns minutos)`);

    try {
      const res = await fetch('/api/admin/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: urlsToImport }),
      });
      const data = await res.json() as { imported: number; errors: number; results: ImportResult[] };
      setImportResults(data.results ?? []);
      setStatusMsg(`✅ ${data.imported} importados com sucesso • ❌ ${data.errors} com erro`);
    } catch {
      setStatusMsg('Erro ao importar. Tente novamente.');
    }
    setPhase('done');
  };

  const toggleSelect = (url: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(url) ? next.delete(url) : next.add(url);
      return next;
    });
  };

  const selectAll   = () => setSelected(new Set(found.map((f) => f.url)));
  const deselectAll = () => setSelected(new Set());

  return (
    <>
      <Header />
      <main className="min-h-screen bg-slate-50">
        <div className="max-w-4xl mx-auto px-4 py-10">

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-black text-slate-900">🤖 Importação em Massa</h1>
            <p className="text-slate-500 mt-1">
              Busque anúncios no OLX automaticamente ou cole URLs manualmente para popular o marketplace.
            </p>
          </div>

          {/* Status */}
          {statusMsg && (
            <div className="mb-6 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 text-sm text-orange-800 font-medium">
              {statusMsg}
            </div>
          )}

          <div className="grid lg:grid-cols-2 gap-6">

            {/* ── Panel 1: Auto-search OLX ────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h2 className="text-lg font-black text-slate-900 mb-1">🔍 Busca Automática no OLX</h2>
              <p className="text-sm text-slate-500 mb-4">
                Varre {OLX_SEARCH_URLS.length} termos de busca (motos, equipamentos, peças)
                e lista os anúncios encontrados.
              </p>

              <button
                onClick={handleSearch}
                disabled={phase === 'searching' || phase === 'importing'}
                className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-slate-100 disabled:text-slate-400 text-white font-bold py-3 rounded-xl transition-colors"
              >
                {phase === 'searching' ? '⏳ Buscando...' : '🚀 Iniciar Varredura OLX'}
              </button>

              {found.length > 0 && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {found.length} encontrados • {selected.size} selecionados
                    </span>
                    <div className="flex gap-2">
                      <button onClick={selectAll} className="text-xs text-orange-500 hover:underline">Todos</button>
                      <button onClick={deselectAll} className="text-xs text-slate-400 hover:underline">Nenhum</button>
                    </div>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {found.map((item) => (
                      <label
                        key={item.url}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(item.url)}
                          onChange={() => toggleSelect(item.url)}
                          className="w-4 h-4 accent-orange-500 flex-shrink-0"
                        />
                        {item.thumb && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.thumb} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-800 truncate">{item.title || item.url}</p>
                          <p className="text-xs text-slate-500">
                            {item.price > 0 ? `R$ ${item.price.toLocaleString('pt-BR')}` : '—'}
                            {item.city ? ` • ${item.city}` : ''}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── Panel 2: Manual URLs ────────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h2 className="text-lg font-black text-slate-900 mb-1">📋 URLs Manuais</h2>
              <p className="text-sm text-slate-500 mb-4">
                Cole um URL por linha. Aceita OLX, Facebook Marketplace e outros.
              </p>
              <textarea
                value={manualUrls}
                onChange={(e) => setManualUrls(e.target.value)}
                placeholder={`https://www.olx.com.br/item/ktm-300-exc-...\nhttps://www.olx.com.br/item/gas-gas-mc65-...\nhttps://facebook.com/marketplace/item/...`}
                rows={10}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 placeholder-slate-300 focus:outline-none focus:border-orange-400 resize-none font-mono"
              />
              <p className="text-xs text-slate-400 mt-1">
                {manualUrls.split('\n').filter((u) => u.trim().startsWith('http')).length} URLs válidas coladas
              </p>
            </div>
          </div>

          {/* ── Import Button ─────────────────────────────────────────────── */}
          <div className="mt-6">
            <button
              onClick={handleImport}
              disabled={phase === 'searching' || phase === 'importing'}
              className="w-full bg-slate-900 hover:bg-slate-800 disabled:bg-slate-100 disabled:text-slate-400 text-white font-black text-lg py-4 rounded-2xl transition-colors"
            >
              {phase === 'importing'
                ? '⏳ Importando... aguarde'
                : `📥 Importar ${selected.size + manualUrls.split('\n').filter((u) => u.trim().startsWith('http')).length} anúncios`}
            </button>
            <p className="text-center text-xs text-slate-400 mt-2">
              Os anúncios serão cadastrados automaticamente como usuário <strong>Mercadão MX</strong>
            </p>
          </div>

          {/* ── Results ───────────────────────────────────────────────────── */}
          {importResults.length > 0 && (
            <div className="mt-8">
              <h2 className="text-lg font-black text-slate-900 mb-4">Resultado da Importação</h2>
              <div className="space-y-2">
                {importResults.map((r, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-3 p-3 rounded-xl text-sm ${
                      r.status === 'ok'
                        ? 'bg-green-50 border border-green-200'
                        : 'bg-red-50 border border-red-200'
                    }`}
                  >
                    <span className="flex-shrink-0">{r.status === 'ok' ? '✅' : '❌'}</span>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 truncate">
                        {r.title ?? r.url}
                      </p>
                      {r.error && <p className="text-red-600 text-xs mt-0.5">{r.error}</p>}
                      <p className="text-slate-400 text-xs truncate">{r.url}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Tips ──────────────────────────────────────────────────────── */}
          <div className="mt-10 bg-blue-50 border border-blue-200 rounded-2xl p-5">
            <h3 className="font-black text-blue-900 mb-2">💡 Estratégia de conteúdo</h3>
            <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
              <li>Rode a varredura semanalmente para manter o catálogo atualizado</li>
              <li>Se o OLX bloquear, cole as URLs manualmente (copie da busca do OLX)</li>
              <li>Cada anúncio importado fica como <strong>Mercadão MX</strong> com link de origem</li>
              <li>Facebook Marketplace: cole os URLs da busca manualmente</li>
              <li>Meta: 200+ anúncios dão sensação de plataforma ativa</li>
            </ul>
          </div>

        </div>
      </main>
    </>
  );
}
