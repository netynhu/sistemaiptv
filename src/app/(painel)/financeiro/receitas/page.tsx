'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Btn, Badge, Card, Carregando, Input, Modal, PageTitle, Select, Tabela, Td, Th, toast, Vazio,
} from '@/components/ui';
import { addMeses, diasAte, fmtData, fmtMoeda, hojeISO, mesAtualISO } from '@/lib/utils';
import type { Cobranca } from '@/types';
import { CheckCircle2, MessageCircle, Plus, RefreshCw, Store, Users, XCircle } from 'lucide-react';

type Aba = 'pendentes' | 'pagas' | 'todas';

export default function ReceitasPage() {
  const supabase = useMemo(() => createClient(), []);
  const [aba, setAba] = useState<Aba>('pendentes');
  const [cobrancas, setCobrancas] = useState<Cobranca[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [enviandoId, setEnviandoId] = useState<string | null>(null);

  // modal de pagamento
  const [pagando, setPagando] = useState<Cobranca | null>(null);
  const [formaPg, setFormaPg] = useState('PIX');
  const [dataPg, setDataPg] = useState(hojeISO());
  const [renovar, setRenovar] = useState(true);
  const [salvandoPg, setSalvandoPg] = useState(false);

  async function carregar() {
    setCarregando(true);
    const { data } = await supabase
      .from('cobrancas')
      .select('*, clientes(*, planos(*), revendedores(*)), revendedores(*)')
      .order('vencimento', { ascending: true });
    setCobrancas((data as Cobranca[]) ?? []);
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Gera cobranças de renovação para clientes com vencimento nos próximos 7 dias (ou vencidos)
  async function gerarRenovacoes() {
    setGerando(true);
    try {
      const { data: clientes } = await supabase
        .from('clientes')
        .select('*, planos(*)')
        .eq('status', 'ativo')
        .not('data_vencimento', 'is', null);
      const pendentes = new Set(
        cobrancas.filter((c) => c.status === 'pendente' && c.cliente_id).map((c) => c.cliente_id)
      );
      const novas = (clientes ?? [])
        .filter((c) => {
          const dias = diasAte(c.data_vencimento);
          return dias !== null && dias <= 7 && !pendentes.has(c.id);
        })
        .map((c) => ({
          tipo: 'cliente',
          cliente_id: c.id,
          descricao: `Renovação ${c.planos?.nome ?? ''}`.trim(),
          valor: c.valor,
          vencimento: c.data_vencimento,
        }));
      if (novas.length === 0) {
        toast('Nenhuma renovação nova para gerar (vencimentos nos próximos 7 dias).');
      } else {
        const { error } = await supabase.from('cobrancas').insert(novas);
        if (error) throw new Error(error.message);
        toast(`${novas.length} cobrança(s) de renovação gerada(s).`);
        await carregar();
      }
    } catch (e: any) {
      toast(`Erro: ${e.message}`, 'erro');
    } finally {
      setGerando(false);
    }
  }

  // Gera a receita mensal dos revendedores master: clientes ativos × valor por acesso
  async function gerarMensalidades() {
    setGerando(true);
    try {
      const mes = mesAtualISO();
      const [{ data: revs }, { data: clientes }] = await Promise.all([
        supabase.from('revendedores').select('*').eq('tipo', 'master').eq('ativo', true),
        supabase.from('clientes').select('id, revendedor_id').eq('status', 'ativo'),
      ]);
      const contagem: Record<string, number> = {};
      for (const c of clientes ?? []) {
        if (c.revendedor_id) contagem[c.revendedor_id] = (contagem[c.revendedor_id] ?? 0) + 1;
      }
      const jaGeradas = new Set(
        cobrancas
          .filter((c) => c.tipo === 'revendedor' && c.vencimento.startsWith(mes) && c.status !== 'cancelado')
          .map((c) => c.revendedor_id)
      );
      const novas = (revs ?? [])
        .filter((r) => !jaGeradas.has(r.id) && (contagem[r.id] ?? 0) > 0)
        .map((r) => {
          const qtd = contagem[r.id] ?? 0;
          const dia = String(Math.min(r.dia_vencimento ?? 10, 28)).padStart(2, '0');
          return {
            tipo: 'revendedor',
            revendedor_id: r.id,
            descricao: `Mensalidade — ${qtd} acesso(s) × ${fmtMoeda(r.valor_por_acesso)}`,
            valor: qtd * r.valor_por_acesso,
            vencimento: `${mes}-${dia}`,
          };
        });
      if (novas.length === 0) {
        toast('Nenhuma receita nova de revenda (já gerada neste mês ou sem clientes ativos).');
      } else {
        const { error } = await supabase.from('cobrancas').insert(novas);
        if (error) throw new Error(error.message);
        toast(`${novas.length} receita(s) de revenda gerada(s).`);
        await carregar();
      }
    } catch (e: any) {
      toast(`Erro: ${e.message}`, 'erro');
    } finally {
      setGerando(false);
    }
  }

  function abrirPagamento(c: Cobranca) {
    setPagando(c);
    setFormaPg('PIX');
    setDataPg(hojeISO());
    setRenovar(c.tipo === 'cliente');
  }

  async function confirmarPagamento() {
    if (!pagando) return;
    setSalvandoPg(true);
    try {
      const { error } = await supabase
        .from('cobrancas')
        .update({ status: 'pago', pago_em: dataPg, forma_pagamento: formaPg })
        .eq('id', pagando.id);
      if (error) throw new Error(error.message);

      const cliente = pagando.clientes;

      // Renova o vencimento do cliente conforme o plano
      if (renovar && pagando.tipo === 'cliente' && cliente?.planos) {
        const base =
          cliente.data_vencimento && cliente.data_vencimento >= hojeISO()
            ? cliente.data_vencimento
            : hojeISO();
        await supabase
          .from('clientes')
          .update({ data_vencimento: addMeses(base, cliente.planos.meses) })
          .eq('id', cliente.id);
      }

      // Gera comissão para o indicador, se houver (aparece em Financeiro > Despesas > Comissões)
      const indicador = cliente?.revendedores;
      if (pagando.tipo === 'cliente' && indicador && indicador.tipo === 'indicacao' && indicador.ativo) {
        const valor =
          indicador.comissao_tipo === 'percentual'
            ? (Number(pagando.valor) * Number(indicador.comissao_valor)) / 100
            : Number(indicador.comissao_valor);
        if (valor > 0) {
          await supabase.from('comissoes').insert({
            indicador_id: indicador.id,
            cliente_id: cliente!.id,
            cobranca_id: pagando.id,
            valor: Math.round(valor * 100) / 100,
          });
        }
      }

      toast('Pagamento registrado.');
      setPagando(null);
      await carregar();
    } catch (e: any) {
      toast(`Erro: ${e.message}`, 'erro');
    } finally {
      setSalvandoPg(false);
    }
  }

  async function cancelarCobranca(c: Cobranca) {
    if (!confirm('Cancelar esta cobrança?')) return;
    const { error } = await supabase.from('cobrancas').update({ status: 'cancelado' }).eq('id', c.id);
    if (error) return toast(`Erro: ${error.message}`, 'erro');
    toast('Cobrança cancelada.');
    carregar();
  }

  async function enviarWhatsApp(c: Cobranca) {
    setEnviandoId(c.id);
    try {
      const res = await fetch('/api/cobranca/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cobranca_id: c.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha no envio');
      toast('Cobrança enviada por WhatsApp.');
      await carregar();
    } catch (e: any) {
      toast(`Erro ao enviar: ${e.message}`, 'erro');
    } finally {
      setEnviandoId(null);
    }
  }

  const visiveis = cobrancas.filter((c) => {
    if (aba === 'pendentes') return c.status === 'pendente';
    if (aba === 'pagas') return c.status === 'pago';
    return true;
  });

  const pendentesClientes = cobrancas.filter((c) => c.status === 'pendente' && c.tipo === 'cliente');
  const pendentesRevendas = cobrancas.filter((c) => c.status === 'pendente' && c.tipo === 'revendedor');
  const totalPendenteClientes = pendentesClientes.reduce((s, c) => s + Number(c.valor), 0);
  const totalPendenteRevendas = pendentesRevendas.reduce((s, c) => s + Number(c.valor), 0);

  function nomeDestino(c: Cobranca) {
    return c.tipo === 'cliente' ? c.clientes?.nome ?? '—' : c.revendedores?.nome ?? '—';
  }

  return (
    <div>
      <PageTitle
        title="Receitas"
        subtitle="Cobranças de clientes e mensalidades de revendas"
        action={
          <div className="flex gap-2">
            <Btn variant="secondary" onClick={gerarRenovacoes} disabled={gerando}>
              <RefreshCw size={15} /> Gerar renovações
            </Btn>
            <Btn variant="secondary" onClick={gerarMensalidades} disabled={gerando}>
              <Plus size={15} /> Gerar receita de revendas
            </Btn>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
            <Users size={20} />
          </div>
          <div>
            <div className="text-[11px] text-slate-500">A receber de clientes ({pendentesClientes.length})</div>
            <div className="text-lg font-bold text-slate-900">{fmtMoeda(totalPendenteClientes)}</div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-violet-100 text-violet-600 flex items-center justify-center shrink-0">
            <Store size={20} />
          </div>
          <div>
            <div className="text-[11px] text-slate-500">A receber de revendas ({pendentesRevendas.length})</div>
            <div className="text-lg font-bold text-slate-900">{fmtMoeda(totalPendenteRevendas)}</div>
          </div>
        </div>
      </div>
      <p className="text-xs text-slate-400 -mt-3 mb-4">
        A receita de cada revendedor é calculada em <b>Revendas &gt; Revendedores</b>: quanto ele paga por
        acesso × quantos clientes ativos ele tem. Clique em <b>Gerar receita de revendas</b> para lançar a
        mensalidade do mês aqui.
      </p>

      <div className="flex gap-1 mb-4 bg-slate-200/70 rounded-lg p-1 w-fit">
        {(
          [
            ['pendentes', 'Pendentes'],
            ['pagas', 'Pagas'],
            ['todas', 'Todas'],
          ] as [Aba, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setAba(k)}
            className={
              aba === k
                ? 'px-4 py-1.5 rounded-md bg-white shadow text-sm font-medium text-slate-800'
                : 'px-4 py-1.5 rounded-md text-sm text-slate-500 hover:text-slate-800'
            }
          >
            {label}
          </button>
        ))}
      </div>

      {carregando ? (
        <Carregando />
      ) : visiveis.length === 0 ? (
        <Vazio>Nenhuma cobrança aqui. Use os botões acima para gerar renovações e receita de revendas.</Vazio>
      ) : (
        <Tabela>
          <thead>
            <tr>
              <Th>Origem</Th>
              <Th>Descrição</Th>
              <Th>Valor</Th>
              <Th>Vencimento</Th>
              <Th>Status</Th>
              <Th>WhatsApp</Th>
              <Th className="text-right">Ações</Th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((c) => {
              const dias = diasAte(c.vencimento);
              return (
                <tr key={c.id} className="hover:bg-slate-50">
                  <Td>
                    <span className="font-medium text-slate-800">{nomeDestino(c)}</span>
                    <div className="text-xs text-slate-400">
                      {c.tipo === 'cliente' ? 'Cliente' : 'Revendedor master'}
                    </div>
                  </Td>
                  <Td>{c.descricao ?? '—'}</Td>
                  <Td className="font-medium">{fmtMoeda(c.valor)}</Td>
                  <Td>
                    {fmtData(c.vencimento)}
                    {c.status === 'pendente' && dias !== null && dias < 0 && (
                      <div className="text-xs text-rose-600">{-dias}d de atraso</div>
                    )}
                  </Td>
                  <Td>
                    {c.status === 'pago' ? (
                      <Badge cor="verde">Paga {c.forma_pagamento ? `· ${c.forma_pagamento}` : ''}</Badge>
                    ) : c.status === 'cancelado' ? (
                      <Badge cor="cinza">Cancelada</Badge>
                    ) : dias !== null && dias < 0 ? (
                      <Badge cor="vermelho">Atrasada</Badge>
                    ) : (
                      <Badge cor="amarelo">Pendente</Badge>
                    )}
                  </Td>
                  <Td>
                    {c.whatsapp_enviado_em ? (
                      <span className="text-xs text-emerald-600">
                        Enviado {fmtData(c.whatsapp_enviado_em.slice(0, 10))}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">Não enviado</span>
                    )}
                  </Td>
                  <Td className="text-right whitespace-nowrap">
                    {c.status === 'pendente' && (
                      <span className="inline-flex gap-1.5">
                        <Btn
                          size="sm"
                          variant="secondary"
                          title="Enviar cobrança por WhatsApp"
                          onClick={() => enviarWhatsApp(c)}
                          disabled={enviandoId === c.id}
                        >
                          <MessageCircle size={14} />
                          {enviandoId === c.id ? 'Enviando…' : 'Cobrar'}
                        </Btn>
                        <Btn size="sm" variant="success" onClick={() => abrirPagamento(c)}>
                          <CheckCircle2 size={14} /> Receber
                        </Btn>
                        <button
                          onClick={() => cancelarCobranca(c)}
                          className="p-1.5 text-slate-400 hover:text-rose-600"
                          title="Cancelar cobrança"
                        >
                          <XCircle size={16} />
                        </button>
                      </span>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Tabela>
      )}

      <Modal
        open={!!pagando}
        onClose={() => setPagando(null)}
        title="Registrar pagamento"
        footer={
          <>
            <Btn variant="secondary" onClick={() => setPagando(null)}>Cancelar</Btn>
            <Btn variant="success" onClick={confirmarPagamento} disabled={salvandoPg}>
              {salvandoPg ? 'Salvando…' : 'Confirmar pagamento'}
            </Btn>
          </>
        }
      >
        {pagando && (
          <div className="space-y-3">
            <Card>
              <div className="text-sm">
                <div className="font-medium text-slate-800">{nomeDestino(pagando)}</div>
                <div className="text-slate-500">{pagando.descricao}</div>
                <div className="text-lg font-bold mt-1">{fmtMoeda(pagando.valor)}</div>
              </div>
            </Card>
            <div className="grid grid-cols-2 gap-3">
              <Select label="Forma de pagamento" value={formaPg} onChange={(e) => setFormaPg(e.target.value)}>
                <option>PIX</option>
                <option>Mercado Pago</option>
                <option>Asaas</option>
                <option>PicPay</option>
                <option>Dinheiro</option>
                <option>Outro</option>
              </Select>
              <Input label="Data do pagamento" type="date" value={dataPg} onChange={(e) => setDataPg(e.target.value)} />
            </div>
            {pagando.tipo === 'cliente' && (
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={renovar} onChange={(e) => setRenovar(e.target.checked)} />
                Renovar vencimento do cliente conforme o plano
              </label>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
