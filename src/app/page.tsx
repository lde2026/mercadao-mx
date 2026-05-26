import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import MobileBottomNav from '@/components/layout/MobileBottomNav';
import Hero from '@/components/home/Hero';
import SuperDestaque from '@/components/home/SuperDestaque';
import UltimosAnuncios from '@/components/home/UltimosAnuncios';
import MotosVitrine from '@/components/home/MotosVitrine';
import EquipamentosVitrine from '@/components/home/EquipamentosVitrine';
import PecasVitrine from '@/components/home/PecasVitrine';

export default function HomePage() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <SuperDestaque />
        <UltimosAnuncios />
        <MotosVitrine />
        <EquipamentosVitrine />
        <PecasVitrine />
      </main>
      <Footer />
      <MobileBottomNav />
    </>
  );
}
