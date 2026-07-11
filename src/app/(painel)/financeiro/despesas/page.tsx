'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Btn, Badge, Card, Carregando, Input, Modal, PageTitle, Select, Tabela, Td, TextArea, Th, toast, Vazio,
} from '@/components/ui';
import { fmtData, fmtMoeda, fmtTelefone, hojeISO, mesAtualISO, nomeMes } from '@/lib/utils';
import type { Comissao, Despesa } from '@/types';
import {
  CheckCircle2, Copy, CreditCard, Pencil, Plus, Receipt, RotateCcw, Trash2, Wallet,
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

  // ---- Indicações (comissões) ----
  const [comissoes, setComissoes] = useState<Comissao[]>([]);
  const [carregandoCom, setCarregandoCom] = useState(true);
  const [verIndicador, setVerIndicador] = useState<Comissao | null>(null);

  async function carregarDespesas() {
    setCarregando(true);
    const inicio = `${mes}-01`;
    const [y, m] = mes.split('-').map(Number);
    const fim = new Date(y, m, 0).toISOString().slice(0, 10);
    const { data } = await supabase
      .from('despesas')
      .select('*')
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

  async function marcarComissaoPaga(cm: Comissao) {
    const { error } = await supabase
      .from('comissoes')
      .update({ status: 'pago', pago_em: hojeISO() })
      .eq('id', cm.id);
    if (error) return toast(`Erro: ${error.message}`, 'erro');
    toast('Comissão marcada como paga.');
    carregarComissoes();
    if (verIndicador?.id === cm.id) setVerIndicador(null);
  }

  function copiarPix(chave: string | null | undefined) {
    if (!chave) return toast('Este indicador não tem chave PIX cadastrada.', 'erro');
    navigator.clipboard.writeText(chave);
    toast('Chave PIX copiada.');
  }

  const totalDespesas = despesas.reduce((s, d) => s + Number(d.valor), 0);
  const totalDespesasPagas = despesas.filter((d) => d.pago).reduce((s, d) => s + Number(d.valor), 0);
  const totalDespesasPendentes = totalDespesas - totalDespesasPagas;

  const totalComissoesPendentes = comissoes.filter((c) => c.status === 'pendente').reduce((s, c) => s + Number(c.valor), 0);
  const totalComissoesPagas = comissoes.filter((c) => c.status === 'pago').reduce((s, c) => s + Number(c.valor), 0);

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
                {despesas.map((d) => (
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
                      <button
                        onClick={() => alternarPago(d)}
                        className="p-1.5 text-slate-400 hover:text-emerald-600"
                        title={d.pago ? 'Marcar como pendente' : 'Marcar como paga'}
                      >
                        {d.pago ? <RotateCcw size={16} /> : <CheckCircle2 size={16} />}
                      </button>
                      <button onClick={() => abrirEdicao(d)} className="p-1.5 text-slate-400 hover:text-indigo-600" title="Editar">
                        <Pencil size={16} />
                      </button>
                      <button onClick={() => excluir(d)} className="p-1.5 text-slate-400 hover:text-rose-600" title="Excluir">
                        <Trash2 size={16} />
                      </button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
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
          ) : comissoes.length === 0 ? (
            <Vazio>Nenhuma comissão gerada ainda. Elas são criadas automaticamente ao registrar o pagamento de um cliente indicado (em Financeiro &gt; Receitas).</Vazio>
          ) : (
            <Tabela>
              <thead>
                <tr>
                  <Th>Indicador</Th>
                  <Th>Cliente</Th>
                  <Th>Valor</Th>
                  <Th>Status</Th>
                  <Th>Pago em</Th>
                  <Th className="text-right">Ações</Th>
                </tr>
              </thead>
              <tbody>
                {comissoes.map((cm) => (
                  <tr key={cm.id} className="hover:bg-slate-50">
                    <Td>
                      <button
                        onClick={() => setVerIndicador(cm)}
                        className="font-medium text-indigo-600 hover:underline"
                        title="Ver dados de pagamento (PIX)"
                      >
                        {(cm as any).revendedores?.nome ?? '—'}
                      </button>
                    </Td>
                    <Td>{cm.clientes?.nome ?? '—'}</Td>
                    <Td>{fmtMoeda(cm.valor)}</Td>
                    <Td>
                      {cm.status === 'pago' ? <Badge cor="verde">Paga</Badge> : <Badge cor="amarelo">Pendente</Badge>}
                    </Td>
                    <Td>{fmtData(cm.pago_em)}</Td>
                    <Td className="text-right whitespace-nowrap">
                      <button
                        onClick={() => setVerIndicador(cm)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600"
                        title="Ver PIX para pagar"
                      >
                        <CreditCard size={16} />
                      </button>
                      {cm.status === 'pendente' && (
                        <Btn size="sm" variant="success" onClick={() => marcarComissaoPaga(cm)}>
                          <CheckCircle2 size={14} /> Marcar paga
                        </Btn>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
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
        footer={
          verIndicador?.status === 'pendente' ? (
            <Btn variant="success" onClick={() => verIndicador && marcarComissaoPaga(verIndicador)}>
              <CheckCircle2 size={14} /> Marcar como paga
            </Btn>
          ) : undefined
        }
      >
        {verIndicador && (
          <div className="space-y-3 text-sm">
            <Card>
              <div className="font-semibold text-slate-800">{(verIndicador as any).revendedores?.nome ?? '—'}</div>
              <div className="text-slate-500">{fmtTelefone((verIndicador as any).revendedores?.telefone ?? null)}</div>
              <div className="text-lg font-bold mt-2">{fmtMoeda(verIndicador.valor)}</div>
              <div className="text-xs text-slate-400">Comissão referente a {verIndicador.clientes?.nome ?? 'cliente indicado'}</div>
            </Card>
            <div>
              <span className="block text-xs font-medium text-slate-600 mb-1">Chave PIX</span>
              <div className="flex gap-2">
                <div className="flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm truncate">
                  {(verIndicador as any).revendedores?.chave_pix || 'Não cadastrada'}
                </div>
                <Btn
                  size="sm" variant="secondary"
                  onClick={() => copiarPix((verIndicador as any).revendedores?.chave_pix)}
                >
                  <Copy size={14} /> Copiar
                </Btn>
              </div>
              <p className="text-[11px] text-slate-400 mt-2">
                Faça o PIX manualmente pelo app do seu banco e depois marque a comissão como paga.
              </p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
