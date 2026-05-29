'use client';

import { useApp } from '@/context/AppContext';
import HomeVitrine from './HomeVitrine';

export default function EquipamentosVitrine() {
  const { listings } = useApp();

  const equipamentos = listings
    .filter((l) => l.status === 'active' && l.productType === 'equipamento')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 16);

  return (
    <HomeVitrine
      title="Equipamentos"
      subtitle="Proteção & estilo"
      emoji="⛑️"
      href="/motos?productType=equipamento"
      listings={equipamentos}
      bg="bg-white"
    />
  );
}
