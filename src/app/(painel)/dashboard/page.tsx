'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Badge, Btn, Card, Carregando, PageTitle, Td, Th, toast, Vazio } from '@/components/ui';
import { diasAte, fmtData, fmtMoeda, fmtTelefone, mesAtualISO, nomeComUsuario } from '@/lib/utils';
import type { Cliente } from '@/types';
import {
  AlertTriangle, CalendarClock, DollarSign, MessageCircle, Receipt, TrendingUp, Users, Wallet, Handshake,
} from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

type Kpis = {
  ativos: number;
  vencem7: number;
  vencidos: number;
  receitaMes: number;
  despesasMes: number;
  aReceber: number;
  comissoesPendentes: number;
};

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), []);
  const [carregando, setCarregando] = useState(true);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [proximos, setProximos] = useState<Cliente[]>([]);
  const [emRisco, setEmRisco] = useState<Cliente[]>([]);
  const [cobrancaPorCliente, setCobrancaPorCliente] = useState<Record<string, string>>({});
  const [cobrandoId, setCobrandoId] = useState<string | null>(null);
  const [grafico, setGrafico] = useState<{ mes: string; Receita: number; Despesas: number }[]>([]);

  useEffect(() => {
    (async () => {
      const mes = mesAtualISO();
      const seisMesesAtras = new Date();
      seisMesesAtras.setMonth(seisMesesAtras.getMonth() - 5);
      const inicioGrafico = seisMesesAtras.toISOString().slice(0, 7) + '-01';

      const [cli, cobPagas, cobPendentes, desp, com] = await Promise.all([
        supabase.from('clientes').select('*, planos(nome)').eq('status', 'ativo'),
        supabase.from('cobrancas').select('valor, pago_em').eq('status', 'pago').gte('pago_em', inicioGrafico),
        supabase.from('cobrancas').select('id, valor, cliente_id, tipo').eq('status', 'pendente'),
        supabase.from('despesas').select('valor, data').gte('data', inicioGrafico),
        supabase.from('comissoes').select('valor').eq('status', 'pendente'),
      ]);

      const clientes = (cli.data as Cliente[]) ?? [];
      const ativos = clientes.length;
      let vencem7 = 0;
      let vencidos = 0;
      for (const c of clientes) {
        const dias = diasAte(c.data_vencimento);
        if (dias === null) continue;
        if (dias < 0) vencidos++;
        else if (dias <= 7) vencem7++;
      }

      const receitaMes = (cobPagas.data ?? [])
        .filter((c) => (c.pago_em ?? '').startsWith(mes))
        .reduce((s, c) => s + Number(c.valor), 0);
      const despesasMes = (desp.data ?? [])
        .filter((d) => (d.data ?? '').startsWith(mes))
        .reduce((s, d) => s + Number(d.valor), 0);
      const aReceber = (cobPendentes.data ?? []).reduce((s, c) => s + Number(c.valor), 0);
      const comissoesPendentes = (com.data ?? []).reduce((s, c) => s + Number(c.valor), 0);

      setKpis({ ativos, vencem7, vencidos, receitaMes, despesasMes, aReceber, comissoesPendentes });

      // Gráfico: últimos 6 meses
      const meses: string[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        meses.push(d.toISOString().slice(0, 7));
      }
      const nomes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
      setGrafico(
        meses.map((m) => ({
          mes: nomes[Number(m.split('-')[1]) - 1],
          Receita: (cobPagas.data ?? [])
            .filter((c) => (c.pago_em ?? '').startsWith(m))
            .reduce((s, c) => s + Number(c.valor), 0),
          Despesas: (desp.data ?? [])
            .filter((d) => (d.data ?? '').startsWith(m))
            .reduce((s, d) => s + Number(d.valor), 0),
        }))
      );

      setProximos(
        clientes
          .filter((c) => {
            const dias = diasAte(c.data_vencimento);
            return dias !== null && dias >= 0 && dias <= 7;
          })
          .sort((a, b) => (a.data_vencimento ?? '').localeCompare(b.data_vencimento ?? ''))
          .slice(0, 10)
      );

      // Risco de perda: clientes ativos com assinatura vencida, do mais atrasado para o menos
      setEmRisco(
        clientes
          .filter((c) => {
            const dias = diasAte(c.data_vencimento);
            return dias !== null && dias < 0;
          })
          .sort((a, b) => (a.data_vencimento ?? '').localeCompare(b.data_vencimento ?? ''))
      );

      // Mapeia a cobrança pendente de cada cliente para o botão "Cobrar" do card de risco
      const mapa: Record<string, string> = {};
      for (const c of cobPendentes.data ?? []) {
        if (c.tipo === 'cliente' && c.cliente_id && !mapa[c.cliente_id]) mapa[c.cliente_id] = c.id;
      }
      setCobrancaPorCliente(mapa);

      setCarregando(false);
    })();
  }, [supabase]);

  async function cobrar(c: Cliente) {
    const cobrancaId = cobrancaPorCliente[c.id];
    if (!cobrancaId) return toast('Nenhuma cobrança pendente encontrada para este cliente.', 'erro');
    setCobrandoId(c.id);
    try {
      const res = await fetch('/api/cobranca/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cobranca_id: cobrancaId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha no envio');
      toast(`Cobrança enviada para ${c.nome} por WhatsApp.`);
    } catch (e: any) {
      toast(`Erro ao cobrar: ${e.message}`, 'erro');
    } finally {
      setCobrandoId(null);
    }
  }

  if (carregando || !kpis) return <Carregando />;

  const lucro = kpis.receitaMes - kpis.despesasMes;

  const cards = [
    { label: 'Clientes ativos', valor: String(kpis.ativos), icon: Users, cor: 'bg-indigo-100 text-indigo-600' },
    { label: 'Vencem em 7 dias', valor: String(kpis.vencem7), icon: CalendarClock, cor: 'bg-amber-100 text-amber-600' },
    { label: 'Vencidos', valor: String(kpis.vencidos), icon: AlertTriangle, cor: 'bg-rose-100 text-rose-600' },
    { label: 'Receita do mês', valor: fmtMoeda(kpis.receitaMes), icon: DollarSign, cor: 'bg-emerald-100 text-emerald-600' },
    { label: 'Despesas do mês', valor: fmtMoeda(kpis.despesasMes), icon: Receipt, cor: 'bg-orange-100 text-orange-600' },
    { label: 'Lucro do mês', valor: fmtMoeda(lucro), icon: TrendingUp, cor: lucro >= 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600' },
    { label: 'A receber', valor: fmtMoeda(kpis.aReceber), icon: Wallet, cor: 'bg-sky-100 text-sky-600' },
    { label: 'Comissões pendentes', valor: fmtMoeda(kpis.comissoesPendentes), icon: Handshake, cor: 'bg-violet-100 text-violet-600' },
  ];

  return (
    <div>
      <PageTitle title="Dashboard" subtitle="Visão geral do negócio" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {cards.map(({ label, valor, icon: Icon, cor }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${cor}`}>
              <Icon size={20} />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] text-slate-500 truncate">{label}</div>
              <div className="text-lg font-bold text-slate-900 truncate">{valor}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Card title="Receita × Despesas (últimos 6 meses)">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={grafico}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `R$${v}`} />
                <Tooltip formatter={(v) => fmtMoeda(Number(v ?? 0))} />
                <Legend />
                <Bar dataKey="Receita" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Despesas" fill="#f43f5e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Próximos vencimentos (7 dias, em dia)">
          {proximos.length === 0 ? (
            <Vazio>Nenhum vencimento nos próximos 7 dias. 🎉</Vazio>
          ) : (
            <div className="overflow-x-auto -m-4">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <Th>Cliente</Th>
                    <Th>WhatsApp</Th>
                    <Th>Plano</Th>
                    <Th>Vencimento</Th>
                    <Th>Situação</Th>
                  </tr>
                </thead>
                <tbody>
                  {proximos.map((c) => {
                    const dias = diasAte(c.data_vencimento)!;
                    return (
                      <tr key={c.id}>
                        <Td className="font-medium">{nomeComUsuario(c.nome, c.usuario)}</Td>
                        <Td>{fmtTelefone(c.telefone)}</Td>
                        <Td>{(c as any).planos?.nome ?? '—'}</Td>
                        <Td>{fmtData(c.data_vencimento)}</Td>
                        <Td>
                          {dias === 0 ? (
                            <Badge cor="vermelho">Hoje</Badge>
                          ) : (
                            <Badge cor="amarelo">{dias}d</Badge>
                          )}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Risco de perda (churn): vencidos há mais tempo primeiro, com cobrança em 1 clique */}
      {emRisco.length > 0 && (
        <div className="mt-5">
          <Card
            title={
              <span className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-rose-500" /> Risco de perda — {emRisco.length} cliente{emRisco.length > 1 ? 's' : ''} vencido{emRisco.length > 1 ? 's' : ''}
              </span>
            }
          >
            <div className="overflow-x-auto -m-4">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <Th>Cliente</Th>
                    <Th>WhatsApp</Th>
                    <Th>Plano</Th>
                    <Th>Venceu em</Th>
                    <Th>Atraso</Th>
                    <Th className="text-right">Ação</Th>
                  </tr>
                </thead>
                <tbody>
                  {emRisco.map((c) => {
                    const dias = -diasAte(c.data_vencimento)!;
                    return (
                      <tr key={c.id}>
                        <Td className="font-medium">{nomeComUsuario(c.nome, c.usuario)}</Td>
                        <Td>{fmtTelefone(c.telefone)}</Td>
                        <Td>{(c as any).planos?.nome ?? '—'}</Td>
                        <Td>{fmtData(c.data_vencimento)}</Td>
                        <Td>
                          <Badge cor={dias >= 7 ? 'vermelho' : 'amarelo'}>{dias}d de atraso</Badge>
                        </Td>
                        <Td className="text-right">
                          <Btn
                            size="sm"
                            variant="secondary"
                            onClick={() => cobrar(c)}
                            disabled={cobrandoId === c.id || !cobrancaPorCliente[c.id]}
                            title={cobrancaPorCliente[c.id] ? 'Enviar cobrança por WhatsApp' : 'Sem cobrança pendente'}
                          >
                            <MessageCircle size={14} /> {cobrandoId === c.id ? 'Enviando…' : 'Cobrar'}
                          </Btn>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-400 mt-4">
              Clientes com mais de 7 dias de atraso têm alta chance de churn — priorize os do topo. O botão envia a
              cobrança pendente por WhatsApp com o PIX.
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}
