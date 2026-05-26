import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import MobileBottomNav from '@/components/layout/MobileBottomNav';
import UserDashboardLayout from '@/components/dashboard/UserDashboardLayout';

export default function DashboardRootLayout({ children }: { children: React.ReactNode }) {
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
