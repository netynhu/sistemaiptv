'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Btn, Card, Carregando, Input, PageTitle, toast } from '@/components/ui';
import { fmtMoeda, mesAtualISO } from '@/lib/utils';
import { CalendarPlus, Rocket, Target, TrendingUp, Users } from 'lucide-react';
import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

export default function CalculadoraMetaPage() {
  const supabase = useMemo(() => createClient(), []);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [receitaClientesMensal, setReceitaClientesMensal] = useState(0);
  const [receitaRevendasMensal, setReceitaRevendasMensal] = useState(0);
  const [qtdClientesAtivos, setQtdClientesAtivos] = useState(0);
  const [recebidoMes, setRecebidoMes] = useState(0);
  const [novosMes, setNovosMes] = useState(0);

  const [meta, setMeta] = useState('');
  const [ticketMedio, setTicketMedio] = useState('');
  const [historicoMetas, setHistoricoMetas] = useState<Record<string, number>>({});
  const [grafico, setGrafico] = useState<{ mes: string; Realizado: number; Meta: number | null }[]>([]);

  useEffect(() => {
    (async () => {
      setCarregando(true);
      const mes = mesAtualISO();
      const inicioMes = `${mes}-01`;
      const seisAtras = new Date();
      seisAtras.setMonth(seisAtras.getMonth() - 5);
      const inicioGrafico = seisAtras.toISOString().slice(0, 7) + '-01';

      const [{ data: clientes }, { data: revendedores }, { data: pagas6m }, { data: novos }, cfg] = await Promise.all([
        supabase.from('clientes').select('valor, planos(meses)').eq('status', 'ativo'),
        supabase.from('revendedores').select('valor_por_acesso, quantidade_clientes').eq('tipo', 'master').eq('ativo', true),
        supabase.from('cobrancas').select('valor, pago_em').eq('status', 'pago').gte('pago_em', inicioGrafico),
        supabase.from('clientes').select('id').gte('data_ativacao', inicioMes),
        supabase.from('settings').select('valor').eq('chave', 'plano_vendas').maybeSingle(),
      ]);
      const pagasMes = (pagas6m ?? []).filter((c: any) => (c.pago_em ?? '').startsWith(mes));

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
      setRecebidoMes((pagasMes ?? []).reduce((s, c) => s + Number(c.valor), 0));
      setNovosMes(novos?.length ?? 0);

      // Meta salva (persiste entre sessões — antes ela se perdia ao recarregar)
      const salva = cfg.data?.valor as
        | { meta_mensal?: number; ticket_medio?: number; historico?: Record<string, number> }
        | undefined;
      if (salva?.meta_mensal) setMeta(String(salva.meta_mensal));
      const historico = salva?.historico ?? {};
      setHistoricoMetas(historico);

      // Gráfico: meta registrada × recebido de verdade, últimos 6 meses
      const nomes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
      const meses: string[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        meses.push(d.toISOString().slice(0, 7));
      }
      setGrafico(
        meses.map((m) => ({
          mes: nomes[Number(m.split('-')[1]) - 1],
          Realizado: (pagas6m ?? [])
            .filter((c: any) => (c.pago_em ?? '').startsWith(m))
            .reduce((s: number, c: any) => s + Number(c.valor), 0),
          Meta: historico[m] ?? (m === mes && salva?.meta_mensal ? salva.meta_mensal : null),
        }))
      );

      const ticket = clientesAtivos.length > 0 ? mensalClientes / clientesAtivos.length : 0;
      setTicketMedio(
        salva?.ticket_medio ? String(salva.ticket_medio) : ticket ? ticket.toFixed(2) : ''
      );
      setCarregando(false);
    })();
  }, [supabase]);

  async function salvarMeta() {
    setSalvando(true);
    const metaNum = parseFloat(meta || '0') || 0;
    // Registra a meta do mês atual no histórico — é isso que alimenta o gráfico Meta × Realizado
    const historico = { ...historicoMetas, [mesAtualISO()]: metaNum };
    const { error } = await supabase.from('settings').upsert({
      chave: 'plano_vendas',
      valor: {
        meta_mensal: metaNum,
        ticket_medio: parseFloat(ticketMedio || '0') || 0,
        historico,
      },
      atualizado_em: new Date().toISOString(),
    });
    setSalvando(false);
    if (error) return toast(`Erro ao salvar: ${error.message}`, 'erro');
    setHistoricoMetas(historico);
    setGrafico((g) => g.map((p, i) => (i === g.length - 1 ? { ...p, Meta: metaNum } : p)));
    toast('Meta salva — ela fica registrada e acompanha seu progresso todo mês.');
  }

  if (carregando) return <Carregando />;

  const receitaAtual = receitaClientesMensal + receitaRevendasMensal;
  const metaNum = parseFloat(meta || '0') || 0;
  const ticketNum = parseFloat(ticketMedio || '0') || 0;
  const falta = Math.max(0, metaNum - receitaAtual);
  const acessosNecessarios = ticketNum > 0 ? Math.ceil(falta / ticketNum) : null;
  const jaBateuMeta = metaNum > 0 && falta === 0;
  const progresso = metaNum > 0 ? Math.min(100, (receitaAtual / metaNum) * 100) : 0;

  // Ritmo do mês: quantos dias já se passaram e projeção de novos clientes
  const hoje = new Date();
  const diaAtual = hoje.getDate();
  const diasNoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
  const projecaoNovos = diaAtual > 0 ? Math.round((novosMes / diaAtual) * diasNoMes) : 0;

  return (
    <div>
      <PageTitle
        title="Calculadora de meta"
        subtitle="Defina sua meta mensal e acompanhe quanto falta — a meta fica salva"
      />

      {/* Progresso da meta */}
      {metaNum > 0 && (
        <div className="mb-5 bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl p-5 text-white shadow-lg shadow-indigo-600/20">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 font-semibold">
              <Target size={18} /> Meta mensal: {fmtMoeda(metaNum)}
            </div>
            <div className="text-sm font-medium">
              {jaBateuMeta ? 'Meta batida! 🎉' : `${progresso.toFixed(0)}% da meta`}
            </div>
          </div>
          <div className="h-3 rounded-full bg-white/20 overflow-hidden">
            <div
              className="h-full rounded-full bg-white transition-all duration-700"
              style={{ width: `${progresso}%` }}
            />
          </div>
          <div className="flex flex-wrap justify-between gap-2 mt-3 text-sm text-indigo-100">
            <span>Receita mensal estimada: <b className="text-white">{fmtMoeda(receitaAtual)}</b></span>
            {!jaBateuMeta && (
              <span>
                Faltam <b className="text-white">{fmtMoeda(falta)}</b>
                {acessosNecessarios !== null && (
                  <> ≈ <b className="text-white">{acessosNecessarios} tela{acessosNecessarios === 1 ? '' : 's'}</b> a vender</>
                )}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Ritmo do mês */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Recebido neste mês', valor: fmtMoeda(recebidoMes), icon: TrendingUp, cor: 'bg-emerald-100 text-emerald-600' },
          { label: 'MRR estimado', valor: fmtMoeda(receitaAtual), icon: Rocket, cor: 'bg-indigo-100 text-indigo-600' },
          { label: 'Novos clientes no mês', valor: String(novosMes), icon: CalendarPlus, cor: 'bg-sky-100 text-sky-600' },
          { label: 'Projeção de novos (ritmo)', valor: String(projecaoNovos), icon: Users, cor: 'bg-violet-100 text-violet-600' },
        ].map(({ label, valor, icon: Icon, cor }) => (
          <div key={label} className="bg-white rounded-2xl ring-1 ring-slate-900/[0.06] shadow-sm p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${cor}`}>
              <Icon size={20} />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] text-slate-500 truncate">{label}</div>
              <div className="text-lg font-bold text-slate-900 truncate">{valor}</div>
            </div>
          </div>
        ))}
      </div>

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
            <Btn onClick={salvarMeta} disabled={salvando}>
              <Target size={15} /> {salvando ? 'Salvando…' : 'Salvar meta'}
            </Btn>
          </div>
        </Card>
      </div>

      {metaNum > 0 && !jaBateuMeta && acessosNecessarios !== null && (
        <div className="mt-5">
          <Card title="Plano de ação para bater a meta">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-slate-500 text-[11px]">Vendas necessárias</div>
                <div className="text-2xl font-bold text-slate-900">{acessosNecessarios} telas</div>
              </div>
              <div>
                <div className="text-slate-500 text-[11px]">Por semana (4 semanas)</div>
                <div className="text-2xl font-bold text-slate-900">{Math.ceil(acessosNecessarios / 4)} telas</div>
              </div>
              <div>
                <div className="text-slate-500 text-[11px]">Por dia útil (~22 dias)</div>
                <div className="text-2xl font-bold text-slate-900">
                  {(acessosNecessarios / 22).toFixed(1)} telas
                </div>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 mt-3">
              Considerando o ticket médio de {fmtMoeda(ticketNum)} por tela. Indicadores e revendas contam — cada
              acesso novo de revenda master também soma na receita.
            </p>
          </Card>
        </div>
      )}

      <div className="mt-5">
        <Card title="Meta × Realizado (últimos 6 meses)">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={grafico}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `R$${v}`} />
                <Tooltip formatter={(v) => fmtMoeda(Number(v ?? 0))} />
                <Legend />
                <Bar dataKey="Realizado" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="Meta" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 4 }} connectNulls={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            &quot;Realizado&quot; = cobranças pagas no mês (dinheiro que entrou). A linha &quot;Meta&quot; usa a meta
            que estava salva em cada mês — salve a meta todo mês para construir o histórico.
          </p>
        </Card>
      </div>
    </div>
  );
}
