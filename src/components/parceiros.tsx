'use client';

// CRUD compartilhado entre Revendedores (master) e Indicadores (indicação)

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Btn, Badge, Carregando, Input, Modal, PageTitle, Select, Tabela, Td, TextArea, Th, toast, Vazio,
} from '@/components/ui';
import { fmtMoeda, fmtTelefone, normalizarTelefone } from '@/lib/utils';
import type { Revendedor } from '@/types';
import { Pencil, Plus, Trash2 } from 'lucide-react';

type Props = { tipo: 'master' | 'indicacao' };

const TEXTOS = {
  master: {
    titulo: 'Revendedores Master',
    subtitulo: 'Fazem as próprias vendas e pagam uma mensalidade por acesso ativo',
    novo: 'Novo revendedor',
    modalNovo: 'Novo revendedor master',
    modalEditar: 'Editar revendedor',
  },
  indicacao: {
    titulo: 'Indicação',
    subtitulo: 'Indicam clientes e recebem comissão por pagamento',
    novo: 'Novo indicador',
    modalNovo: 'Novo indicador',
    modalEditar: 'Editar indicador',
  },
};

export default function Parceiros({ tipo }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const t = TEXTOS[tipo];
  const [lista, setLista] = useState<Revendedor[]>([]);
  const [contagens, setContagens] = useState<Record<string, number>>({});
  const [padrao, setPadrao] = useState<{ valor_por_acesso?: number; tipo?: string; valor?: number }>({});
  const [carregando, setCarregando] = useState(true);
  const [modal, setModal] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState({
    nome: '', telefone: '', email: '', valor_por_acesso: '', comissao_tipo: 'fixo',
    comissao_valor: '', dia_vencimento: '10', chave_pix: '', ativo: true, observacoes: '',
  });

  async function carregar() {
    setCarregando(true);
    const chavePadrao = tipo === 'master' ? 'revenda_padrao' : 'comissao_padrao';
    const [rev, cli, cfg] = await Promise.all([
      supabase.from('revendedores').select('*').eq('tipo', tipo).order('nome'),
      supabase.from('clientes').select('id, revendedor_id, status').eq('status', 'ativo'),
      supabase.from('settings').select('valor').eq('chave', chavePadrao).maybeSingle(),
    ]);
    setLista((rev.data as Revendedor[]) ?? []);
    const cont: Record<string, number> = {};
    for (const c of cli.data ?? []) {
      if (c.revendedor_id) cont[c.revendedor_id] = (cont[c.revendedor_id] ?? 0) + 1;
    }
    setContagens(cont);
    setPadrao((cfg.data?.valor as any) ?? {});
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo]);

  function abrirNovo() {
    setEditandoId(null);
    setForm({
      nome: '', telefone: '', email: '',
      valor_por_acesso: String(padrao.valor_por_acesso ?? ''),
      comissao_tipo: (padrao.tipo as string) ?? 'fixo',
      comissao_valor: String(padrao.valor ?? ''),
      dia_vencimento: '10', chave_pix: '', ativo: true, observacoes: '',
    });
    setModal(true);
  }

  function abrirEdicao(r: Revendedor) {
    setEditandoId(r.id);
    setForm({
      nome: r.nome, telefone: r.telefone ?? '', email: r.email ?? '',
      valor_por_acesso: String(r.valor_por_acesso ?? ''),
      comissao_tipo: r.comissao_tipo, comissao_valor: String(r.comissao_valor ?? ''),
      dia_vencimento: String(r.dia_vencimento ?? 10), chave_pix: r.chave_pix ?? '',
      ativo: r.ativo, observacoes: r.observacoes ?? '',
    });
    setModal(true);
  }

  async function salvar() {
    if (!form.nome.trim()) return toast('Informe o nome.', 'erro');
    setSalvando(true);
    const registro = {
      nome: form.nome.trim(),
      telefone: form.telefone ? normalizarTelefone(form.telefone) : null,
      email: form.email || null,
      tipo,
      valor_por_acesso: parseFloat(form.valor_por_acesso || '0') || 0,
      comissao_tipo: form.comissao_tipo,
      comissao_valor: parseFloat(form.comissao_valor || '0') || 0,
      dia_vencimento: parseInt(form.dia_vencimento || '10', 10),
      chave_pix: form.chave_pix || null,
      ativo: form.ativo,
      observacoes: form.observacoes || null,
    };
    const { error } = editandoId
      ? await supabase.from('revendedores').update(registro).eq('id', editandoId)
      : await supabase.from('revendedores').insert(registro);
    setSalvando(false);
    if (error) return toast(`Erro ao salvar: ${error.message}`, 'erro');
    toast('Salvo com sucesso.');
    setModal(false);
    carregar();
  }

  async function excluir(r: Revendedor) {
    if (!confirm(`Excluir "${r.nome}"? Os clientes vinculados ficarão como venda direta.`)) return;
    const { error } = await supabase.from('revendedores').delete().eq('id', r.id);
    if (error) return toast(`Erro ao excluir: ${error.message}`, 'erro');
    toast('Excluído.');
    carregar();
  }

  return (
    <div>
      <PageTitle
        title={t.titulo}
        subtitle={t.subtitulo}
        action={
          <Btn onClick={abrirNovo}>
            <Plus size={16} /> {t.novo}
          </Btn>
        }
      />

      {carregando ? (
        <Carregando />
      ) : lista.length === 0 ? (
        <Vazio>Nenhum cadastro ainda.</Vazio>
      ) : (
        <Tabela>
          <thead>
            <tr>
              <Th>Nome</Th>
              <Th>WhatsApp</Th>
              {tipo === 'master' ? (
                <>
                  <Th>Valor por acesso</Th>
                  <Th>Clientes ativos</Th>
                  <Th>Mensalidade estimada</Th>
                  <Th>Vencimento</Th>
                </>
              ) : (
                <>
                  <Th>Comissão</Th>
                  <Th>Clientes indicados</Th>
                  <Th>PIX</Th>
                </>
              )}
              <Th>Status</Th>
              <Th className="text-right">Ações</Th>
            </tr>
          </thead>
          <tbody>
            {lista.map((r) => {
              const qtd = contagens[r.id] ?? 0;
              return (
                <tr key={r.id} className="hover:bg-slate-50">
                  <Td><span className="font-medium text-slate-800">{r.nome}</span></Td>
                  <Td>{fmtTelefone(r.telefone)}</Td>
                  {tipo === 'master' ? (
                    <>
                      <Td>{fmtMoeda(r.valor_por_acesso)}</Td>
                      <Td>{qtd}</Td>
                      <Td className="font-medium">{fmtMoeda(qtd * r.valor_por_acesso)}</Td>
                      <Td>dia {r.dia_vencimento}</Td>
                    </>
                  ) : (
                    <>
                      <Td>
                        {r.comissao_tipo === 'percentual'
                          ? `${r.comissao_valor}%`
                          : fmtMoeda(r.comissao_valor)}{' '}
                        <span className="text-xs text-slate-400">por pagamento</span>
                      </Td>
                      <Td>{qtd}</Td>
                      <Td className="text-xs">{r.chave_pix ?? '—'}</Td>
                    </>
                  )}
                  <Td>{r.ativo ? <Badge cor="verde">Ativo</Badge> : <Badge cor="cinza">Inativo</Badge>}</Td>
                  <Td className="text-right whitespace-nowrap">
                    <button onClick={() => abrirEdicao(r)} className="p-1.5 text-slate-400 hover:text-indigo-600" title="Editar">
                      <Pencil size={16} />
                    </button>
                    <button onClick={() => excluir(r)} className="p-1.5 text-slate-400 hover:text-rose-600" title="Excluir">
                      <Trash2 size={16} />
                    </button>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Tabela>
      )}

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editandoId ? t.modalEditar : t.modalNovo}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setModal(false)}>Cancelar</Btn>
            <Btn onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</Btn>
          </>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Nome *" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          <Input label="WhatsApp" placeholder="(35) 99999-0000" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
          <Input label="E-mail" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label="Chave PIX" value={form.chave_pix} onChange={(e) => setForm({ ...form, chave_pix: e.target.value })} />

          {tipo === 'master' ? (
            <>
              <Input
                label="Valor por acesso (R$) *"
                type="number" step="0.01"
                value={form.valor_por_acesso}
                onChange={(e) => setForm({ ...form, valor_por_acesso: e.target.value })}
                hint="Quanto ele paga por cliente ativo na mensalidade"
              />
              <Input
                label="Dia de vencimento"
                type="number" min={1} max={28}
                value={form.dia_vencimento}
                onChange={(e) => setForm({ ...form, dia_vencimento: e.target.value })}
              />
            </>
          ) : (
            <>
              <Select label="Tipo de comissão" value={form.comissao_tipo} onChange={(e) => setForm({ ...form, comissao_tipo: e.target.value })}>
                <option value="fixo">Valor fixo (R$)</option>
                <option value="percentual">Percentual (%)</option>
              </Select>
              <Input
                label={form.comissao_tipo === 'percentual' ? 'Comissão (%)' : 'Comissão (R$)'}
                type="number" step="0.01"
                value={form.comissao_valor}
                onChange={(e) => setForm({ ...form, comissao_valor: e.target.value })}
                hint="Gerada a cada pagamento de cliente indicado"
              />
            </>
          )}

          <Select label="Status" value={form.ativo ? '1' : '0'} onChange={(e) => setForm({ ...form, ativo: e.target.value === '1' })}>
            <option value="1">Ativo</option>
            <option value="0">Inativo</option>
          </Select>
          <TextArea label="Observações" className="sm:col-span-2" value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
        </div>
      </Modal>
    </div>
  );
}
