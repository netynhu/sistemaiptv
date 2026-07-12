'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, Carregando, Input, PageTitle } from '@/components/ui';
import { fmtMoeda } from '@/lib/utils';
import { Target } from 'lucide-react';

export default function CalculadoraMetaPage() {
  const supabase = useMemo(() => createClient(), []);
  const [carregando, setCarregando] = useState(true);
  const [receitaClientesMensal, setReceitaClientesMensal] = useState(0);
  const [receitaRevendasMensal, setReceitaRevendasMensal] = useState(0);
  const [qtdClientesAtivos, setQtdClientesAtivos] = useState(0);

  const [meta, setMeta] = useState('');
  const [ticketMedio, setTicketMedio] = useState('');

  useEffect(() => {
    (async () => {
      setCarregando(true);
      const [{ data: clientes }, { data: revendedores }] = await Promise.all([
        supabase.from('clientes').select('valor, planos(meses)').eq('status', 'ativo'),
        supabase.from('revendedores').select('valor_por_acesso, quantidade_clientes').eq('tipo', 'master').eq('ativo', true),
      ]);

      const clientesAtivos = clientes ?? [];
      const mensalClientes = clientesAtivos.reduce((s: number, c: any) => {
        const meses = c.planos?.meses ?? 1;
        return s + Number(c.valor) / (meses || 1);
      }, 0);
      const mensalRevendas = (revendedores ?? []).reduce(
        (s, r) => s + Number(r.valor_por_acesso) * Number(r.quantidade_clientes),
        0
      );

      setReceitaClientesMensal(mensalClientes);
      setReceitaRevendasMensal(mensalRevendas);
      setQtdClientesAtivos(clientesAtivos.length);

      const ticket = clientesAtivos.length > 0 ? mensalClientes / clientesAtivos.length : 0;
      setTicketMedio(ticket ? ticket.toFixed(2) : '');
      setCarregando(false);
    })();
  }, [supabase]);

  if (carregando) return <Carregando />;

  const receitaAtual = receitaClientesMensal + receitaRevendasMensal;
  const metaNum = parseFloat(meta || '0') || 0;
  const ticketNum = parseFloat(ticketMedio || '0') || 0;
  const falta = Math.max(0, metaNum - receitaAtual);
  const acessosNecessarios = ticketNum > 0 ? Math.ceil(falta / ticketNum) : null;
  const jaBateuMeta = metaNum > 0 && falta === 0;

  return (
    <div>
      <PageTitle title="Calculadora de meta" subtitle="Quantas telas (acessos) faltam vender para chegar na meta desejada" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card title="Sua receita atual (estimada por mês)">
          <ul className="text-sm space-y-2">
            <li className="flex justify-between">
              <span>Clientes ativos ({qtdClientesAtivos})</span>
              <b>{fmtMoeda(receitaClientesMensal)}</b>
            </li>
            <li className="flex justify-between">
              <span>Revendas master</span>
              <b>{fmtMoeda(receitaRevendasMensal)}</b>
            </li>
            <li className="flex justify-between border-t border-slate-100 pt-2 font-medium">
              <span>Total mensal estimado</span>
              <b>{fmtMoeda(receitaAtual)}</b>
            </li>
          </ul>
          <p className="text-[11px] text-slate-400 mt-3">
            Planos trimestrais/semestrais/anuais são divididos pelos meses do plano para dar o valor mensal
            equivalente (MRR).
          </p>
        </Card>

        <Card title="Sua meta">
          <div className="space-y-3">
            <Input
              label="Meta de receita mensal (R$)"
              type="number" step="0.01"
              value={meta}
              onChange={(e) => setMeta(e.target.value)}
              placeholder="Ex.: 5000"
            />
            <Input
              label="Ticket médio por tela/acesso vendido (R$)"
              type="number" step="0.01"
              value={ticketMedio}
              onChange={(e) => setTicketMedio(e.target.value)}
              hint="Já vem calculado com base nos seus clientes ativos — mude aqui para simular outro preço de venda"
            />
          </div>
        </Card>
      </div>

      {metaNum > 0 && (
        <div className="mt-5">
          <Card>
            {jaBateuMeta ? (
              <div className="flex items-center gap-3 text-emerald-700">
                <Target size={28} />
                <div>
                  <div className="font-bold text-lg">Meta já batida! 🎉</div>
                  <div className="text-sm">Sua receita estimada ({fmtMoeda(receitaAtual)}) já alcança a meta de {fmtMoeda(metaNum)}.</div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                  <Target size={28} />
                </div>
                <div>
                  <div className="text-sm text-slate-500">
                    Faltam <b className="text-slate-800">{fmtMoeda(falta)}</b> por mês para bater a meta de {fmtMoeda(metaNum)}.
                  </div>
                  {acessosNecessarios !== null ? (
                    <div className="text-2xl font-bold text-slate-900 mt-1">
                      {acessosNecessarios} {acessosNecessarios === 1 ? 'tela/acesso novo' : 'telas/acessos novos'}
                    </div>
                  ) : (
                    <div className="text-sm text-rose-600 mt-1">Informe o ticket médio para calcular quantas telas vender.</div>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
