'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Btn, Card, Carregando, PageTitle, Vazio } from '@/components/ui';
import { fmtMoeda, mesAtualISO, nomeMes } from '@/lib/utils';
import { Printer } from 'lucide-react';

type CustoCliente = {
  id: string;
  nome: string;
  plano: string;
  telas: number;
  custoTelas: number;
  assistPlus: number;
  custo: number;
  recebe: number;
  margem: number;
};

type Resumo = {
  receitaClientes: number;
  receitaRevendas: number;
  despesas: number;
  comissoesGeradas: number;
  novosClientes: number;
  cancelamentos: number;
  porForma: Record<string, number>;
  porCategoria: Record<string, number>;
  totalTelas: number;
  telasAssistPlus: number;
  custoPorCliente: CustoCliente[];
};

export default function RelatoriosPage() {
  const supabase = useMemo(() => createClient(), []);
  const [mes, setMes] = useState(mesAtualISO());
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [custoPorTela, setCustoPorTela] = useState(1.5);

  useEffect(() => {
    (async () => {
      setCarregando(true);
      const inicio = `${mes}-01`;
      const [y, m] = mes.split('-').map(Number);
      const fim = new Date(y, m, 0).toISOString().slice(0, 10);
      const fimTs = `${fim}T23:59:59`;

      const [cobPagas, desp, comGeradas, novos, cancelados, telas, telasCfg, despAssist] = await Promise.all([
        supabase.from('cobrancas').select('valor, tipo, forma_pagamento').eq('status', 'pago').gte('pago_em', inicio).lte('pago_em', fim),
        supabase.from('despesas').select('valor, categoria').gte('data', inicio).lte('data', fim),
        supabase.from('comissoes').select('valor').gte('criado_em', inicio).lte('criado_em', fimTs),
        supabase.from('clientes').select('id').gte('data_ativacao', inicio).lte('data_ativacao', fim),
        supabase.from('clientes').select('id').eq('status', 'cancelado').gte('criado_em', inicio),
        supabase.from('clientes').select('id, nome, valor, aplicativo, telas_apps, planos(nome)').eq('status', 'ativo'),
        supabase.from('settings').select('valor').eq('chave', 'telas_config').maybeSingle(),
        // Despesa real do Assist Plus lançada por cliente (Financeiro > Despesas, categoria "Assist Plus")
        supabase.from('despesas').select('cliente_id, valor').eq('categoria', 'Assist Plus').not('cliente_id', 'is', null),
      ]);
      const custoTela = Number(telasCfg.data?.valor?.custo_por_tela ?? 1.5) || 1.5;
      setCustoPorTela(custoTela);

      const pagas = cobPagas.data ?? [];
      const porForma: Record<string, number> = {};
      for (const c of pagas) {
        const f = c.forma_pagamento || 'Não informado';
        porForma[f] = (porForma[f] ?? 0) + Number(c.valor);
      }
      const porCategoria: Record<string, number> = {};
      for (const d of desp.data ?? []) {
        porCategoria[d.categoria] = (porCategoria[d.categoria] ?? 0) + Number(d.valor);
      }

      // Comissões de indicação também são despesa (dinheiro pago para fora)
      const comissoesGeradasValor = (comGeradas.data ?? []).reduce((s, c) => s + Number(c.valor), 0);
      if (comissoesGeradasValor > 0) {
        porCategoria['Comissões de indicação'] = comissoesGeradasValor;
      }

      // O dispositivo/app principal do cliente já conta como a 1ª tela dele
      const todasTelas = (telas.data ?? []).flatMap((c: any) =>
        [c.aplicativo, ...((c.telas_apps as string[]) ?? [])].filter(Boolean)
      );

      // Despesa do Assist Plus por cliente (o que você paga de licença pelo cliente)
      const assistPorCliente: Record<string, number> = {};
      for (const d of despAssist.data ?? []) {
        if (d.cliente_id) assistPorCliente[d.cliente_id] = (assistPorCliente[d.cliente_id] ?? 0) + Number(d.valor);
      }

      // Custo e margem por cliente ativo (custo = telas × custo por tela + Assist Plus pago pelo cliente)
      const custoPorCliente: CustoCliente[] = (telas.data ?? [])
        .map((c: any) => {
          const apps = [c.aplicativo, ...((c.telas_apps as string[]) ?? [])].filter(Boolean);
          const custoTelas = Math.round(apps.length * custoTela * 100) / 100;
          const assistPlus = Math.round((assistPorCliente[c.id] ?? 0) * 100) / 100;
          const custo = Math.round((custoTelas + assistPlus) * 100) / 100;
          const recebe = Number(c.valor) || 0;
          return {
            id: c.id,
            nome: c.nome,
            plano: c.planos?.nome ?? '—',
            telas: apps.length,
            custoTelas,
            assistPlus,
            custo,
            recebe,
            margem: Math.round((recebe - custo) * 100) / 100,
          };
        })
        .sort((a, b) => a.margem - b.margem);

      setResumo({
        receitaClientes: pagas.filter((c) => c.tipo === 'cliente').reduce((s, c) => s + Number(c.valor), 0),
        receitaRevendas: pagas.filter((c) => c.tipo === 'revendedor').reduce((s, c) => s + Number(c.valor), 0),
        despesas: (desp.data ?? []).reduce((s, d) => s + Number(d.valor), 0) + comissoesGeradasValor,
        comissoesGeradas: comissoesGeradasValor,
        novosClientes: novos.data?.length ?? 0,
        cancelamentos: cancelados.data?.length ?? 0,
        porForma,
        porCategoria,
        totalTelas: todasTelas.length,
        telasAssistPlus: todasTelas.filter((a) => a === 'Assist Plus').length,
        custoPorCliente,
      });
      setCarregando(false);
    })();
  }, [mes, supabase]);

  if (carregando || !resumo) return <Carregando />;

  const receitaTotal = resumo.receitaClientes + resumo.receitaRevendas;
  const lucro = receitaTotal - resumo.despesas;

  return (
    <div>
      <PageTitle
        title="Relatório mensal"
        subtitle={nomeMes(mes)}
        action={
          <div className="no-print flex gap-2 items-center">
            <input
              type="month"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              value={mes}
              onChange={(e) => setMes(e.target.value)}
            />
            <Btn variant="secondary" onClick={() => window.print()}>
              <Printer size={15} /> Imprimir / PDF
            </Btn>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          ['Receita total', fmtMoeda(receitaTotal), 'text-emerald-600'],
          ['Despesas', fmtMoeda(resumo.despesas), 'text-rose-600'],
          ['Lucro', fmtMoeda(lucro), lucro >= 0 ? 'text-emerald-600' : 'text-rose-600'],
          ['Comissões geradas', fmtMoeda(resumo.comissoesGeradas), 'text-violet-600'],
        ].map(([label, valor, cor]) => (
          <div key={label as string} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="text-[11px] text-slate-500">{label}</div>
            <div className={`text-xl font-bold ${cor}`}>{valor}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
        <Card title="Composição da receita">
          <ul className="text-sm space-y-2">
            <li className="flex justify-between">
              <span>Pagamentos de clientes</span>
              <b>{fmtMoeda(resumo.receitaClientes)}</b>
            </li>
            <li className="flex justify-between">
              <span>Mensalidades de revendedores</span>
              <b>{fmtMoeda(resumo.receitaRevendas)}</b>
            </li>
            <li className="flex justify-between border-t border-slate-100 pt-2 font-medium">
              <span>Total</span>
              <b>{fmtMoeda(resumo.receitaClientes + resumo.receitaRevendas)}</b>
            </li>
          </ul>
        </Card>

        <Card title="Movimentação de clientes">
          <ul className="text-sm space-y-2">
            <li className="flex justify-between">
              <span>Novos clientes no mês</span>
              <b className="text-emerald-600">{resumo.novosClientes}</b>
            </li>
            <li className="flex justify-between">
              <span>Cancelamentos</span>
              <b className="text-rose-600">{resumo.cancelamentos}</b>
            </li>
          </ul>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card title="Recebimentos por forma de pagamento">
          {Object.keys(resumo.porForma).length === 0 ? (
            <Vazio>Nenhum recebimento no mês.</Vazio>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {Object.entries(resumo.porForma)
                  .sort((a, b) => b[1] - a[1])
                  .map(([forma, valor]) => (
                    <tr key={forma} className="border-b border-slate-100 last:border-0">
                      <td className="py-2">{forma}</td>
                      <td className="py-2 text-right font-medium">{fmtMoeda(valor)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Despesas por categoria">
          {Object.keys(resumo.porCategoria).length === 0 ? (
            <Vazio>Nenhuma despesa no mês.</Vazio>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {Object.entries(resumo.porCategoria)
                  .sort((a, b) => b[1] - a[1])
                  .map(([cat, valor]) => (
                    <tr key={cat} className="border-b border-slate-100 last:border-0">
                      <td className="py-2">{cat}</td>
                      <td className="py-2 text-right font-medium">{fmtMoeda(valor)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <div className="mt-5">
        <Card title="Custo de telas dos clientes ativos (informativo)">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-slate-500 text-[11px]">Telas simultâneas ativas</div>
              <div className="text-xl font-bold text-slate-900">{resumo.totalTelas}</div>
            </div>
            <div>
              <div className="text-slate-500 text-[11px]">Custo estimado ({fmtMoeda(custoPorTela)}/tela)</div>
              <div className="text-xl font-bold text-slate-900">{fmtMoeda(resumo.totalTelas * custoPorTela)}</div>
            </div>
            <div>
              <div className="text-slate-500 text-[11px]">Das quais Assist Plus ({resumo.telasAssistPlus} tela{resumo.telasAssistPlus === 1 ? '' : 's'})</div>
              <div className="text-xl font-bold text-slate-900">{fmtMoeda(resumo.telasAssistPlus * custoPorTela)}</div>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mt-3">
            Este custo é apenas para referência de margem e não entra no total de despesas — exceto a parte do
            Assist Plus, que já está lançada em Financeiro &gt; Despesas (categoria &quot;Assist Plus&quot;) e portanto
            já soma no total de despesas acima.
          </p>
        </Card>
      </div>

      <div className="mt-5">
        <Card title="Custo e margem por cliente (ativos)">
          {resumo.custoPorCliente.length === 0 ? (
            <Vazio>Nenhum cliente ativo.</Vazio>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-200">
                    <th className="py-2 font-medium">Cliente</th>
                    <th className="py-2 font-medium">Plano</th>
                    <th className="py-2 font-medium text-center">Telas</th>
                    <th className="py-2 font-medium text-right">Custo telas</th>
                    <th className="py-2 font-medium text-right">Assist Plus</th>
                    <th className="py-2 font-medium text-right">Custo total</th>
                    <th className="py-2 font-medium text-right">Recebe</th>
                    <th className="py-2 font-medium text-right">Margem</th>
                  </tr>
                </thead>
                <tbody>
                  {resumo.custoPorCliente.map((c) => (
                    <tr key={c.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-2">{c.nome}</td>
                      <td className="py-2 text-slate-500">{c.plano}</td>
                      <td className="py-2 text-center">{c.telas}</td>
                      <td className="py-2 text-right">{fmtMoeda(c.custoTelas)}</td>
                      <td className="py-2 text-right">{c.assistPlus > 0 ? fmtMoeda(c.assistPlus) : <span className="text-slate-300">—</span>}</td>
                      <td className="py-2 text-right font-medium">{fmtMoeda(c.custo)}</td>
                      <td className="py-2 text-right">{fmtMoeda(c.recebe)}</td>
                      <td className={`py-2 text-right font-medium ${c.margem >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {fmtMoeda(c.margem)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 font-semibold">
                    <td className="py-2" colSpan={2}>Total ({resumo.custoPorCliente.length} clientes)</td>
                    <td className="py-2 text-center">{resumo.totalTelas}</td>
                    <td className="py-2 text-right">{fmtMoeda(resumo.custoPorCliente.reduce((s, c) => s + c.custoTelas, 0))}</td>
                    <td className="py-2 text-right">{fmtMoeda(resumo.custoPorCliente.reduce((s, c) => s + c.assistPlus, 0))}</td>
                    <td className="py-2 text-right">{fmtMoeda(resumo.custoPorCliente.reduce((s, c) => s + c.custo, 0))}</td>
                    <td className="py-2 text-right">{fmtMoeda(resumo.custoPorCliente.reduce((s, c) => s + c.recebe, 0))}</td>
                    <td className={`py-2 text-right ${resumo.custoPorCliente.reduce((s, c) => s + c.margem, 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {fmtMoeda(resumo.custoPorCliente.reduce((s, c) => s + c.margem, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <p className="text-[11px] text-slate-400 mt-3">
            Custo total = telas do cliente × {fmtMoeda(custoPorTela)} por tela + a despesa de Assist Plus lançada para
            ele em Financeiro &gt; Despesas. Margem = valor cobrado − custo total. Ordenado da menor margem para a
            maior, para você identificar rápido quem está pouco (ou nada) lucrativo.
          </p>
        </Card>
      </div>
    </div>
  );
}
