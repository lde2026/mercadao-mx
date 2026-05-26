'use client';

import { useApp } from '@/context/AppContext';
import HomeVitrine from './HomeVitrine';

export default function UltimosAnuncios() {
  const { listings } = useApp();

  const recent = listings
    .filter((l) => l.status === 'active')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 20);

  return (
    <HomeVitrine
      title="Últimos anúncios"
      subtitle="Recém chegados"
      emoji="🆕"
      href="/motos"
      listings={recent}
      bg="bg-white"
    />
  );
}
