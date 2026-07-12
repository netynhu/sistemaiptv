'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Btn, Badge, Card, Carregando, Input, Modal, PageTitle, Select, Tabela, Td, Th, toast, Vazio,
} from '@/components/ui';
import { addMeses, diasAte, fmtData, fmtMoeda, hojeISO, mesAtualISO, nomeComUsuario } from '@/lib/utils';
import type { Cobranca } from '@/types';
import { CheckCircle2, MessageCircle, Search, Store, Users, XCircle } from 'lucide-react';

type Aba = 'pendentes' | 'pagas' | 'todas';

export default function ReceitasPage() {
  const supabase = useMemo(() => createClient(), []);
  const [aba, setAba] = useState<Aba>('pendentes');
  const [cobrancas, setCobrancas] = useState<Cobranca[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [enviandoId, setEnviandoId] = useState<string | null>(null);
  const [mes, setMes] = useState('');
  const [busca, setBusca] = useState('');

  // modal de pagamento
  const [pagando, setPagando] = useState<Cobranca | null>(null);
  const [formaPg, setFormaPg] = useState('PIX');
  const [dataPg, setDataPg] = useState(hojeISO());
  const [renovar, setRenovar] = useState(true);
  const [salvandoPg, setSalvandoPg] = useState(false);

  // Garante, sem precisar de botão, que todo cliente ativo e todo revendedor master
  // tenham a receita esperada lançada aqui (clientes: ao serem cadastrados já entram;
  // isto aqui cobre cadastros antigos e a virada de mês das revendas).
  async function reconciliar(cobrancasAtuais: Cobranca[]) {
    const [{ data: clientesAtivos }, { data: revendasAtivas }] = await Promise.all([
      supabase.from('clientes').select('id, valor, data_vencimento, planos(nome)').eq('status', 'ativo'),
      supabase.from('revendedores').select('id, valor_por_acesso, quantidade_clientes, dia_vencimento').eq('tipo', 'master').eq('ativo', true),
    ]);

    const pendentesCliente = new Set(
      cobrancasAtuais.filter((c) => c.tipo === 'cliente' && c.status === 'pendente').map((c) => c.cliente_id)
    );
    const novasCliente = (clientesAtivos ?? [])
      .filter((c: any) => c.data_vencimento && !pendentesCliente.has(c.id))
      .map((c: any) => ({
        tipo: 'cliente',
        cliente_id: c.id,
        descricao: c.planos?.nome ? `Assinatura — ${c.planos.nome}` : 'Assinatura',
        valor: c.valor,
        vencimento: c.data_vencimento,
      }));

    const mes = mesAtualISO();
    const revendasGeradasEsteMes = new Set(
      cobrancasAtuais
        .filter((c) => c.tipo === 'revendedor' && c.vencimento.startsWith(mes) && c.status !== 'cancelado')
        .map((c) => c.revendedor_id)
    );
    const novasRevenda = (revendasAtivas ?? [])
      .filter((r: any) => !revendasGeradasEsteMes.has(r.id) && (r.quantidade_clientes ?? 0) > 0)
      .map((r: any) => {
        const dia = String(Math.min(r.dia_vencimento ?? 10, 28)).padStart(2, '0');
        return {
          tipo: 'revendedor',
          revendedor_id: r.id,
          descricao: `Mensalidade — ${r.quantidade_clientes} acesso(s) × ${fmtMoeda(r.valor_por_acesso)}`,
          valor: Math.round(r.quantidade_clientes * r.valor_por_acesso * 100) / 100,
          vencimento: `${mes}-${dia}`,
        };
      });

    const novas = [...novasCliente, ...novasRevenda];
    if (novas.length > 0) {
      await supabase.from('cobrancas').insert(novas);
    }
    return novas.length > 0;
  }

  async function carregar() {
    setCarregando(true);
    const { data: primeira } = await supabase
      .from('cobrancas')
      .select('*, clientes(*, planos(*), revendedores(*)), revendedores(*)')
      .order('vencimento', { ascending: true });

    const gerouAlgo = await reconciliar((primeira as Cobranca[]) ?? []);

    if (gerouAlgo) {
      const { data: atualizada } = await supabase
        .from('cobrancas')
        .select('*, clientes(*, planos(*), revendedores(*)), revendedores(*)')
        .order('vencimento', { ascending: true });
      setCobrancas((atualizada as Cobranca[]) ?? []);
    } else {
      setCobrancas((primeira as Cobranca[]) ?? []);
    }
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

      // Renova o vencimento do cliente e já lança a próxima receita, sem precisar de botão
      if (renovar && pagando.tipo === 'cliente' && cliente?.planos) {
        const base =
          cliente.data_vencimento && cliente.data_vencimento >= hojeISO()
            ? cliente.data_vencimento
            : hojeISO();
        const novoVencimento = addMeses(base, cliente.planos.meses);

        await supabase.from('clientes').update({ data_vencimento: novoVencimento }).eq('id', cliente.id);

        await supabase.from('cobrancas').insert({
          tipo: 'cliente',
          cliente_id: cliente.id,
          descricao: `Assinatura — ${cliente.planos.nome}`,
          valor: cliente.valor,
          vencimento: novoVencimento,
        });
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
    if (aba === 'pendentes' && c.status !== 'pendente') return false;
    if (aba === 'pagas' && c.status !== 'pago') return false;
    if (mes && !c.vencimento.startsWith(mes)) return false;
    if (busca && !nomeDestino(c).toLowerCase().includes(busca.toLowerCase())) return false;
    return true;
  });

  const pendentesClientes = cobrancas.filter((c) => c.status === 'pendente' && c.tipo === 'cliente');
  const pendentesRevendas = cobrancas.filter((c) => c.status === 'pendente' && c.tipo === 'revendedor');
  const totalPendenteClientes = pendentesClientes.reduce((s, c) => s + Number(c.valor), 0);
  const totalPendenteRevendas = pendentesRevendas.reduce((s, c) => s + Number(c.valor), 0);

  function nomeDestino(c: Cobranca) {
    return c.tipo === 'cliente'
      ? nomeComUsuario(c.clientes?.nome, c.clientes?.usuario)
      : c.revendedores?.nome ?? '—';
  }

  return (
    <div>
      <PageTitle title="Receitas" subtitle="Gerado automaticamente — nenhum botão para clicar" />

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
        Todo cliente cadastrado entra aqui sozinho. A receita de cada revendedor master vem do que foi
        informado no cadastro dele (Revendas &gt; Revendedores): quanto ele paga por acesso × quantos
        clientes ele tem.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex gap-1 bg-slate-200/70 rounded-lg p-1 w-fit">
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

        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm outline-none focus:border-indigo-500 w-56"
              placeholder="Buscar por nome…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <input
            type="month"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
          />
          {mes && (
            <button
              onClick={() => setMes('')}
              className="text-xs text-slate-400 hover:text-slate-700 px-1"
              title="Ver todos os meses"
            >
              Limpar mês
            </button>
          )}
        </div>
      </div>

      {carregando ? (
        <Carregando />
      ) : visiveis.length === 0 ? (
        <Vazio>
          {busca || mes ? 'Nenhuma cobrança encontrada com esse filtro.' : 'Nenhuma cobrança aqui.'}
        </Vazio>
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
                Renovar vencimento e já lançar a próxima receita
              </label>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
