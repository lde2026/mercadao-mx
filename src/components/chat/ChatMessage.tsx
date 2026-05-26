import Image from 'next/image';
import { formatRelativeDate, formatCurrency } from '@/lib/utils';

interface Props {
  message: string;
  isOwn: boolean;
  createdAt: string;
  type?: 'text' | 'image' | 'video' | 'audio' | 'proposal' | 'proposal_response' | 'contact_share';
  mediaUrl?: string;
  proposalValue?: number;
  proposalStatus?: 'pending' | 'accepted' | 'rejected';
  onAcceptProposal?: () => void;
  onRejectProposal?: () => void;
}

export default function ChatMessage({
  message,
  isOwn,
  createdAt,
  type = 'text',
  mediaUrl,
  proposalValue,
  proposalStatus,
  onAcceptProposal,
  onRejectProposal,
}: Props) {
  // --- Image ---
  if (type === 'image' && mediaUrl) {
    return (
      <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
        <div className={`max-w-[65%] flex flex-col gap-1 ${isOwn ? 'items-end' : 'items-start'}`}>
          <div className="relative rounded-2xl overflow-hidden border border-slate-200 shadow-sm" style={{ width: 200, height: 200 }}>
            <Image src={mediaUrl} alt="foto" fill sizes="200px" className="object-cover" />
          </div>
          {message && (
            <div className={`px-3 py-2 rounded-xl text-sm ${isOwn ? 'bg-orange-500 text-white' : 'bg-white border border-slate-200 text-slate-800'}`}>
              {message}
            </div>
          )}
          <span className="text-slate-400 text-[10px] px-1">{formatRelativeDate(createdAt)}</span>
        </div>
      </div>
    );
  }

  // --- Audio ---
  if (type === 'audio' && mediaUrl) {
    return (
      <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
        <div className={`flex flex-col gap-1 ${isOwn ? 'items-end' : 'items-start'}`}>
          <div className={`px-4 py-3 rounded-2xl flex items-center gap-3 ${isOwn ? 'bg-orange-500 rounded-br-sm' : 'bg-white border border-slate-200 rounded-bl-sm shadow-sm'}`}>
            <span className={`text-lg ${isOwn ? 'text-white' : 'text-orange-500'}`}>🎤</span>
            <audio controls src={mediaUrl} className="h-8 max-w-[200px]" />
          </div>
          <span className="text-slate-400 text-[10px] px-1">{formatRelativeDate(createdAt)}</span>
        </div>
      </div>
    );
  }

  // --- Proposal ---
  if (type === 'proposal' && proposalValue !== undefined) {
    const statusColors = {
      pending: 'border-orange-200 bg-orange-50',
      accepted: 'border-green-200 bg-green-50',
      rejected: 'border-red-200 bg-red-50',
    };
    const status = proposalStatus ?? 'pending';

    return (
      <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
        <div className={`max-w-[80%] flex flex-col gap-1 ${isOwn ? 'items-end' : 'items-start'}`}>
          <div className={`rounded-2xl border-2 p-4 w-64 ${statusColors[status]}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">💰</span>
              <span className="font-bold text-slate-800 text-sm">Proposta enviada</span>
            </div>
            <p className="text-2xl font-black text-orange-500 mb-3">{formatCurrency(proposalValue)}</p>

            {status === 'pending' && !isOwn && (
              <div className="flex gap-2">
                <button
                  onClick={onAcceptProposal}
                  className="flex-1 bg-green-500 hover:bg-green-600 text-white text-xs font-bold py-2 rounded-lg transition-colors"
                >
                  ✅ Aceitar
                </button>
                <button
                  onClick={onRejectProposal}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white text-xs font-bold py-2 rounded-lg transition-colors"
                >
                  ❌ Recusar
                </button>
              </div>
            )}
            {status === 'accepted' && (
              <div className="bg-green-100 text-green-700 text-xs font-bold py-1.5 px-3 rounded-lg text-center">
                ✅ Proposta aceita
              </div>
            )}
            {status === 'rejected' && (
              <div className="bg-red-100 text-red-600 text-xs font-bold py-1.5 px-3 rounded-lg text-center">
                ❌ Proposta recusada
              </div>
            )}
            {status === 'pending' && isOwn && (
              <div className="bg-orange-100 text-orange-700 text-xs font-bold py-1.5 px-3 rounded-lg text-center">
                ⏳ Aguardando resposta
              </div>
            )}
          </div>
          <span className="text-slate-400 text-[10px] px-1">{formatRelativeDate(createdAt)}</span>
        </div>
      </div>
    );
  }

  // --- Contact share ---
  if (type === 'contact_share') {
    return (
      <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
        <div className={`max-w-[75%] flex flex-col gap-1 ${isOwn ? 'items-end' : 'items-start'}`}>
          <div className={`rounded-2xl border-2 p-4 w-60 ${isOwn ? 'border-orange-200 bg-orange-50' : 'border-green-200 bg-green-50'}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">📱</span>
              <span className="font-bold text-slate-800 text-sm">Contato compartilhado</span>
            </div>
            <p className="text-slate-700 font-semibold text-sm mt-2">{message}</p>
            <a
              href={`https://wa.me/${message.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 flex items-center gap-1.5 text-green-600 text-xs font-bold hover:text-green-700 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.890-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              Abrir no WhatsApp
            </a>
          </div>
          <span className="text-slate-400 text-[10px] px-1">{formatRelativeDate(createdAt)}</span>
        </div>
      </div>
    );
  }

  // --- Text (default) ---
  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[75%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        <div
          className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
            isOwn
              ? 'bg-orange-500 text-white rounded-br-sm'
              : 'bg-white text-slate-800 rounded-bl-sm border border-slate-200 shadow-sm'
          }`}
        >
          {message}
        </div>
        <span className="text-slate-400 text-[10px] px-1">{formatRelativeDate(createdAt)}</span>
      </div>
    </div>
  );
}
