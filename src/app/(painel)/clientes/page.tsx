'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Btn, Badge, Carregando, Input, Modal, PageTitle, Select, Tabela, Td, TextArea, Th, toast, Vazio,
} from '@/components/ui';
import { addMeses, diasAte, fmtData, fmtMoeda, fmtTelefone, hojeISO, normalizarTelefone } from '@/lib/utils';
import type { Cliente, Dispositivo, LinksPadrao, Plano, Revendedor } from '@/types';
import { Copy, Pencil, Plus, Search, Trash2 } from 'lucide-react';

const FORM_VAZIO = {
  nome: '', telefone: '', usuario: '', senha: '', plano_id: '', valor: '',
  m3u_link: '', dispositivo: '', aplicativo: '', revendedor_id: '',
  data_ativacao: hojeISO(), data_vencimento: '', status: 'ativo', observacoes: '',
};

export default function ClientesPage() {
  const supabase = useMemo(() => createClient(), []);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [revendedores, setRevendedores] = useState<Revendedor[]>([]);
  const [dispositivos, setDispositivos] = useState<Dispositivo[]>([]);
  const [links, setLinks] = useState<LinksPadrao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [modal, setModal] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...FORM_VAZIO });

  async function carregar() {
    setCarregando(true);
    const [cli, pla, rev, disp, cfg] = await Promise.all([
      supabase.from('clientes').select('*, planos(*), revendedores(*)').order('nome'),
      supabase.from('planos').select('*').eq('ativo', true).order('meses'),
      supabase.from('revendedores').select('*').eq('ativo', true).order('nome'),
      supabase.from('dispositivos').select('*').order('ordem'),
      supabase.from('settings').select('valor').eq('chave', 'links_padrao').maybeSingle(),
    ]);
    setClientes((cli.data as Cliente[]) ?? []);
    setPlanos((pla.data as Plano[]) ?? []);
    setRevendedores((rev.data as Revendedor[]) ?? []);
    setDispositivos((disp.data as Dispositivo[]) ?? []);
    setLinks((cfg.data?.valor as LinksPadrao) ?? null);
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function abrirNovo() {
    setEditandoId(null);
    setForm({ ...FORM_VAZIO, data_ativacao: hojeISO() });
    setModal(true);
  }

  function abrirEdicao(c: Cliente) {
    setEditandoId(c.id);
    setForm({
      nome: c.nome, telefone: c.telefone ?? '', usuario: c.usuario ?? '', senha: c.senha ?? '',
      plano_id: c.plano_id ?? '', valor: String(c.valor ?? ''), m3u_link: c.m3u_link ?? '',
      dispositivo: c.dispositivo ?? '', aplicativo: c.aplicativo ?? '',
      revendedor_id: c.revendedor_id ?? '', data_ativacao: c.data_ativacao,
      data_vencimento: c.data_vencimento ?? '', status: c.status, observacoes: c.observacoes ?? '',
    });
    setModal(true);
  }

  // Ao escolher o plano: sugere valor e vencimento
  function aoMudarPlano(planoId: string) {
    const plano = planos.find((p) => p.id === planoId);
    setForm((f) => ({
      ...f,
      plano_id: planoId,
      valor: f.valor && editandoId ? f.valor : String(plano?.valor ?? ''),
      data_vencimento: plano ? addMeses(f.data_ativacao || hojeISO(), plano.meses) : f.data_vencimento,
    }));
  }

  async function salvar() {
    if (!form.nome.trim()) return toast('Informe o nome do cliente.', 'erro');
    setSalvando(true);
    const registro = {
      nome: form.nome.trim(),
      telefone: form.telefone ? normalizarTelefone(form.telefone) : null,
      usuario: form.usuario || null,
      senha: form.senha || null,
      plano_id: form.plano_id || null,
      valor: parseFloat(form.valor || '0') || 0,
      m3u_link: form.m3u_link || null,
      dispositivo: form.dispositivo || null,
      aplicativo: form.aplicativo || null,
      revendedor_id: form.revendedor_id || null,
      data_ativacao: form.data_ativacao || hojeISO(),
      data_vencimento: form.data_vencimento || null,
      status: form.status,
      observacoes: form.observacoes || null,
    };
    const { error } = editandoId
      ? await supabase.from('clientes').update(registro).eq('id', editandoId)
      : await supabase.from('clientes').insert(registro);
    setSalvando(false);
    if (error) return toast(`Erro ao salvar: ${error.message}`, 'erro');
    toast(editandoId ? 'Cliente atualizado.' : 'Cliente cadastrado.');
    setModal(false);
    carregar();
  }

  async function excluir(c: Cliente) {
    if (!confirm(`Excluir o cliente "${c.nome}"? As cobranças dele também serão removidas.`)) return;
    const { error } = await supabase.from('clientes').delete().eq('id', c.id);
    if (error) return toast(`Erro ao excluir: ${error.message}`, 'erro');
    toast('Cliente excluído.');
    carregar();
  }

  function copiarAcesso(c: Cliente) {
    const m3u = c.m3u_link || links?.m3u || '';
    const texto = [
      `📺 *Dados de acesso — ${c.nome}*`,
      c.usuario && `Usuário: ${c.usuario}`,
      c.senha && `Senha: ${c.senha}`,
      m3u && `Link M3U: ${m3u}`,
      c.aplicativo && `Aplicativo: ${c.aplicativo}`,
    ]
      .filter(Boolean)
      .join('\n');
    navigator.clipboard.writeText(texto);
    toast('Dados de acesso copiados.');
  }

  const filtrados = clientes.filter((c) => {
    const t = busca.toLowerCase();
    const casaBusca =
      !t || c.nome.toLowerCase().includes(t) || (c.telefone ?? '').includes(t) || (c.usuario ?? '').toLowerCase().includes(t);
    if (!casaBusca) return false;
    const dias = diasAte(c.data_vencimento);
    switch (filtro) {
      case 'ativos': return c.status === 'ativo' && (dias === null || dias >= 0);
      case 'vencidos': return c.status === 'ativo' && dias !== null && dias < 0;
      case 'proximos': return c.status === 'ativo' && dias !== null && dias >= 0 && dias <= 7;
      case 'cancelados': return c.status === 'cancelado' || c.status === 'suspenso';
      default: return true;
    }
  });

  function badgeVencimento(c: Cliente) {
    if (c.status === 'cancelado') return <Badge cor="cinza">Cancelado</Badge>;
    if (c.status === 'suspenso') return <Badge cor="amarelo">Suspenso</Badge>;
    const dias = diasAte(c.data_vencimento);
    if (dias === null) return <Badge cor="cinza">Sem vencimento</Badge>;
    if (dias < 0) return <Badge cor="vermelho">Vencido há {-dias}d</Badge>;
    if (dias === 0) return <Badge cor="vermelho">Vence hoje</Badge>;
    if (dias <= 7) return <Badge cor="amarelo">Vence em {dias}d</Badge>;
    return <Badge cor="verde">Ativo</Badge>;
  }

  const appsDoDispositivo =
    dispositivos.find((d) => d.nome === form.dispositivo)?.apps ?? [];

  return (
    <div>
      <PageTitle
        title="Clientes"
        subtitle={`${clientes.length} cadastrados`}
        action={
          <Btn onClick={abrirNovo}>
            <Plus size={16} /> Novo cliente
          </Btn>
        }
      />

      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm outline-none focus:border-indigo-500"
            placeholder="Buscar por nome, telefone ou usuário…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <select
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
        >
          <option value="todos">Todos</option>
          <option value="ativos">Ativos</option>
          <option value="proximos">Vencem em 7 dias</option>
          <option value="vencidos">Vencidos</option>
          <option value="cancelados">Suspensos/Cancelados</option>
        </select>
      </div>

      {carregando ? (
        <Carregando />
      ) : filtrados.length === 0 ? (
        <Vazio>Nenhum cliente encontrado.</Vazio>
      ) : (
        <Tabela>
          <thead>
            <tr>
              <Th>Nome</Th>
              <Th>WhatsApp</Th>
              <Th>Plano</Th>
              <Th>Valor</Th>
              <Th>Vencimento</Th>
              <Th>Situação</Th>
              <Th>Origem</Th>
              <Th className="text-right">Ações</Th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <Td>
                  <div className="font-medium text-slate-800">{c.nome}</div>
                  <div className="text-xs text-slate-400">
                    {c.usuario && <>usuário: {c.usuario} · </>}
                    {c.dispositivo || ''}
                  </div>
                </Td>
                <Td>{fmtTelefone(c.telefone)}</Td>
                <Td>{c.planos?.nome ?? '—'}</Td>
                <Td>{fmtMoeda(c.valor)}</Td>
                <Td>{fmtData(c.data_vencimento)}</Td>
                <Td>{badgeVencimento(c)}</Td>
                <Td>
                  {c.revendedores ? (
                    <Badge cor={c.revendedores.tipo === 'master' ? 'roxo' : 'azul'}>
                      {c.revendedores.nome}
                    </Badge>
                  ) : (
                    <span className="text-slate-400 text-xs">Direto</span>
                  )}
                </Td>
                <Td className="text-right whitespace-nowrap">
                  <button
                    title="Copiar dados de acesso"
                    onClick={() => copiarAcesso(c)}
                    className="p-1.5 text-slate-400 hover:text-indigo-600"
                  >
                    <Copy size={16} />
                  </button>
                  <button
                    title="Editar"
                    onClick={() => abrirEdicao(c)}
                    className="p-1.5 text-slate-400 hover:text-indigo-600"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    title="Excluir"
                    onClick={() => excluir(c)}
                    className="p-1.5 text-slate-400 hover:text-rose-600"
                  >
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
        title={editandoId ? 'Editar cliente' : 'Novo cliente'}
        wide
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
          <Input label="Usuário" value={form.usuario} onChange={(e) => setForm({ ...form, usuario: e.target.value })} />
          <Input label="Senha" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} />
          <Select label="Plano" value={form.plano_id} onChange={(e) => aoMudarPlano(e.target.value)}>
            <option value="">Selecione…</option>
            {planos.map((p) => (
              <option key={p.id} value={p.id}>{p.nome} — {fmtMoeda(p.valor)}</option>
            ))}
          </Select>
          <Input label="Valor cobrado (R$)" type="number" step="0.01" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} hint="Pode ser diferente do valor padrão do plano" />
          <Input label="Data de ativação" type="date" value={form.data_ativacao} onChange={(e) => setForm({ ...form, data_ativacao: e.target.value })} />
          <Input label="Data de vencimento" type="date" value={form.data_vencimento} onChange={(e) => setForm({ ...form, data_vencimento: e.target.value })} />
          <Select label="Dispositivo" value={form.dispositivo} onChange={(e) => setForm({ ...form, dispositivo: e.target.value, aplicativo: '' })}>
            <option value="">Selecione…</option>
            {dispositivos.map((d) => (
              <option key={d.id} value={d.nome}>{d.nome}</option>
            ))}
          </Select>
          <Select label="Aplicativo" value={form.aplicativo} onChange={(e) => setForm({ ...form, aplicativo: e.target.value })}>
            <option value="">Selecione…</option>
            {(appsDoDispositivo.length ? appsDoDispositivo : []).map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
            {form.aplicativo && !appsDoDispositivo.includes(form.aplicativo) && (
              <option value={form.aplicativo}>{form.aplicativo}</option>
            )}
          </Select>
          <Select label="Revendedor / Indicador" value={form.revendedor_id} onChange={(e) => setForm({ ...form, revendedor_id: e.target.value })} className="sm:col-span-2">
            <option value="">Venda direta (sem revendedor)</option>
            {revendedores.map((r) => (
              <option key={r.id} value={r.id}>
                {r.tipo === 'master' ? '👑 ' : '🤝 '}{r.nome}
              </option>
            ))}
          </Select>
          <Input label="Link M3U (opcional)" className="sm:col-span-2" placeholder={links?.m3u ? `Padrão: ${links.m3u}` : 'Deixe vazio para usar o link padrão das Configurações'} value={form.m3u_link} onChange={(e) => setForm({ ...form, m3u_link: e.target.value })} />
          <Select label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="ativo">Ativo</option>
            <option value="suspenso">Suspenso</option>
            <option value="cancelado">Cancelado</option>
          </Select>
          <TextArea label="Observações" className="sm:col-span-2" value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
        </div>
      </Modal>
    </div>
  );
}
