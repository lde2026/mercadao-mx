'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import MobileBottomNav from '@/components/layout/MobileBottomNav';
import UserDashboardLayout from '@/components/dashboard/UserDashboardLayout';
import { useApp } from '@/context/AppContext';

export default function DashboardRootLayout({ children }: { children: React.ReactNode }) {
  const { isLoggedIn } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (!isLoggedIn) {
      router.replace('/login?redirect=/dashboard');
    }
  }, [isLoggedIn, router]);

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-pulse text-slate-400 text-sm">Verificando sessão...</div>
      </div>
    );
  }

  return (
    <>
      <Header />
      <main className="min-h-screen pb-20 md:pb-0">
        <UserDashboardLayout>{children}</UserDashboardLayout>
      </main>
      <Footer />
      <MobileBottomNav />
    </>
  );
}
