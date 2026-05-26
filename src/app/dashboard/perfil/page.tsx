'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import { CURRENT_USER } from '@/data/mockData';
import { formatDate } from '@/lib/utils';
import { useApp } from '@/context/AppContext';

export default function PerfilPage() {
  const { authUser, login } = useApp();
  const [name, setName] = useState(authUser?.name ?? CURRENT_USER.name);
  const [phone, setPhone] = useState(CURRENT_USER.phone);
  const [saved, setSaved] = useState(false);
  const [avatar, setAvatar] = useState<string>(authUser?.avatar ?? CURRENT_USER.avatar ?? '');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setAvatar(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    // Persist name + avatar into auth context so header updates too
    if (authUser) {
      login({ ...authUser, name, avatar: avatar || undefined });
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();

  return (
    <div>
      <h1 className="text-2xl font-black text-slate-900 mb-6">Meu perfil</h1>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-lg shadow-sm">
        {/* Avatar */}
        <div className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-200">
          <div className="relative group w-16 h-16 flex-shrink-0">
            <div className="w-16 h-16 rounded-full overflow-hidden bg-orange-100 flex items-center justify-center">
              {avatar ? (
                <Image src={avatar} alt={name} fill sizes="64px" className="object-cover" />
              ) : (
                <span className="text-orange-500 font-black text-xl">{initials}</span>
              )}
            </div>
            {/* Camera button overlay */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              title="Alterar foto"
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>
          <div>
            <p className="text-slate-900 font-bold">{name}</p>
            <p className="text-slate-400 text-sm">Membro desde {formatDate(CURRENT_USER.createdAt)}</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-xs text-orange-500 hover:text-orange-600 font-medium mt-0.5 transition-colors"
            >
              Alterar foto
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-slate-700 text-sm font-medium mb-1.5">Nome completo</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-orange-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-slate-700 text-sm font-medium mb-1.5">E-mail</label>
            <input
              type="email"
              value={authUser?.email ?? CURRENT_USER.email}
              disabled
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 opacity-50 cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-slate-700 text-sm font-medium mb-1.5">Telefone / WhatsApp</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-orange-500 transition-colors"
            />
          </div>

          <button
            onClick={handleSave}
            className={`w-full font-bold py-3 rounded-xl transition-all ${
              saved
                ? 'bg-green-500 text-white'
                : 'bg-orange-500 hover:bg-orange-600 text-white'
            }`}
          >
            {saved ? '✓ Salvo com sucesso!' : 'Salvar alterações'}
          </button>
        </div>
      </div>
    </div>
  );
}
