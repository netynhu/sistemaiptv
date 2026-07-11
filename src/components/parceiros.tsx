'use client';

// CRUD compartilhado entre Revendedores (master) e Indicadores (indicação)

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Btn, Badge, Carregando, Input, Modal, PageTitle, Select, Tabela, Td, TextArea, Th, toast, Vazio,
} from '@/components/ui';
import { fmtMoeda, fmtTelefone, mesAtualISO, normalizarTelefone } from '@/lib/utils';
import type { Revendedor } from '@/types';
import { Pencil, Plus, Trash2 } from 'lucide-react';

type Props = { tipo: 'master' | 'indicacao' };

const TEXTOS = {
  master: {
    titulo: 'Revendedores Master',
    subtitulo: 'Vendem por conta própria (painel deles) e pagam por acesso — a receita é gerada sozinha',
    novo: 'Novo revendedor',
    modalNovo: 'Novo revendedor master',
    modalEditar: 'Editar revendedor',
  },
  indicacao: {
    titulo: 'Indicação',
    subtitulo: 'Indicam clientes e recebem comissão — gerada automaticamente a cada pagamento',
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
    nome: '', telefone: '', email: '', valor_por_acesso: '', quantidade_clientes: '0',
    comissao_tipo: 'fixo', comissao_valor: '', dia_vencimento: '10', chave_pix: '',
    ativo: true, observacoes: '',
  });

  async function carregar() {
    setCarregando(true);
    const chavePadrao = tipo === 'master' ? 'revenda_padrao' : 'comissao_padrao';
    const [rev, cfg] = await Promise.all([
      supabase.from('revendedores').select('*').eq('tipo', tipo).order('nome'),
      supabase.from('settings').select('valor').eq('chave', chavePadrao).maybeSingle(),
    ]);
    setLista((rev.data as Revendedor[]) ?? []);

    // Indicadores: contamos os clientes que eles de fato indicaram (ficam vinculados aqui no sistema)
    if (tipo === 'indicacao') {
      const { data: cli } = await supabase
        .from('clientes')
        .select('id, revendedor_id')
        .eq('status', 'ativo');
      const cont: Record<string, number> = {};
      for (const c of cli ?? []) {
        if (c.revendedor_id) cont[c.revendedor_id] = (cont[c.revendedor_id] ?? 0) + 1;
      }
      setContagens(cont);
    }

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
      quantidade_clientes: '0',
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
      quantidade_clientes: String(r.quantidade_clientes ?? 0),
      comissao_tipo: r.comissao_tipo, comissao_valor: String(r.comissao_valor ?? ''),
      dia_vencimento: String(r.dia_vencimento ?? 10), chave_pix: r.chave_pix ?? '',
      ativo: r.ativo, observacoes: r.observacoes ?? '',
    });
    setModal(true);
  }

  // Garante (cria ou atualiza) a receita do mês deste revendedor master, sem precisar de botão
  async function garantirReceitaDoMes(revendedorId: string, valorPorAcesso: number, qtdClientes: number, diaVencimento: number) {
    if (qtdClientes <= 0) return;
    const mes = mesAtualISO();
    const dia = String(Math.min(diaVencimento || 10, 28)).padStart(2, '0');
    const { data: existente } = await supabase
      .from('cobrancas')
      .select('id, status')
      .eq('tipo', 'revendedor')
      .eq('revendedor_id', revendedorId)
      .gte('vencimento', `${mes}-01`)
      .lte('vencimento', `${mes}-31`)
      .neq('status', 'cancelado')
      .maybeSingle();

    const valor = Math.round(qtdClientes * valorPorAcesso * 100) / 100;
    const descricao = `Mensalidade — ${qtdClientes} acesso(s) × ${fmtMoeda(valorPorAcesso)}`;

    if (!existente) {
      await supabase.from('cobrancas').insert({
        tipo: 'revendedor', revendedor_id: revendedorId, descricao, valor, vencimento: `${mes}-${dia}`,
      });
    } else if (existente.status === 'pendente') {
      // Ainda não foi pago este mês: mantém o valor atualizado com o cadastro
      await supabase.from('cobrancas').update({ descricao, valor }).eq('id', existente.id);
    }
    // Se já foi pago este mês, não mexe (é histórico).
  }

  async function salvar() {
    if (!form.nome.trim()) return toast('Informe o nome.', 'erro');
    setSalvando(true);
    const valorPorAcesso = parseFloat(form.valor_por_acesso || '0') || 0;
    const qtdClientes = tipo === 'master' ? parseInt(form.quantidade_clientes || '0', 10) || 0 : 0;
    const diaVencimento = parseInt(form.dia_vencimento || '10', 10);
    const registro = {
      nome: form.nome.trim(),
      telefone: form.telefone ? normalizarTelefone(form.telefone) : null,
      email: form.email || null,
      tipo,
      valor_por_acesso: valorPorAcesso,
      quantidade_clientes: qtdClientes,
      comissao_tipo: form.comissao_tipo,
      comissao_valor: parseFloat(form.comissao_valor || '0') || 0,
      dia_vencimento: diaVencimento,
      chave_pix: form.chave_pix || null,
      ativo: form.ativo,
      observacoes: form.observacoes || null,
    };
    const { data: salvo, error } = editandoId
      ? await supabase.from('revendedores').update(registro).eq('id', editandoId).select().single()
      : await supabase.from('revendedores').insert(registro).select().single();

    if (error) {
      setSalvando(false);
      return toast(`Erro ao salvar: ${error.message}`, 'erro');
    }

    // Revendedor master ativo: a receita do mês é gerada/atualizada sozinha, sem precisar de botão
    if (tipo === 'master' && form.ativo && salvo) {
      try {
        await garantirReceitaDoMes(salvo.id, valorPorAcesso, qtdClientes, diaVencimento);
      } catch {
        // não bloqueia o salvamento do cadastro por causa disso
      }
    }

    setSalvando(false);
    toast('Salvo com sucesso.');
    setModal(false);
    carregar();
  }

  async function excluir(r: Revendedor) {
    const aviso = tipo === 'indicacao'
      ? `Excluir "${r.nome}"? Os clientes indicados por ele ficarão sem indicador.`
      : `Excluir "${r.nome}"?`;
    if (!confirm(aviso)) return;
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
                  <Th>Qtd. clientes</Th>
                  <Th>Receita mensal</Th>
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
              const qtd = tipo === 'master' ? (r.quantidade_clientes ?? 0) : (contagens[r.id] ?? 0);
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
                hint="Quanto ele paga por cliente"
              />
              <Input
                label="Quantidade de clientes *"
                type="number" min={0}
                value={form.quantidade_clientes}
                onChange={(e) => setForm({ ...form, quantidade_clientes: e.target.value })}
                hint="Informado manualmente — os clientes dele ficam no painel próprio, não aqui"
              />
              <Input
                label="Dia de vencimento"
                type="number" min={1} max={28}
                value={form.dia_vencimento}
                onChange={(e) => setForm({ ...form, dia_vencimento: e.target.value })}
                hint="A receita do mês é gerada/atualizada sozinha ao salvar"
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
                hint="Vai para Despesas assim que o cliente pagar"
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
