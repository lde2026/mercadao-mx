'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import type { BotMessage, MotoListing } from '@/types';
import { formatCurrency } from '@/lib/utils';
import { useApp } from '@/context/AppContext';
import { USE_SUPABASE } from '@/lib/supabase';
import { CURRENT_USER } from '@/data/mockData';

const REQUIRED_FIELDS_MOTO = ['brand', 'model', 'year', 'displacement', 'engineType', 'category', 'price', 'city', 'state'];
const REQUIRED_FIELDS_PECA = ['title', 'price', 'city', 'state'];
const REQUIRED_FIELDS_EQUIPAMENTO = ['title', 'price', 'city', 'state'];

function getRequiredFields(productType?: string): string[] {
  if (productType === 'peca') return REQUIRED_FIELDS_PECA;
  if (productType === 'equipamento') return REQUIRED_FIELDS_EQUIPAMENTO;
  if (productType === 'moto') return REQUIRED_FIELDS_MOTO;
  return ['productType']; // Step 1: must identify type first
}

const FIRST_MESSAGE: BotMessage = {
  id: 'bot-0',
  role: 'assistant',
  content: '👋 Olá! Sou o MotoBot do Mercadão MX e vou te ajudar a cadastrar seu anúncio.\n\nO que você vai anunciar? 🏍️ **Moto**, 🔧 **Peça** ou 🪖 **Equipamento**?',
  createdAt: new Date().toISOString(),
};

export default function ListingChatWizard() {
  const router = useRouter();
  const { addListing, uploadPhoto, authUser } = useApp();
  const [messages, setMessages] = useState<BotMessage[]>([FIRST_MESSAGE]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [collectedData, setCollectedData] = useState<Record<string, unknown>>({});
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [listingData, setListingData] = useState<Record<string, unknown> | null>(null);
  const [published, setPublished] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  const getMissingFields = useCallback((data: Record<string, unknown>) => {
    const required = getRequiredFields(data.productType as string | undefined);
    return required.filter((f) => !data[f]);
  }, []);

  const sendMessage = useCallback(async (userText: string) => {
    if (!userText.trim() || loading) return;

    const userMsg: BotMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: userText,
      createdAt: new Date().toISOString(),
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/listing-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
          collectedData,
          missingFields: getMissingFields(collectedData),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Erro na API');
      }

      const botMsg: BotMessage = {
        id: `bot-${Date.now()}`,
        role: 'assistant',
        content: data.isComplete
          ? '✅ Perfeito! Coletei todas as informações. Adicione fotos se quiser (opcional) e clique em **Publicar anúncio**!'
          : (data.text || '⚠️ Ops, tive um problema. Pode repetir?'),
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, botMsg]);

      if (data.isComplete && data.listingData) {
        setIsComplete(true);
        setListingData(data.listingData);
        setCollectedData(data.listingData);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: '⚠️ Ops, tive um problema. Pode repetir?',
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [loading, messages, collectedData, getMissingFields]);

  const handlePhotoAdd = (files: FileList | null) => {
    if (!files) return;
    const newFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
    // Crop quadrada via canvas
    newFiles.forEach((file) => {
      cropSquare(file, (croppedUrl, croppedFile) => {
        setPhotos((p) => [...p, croppedFile]);
        setPhotoUrls((p) => [...p, croppedUrl]);
      });
    });
  };

  const handlePublish = async () => {
    if (!listingData) return;
    const d = listingData as Record<string, unknown>;
    const now = new Date().toISOString();
    const productType = (d.productType as MotoListing['productType']) ?? 'moto';

    // Title: use explicit title for peca/equipamento, build from brand+model+year for moto
    const title =
      productType === 'moto'
        ? `${String(d.brand)} ${String(d.model)} ${String(d.year)}`
        : String(d.title ?? `${String(d.brand ?? '')} ${String(d.model ?? '')}`.trim());

    // Upload photos to Supabase Storage (or keep blob URLs in mock mode)
    let finalPhotoUrls = photoUrls;
    if (USE_SUPABASE && photos.length > 0) {
      try {
        finalPhotoUrls = await Promise.all(photos.map((f) => uploadPhoto(f)));
      } catch (err) {
        console.error('Photo upload error:', err);
        // Continue with blob URLs as fallback
      }
    }

    const newListing: MotoListing = {
      id: `listing-${Date.now()}`,
      userId: authUser?.id ?? CURRENT_USER.id,
      productType,
      title,
      description: String(d.description ?? ''),
      brand: (d.brand as MotoListing['brand']) ?? 'Outra',
      model: String(d.model ?? ''),
      year: Number(d.year ?? new Date().getFullYear()),
      displacement: (d.displacement as MotoListing['displacement']) ?? '250cc',
      engineType: (d.engineType as MotoListing['engineType']) ?? 'four_stroke',
      category: (d.category as MotoListing['category']) ?? 'motocross',
      price: Number(d.price ?? 0),
      acceptsTrade: Boolean(d.acceptsTrade),
      acceptsProposals: Boolean(d.acceptsProposals ?? true),
      city: String(d.city ?? ''),
      state: String(d.state ?? ''),
      documentation: String(d.documentation ?? 'Sem documento'),
      condition: String(d.condition ?? 'Seminovo'),
      status: 'active',
      photos: finalPhotoUrls.length > 0 ? finalPhotoUrls : ['/placeholder-moto.svg'],
      mainPhoto: finalPhotoUrls[0] ?? '/placeholder-moto.svg',
      views: 0,
      featured: false,
      source: 'manual',
      createdAt: now,
      updatedAt: now,
    };
    await addListing(newListing);
    setPublished(true);
    setTimeout(() => router.push('/dashboard/anuncios'), 2000);
  };

  if (published) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-20 h-20 bg-green-50 border border-green-200 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-black text-slate-900 mb-2">Anúncio publicado! 🎉</h2>
        <p className="text-slate-500">Redirecionando para seus anúncios...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[520px]">
      {/* Messages */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 rounded-2xl border border-slate-200">
        {messages.map((msg) => (
          <ChatBubble key={msg.id} msg={msg} />
        ))}

        {loading && (
          <div className="flex gap-2 items-end">
            <BotAvatar />
            <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        {/* Foto upload após completar */}
        {isComplete && (
          <div className="flex gap-2 items-end">
            <BotAvatar />
            <div className="flex-1">
              <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm p-4 shadow-sm">
                {/* Preview das fotos */}
                {photoUrls.length > 0 && (
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    {photoUrls.map((url, i) => (
                      <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200">
                        <Image src={url} alt={`Foto ${i + 1}`} fill sizes="80px" className="object-cover" />
                      </div>
                    ))}
                    <button
                      onClick={() => photoInputRef.current?.click()}
                      className="aspect-square rounded-xl border-2 border-dashed border-slate-300 hover:border-orange-400 flex items-center justify-center text-slate-400 hover:text-orange-500 transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                  </div>
                )}

                {photoUrls.length === 0 && (
                  <button
                    onClick={() => photoInputRef.current?.click()}
                    className="w-full border-2 border-dashed border-slate-300 hover:border-orange-400 rounded-xl p-6 flex flex-col items-center gap-2 transition-colors mb-3"
                  >
                    <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="text-sm text-slate-600 font-medium">Adicionar fotos da moto</span>
                    <span className="text-xs text-slate-400">As fotos serão cortadas em quadrado automaticamente</span>
                  </button>
                )}

                <input ref={photoInputRef} type="file" accept="image/*" multiple onChange={(e) => handlePhotoAdd(e.target.files)} className="hidden" />

                {/* Resumo do anúncio */}
                {listingData && (
                  <div className="bg-slate-50 rounded-xl p-3 mb-3 text-sm">
                    <p className="font-semibold text-slate-900 mb-1">📋 Resumo do anúncio</p>
                    {listingData.productType === 'moto' ? (
                      <p className="text-slate-600">
                        {String(listingData.brand)} {String(listingData.model)} {String(listingData.year)} • {String(listingData.displacement)}
                      </p>
                    ) : (
                      <p className="text-slate-600">
                        {String(listingData.title ?? `${String(listingData.brand ?? '')} ${String(listingData.model ?? '')}`.trim())}
                      </p>
                    )}
                    <p className="text-orange-500 font-bold">{formatCurrency(Number(listingData.price))}</p>
                    <p className="text-slate-500">{String(listingData.city)}/{String(listingData.state)}</p>
                  </div>
                )}

                <button
                  onClick={handlePublish}
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black py-3 rounded-xl transition-colors"
                >
                  {photos.length === 0 ? '🚀 Publicar anúncio sem foto' : `🚀 Publicar anúncio (${photos.length} foto${photos.length > 1 ? 's' : ''})`}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Input */}
      {!isComplete && (
        <div className="mt-3 flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage(input)}
            placeholder="Digite sua resposta..."
            disabled={loading}
            className="flex-1 bg-white border border-slate-200 text-slate-900 placeholder-slate-400 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-500 transition-colors disabled:opacity-50"
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            className="w-11 h-11 bg-orange-500 hover:bg-orange-600 disabled:bg-slate-100 disabled:text-slate-300 text-white rounded-xl flex items-center justify-center transition-colors flex-shrink-0"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

function BotAvatar() {
  return (
    <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-black">
      MX
    </div>
  );
}

function ChatBubble({ msg }: { msg: BotMessage }) {
  const isBot = msg.role === 'assistant';
  const lines = (msg.content || '').split('\n');

  const renderContent = (text: string) => {
    // Bold markdown
    return text.split(/\*\*(.*?)\*\*/g).map((part, i) =>
      i % 2 === 1 ? <strong key={i}>{part}</strong> : <span key={i}>{part}</span>
    );
  };

  if (isBot) {
    return (
      <div className="flex gap-2 items-end">
        <BotAvatar />
        <div className="max-w-[80%] bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm text-sm text-slate-800 leading-relaxed">
          {lines.map((line, i) => (
            <p key={i} className={i > 0 ? 'mt-1' : ''}>
              {renderContent(line)}
            </p>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] bg-orange-500 text-white rounded-2xl rounded-br-sm px-4 py-3 text-sm leading-relaxed">
        {msg.content}
      </div>
    </div>
  );
}

/** Crop center-square via Canvas API */
function cropSquare(file: File, callback: (url: string, file: File) => void) {
  const img = new window.Image();
  const objectUrl = URL.createObjectURL(file);
  img.onload = () => {
    const size = Math.min(img.width, img.height);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(
      img,
      (img.width - size) / 2,
      (img.height - size) / 2,
      size,
      size,
      0, 0, size, size
    );
    canvas.toBlob((blob) => {
      if (!blob) return;
      const croppedFile = new File([blob], file.name, { type: 'image/jpeg' });
      const croppedUrl = URL.createObjectURL(croppedFile);
      callback(croppedUrl, croppedFile);
      URL.revokeObjectURL(objectUrl);
    }, 'image/jpeg', 0.92);
  };
  img.src = objectUrl;
}
