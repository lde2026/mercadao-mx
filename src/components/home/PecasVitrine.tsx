'use client';

import { useApp } from '@/context/AppContext';
import HomeVitrine from './HomeVitrine';

export default function PecasVitrine() {
  const { listings } = useApp();

  const pecas = listings
    .filter((l) => l.status === 'active' && l.productType === 'peca')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 16);

  return (
    <HomeVitrine
      title="Peças"
      subtitle="Motor, escapamento e mais"
      emoji="🔧"
      href="/motos?productType=peca"
      listings={pecas}
      bg="bg-slate-50"
    />
  );
}
