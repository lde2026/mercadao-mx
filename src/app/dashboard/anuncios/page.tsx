import Link from 'next/link';
import MyListingsTable from '@/components/dashboard/MyListingsTable';

export default function AnunciosPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black text-slate-900">Meus anúncios</h1>
        <Link
          href="/anunciar"
          className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors"
        >
          + Nova moto
        </Link>
      </div>
      <MyListingsTable />
    </div>
  );
}
