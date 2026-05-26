'use client';

import { useState, useEffect } from 'react';
import { formatCurrency } from '@/lib/utils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  listingTitle: string;
  listingPrice: number;
  onSubmit: (value: number) => void;
}

export default function ProposalModal({ isOpen, onClose, listingTitle, listingPrice, onSubmit }: Props) {
  const [value, setValue] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const minValue = Math.ceil(listingPrice * 0.3);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      setValue('');
      setSubmitted(false);
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  const numericValue = Number(value.replace(/\D/g, ''));
  const isValid = numericValue >= minValue;
  const tooLow = value.length > 0 && numericValue < minValue;

  const handleSubmit = () => {
    if (!isValid) return;
    onSubmit(numericValue);
    setSubmitted(true);
    setTimeout(onClose, 2000);
  };

  const handleInput = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    setValue(digits);
  };

  if (submitted) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
        <div className="relative bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-sm mx-0 sm:mx-4 p-8 shadow-2xl text-center">
          <div className="w-16 h-16 bg-green-50 border border-green-200 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-xl font-black text-slate-900 mb-1">Proposta enviada! 🎉</h3>
          <p className="text-slate-500 text-sm">O vendedor receberá sua proposta e entrará em contato.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-sm mx-0 sm:mx-4 p-6 shadow-2xl">
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-6 sm:hidden" />

        <h2 className="text-xl font-black text-slate-900 mb-1">Enviar Proposta</h2>
        <p className="text-slate-500 text-sm mb-5 line-clamp-1">{listingTitle}</p>

        {/* Price reference */}
        <div className="bg-slate-50 rounded-xl p-3 mb-5 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 mb-0.5">Preço pedido</p>
            <p className="font-black text-slate-900">{formatCurrency(listingPrice)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400 mb-0.5">Proposta mínima (30%)</p>
            <p className="font-bold text-orange-500">{formatCurrency(minValue)}</p>
          </div>
        </div>

        {/* Input */}
        <div className="mb-1">
          <label className="block text-sm font-semibold text-slate-700 mb-2">Sua proposta</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-semibold text-sm">R$</span>
            <input
              type="text"
              inputMode="numeric"
              value={numericValue > 0 ? numericValue.toLocaleString('pt-BR') : ''}
              onChange={(e) => handleInput(e.target.value)}
              placeholder="0"
              className={`w-full pl-10 pr-4 py-3.5 bg-white border-2 rounded-xl text-slate-900 font-bold text-lg focus:outline-none transition-colors ${
                tooLow
                  ? 'border-red-300 focus:border-red-400'
                  : isValid
                  ? 'border-green-400 focus:border-green-500'
                  : 'border-slate-200 focus:border-orange-500'
              }`}
              autoFocus
            />
          </div>
          {tooLow && (
            <p className="text-red-500 text-xs mt-1.5 flex items-center gap-1">
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              Proposta mínima de {formatCurrency(minValue)}
            </p>
          )}
          {isValid && (
            <p className="text-green-600 text-xs mt-1.5 flex items-center gap-1">
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              {((numericValue / listingPrice) * 100).toFixed(0)}% do valor pedido
            </p>
          )}
        </div>

        <div className="mt-5 space-y-2">
          <button
            onClick={handleSubmit}
            disabled={!isValid}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-slate-100 disabled:text-slate-400 text-white font-black py-3.5 rounded-xl transition-colors"
          >
            💰 Enviar proposta de {numericValue > 0 ? formatCurrency(numericValue) : '—'}
          </button>
          <button onClick={onClose} className="w-full text-slate-400 hover:text-slate-600 text-sm py-2 transition-colors">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
