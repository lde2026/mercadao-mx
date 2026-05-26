'use client';

import { useApp } from '@/context/AppContext';
import HomeVitrine from './HomeVitrine';

export default function MotosVitrine() {
  const { listings } = useApp();

  const motos = listings
    .filter((l) => l.status === 'active' && l.productType === 'moto')
    .sort((a, b) => b.views - a.views)
    .slice(0, 16);

  return (
    <HomeVitrine
      title="Motos"
      subtitle="Off-road"
      emoji="🏍️"
      href="/motos?productType=moto"
      listings={motos}
      bg="bg-slate-50"
    />
  );
}
