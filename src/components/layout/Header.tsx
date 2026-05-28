'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useRef, useEffect, useCallback } from 'react';
import AnunciarModal from '@/components/ui/AnunciarModal';
import { useApp } from '@/context/AppContext';

// ─── Nav dropdown data ────────────────────────────────────────────────────────

const MARCAS_MOTOS = [
  'KTM', 'Husqvarna', 'Gas Gas', 'Honda', 'Kawasaki', 'Suzuki', 'Yamaha', 'Beta', 'Sherco',
];

const CATEGORIAS_EQUIPAMENTOS = [
  'Capacete', 'Óculos', 'Luva', 'Calça', 'Camisa', 'Conjuntos',
  'Colete', 'Protetor de Pescoço', 'Meiãoo', 'Bota', 'Joelheira', 'Cinta Abdominal',
];

const CATEGORIAS_PECAS = ['Peças de Motor', 'Escapamentos', 'Guidões'];

// ─── Component ────────────────────────────────────────────────────────────────

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [userDropStyle, setUserDropStyle] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [activeNav, setActiveNav] = useState<string | null>(null);
  const [mobileExpanded, setMobileExpanded] = useState<string | null>(null);
  const { isLoggedIn, authUser, logout } = useApp();

  const userBtnRef = useRef<HTMLButtonElement>(null);
  const userDropRef = useRef<HTMLDivElement>(null);
  const navLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLogout = () => {
    logout();
    setUserMenuOpen(false);
    setMenuOpen(false);
    router.push('/');
  };

  const handleAnunciar = () => {
    if (!isLoggedIn) {
      router.push('/cadastro');
      return;
    }
    setModalOpen(true);
  };

  // User dropdown: calculate position from button rect for exact placement
  const toggleUserMenu = () => {
    if (!userMenuOpen && userBtnRef.current) {
      const rect = userBtnRef.current.getBoundingClientRect();
      setUserDropStyle({ top: rect.bottom + 6, left: rect.left });
    }
    setUserMenuOpen((v) => !v);
  };

  // Close user dropdown on outside click
  useEffect(() => {
    if (!userMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (userBtnRef.current?.contains(t) || userDropRef.current?.contains(t)) return;
      setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [userMenuOpen]);

  const openNav = useCallback((name: string) => {
    if (navLeaveTimer.current) clearTimeout(navLeaveTimer.current);
    setActiveNav(name);
  }, []);

  const closeNav = useCallback(() => {
    navLeaveTimer.current = setTimeout(() => setActiveNav(null), 120);
  }, []);

  const keepNav = useCallback(() => {
    if (navLeaveTimer.current) clearTimeout(navLeaveTimer.current);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-50 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-[100px]">
            {/* Logo */}
            <Link href="/" className="flex items-center -ml-2 flex-shrink-0">
              <Image
                src="/logo.png"
                alt="Mercadão MX"
                width={546}
                height={308}
                className="h-[73px] sm:h-[94px] w-auto object-contain"
                placeholder="empty"
                priority
              />
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden lg:flex items-center gap-0.5" onMouseLeave={closeNav}>
              {/* VER MOTOS */}
              <div className="relative" onMouseEnter={() => openNav('motos')}>
                <Link
                  href="/motos?productType=moto"
                  className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    activeNav === 'motos' ? 'text-orange-500 bg-orange-50' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  Ver Motos
                  <svg className={`w-3.5 h-3.5 transition-transform ${activeNav === 'motos' ? 'rotate-180 text-orange-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </Link>
                {activeNav === 'motos' && (
                  <div
                    className="absolute top-full left-0 mt-1 w-52 bg-white border border-slate-200 rounded-xl shadow-xl z-[200] p-2"
                    onMouseEnter={keepNav}
                    onMouseLeave={closeNav}
                  >
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-2 py-1">Marcas</p>
                    {MARCAS_MOTOS.map((m) => (
                      <Link
                        key={m}
                        href={`/motos?productType=moto&brand=${encodeURIComponent(m === 'Gas Gas' ? 'GasGas' : m)}`}
                        onClick={() => setActiveNav(null)}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-slate-700 hover:bg-orange-50 hover:text-orange-600 transition-colors"
                      >
                        {m}
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* EQUIPAMENTOS */}
              <div className="relative" onMouseEnter={() => openNav('equipamentos')}>
                <Link
                  href="/motos?productType=equipamento"
                  className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    activeNav === 'equipamentos' ? 'text-orange-500 bg-orange-50' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  Equipamentos
                  <svg className={`w-3.5 h-3.5 transition-transform ${activeNav === 'equipamentos' ? 'rotate-180 text-orange-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </Link>
                {activeNav === 'equipamentos' && (
                  <div
                    className="absolute top-full left-0 mt-1 w-56 bg-white border border-slate-200 rounded-xl shadow-xl z-[200] p-2"
                    onMouseEnter={keepNav}
                    onMouseLeave={closeNav}
                  >
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-2 py-1">Categorias</p>
                    {CATEGORIAS_EQUIPAMENTOS.map((c) => (
                      <Link
                        key={c}
                        href={`/motos?productType=equipamento&search=${encodeURIComponent(c)}`}
                        onClick={() => setActiveNav(null)}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-slate-700 hover:bg-orange-50 hover:text-orange-600 transition-colors"
                      >
                        {c}
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* PEÇAS */}
              <div className="relative" onMouseEnter={() => openNav('pecas')}>
                <Link
                  href="/motos?productType=peca"
                  className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    activeNav === 'pecas' ? 'text-orange-500 bg-orange-50' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  Peças
                  <svg className={`w-3.5 h-3.5 transition-transform ${activeNav === 'pecas' ? 'rotate-180 text-orange-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </Link>
                {activeNav === 'pecas' && (
                  <div
                    className="absolute top-full left-0 mt-1 w-48 bg-white border border-slate-200 rounded-xl shadow-xl z-[200] p-2"
                    onMouseEnter={keepNav}
                    onMouseLeave={closeNav}
                  >
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-2 py-1">Categorias</p>
                    {CATEGORIAS_PECAS.map((c) => (
                      <Link
                        key={c}
                        href={`/motos?productType=peca&search=${encodeURIComponent(c)}`}
                        onClick={() => setActiveNav(null)}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-slate-700 hover:bg-orange-50 hover:text-orange-600 transition-colors"
                      >
                        {c}
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* FAVORITOS */}
              <Link
                href="/dashboard/favoritos"
                className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  pathname === '/dashboard/favoritos' ? 'text-orange-500 bg-orange-50' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                Favoritos
              </Link>

              {/* MENSAGENS */}
              <Link
                href="/dashboard/mensagens"
                className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  pathname === '/dashboard/mensagens' ? 'text-orange-500 bg-orange-50' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                Mensagens
              </Link>
            </nav>

            {/* Desktop CTA */}
            <div className="hidden lg:flex items-center gap-2 flex-shrink-0">
              {isLoggedIn ? (
                <button
                  ref={userBtnRef}
                  onClick={toggleUserMenu}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-slate-100 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-white text-xs font-black overflow-hidden flex-shrink-0">
                    {authUser?.avatar
                      ? <img src={authUser.avatar} alt="" className="w-full h-full object-cover" />
                      : (authUser?.name?.charAt(0).toUpperCase() ?? 'U')
                    }
                  </div>
                  <span className="text-sm font-semibold text-slate-700 max-w-[100px] truncate">
                    {authUser?.name?.split(' ')[0]}
                  </span>
                  <svg
                    className={`w-4 h-4 text-slate-400 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              ) : (
                <Link href="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors">
                  Entrar
                </Link>
              )}
              <button
                onClick={handleAnunciar}
                className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm px-4 py-2 rounded-xl shadow-sm shadow-orange-500/20 transition-all hover:scale-[1.02]"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                Anunciar
              </button>
            </div>

            {/* Mobile menu button */}
            <button
              className="lg:hidden p-2 text-slate-500 hover:text-slate-900 transition-colors"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Menu"
            >
              {menuOpen ? <XIcon /> : <MenuIcon />}
            </button>
          </div>
        </div>

        {/* ── Mobile Menu ───────────────────────────────────────────────────── */}
        {menuOpen && (
          <div className="lg:hidden bg-white border-b border-slate-200 px-4 py-4 space-y-1 max-h-[80vh] overflow-y-auto">
            {/* VER MOTOS expandable */}
            <MobileNavGroup
              label="Ver Motos"
              href="/motos?productType=moto"
              isOpen={mobileExpanded === 'motos'}
              onToggle={() => setMobileExpanded(mobileExpanded === 'motos' ? null : 'motos')}
              onLinkClick={() => setMenuOpen(false)}
            >
              {MARCAS_MOTOS.map((m) => (
                <Link
                  key={m}
                  href={`/motos?productType=moto&brand=${encodeURIComponent(m === 'Gas Gas' ? 'GasGas' : m)}`}
                  onClick={() => setMenuOpen(false)}
                  className="block px-6 py-2 text-sm text-slate-600 hover:text-orange-500 transition-colors"
                >
                  {m}
                </Link>
              ))}
            </MobileNavGroup>

            {/* EQUIPAMENTOS expandable */}
            <MobileNavGroup
              label="Equipamentos"
              href="/motos?productType=equipamento"
              isOpen={mobileExpanded === 'equipamentos'}
              onToggle={() => setMobileExpanded(mobileExpanded === 'equipamentos' ? null : 'equipamentos')}
              onLinkClick={() => setMenuOpen(false)}
            >
              {CATEGORIAS_EQUIPAMENTOS.map((c) => (
                <Link
                  key={c}
                  href={`/motos?productType=equipamento&search=${encodeURIComponent(c)}`}
                  onClick={() => setMenuOpen(false)}
                  className="block px-6 py-2 text-sm text-slate-600 hover:text-orange-500 transition-colors"
                >
                  {c}
                </Link>
              ))}
            </MobileNavGroup>

            {/* PEÇAS expandable */}
            <MobileNavGroup
              label="Peças"
              href="/motos?productType=peca"
              isOpen={mobileExpanded === 'pecas'}
              onToggle={() => setMobileExpanded(mobileExpanded === 'pecas' ? null : 'pecas')}
              onLinkClick={() => setMenuOpen(false)}
            >
              {CATEGORIAS_PECAS.map((c) => (
                <Link
                  key={c}
                  href={`/motos?productType=peca&search=${encodeURIComponent(c)}`}
                  onClick={() => setMenuOpen(false)}
                  className="block px-6 py-2 text-sm text-slate-600 hover:text-orange-500 transition-colors"
                >
                  {c}
                </Link>
              ))}
            </MobileNavGroup>

            <Link
              href="/dashboard/favoritos"
              onClick={() => setMenuOpen(false)}
              className="block px-4 py-3 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
            >
              Favoritos
            </Link>
            <Link
              href="/dashboard/mensagens"
              onClick={() => setMenuOpen(false)}
              className="block px-4 py-3 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
            >
              Mensagens
            </Link>

            <div className="pt-2 border-t border-slate-100 mt-2 space-y-1">
              {isLoggedIn ? (
                <>
                  <div className="px-4 py-2 flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-white text-xs font-black overflow-hidden">
                      {authUser?.avatar
                        ? <img src={authUser.avatar} alt="" className="w-full h-full object-cover" />
                        : (authUser?.name?.charAt(0).toUpperCase() ?? 'U')
                      }
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{authUser?.name?.split(' ')[0]}</p>
                      <p className="text-xs text-slate-400">{authUser?.email}</p>
                    </div>
                  </div>
                  <Link href="/dashboard" onClick={() => setMenuOpen(false)} className="block px-4 py-3 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors">
                    Minha Área
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="w-full text-left block px-4 py-3 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 transition-colors"
                  >
                    Sair da conta
                  </button>
                </>
              ) : (
                <>
                  <Link href="/login" onClick={() => setMenuOpen(false)} className="block px-4 py-3 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors">
                    Entrar
                  </Link>
                  <Link href="/cadastro" onClick={() => setMenuOpen(false)} className="block px-4 py-3 rounded-lg text-sm font-medium text-orange-500 hover:bg-orange-50 transition-colors">
                    Criar conta grátis
                  </Link>
                </>
              )}
              <button
                onClick={() => { setMenuOpen(false); handleAnunciar(); }}
                className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm px-4 py-3 rounded-xl transition-colors mt-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                Anunciar
              </button>
            </div>
          </div>
        )}
      </header>

      {/* ── User dropdown — outside header, fixed position ─────────────────── */}
      {isLoggedIn && userMenuOpen && (
        <div
          ref={userDropRef}
          style={{ top: userDropStyle.top, left: userDropStyle.left }}
          className="fixed w-52 bg-white border border-slate-200 rounded-xl shadow-xl z-[9999] py-1"
        >
          <Link
            href="/dashboard"
            onClick={() => setUserMenuOpen(false)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 rounded-t-xl"
          >
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            Minha Área
          </Link>
          <Link
            href="/dashboard/anuncios"
            onClick={() => setUserMenuOpen(false)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Meus Anúncios
          </Link>
          <Link
            href="/dashboard/perfil"
            onClick={() => setUserMenuOpen(false)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Configurações
          </Link>
          <div className="border-t border-slate-100 my-1" />
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 rounded-b-xl"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sair
          </button>
        </div>
      )}

      <AnunciarModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}

// ─── Mobile nav group (expandable) ───────────────────────────────────────────

function MobileNavGroup({
  label, href, isOpen, onToggle, onLinkClick, children,
}: {
  label: string;
  href: string;
  isOpen: boolean;
  onToggle: () => void;
  onLinkClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center">
        <Link
          href={href}
          onClick={onLinkClick}
          className="flex-1 px-4 py-3 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
        >
          {label}
        </Link>
        <button
          onClick={onToggle}
          className="p-2 text-slate-400 hover:text-slate-700 transition-colors"
        >
          <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
      {isOpen && (
        <div className="pb-1">
          {children}
        </div>
      )}
    </div>
  );
}

function MenuIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
