'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { MOCK_CONVERSATIONS, MOCK_MESSAGES, MOCK_USERS, MOCK_LISTINGS, CURRENT_USER } from '@/data/mockData';
import { formatRelativeDate, formatCurrency } from '@/lib/utils';
import ChatMessage from './ChatMessage';

type LocalMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  message: string;
  createdAt: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'proposal' | 'contact_share';
  mediaUrl?: string;
  proposalValue?: number;
  proposalStatus?: 'pending' | 'accepted' | 'rejected';
};

export default function ChatLayout({ conversationId }: { conversationId?: string }) {
  const [activeId, setActiveId] = useState<string | undefined>(conversationId);
  const [newMessage, setNewMessage] = useState('');
  const [localMessages, setLocalMessages] = useState<Record<string, LocalMessage[]>>(
    Object.fromEntries(
      Object.entries(MOCK_MESSAGES).map(([k, v]) => [
        k,
        v.map((m) => ({ ...m, type: 'text' as const })),
      ])
    )
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeConv = MOCK_CONVERSATIONS.find((c) => c.id === activeId);
  const activeListing = activeConv
    ? MOCK_LISTINGS.find((l) => l.id === activeConv.listingId)
    : null;
  const messages: LocalMessage[] = activeId ? (localMessages[activeId] ?? []) : [];

  const getOtherUser = (conv: (typeof MOCK_CONVERSATIONS)[0]) => {
    const otherId = conv.buyerId === CURRENT_USER.id ? conv.sellerId : conv.buyerId;
    return MOCK_USERS.find((u) => u.id === otherId) ?? MOCK_USERS[0];
  };

  const addMessage = (msg: Omit<LocalMessage, 'id' | 'conversationId' | 'senderId' | 'createdAt'>) => {
    if (!activeId) return;
    const newMsg: LocalMessage = {
      id: `msg-${Date.now()}`,
      conversationId: activeId,
      senderId: CURRENT_USER.id,
      createdAt: new Date().toISOString(),
      ...msg,
    };
    setLocalMessages((prev) => ({
      ...prev,
      [activeId]: [...(prev[activeId] ?? []), newMsg],
    }));
  };

  const handleSend = () => {
    if (!newMessage.trim()) return;
    addMessage({ type: 'text', message: newMessage.trim() });
    setNewMessage('');
  };

  const handleShareContact = () => {
    const phone = CURRENT_USER.phone ?? '+55 11 99999-9999';
    addMessage({ type: 'contact_share', message: phone });
  };

  const handleImageSelect = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      const url = URL.createObjectURL(file);
      addMessage({ type: 'image', message: '', mediaUrl: url });
    });
  };

  const handleAcceptProposal = (msgId: string) => {
    if (!activeId) return;
    setLocalMessages((prev) => ({
      ...prev,
      [activeId]: prev[activeId].map((m) =>
        m.id === msgId ? { ...m, proposalStatus: 'accepted' as const } : m
      ),
    }));
  };

  const handleRejectProposal = (msgId: string) => {
    if (!activeId) return;
    setLocalMessages((prev) => ({
      ...prev,
      [activeId]: prev[activeId].map((m) =>
        m.id === msgId ? { ...m, proposalStatus: 'rejected' as const } : m
      ),
    }));
  };

  return (
    <div className="flex h-[calc(100vh-120px)] sm:h-[700px] bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      {/* Conversation list */}
      <div className={`w-full sm:w-72 flex-shrink-0 border-r border-slate-200 flex flex-col ${activeId ? 'hidden sm:flex' : 'flex'}`}>
        <div className="p-4 border-b border-slate-200">
          <h2 className="text-slate-900 font-bold">Mensagens</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          {MOCK_CONVERSATIONS.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-sm">
              Nenhuma conversa por enquanto.
            </div>
          ) : (
            MOCK_CONVERSATIONS.map((conv) => {
              const other = getOtherUser(conv);
              const listing = MOCK_LISTINGS.find((l) => l.id === conv.listingId);
              const isActive = conv.id === activeId;

              return (
                <button
                  key={conv.id}
                  onClick={() => setActiveId(conv.id)}
                  className={`w-full flex items-start gap-3 p-4 hover:bg-slate-50 transition-colors text-left border-b border-slate-100 ${isActive ? 'bg-orange-50' : ''}`}
                >
                  <div className="relative w-10 h-10 rounded-full overflow-hidden bg-slate-200 flex-shrink-0">
                    {other.avatar && <Image src={other.avatar} alt={other.name} fill sizes="40px" className="object-cover" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-slate-900 text-sm font-medium truncate">{other.name}</span>
                      <span className="text-slate-400 text-[10px] flex-shrink-0 ml-2">{formatRelativeDate(conv.lastMessageAt)}</span>
                    </div>
                    {listing && (
                      <p className="text-orange-500 text-xs truncate mb-0.5">{listing.brand} {listing.model}</p>
                    )}
                    <p className="text-slate-400 text-xs truncate">{conv.lastMessage}</p>
                  </div>
                  {conv.unreadCount > 0 && (
                    <span className="w-5 h-5 bg-orange-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center flex-shrink-0">
                      {conv.unreadCount}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className={`flex-1 flex flex-col ${activeId ? 'flex' : 'hidden sm:flex'}`}>
        {activeConv && activeListing ? (
          <>
            {/* Chat header */}
            <div className="p-4 border-b border-slate-200 flex items-center gap-3 bg-white">
              <button
                onClick={() => setActiveId(undefined)}
                className="sm:hidden p-1 text-slate-400 hover:text-slate-900 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="relative w-10 h-10 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0">
                <Image src={activeListing.mainPhoto} alt={activeListing.title} fill sizes="40px" className="object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <Link href={`/motos/${activeListing.id}`} className="text-slate-900 text-sm font-semibold hover:text-orange-500 transition-colors truncate block">
                  {activeListing.brand} {activeListing.model} {activeListing.year}
                </Link>
                <p className="text-orange-500 text-xs">{formatCurrency(activeListing.price)}</p>
              </div>
              {activeListing.status === 'sold' && (
                <span className="bg-red-50 text-red-500 border border-red-200 text-xs font-bold px-2 py-1 rounded-full">VENDIDA</span>
              )}
            </div>

            {/* Sold notice */}
            {activeListing.status === 'sold' && (
              <div className="bg-red-50 border-b border-red-200 px-4 py-2">
                <p className="text-red-500 text-xs text-center">Este anúncio foi marcado como vendido. Não é possível iniciar novas conversas.</p>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
              {messages.map((msg) => (
                <ChatMessage
                  key={msg.id}
                  message={msg.message}
                  isOwn={msg.senderId === CURRENT_USER.id}
                  createdAt={msg.createdAt}
                  type={msg.type}
                  mediaUrl={msg.mediaUrl}
                  proposalValue={msg.proposalValue}
                  proposalStatus={msg.proposalStatus}
                  onAcceptProposal={() => handleAcceptProposal(msg.id)}
                  onRejectProposal={() => handleRejectProposal(msg.id)}
                />
              ))}
            </div>

            {/* Input bar */}
            {activeListing.status !== 'sold' && (
              <div className="p-3 border-t border-slate-200 bg-white">
                {/* Action buttons row */}
                <div className="flex items-center gap-2 mb-2">
                  {/* Image upload */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    title="Enviar foto"
                    className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => handleImageSelect(e.target.files)}
                    className="hidden"
                  />

                  {/* Trocar contato */}
                  <button
                    onClick={handleShareContact}
                    title="Trocar contato WhatsApp"
                    className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-green-600 hover:bg-green-50 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-green-300 transition-colors"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.890-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                    Trocar contato
                  </button>
                </div>

                {/* Text input row */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Digite sua mensagem..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                    className="flex-1 bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500 transition-colors"
                  />
                  <button
                    onClick={handleSend}
                    disabled={!newMessage.trim()}
                    className="w-10 h-10 bg-orange-500 hover:bg-orange-600 disabled:bg-slate-100 disabled:text-slate-300 text-white rounded-xl flex items-center justify-center transition-colors flex-shrink-0"
                    aria-label="Enviar"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-center p-8 bg-slate-50">
            <div>
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <p className="text-slate-900 font-semibold mb-1">Selecione uma conversa</p>
              <p className="text-slate-400 text-sm">Escolha uma conversa na lista ao lado</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
