import Link from 'next/link';
import Image from 'next/image';

export default function Footer() {
  return (
    <footer className="bg-slate-50 border-t border-slate-200 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="md:col-span-2">
            <Image
              src="/logo.png"
              alt="Mercadão MX"
              width={400}
              height={142}
              className="h-[88px] w-auto object-contain"
            />
            <p className="mt-3 text-slate-500 text-sm max-w-xs">
              O marketplace feito para quem vive o mundo off-road. Compre, venda e negocie motos MX
              de forma rápida, direta e segura.
            </p>
            <div className="mt-4 pt-4 border-t border-slate-200">
              <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-2">Desenvolvido por</p>
              <a
                href="https://www.lojadoecommerce.com.br"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 transition-opacity hover:opacity-80"
              >
                <span className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
                  <span className="w-6 h-6 bg-orange-500 rounded flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 11H4L5 9z" />
                    </svg>
                  </span>
                  Loja do Ecommerce
                  <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </span>
              </a>
            </div>
          </div>

          {/* Links */}
          <div>
            <h3 className="text-slate-900 font-semibold text-sm uppercase tracking-wider mb-3">
              Plataforma
            </h3>
            <ul className="space-y-2">
              {[
                { href: '/motos', label: 'Ver anúncios' },
                { href: '/importar', label: 'Importar anúncio' },
                { href: '/dashboard', label: 'Minha área' },
                { href: '/dashboard/favoritos', label: 'Favoritos' },
                { href: '/contato', label: 'Contato' },
                { href: '/login', label: 'Entrar' },
                { href: '/cadastro', label: 'Criar conta' },
                { href: '/termos', label: 'Termos de Uso' },
                { href: '/privacidade', label: 'Privacidade' },
              ].map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-slate-500 hover:text-orange-500 text-sm transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Categories */}
          <div>
            <h3 className="text-slate-900 font-semibold text-sm uppercase tracking-wider mb-3">
              Categorias
            </h3>
            <ul className="space-y-2">
              <li>
                <Link href="/motos?productType=moto" className="text-slate-500 hover:text-orange-500 text-sm transition-colors">
                  Motos
                </Link>
              </li>
              <li>
                <Link href="/motos?productType=peca" className="text-slate-500 hover:text-orange-500 text-sm transition-colors">
                  Peças
                </Link>
              </li>
              <li>
                <Link href="/motos?productType=equipamento" className="text-slate-500 hover:text-orange-500 text-sm transition-colors">
                  Equipamentos
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-slate-200 flex flex-col items-center gap-3">
          <p className="text-slate-400 text-sm">
            © {new Date().getFullYear()} Mercadão MX. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
}
