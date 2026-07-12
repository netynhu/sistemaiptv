'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Btn, Badge, Card, Carregando, cls, Input, Modal, PageTitle, Select, Tabela, Td, TextArea, Th, toast, Vazio,
} from '@/components/ui';
import { fmtData, fmtMoeda, fmtTelefone, hojeISO, mesAtualISO, nomeComUsuario, nomeMes } from '@/lib/utils';
import type { Comissao, Despesa, Revendedor } from '@/types';
import {
  CheckCircle2, ChevronDown, Copy, CreditCard, Pencil, Plus, Receipt, RotateCcw, Trash2, Users, Wallet,
} from 'lucide-react';

const CATEGORIAS = ['Servidor', 'Painel', 'Assist Plus', 'Aplicativos', 'Internet', 'Marketing', 'Impostos', 'Geral'];

type Aba = 'despesas' | 'indicacoes';

export default function DespesasPage() {
  const supabase = useMemo(() => createClient(), []);
  const [aba, setAba] = useState<Aba>('despesas');

  // ---- Despesas gerais ----
  const [despesas, setDespesas] = useState<Despesa[]>([]);
  const [mes, setMes] = useState(mesAtualISO());
  const [carregando, setCarregando] = useState(true);
  const [modal, setModal] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState({
    descricao: '', categoria: 'Geral', valor: '', data: hojeISO(), recorrente: false,
    pago: false, pago_em: hojeISO(), observacoes: '',
  });

  // ---- Indicações (comissões, agrupadas por indicador) ----
  const [comissoes, setComissoes] = useState<Comissao[]>([]);
  const [carregandoCom, setCarregandoCom] = useState(true);
  const [verIndicador, setVerIndicador] = useState<Revendedor | null>(null);
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});

  async function carregarDespesas() {
    setCarregando(true);
    const inicio = `${mes}-01`;
    const [y, m] = mes.split('-').map(Number);
    const fim = new Date(y, m, 0).toISOString().slice(0, 10);
    const { data } = await supabase
      .from('despesas')
      .select('*, clientes(nome, usuario)')
      .gte('data', inicio)
      .lte('data', fim)
      .order('data', { ascending: false });
    setDespesas((data as Despesa[]) ?? []);
    setCarregando(false);
  }

  async function carregarComissoes() {
    setCarregandoCom(true);
    const { data } = await supabase
      .from('comissoes')
      .select('*, revendedores(*), clientes(*)')
      .order('criado_em', { ascending: false });
    setComissoes((data as unknown as Comissao[]) ?? []);
    setCarregandoCom(false);
  }

  useEffect(() => {
    carregarDespesas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes]);

  useEffect(() => {
    carregarComissoes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function abrirNovo() {
    setEditandoId(null);
    setForm({ descricao: '', categoria: 'Geral', valor: '', data: hojeISO(), recorrente: false, pago: false, pago_em: hojeISO(), observacoes: '' });
    setModal(true);
  }

  function abrirEdicao(d: Despesa) {
    setEditandoId(d.id);
    setForm({
      descricao: d.descricao, categoria: d.categoria, valor: String(d.valor),
      data: d.data, recorrente: d.recorrente, pago: d.pago, pago_em: d.pago_em ?? hojeISO(),
      observacoes: d.observacoes ?? '',
    });
    setModal(true);
  }

  async function salvar() {
    if (!form.descricao.trim()) return toast('Informe a descrição.', 'erro');
    const valor = parseFloat(form.valor || '0');
    if (!valor) return toast('Informe o valor.', 'erro');
    setSalvando(true);
    const registro = {
      descricao: form.descricao.trim(),
      categoria: form.categoria,
      valor,
      data: form.data,
      recorrente: form.recorrente,
      pago: form.pago,
      pago_em: form.pago ? (form.pago_em || hojeISO()) : null,
      observacoes: form.observacoes || null,
    };
    const { error } = editandoId
      ? await supabase.from('despesas').update(registro).eq('id', editandoId)
      : await supabase.from('despesas').insert(registro);
    setSalvando(false);
    if (error) return toast(`Erro ao salvar: ${error.message}`, 'erro');
    toast('Despesa salva.');
    setModal(false);
    carregarDespesas();
  }

  async function excluir(d: Despesa) {
    if (!confirm(`Excluir a despesa "${d.descricao}"?`)) return;
    const { error } = await supabase.from('despesas').delete().eq('id', d.id);
    if (error) return toast(`Erro ao excluir: ${error.message}`, 'erro');
    toast('Despesa excluída.');
    carregarDespesas();
  }

  async function alternarPago(d: Despesa) {
    const novoPago = !d.pago;
    const { error } = await supabase
      .from('despesas')
      .update({ pago: novoPago, pago_em: novoPago ? hojeISO() : null })
      .eq('id', d.id);
    if (error) return toast(`Erro: ${error.message}`, 'erro');
    toast(novoPago ? 'Despesa marcada como paga.' : 'Despesa marcada como pendente.');
    carregarDespesas();
  }

  async function pagarTodasDespesas(itens: Despesa[]) {
    const pendentes = itens.filter((d) => !d.pago);
    if (pendentes.length === 0) return;
    if (!confirm(`Marcar ${pendentes.length} despesa(s) como paga(s)?`)) return;
    const { error } = await supabase
      .from('despesas')
      .update({ pago: true, pago_em: hojeISO() })
      .in('id', pendentes.map((d) => d.id));
    if (error) return toast(`Erro: ${error.message}`, 'erro');
    toast(`${pendentes.length} despesa(s) marcada(s) como paga(s).`);
    carregarDespesas();
  }

  async function marcarComissaoPaga(cm: Comissao) {
    const { error } = await supabase
      .from('comissoes')
      .update({ status: 'pago', pago_em: hojeISO() })
      .eq('id', cm.id);
    if (error) return toast(`Erro: ${error.message}`, 'erro');
    toast('Comissão marcada como paga.');
    carregarComissoes();
  }

  async function pagarTodasComissoes(nome: string, itens: Comissao[]) {
    const pendentes = itens.filter((c) => c.status === 'pendente');
    if (pendentes.length === 0) return;
    if (!confirm(`Marcar ${pendentes.length} comissão(ões) pendente(s) de ${nome} como paga(s)?`)) return;
    const { error } = await supabase
      .from('comissoes')
      .update({ status: 'pago', pago_em: hojeISO() })
      .in('id', pendentes.map((c) => c.id));
    if (error) return toast(`Erro: ${error.message}`, 'erro');
    toast(`${pendentes.length} comissão(ões) marcada(s) como paga(s).`);
    carregarComissoes();
  }

  function alternarGrupo(chave: string) {
    setAbertos((a) => ({ ...a, [chave]: !a[chave] }));
  }

  function copiarPix(chave: string | null | undefined) {
    if (!chave) return toast('Este indicador não tem chave PIX cadastrada.', 'erro');
    navigator.clipboard.writeText(chave);
    toast('Chave PIX copiada.');
  }

  const totalDespesas = despesas.reduce((s, d) => s + Number(d.valor), 0);
  const totalDespesasPagas = despesas.filter((d) => d.pago).reduce((s, d) => s + Number(d.valor), 0);
  const totalDespesasPendentes = totalDespesas - totalDespesasPagas;

  // As despesas do Assist Plus (uma por cliente) ficam agrupadas num card só, à parte das demais
  const despesasAssistPlus = despesas.filter((d) => d.categoria === 'Assist Plus');
  const despesasOutras = despesas.filter((d) => d.categoria !== 'Assist Plus');
  const assistPlusPendente = despesasAssistPlus.filter((d) => !d.pago).reduce((s, d) => s + Number(d.valor), 0);
  const assistPlusPago = despesasAssistPlus.filter((d) => d.pago).reduce((s, d) => s + Number(d.valor), 0);

  const totalComissoesPendentes = comissoes.filter((c) => c.status === 'pendente').reduce((s, c) => s + Number(c.valor), 0);
  const totalComissoesPagas = comissoes.filter((c) => c.status === 'pago').reduce((s, c) => s + Number(c.valor), 0);

  // Agrupa as comissões por indicador — o nome aparece uma única vez, com o total dele
  const gruposIndicadores = useMemo(() => {
    const mapa = new Map<string, { indicador: Revendedor; itens: Comissao[]; pendente: number; pago: number }>();
    for (const cm of comissoes) {
      const ind = (cm as any).revendedores as Revendedor | null;
      if (!ind) continue;
      if (!mapa.has(ind.id)) mapa.set(ind.id, { indicador: ind, itens: [], pendente: 0, pago: 0 });
      const grupo = mapa.get(ind.id)!;
      grupo.itens.push(cm);
      if (cm.status === 'pendente') grupo.pendente += Number(cm.valor);
      else grupo.pago += Number(cm.valor);
    }
    return Array.from(mapa.values()).sort((a, b) => b.pendente - a.pendente);
  }, [comissoes]);

  return (
    <div>
      <PageTitle
        title="Despesas"
        subtitle={aba === 'despesas' ? nomeMes(mes) : 'Comissões de indicação'}
        action={
          aba === 'despesas' ? (
            <Btn onClick={abrirNovo}>
              <Plus size={16} /> Nova despesa
            </Btn>
          ) : undefined
        }
      />

      <div className="flex gap-1 mb-4 bg-slate-200/70 rounded-lg p-1 w-fit">
        {(
          [
            ['despesas', 'Despesas gerais'],
            ['indicacoes', 'Indicações'],
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

      {aba === 'despesas' ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                <Wallet size={20} />
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Total do mês</div>
                <div className="text-lg font-bold text-slate-900">{fmtMoeda(totalDespesas)}</div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                <CheckCircle2 size={20} />
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Pagas</div>
                <div className="text-lg font-bold text-slate-900">{fmtMoeda(totalDespesasPagas)}</div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                <Receipt size={20} />
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Pendentes</div>
                <div className="text-lg font-bold text-slate-900">{fmtMoeda(totalDespesasPendentes)}</div>
              </div>
            </div>
          </div>

          <div className="mb-4">
            <input
              type="month"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              value={mes}
              onChange={(e) => setMes(e.target.value)}
            />
          </div>

          {carregando ? (
            <Carregando />
          ) : despesas.length === 0 ? (
            <Vazio>Nenhuma despesa lançada neste mês.</Vazio>
          ) : (
            <>
              {despesasAssistPlus.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-4">
                  <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => alternarGrupo('assist-plus')}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    >
                      <ChevronDown size={16} className={cls('shrink-0 text-slate-400 transition-transform', !!abertos['assist-plus'] && 'rotate-180')} />
                      <div className="min-w-0">
                        <div className="font-medium text-slate-800 truncate">Assist Plus</div>
                        <div className="text-xs text-slate-400 flex items-center gap-1">
                          <Users size={12} /> {despesasAssistPlus.length} cliente{despesasAssistPlus.length > 1 ? 's' : ''}
                        </div>
                      </div>
                    </button>
                    <div className="flex items-center gap-4 shrink-0">
                      {assistPlusPago > 0 && (
                        <div className="text-right hidden sm:block">
                          <div className="text-[10px] text-slate-400">Pago</div>
                          <div className="text-sm font-medium text-emerald-600">{fmtMoeda(assistPlusPago)}</div>
                        </div>
                      )}
                      <div className="text-right">
                        <div className="text-[10px] text-slate-400">Pendente</div>
                        <div className="text-sm font-bold text-slate-900">{fmtMoeda(assistPlusPendente)}</div>
                      </div>
                      {assistPlusPendente > 0 && (
                        <Btn size="sm" variant="success" onClick={() => pagarTodasDespesas(despesasAssistPlus)}>
                          <CheckCircle2 size={14} /> Pagar tudo
                        </Btn>
                      )}
                    </div>
                  </div>

                  {!!abertos['assist-plus'] && (
                    <div className="border-t border-slate-100 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr>
                            <Th>Cliente</Th>
                            <Th>Valor</Th>
                            <Th>Status</Th>
                            <Th>Pago em</Th>
                            <Th className="text-right">Ações</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {despesasAssistPlus.map((d) => (
                            <tr key={d.id} className="hover:bg-slate-50">
                              <Td>{d.clientes ? nomeComUsuario(d.clientes.nome, d.clientes.usuario) : d.descricao}</Td>
                              <Td>{fmtMoeda(d.valor)}</Td>
                              <Td>
                                {d.pago ? <Badge cor="verde">Paga</Badge> : <Badge cor="amarelo">Pendente</Badge>}
                              </Td>
                              <Td>{fmtData(d.pago_em)}</Td>
                              <Td className="text-right">
                                {d.pago ? (
                                  <Btn size="sm" variant="secondary" onClick={() => alternarPago(d)}>
                                    <RotateCcw size={14} /> Desfazer
                                  </Btn>
                                ) : (
                                  <Btn size="sm" variant="success" onClick={() => alternarPago(d)}>
                                    <CheckCircle2 size={14} /> Pagar
                                  </Btn>
                                )}
                              </Td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {despesasOutras.length > 0 && (
                <Tabela>
                  <thead>
                    <tr>
                      <Th>Data</Th>
                      <Th>Descrição</Th>
                      <Th>Categoria</Th>
                      <Th>Valor</Th>
                      <Th>Status</Th>
                      <Th className="text-right">Ações</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {despesasOutras.map((d) => (
                      <tr key={d.id} className="hover:bg-slate-50">
                        <Td>{fmtData(d.data)}</Td>
                        <Td>
                          <span className="font-medium text-slate-800">{d.descricao}</span>
                          {d.recorrente && <Badge cor="roxo">Mensal</Badge>}
                          {d.observacoes && <div className="text-xs text-slate-400">{d.observacoes}</div>}
                        </Td>
                        <Td><Badge cor="azul">{d.categoria}</Badge></Td>
                        <Td className="font-medium">{fmtMoeda(d.valor)}</Td>
                        <Td>
                          {d.pago ? (
                            <Badge cor="verde">Paga {d.pago_em ? `· ${fmtData(d.pago_em)}` : ''}</Badge>
                          ) : (
                            <Badge cor="amarelo">Pendente</Badge>
                          )}
                        </Td>
                        <Td className="text-right whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            {d.pago ? (
                              <Btn size="sm" variant="secondary" onClick={() => alternarPago(d)}>
                                <RotateCcw size={14} /> Desfazer
                              </Btn>
                            ) : (
                              <Btn size="sm" variant="success" onClick={() => alternarPago(d)}>
                                <CheckCircle2 size={14} /> Pagar
                              </Btn>
                            )}
                            <button onClick={() => abrirEdicao(d)} className="p-1.5 text-slate-400 hover:text-indigo-600" title="Editar">
                              <Pencil size={16} />
                            </button>
                            <button onClick={() => excluir(d)} className="p-1.5 text-slate-400 hover:text-rose-600" title="Excluir">
                              <Trash2 size={16} />
                            </button>
                          </span>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Tabela>
              )}
            </>
          )}
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                <Wallet size={20} />
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Total geral</div>
                <div className="text-lg font-bold text-slate-900">{fmtMoeda(totalComissoesPendentes + totalComissoesPagas)}</div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                <CheckCircle2 size={20} />
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Pagas</div>
                <div className="text-lg font-bold text-slate-900">{fmtMoeda(totalComissoesPagas)}</div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                <Receipt size={20} />
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Pendentes</div>
                <div className="text-lg font-bold text-slate-900">{fmtMoeda(totalComissoesPendentes)}</div>
              </div>
            </div>
          </div>

          {carregandoCom ? (
            <Carregando />
          ) : gruposIndicadores.length === 0 ? (
            <Vazio>Nenhuma comissão gerada ainda. Elas são criadas automaticamente ao registrar o pagamento de um cliente indicado (em Financeiro &gt; Receitas).</Vazio>
          ) : (
            <div className="space-y-3">
              {gruposIndicadores.map((g) => {
                const aberto = !!abertos[g.indicador.id];
                return (
                  <div key={g.indicador.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between gap-3 px-4 py-3">
                      <button
                        type="button"
                        onClick={() => alternarGrupo(g.indicador.id)}
                        className="flex items-center gap-3 flex-1 min-w-0 text-left"
                      >
                        <ChevronDown size={16} className={cls('shrink-0 text-slate-400 transition-transform', aberto && 'rotate-180')} />
                        <div className="min-w-0">
                          <div className="font-medium text-slate-800 truncate">{g.indicador.nome}</div>
                          <div className="text-xs text-slate-400 flex items-center gap-1">
                            <Users size={12} /> {g.itens.length} cliente{g.itens.length > 1 ? 's' : ''} indicado{g.itens.length > 1 ? 's' : ''}
                          </div>
                        </div>
                      </button>
                      <div className="flex items-center gap-4 shrink-0">
                        {g.pago > 0 && (
                          <div className="text-right hidden sm:block">
                            <div className="text-[10px] text-slate-400">Pago</div>
                            <div className="text-sm font-medium text-emerald-600">{fmtMoeda(g.pago)}</div>
                          </div>
                        )}
                        <div className="text-right">
                          <div className="text-[10px] text-slate-400">Pendente</div>
                          <div className="text-sm font-bold text-slate-900">{fmtMoeda(g.pendente)}</div>
                        </div>
                        {g.pendente > 0 && (
                          <Btn size="sm" variant="success" onClick={() => pagarTodasComissoes(g.indicador.nome, g.itens)}>
                            <CheckCircle2 size={14} /> Pagar tudo
                          </Btn>
                        )}
                        <button
                          onClick={() => setVerIndicador(g.indicador)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600"
                          title="Ver PIX para pagar"
                        >
                          <CreditCard size={18} />
                        </button>
                      </div>
                    </div>

                    {aberto && (
                      <div className="border-t border-slate-100 overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr>
                              <Th>Cliente</Th>
                              <Th>Valor</Th>
                              <Th>Status</Th>
                              <Th>Pago em</Th>
                              <Th className="text-right">Ações</Th>
                            </tr>
                          </thead>
                          <tbody>
                            {g.itens.map((cm) => (
                              <tr key={cm.id} className="hover:bg-slate-50">
                                <Td>{nomeComUsuario(cm.clientes?.nome, cm.clientes?.usuario)}</Td>
                                <Td>{fmtMoeda(cm.valor)}</Td>
                                <Td>
                                  {cm.status === 'pago' ? <Badge cor="verde">Paga</Badge> : <Badge cor="amarelo">Pendente</Badge>}
                                </Td>
                                <Td>{fmtData(cm.pago_em)}</Td>
                                <Td className="text-right">
                                  {cm.status === 'pendente' && (
                                    <Btn size="sm" variant="success" onClick={() => marcarComissaoPaga(cm)}>
                                      <CheckCircle2 size={14} /> Pagar
                                    </Btn>
                                  )}
                                </Td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editandoId ? 'Editar despesa' : 'Nova despesa'}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setModal(false)}>Cancelar</Btn>
            <Btn onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</Btn>
          </>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Descrição *" className="sm:col-span-2" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
          <Select label="Categoria" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
          <Input label="Valor (R$) *" type="number" step="0.01" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
          <Input label="Data" type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
          <Select label="Recorrência" value={form.recorrente ? '1' : '0'} onChange={(e) => setForm({ ...form, recorrente: e.target.value === '1' })}>
            <option value="0">Despesa única</option>
            <option value="1">Recorrente (mensal)</option>
          </Select>
          <Select label="Situação" value={form.pago ? '1' : '0'} onChange={(e) => setForm({ ...form, pago: e.target.value === '1' })}>
            <option value="0">Pendente</option>
            <option value="1">Já paga</option>
          </Select>
          {form.pago && (
            <Input label="Paga em" type="date" value={form.pago_em} onChange={(e) => setForm({ ...form, pago_em: e.target.value })} />
          )}
          <TextArea label="Observações" className="sm:col-span-2" value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
        </div>
      </Modal>

      <Modal
        open={!!verIndicador}
        onClose={() => setVerIndicador(null)}
        title="Dados para pagamento"
      >
        {verIndicador && (
          <div className="space-y-3 text-sm">
            <Card>
              <div className="font-semibold text-slate-800">{verIndicador.nome}</div>
              <div className="text-slate-500">{fmtTelefone(verIndicador.telefone)}</div>
            </Card>
            <div>
              <span className="block text-xs font-medium text-slate-600 mb-1">Chave PIX</span>
              <div className="flex gap-2">
                <div className="flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm truncate">
                  {verIndicador.chave_pix || 'Não cadastrada'}
                </div>
                <Btn size="sm" variant="secondary" onClick={() => copiarPix(verIndicador.chave_pix)}>
                  <Copy size={14} /> Copiar
                </Btn>
              </div>
              <p className="text-[11px] text-slate-400 mt-2">
                Faça o PIX manualmente pelo app do seu banco e depois marque cada comissão como paga na lista
                de clientes dele.
              </p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
