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
  Wallet,
  BarChart3,
  Headset,
  Settings,
  LogOut,
  Menu,
  Tv,
  X,
  ChevronDown,
  Target,
} from 'lucide-react';

type ItemMenu = { href: string; label: string };
type GrupoMenu = { label: string; icon: any; children: ItemMenu[] };
type EntradaMenu = ({ href: string; label: string; icon: any } | GrupoMenu);

function ehGrupo(e: EntradaMenu): e is GrupoMenu {
  return 'children' in e;
}

const MENU: EntradaMenu[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/clientes', label: 'Clientes', icon: Users },
  {
    label: 'Revendas', icon: Store,
    children: [
      { href: '/revendas/revendedores', label: 'Revendedores' },
      { href: '/revendas/indicacao', label: 'Indicação' },
    ],
  },
  {
    label: 'Financeiro', icon: Wallet,
    children: [
      { href: '/financeiro/receitas', label: 'Receitas' },
      { href: '/financeiro/despesas', label: 'Despesas' },
    ],
  },
  {
    label: 'Plano de vendas', icon: Target,
    children: [
      { href: '/plano-vendas/calculadora', label: 'Calculadora de meta' },
      { href: '/plano-vendas/regras', label: 'Regras e planos' },
    ],
  },
  { href: '/relatorios', label: 'Relatórios', icon: BarChart3 },
  { href: '/suporte', label: 'Suporte', icon: Headset },
  { href: '/configuracoes', label: 'Configurações', icon: Settings },
];

function NavGrupo({
  grupo, pathname, onNavegar,
}: { grupo: GrupoMenu; pathname: string; onNavegar: () => void }) {
  const contemAtivo = grupo.children.some((c) => pathname.startsWith(c.href));
  const [aberto, setAberto] = useState(contemAtivo);
  const Icon = grupo.icon;

  return (
    <div>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className={cls(
          'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
          contemAtivo && !aberto
            ? 'bg-slate-800 text-white'
            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
        )}
      >
        <Icon size={18} />
        <span className="flex-1 text-left">{grupo.label}</span>
        <ChevronDown size={15} className={cls('transition-transform', aberto && 'rotate-180')} />
      </button>
      {aberto && (
        <div className="mt-1 ml-4 pl-3 border-l border-slate-700 space-y-1">
          {grupo.children.map((c) => {
            const ativo = pathname.startsWith(c.href);
            return (
              <Link
                key={c.href}
                href={c.href}
                onClick={onNavegar}
                className={cls(
                  'block px-3 py-2 rounded-lg text-sm transition-colors',
                  ativo
                    ? 'bg-indigo-600 text-white font-medium'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                )}
              >
                {c.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

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
      {MENU.map((item) => {
        if (ehGrupo(item)) {
          return (
            <NavGrupo
              key={item.label}
              grupo={item}
              pathname={pathname}
              onNavegar={() => setAberto(false)}
            />
          );
        }
        const Icon = item.icon;
        const ativo = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setAberto(false)}
            className={cls(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              ativo
                ? 'bg-indigo-600 text-white'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            )}
          >
            <Icon size={18} />
            {item.label}
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
        <div className="flex-1 overflow-y-auto">{nav}</div>
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
            <div className="flex-1 overflow-y-auto">{nav}</div>
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
