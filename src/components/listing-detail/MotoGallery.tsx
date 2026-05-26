'use client';

import { useState } from 'react';
import Image from 'next/image';

interface Props {
  photos: string[];
  title: string;
}

export default function MotoGallery({ photos, title }: Props) {
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState(false);

  return (
    <>
      <div className="space-y-3">
        {/* Main photo */}
        <div
          className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-slate-100 cursor-zoom-in"
          onClick={() => setLightbox(true)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setLightbox(true)}
          aria-label="Ampliar foto"
        >
          <Image
            src={photos[active]}
            alt={`${title} — foto ${active + 1}`}
            fill
            sizes="(max-width: 1024px) 100vw, 55vw"
            className="object-cover transition-transform duration-300 hover:scale-[1.02]"
            priority={active === 0}
          />
          <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-full">
            {active + 1} / {photos.length}
          </div>
          <div className="absolute inset-0 flex items-center justify-between px-3 opacity-0 hover:opacity-100 transition-opacity">
            {active > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); setActive(active - 1); }}
                className="w-9 h-9 bg-black/60 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-black/80 transition-colors"
                aria-label="Foto anterior"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <div className="flex-1" />
            {active < photos.length - 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); setActive(active + 1); }}
                className="w-9 h-9 bg-black/60 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-black/80 transition-colors"
                aria-label="Próxima foto"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Thumbnails */}
        {photos.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {photos.map((photo, idx) => (
              <button
                key={idx}
                onClick={() => setActive(idx)}
                className={`relative flex-shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden border-2 transition-all ${
                  idx === active ? 'border-orange-500' : 'border-transparent opacity-60 hover:opacity-80'
                }`}
                aria-label={`Ver foto ${idx + 1}`}
              >
                <Image
                  src={photo}
                  alt={`Miniatura ${idx + 1}`}
                  fill
                  sizes="80px"
                  className="object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center"
          onClick={() => setLightbox(false)}
        >
          <button
            className="absolute top-4 right-4 w-10 h-10 bg-zinc-800 rounded-full flex items-center justify-center text-white hover:bg-zinc-700 transition-colors"
            onClick={() => setLightbox(false)}
            aria-label="Fechar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="relative w-full max-w-4xl max-h-[80vh] mx-4" onClick={(e) => e.stopPropagation()}>
            <Image
              src={photos[active]}
              alt={title}
              width={1200}
              height={900}
              className="w-full h-auto max-h-[80vh] object-contain rounded-xl"
            />
          </div>
          {/* Navigation in lightbox */}
          {active > 0 && (
            <button
              className="absolute left-4 w-12 h-12 bg-zinc-800 rounded-full flex items-center justify-center text-white hover:bg-zinc-700"
              onClick={(e) => { e.stopPropagation(); setActive(active - 1); }}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          {active < photos.length - 1 && (
            <button
              className="absolute right-4 w-12 h-12 bg-zinc-800 rounded-full flex items-center justify-center text-white hover:bg-zinc-700"
              onClick={(e) => { e.stopPropagation(); setActive(active + 1); }}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>
      )}
    </>
  );
}
