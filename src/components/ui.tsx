'use client';

import { X } from 'lucide-react';
import { ReactNode } from 'react';

export function cls(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

// ---------- Toast ----------
export function toast(msg: string, tipo: 'ok' | 'erro' = 'ok') {
  if (typeof document === 'undefined') return;
  let box = document.getElementById('toast-box');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toast-box';
    box.className = 'fixed bottom-4 right-4 z-[100] flex flex-col gap-2 items-end';
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  el.className = cls(
    'toast-item px-4 py-2.5 rounded-lg shadow-lg text-sm text-white max-w-sm',
    tipo === 'ok' ? 'bg-emerald-600' : 'bg-rose-600'
  );
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ---------- Botões ----------
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
  size?: 'sm' | 'md';
};

export function Btn({ variant = 'primary', size = 'md', className, ...props }: BtnProps) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  const sizes = { sm: 'px-2.5 py-1.5 text-xs', md: 'px-4 py-2 text-sm' };
  const variants = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700',
    secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50',
    danger: 'bg-rose-600 text-white hover:bg-rose-700',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700',
    ghost: 'text-slate-600 hover:bg-slate-200',
  };
  return <button className={cls(base, sizes[size], variants[variant], className)} {...props} />;
}

// ---------- Campos ----------
type FieldWrapProps = { label?: string; children: ReactNode; className?: string; hint?: string };
export function Field({ label, children, className, hint }: FieldWrapProps) {
  return (
    <label className={cls('block', className)}>
      {label && <span className="block text-xs font-medium text-slate-600 mb-1">{label}</span>}
      {children}
      {hint && <span className="block text-[11px] text-slate-400 mt-1">{hint}</span>}
    </label>
  );
}

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 placeholder:text-slate-400';

export function Input({
  label,
  hint,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string }) {
  return (
    <Field label={label} hint={hint} className={className}>
      <input className={inputCls} {...props} />
    </Field>
  );
}

export function Select({
  label,
  hint,
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string; hint?: string }) {
  return (
    <Field label={label} hint={hint} className={className}>
      <select className={inputCls} {...props}>
        {children}
      </select>
    </Field>
  );
}

export function TextArea({
  label,
  hint,
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; hint?: string }) {
  return (
    <Field label={label} hint={hint} className={className}>
      <textarea className={cls(inputCls, 'min-h-[80px]')} {...props} />
    </Field>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 text-sm text-slate-700"
    >
      <span
        className={cls(
          'w-10 h-6 rounded-full p-0.5 transition-colors',
          checked ? 'bg-indigo-600' : 'bg-slate-300'
        )}
      >
        <span
          className={cls(
            'block w-5 h-5 bg-white rounded-full shadow transition-transform',
            checked && 'translate-x-4'
          )}
        />
      </span>
      {label}
    </button>
  );
}

// ---------- Cartões ----------
export function Card({
  title,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cls('bg-white rounded-xl border border-slate-200 shadow-sm', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800 text-sm">{title}</h3>
          {action}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

// ---------- Badges ----------
const badgeCores: Record<string, string> = {
  verde: 'bg-emerald-100 text-emerald-700',
  vermelho: 'bg-rose-100 text-rose-700',
  amarelo: 'bg-amber-100 text-amber-700',
  azul: 'bg-sky-100 text-sky-700',
  cinza: 'bg-slate-100 text-slate-600',
  roxo: 'bg-violet-100 text-violet-700',
};

export function Badge({ cor = 'cinza', children }: { cor?: string; children: ReactNode }) {
  return (
    <span
      className={cls(
        'inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap',
        badgeCores[cor] ?? badgeCores.cinza
      )}
    >
      {children}
    </span>
  );
}

// ---------- Modal ----------
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto">
      <div
        className={cls(
          'bg-white rounded-xl shadow-xl w-full my-8',
          wide ? 'max-w-3xl' : 'max-w-xl'
        )}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100">{footer}</div>
        )}
      </div>
    </div>
  );
}

// ---------- Tabela ----------
export function Tabela({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th
      className={cls(
        'text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 whitespace-nowrap',
        className
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <td className={cls('px-4 py-3 border-b border-slate-100 align-middle', className)}>
      {children}
    </td>
  );
}

// ---------- Cabeçalho de página ----------
export function PageTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return <div className="text-center text-sm text-slate-400 py-10">{children}</div>;
}

export function Carregando() {
  return (
    <div className="flex justify-center py-16">
      <div className="w-8 h-8 border-[3px] border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
    </div>
  );
}
