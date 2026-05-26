'use client';

import { useApp } from '@/context/AppContext';

interface Props {
  listingId: string;
  size?: 'sm' | 'md';
  className?: string;
}

export default function FavoriteButton({ listingId, size = 'md', className = '' }: Props) {
  const { isFavorite, toggleFavorite } = useApp();
  const active = isFavorite(listingId);

  const sizeClass = size === 'sm' ? 'p-1.5' : 'p-2';
  const iconSize = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';

  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFavorite(listingId);
      }}
      className={`${sizeClass} rounded-full transition-all ${
        active
          ? 'bg-red-50 text-red-500 hover:bg-red-100'
          : 'bg-white/90 text-slate-400 hover:bg-white hover:text-slate-700 shadow-sm'
      } ${className}`}
      aria-label={active ? 'Remover dos favoritos' : 'Salvar nos favoritos'}
    >
      <svg
        className={iconSize}
        fill={active ? 'currentColor' : 'none'}
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
        />
      </svg>
    </button>
  );
}
