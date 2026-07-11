'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Btn, Badge, Carregando, Input, Modal, PageTitle, Select, Tabela, Td, TextArea, Th, toast, Vazio,
} from '@/components/ui';
import { fmtData, fmtMoeda, hojeISO, mesAtualISO, nomeMes } from '@/lib/utils';
import type { Despesa } from '@/types';
import { Pencil, Plus, Trash2 } from 'lucide-react';

const CATEGORIAS = ['Servidor', 'Painel', 'Aplicativos', 'Internet', 'Marketing', 'Comissões', 'Impostos', 'Geral'];

export default function DespesasPage() {
  const supabase = useMemo(() => createClient(), []);
  const [despesas, setDespesas] = useState<Despesa[]>([]);
  const [mes, setMes] = useState(mesAtualISO());
  const [carregando, setCarregando] = useState(true);
  const [modal, setModal] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState({
    descricao: '', categoria: 'Geral', valor: '', data: hojeISO(), recorrente: false, observacoes: '',
  });

  async function carregar() {
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

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes]);

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
    carregar();
  }

  async function excluir(d: Despesa) {
    if (!confirm(`Excluir a despesa "${d.descricao}"?`)) return;
    const { error } = await supabase.from('despesas').delete().eq('id', d.id);
    if (error) return toast(`Erro ao excluir: ${error.message}`, 'erro');
    toast('Despesa excluída.');
    carregar();
  }

  const total = despesas.reduce((s, d) => s + Number(d.valor), 0);

  return (
    <div>
      <PageTitle
        title="Despesas"
        subtitle={`${nomeMes(mes)} — total ${fmtMoeda(total)}`}
        action={
          <Btn onClick={abrirNovo}>
            <Plus size={16} /> Nova despesa
          </Btn>
        }
      />

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
