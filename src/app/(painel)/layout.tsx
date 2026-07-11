'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { cls } from '@/components/ui';
import {
  LayoutDashboard,
  Users,
  Store,
  Handshake,
  Wallet,
  Receipt,
  BarChart3,
  Headset,
  Settings,
  LogOut,
  Menu,
  Tv,
  X,
} from 'lucide-react';

const MENU = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/clientes', label: 'Clientes', icon: Users },
  { href: '/revendedores', label: 'Revendedores', icon: Store },
  { href: '/indicadores', label: 'Indicadores', icon: Handshake },
  { href: '/financeiro', label: 'Financeiro', icon: Wallet },
  { href: '/despesas', label: 'Despesas', icon: Receipt },
  { href: '/relatorios', label: 'Relatórios', icon: BarChart3 },
  { href: '/suporte', label: 'Suporte', icon: Headset },
  { href: '/configuracoes', label: 'Configurações', icon: Settings },
];

export default function PainelLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [aberto, setAberto] = useState(false);

  async function sair() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const nav = (
    <nav className="flex-1 px-3 space-y-1">
      {MENU.map(({ href, label, icon: Icon }) => {
        const ativo = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setAberto(false)}
            className={cls(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              ativo
                ? 'bg-indigo-600 text-white'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            )}
          >
            <Icon size={18} />
            {label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen flex">
      {/* Sidebar desktop */}
      <aside className="no-print hidden lg:flex w-60 flex-col bg-slate-900 fixed inset-y-0">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
            <Tv size={20} />
          </div>
          <div>
            <div className="text-white font-bold text-sm leading-tight">Sistema Alfenas</div>
            <div className="text-slate-400 text-[11px]">Gestão &amp; Controle</div>
          </div>
        </div>
        {nav}
        <button
          onClick={sair}
          className="flex items-center gap-3 px-6 py-4 text-sm text-slate-400 hover:text-white border-t border-slate-800"
        >
          <LogOut size={18} /> Sair
        </button>
      </aside>

      {/* Sidebar mobile */}
      {aberto && (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setAberto(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-slate-900 flex flex-col py-4">
            <div className="flex items-center justify-between px-5 pb-4">
              <span className="text-white font-bold">Sistema Alfenas</span>
              <button onClick={() => setAberto(false)} className="text-slate-400">
                <X size={20} />
              </button>
            </div>
            {nav}
            <button
              onClick={sair}
              className="flex items-center gap-3 px-6 py-4 text-sm text-slate-400 hover:text-white border-t border-slate-800"
            >
              <LogOut size={18} /> Sair
            </button>
          </aside>
        </div>
      )}

      {/* Conteúdo */}
      <div className="flex-1 lg:ml-60 flex flex-col min-w-0">
        <header className="no-print lg:hidden sticky top-0 z-30 bg-white border-b border-slate-200 flex items-center gap-3 px-4 py-3">
          <button onClick={() => setAberto(true)} className="text-slate-600">
            <Menu size={22} />
          </button>
          <span className="font-bold text-slate-800">Sistema Alfenas</span>
        </header>
        <main className="flex-1 p-4 lg:p-6 max-w-[1400px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
