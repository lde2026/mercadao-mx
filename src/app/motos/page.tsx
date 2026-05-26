import { Suspense } from 'react';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import MobileBottomNav from '@/components/layout/MobileBottomNav';
import MotosContent from './MotosContent';

export default function MotosPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen">
        <Suspense fallback={<MotosLoadingSkeleton />}>
          <MotosContent />
        </Suspense>
      </main>
      <Footer />
      <MobileBottomNav />
    </>
  );
}

function MotosLoadingSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-slate-200 rounded-xl w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl overflow-hidden border border-slate-200">
              <div className="aspect-[16/10] bg-slate-100" />
              <div className="p-4 space-y-3">
                <div className="h-4 bg-slate-100 rounded w-3/4" />
                <div className="h-3 bg-slate-100 rounded w-1/2" />
                <div className="h-6 bg-slate-100 rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
