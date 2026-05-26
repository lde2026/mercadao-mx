'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import AnunciarModal from '@/components/ui/AnunciarModal';

export default function Hero() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <section className="relative min-h-[60vh] flex items-center overflow-hidden bg-white">
        {/* Subtle background decoration */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(249,115,22,0.07)_0%,transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_rgba(249,115,22,0.04)_0%,transparent_50%)]" />

        {/* Grid pattern */}
        <div className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: 'linear-gradient(rgba(15,23,42,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.5) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        {/* Content */}
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="max-w-3xl">
            {/* Tag */}
            <div className="inline-flex items-center gap-2 bg-orange-50 border border-orange-200 text-orange-600 text-sm font-medium px-4 py-1.5 rounded-full mb-6">
              <span className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse" />
              Motos off-road · Compra e venda P2P
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-7xl font-black text-slate-900 leading-[1.05] tracking-tight mb-6">
              Encontre a moto
              <br />
              <span className="text-orange-500">certa para trilha,</span>
              <br />
              enduro ou motocross.
            </h1>

            <p className="text-slate-500 text-lg sm:text-xl leading-relaxed mb-10 max-w-xl">
              O marketplace feito para quem vive o mundo off-road. Compre, venda e negocie motos MX
              de forma rápida, direta e segura.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <button
                onClick={() => setModalOpen(true)}
                className="flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-black text-base px-8 py-4 rounded-2xl shadow-lg shadow-orange-500/25 transition-all hover:scale-105 hover:shadow-orange-500/40"
              >
                <PlusIcon />
                Anunciar minha moto
              </button>
              <Link
                href="/motos"
                className="flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-900 font-bold text-base px-8 py-4 rounded-2xl border border-slate-200 hover:border-slate-300 transition-all shadow-sm"
              >
                Ver motos disponíveis
                <ArrowIcon />
              </Link>
            </div>
          </div>
        </div>

        {/* Decorative icon — visible on lg+ */}
        <div className="hidden lg:flex absolute right-8 xl:right-20 top-1/2 -translate-y-1/2 items-center justify-center pointer-events-none select-none">
          <div className="relative">
            <div className="absolute inset-0 bg-orange-500/10 rounded-full blur-3xl scale-150" />
            <Image
              src="/icon.png"
              alt=""
              width={300}
              height={300}
              className="opacity-30 relative z-10"
              aria-hidden="true"
            />
          </div>
        </div>
      </section>

      <AnunciarModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}

function PlusIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}
