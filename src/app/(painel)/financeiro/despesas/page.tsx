'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Btn, Badge, Carregando, Input, Modal, PageTitle, Select, Tabela, Td, TextArea, Th, toast, Vazio,
} from '@/components/ui';
import { fmtData, fmtMoeda, hojeISO, mesAtualISO, nomeMes } from '@/lib/utils';
import type { Comissao, Despesa } from '@/types';
import { CheckCircle2, Pencil, Plus, Trash2 } from 'lucide-react';

const CATEGORIAS = ['Servidor', 'Painel', 'Aplicativos', 'Internet', 'Marketing', 'Impostos', 'Geral'];

type Aba = 'despesas' | 'comissoes';

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
    descricao: '', categoria: 'Geral', valor: '', data: hojeISO(), recorrente: false, observacoes: '',
  });

  // ---- Comissões ----
  const [comissoes, setComissoes] = useState<Comissao[]>([]);
  const [carregandoCom, setCarregandoCom] = useState(true);

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
    setForm({ descricao: '', categoria: 'Geral', valor: '', data: hojeISO(), recorrente: false, observacoes: '' });
    setModal(true);
  }

  function abrirEdicao(d: Despesa) {
    setEditandoId(d.id);
    setForm({
      descricao: d.descricao, categoria: d.categoria, valor: String(d.valor),
      data: d.data, recorrente: d.recorrente, observacoes: d.observacoes ?? '',
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

  async function marcarComissaoPaga(cm: Comissao) {
    const { error } = await supabase
      .from('comissoes')
      .update({ status: 'pago', pago_em: hojeISO() })
      .eq('id', cm.id);
    if (error) return toast(`Erro: ${error.message}`, 'erro');
    toast('Comissão marcada como paga.');
    carregarComissoes();
  }

  const totalDespesas = despesas.reduce((s, d) => s + Number(d.valor), 0);
  const totalComissoesPendentes = comissoes
    .filter((c) => c.status === 'pendente')
    .reduce((s, c) => s + Number(c.valor), 0);

  return (
    <div>
      <PageTitle
        title="Despesas"
        subtitle={
          aba === 'despesas'
            ? `${nomeMes(mes)} — total ${fmtMoeda(totalDespesas)}`
            : `Comissões pendentes: ${fmtMoeda(totalComissoesPendentes)}`
        }
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
            ['comissoes', 'Comissões (indicadores)'],
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
                  <Th>Recorrente</Th>
                  <Th className="text-right">Ações</Th>
                </tr>
              </thead>
              <tbody>
                {despesas.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <Td>{fmtData(d.data)}</Td>
                    <Td>
                      <span className="font-medium text-slate-800">{d.descricao}</span>
                      {d.observacoes && <div className="text-xs text-slate-400">{d.observacoes}</div>}
                    </Td>
                    <Td><Badge cor="azul">{d.categoria}</Badge></Td>
                    <Td className="font-medium">{fmtMoeda(d.valor)}</Td>
                    <Td>{d.recorrente ? <Badge cor="roxo">Mensal</Badge> : <span className="text-slate-400 text-xs">Única</span>}</Td>
                    <Td className="text-right whitespace-nowrap">
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
      ) : carregandoCom ? (
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
                <Td className="font-medium">{(cm as any).revendedores?.nome ?? '—'}</Td>
                <Td>{cm.clientes?.nome ?? '—'}</Td>
                <Td>{fmtMoeda(cm.valor)}</Td>
                <Td>
                  {cm.status === 'pago' ? <Badge cor="verde">Paga</Badge> : <Badge cor="amarelo">Pendente</Badge>}
                </Td>
                <Td>{fmtData(cm.pago_em)}</Td>
                <Td className="text-right">
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
          <TextArea label="Observações" className="sm:col-span-2" value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
        </div>
      </Modal>
    </div>
  );
}
