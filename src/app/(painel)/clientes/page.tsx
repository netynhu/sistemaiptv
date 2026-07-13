'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Btn, Badge, Carregando, Input, Modal, PageTitle, Select, Tabela, Td, TextArea, Th, toast, Vazio,
} from '@/components/ui';
import { addMeses, diasAte, fmtData, fmtMoeda, fmtTelefone, hojeISO, normalizarTelefone, resolverLinkM3U } from '@/lib/utils';
import type { Cliente, Dispositivo, LinksPadrao, Plano, Revendedor } from '@/types';
import { Copy, Pencil, Plus, Search, Trash2 } from 'lucide-react';

const APP_ASSIST_PLUS = 'Assist Plus';

const FORM_VAZIO = {
  nome: '', telefone: '', usuario: '', senha: '', plano_id: '', valor: '',
  dispositivo: '', aplicativo: '', telas_apps: [] as string[], revendedor_id: '',
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
  const [custoPorTela, setCustoPorTela] = useState(1.5);
  const [custoAssistPlus, setCustoAssistPlus] = useState(1.5);

  const appsDisponiveis = useMemo(
    () => Array.from(new Set(dispositivos.flatMap((d) => d.apps))).sort(),
    [dispositivos]
  );

  async function carregar() {
    setCarregando(true);
    const [cli, pla, rev, disp, cfg, telasCfg] = await Promise.all([
      supabase.from('clientes').select('*, planos(*), revendedores(*)').order('nome'),
      supabase.from('planos').select('*').eq('ativo', true).order('meses'),
      // Só indicadores ficam vinculados aqui — revendedor master tem painel próprio
      supabase.from('revendedores').select('*').eq('ativo', true).eq('tipo', 'indicacao').order('nome'),
      supabase.from('dispositivos').select('*').order('ordem'),
      supabase.from('settings').select('valor').eq('chave', 'links_padrao').maybeSingle(),
      supabase.from('settings').select('valor').eq('chave', 'telas_config').maybeSingle(),
    ]);
    setClientes((cli.data as Cliente[]) ?? []);
    setPlanos((pla.data as Plano[]) ?? []);
    setRevendedores((rev.data as Revendedor[]) ?? []);
    setDispositivos((disp.data as Dispositivo[]) ?? []);
    setLinks((cfg.data?.valor as LinksPadrao) ?? null);
    const cfgTelas = telasCfg.data?.valor;
    if (cfgTelas?.custo_por_tela) setCustoPorTela(Number(cfgTelas.custo_por_tela));
    setCustoAssistPlus(Number(cfgTelas?.custo_assist_plus ?? cfgTelas?.custo_por_tela ?? 1.5));
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
      plano_id: c.plano_id ?? '', valor: String(c.valor ?? ''),
      dispositivo: c.dispositivo ?? '', aplicativo: c.aplicativo ?? '', telas_apps: c.telas_apps ?? [],
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

  function adicionarTela() {
    setForm((f) => ({ ...f, telas_apps: [...f.telas_apps, ''] }));
  }
  function atualizarTela(indice: number, app: string) {
    setForm((f) => ({ ...f, telas_apps: f.telas_apps.map((a, i) => (i === indice ? app : a)) }));
  }
  function removerTela(indice: number) {
    setForm((f) => ({ ...f, telas_apps: f.telas_apps.filter((_, i) => i !== indice) }));
  }

  // O dispositivo/app principal já conta como a 1ª tela — "telas_apps" guarda só as extras
  function todasAsTelas(aplicativoPrincipal: string | null, extras: string[]): string[] {
    return [aplicativoPrincipal, ...extras].filter((a): a is string => !!a);
  }

  // Mantém em Financeiro > Despesas uma linha só com o custo do Assist Plus deste cliente
  // (custo por tela que usa Assist Plus, configurado em Configurações — as demais telas são
  // só informativas, não viram despesa)
  async function sincronizarDespesaAssistPlus(clienteId: string, nomeCliente: string, aplicativoPrincipal: string | null, extras: string[]) {
    const qtd = todasAsTelas(aplicativoPrincipal, extras).filter((a) => a === APP_ASSIST_PLUS).length;
    const { data: existente } = await supabase
      .from('despesas')
      .select('id')
      .eq('cliente_id', clienteId)
      .eq('categoria', 'Assist Plus')
      .maybeSingle();

    if (qtd > 0) {
      const valor = Math.round(qtd * custoAssistPlus * 100) / 100;
      const descricao = `Assist Plus — ${nomeCliente} (${qtd} tela${qtd > 1 ? 's' : ''})`;
      if (existente) {
        await supabase.from('despesas').update({ descricao, valor }).eq('id', existente.id);
      } else {
        await supabase.from('despesas').insert({
          descricao, categoria: 'Assist Plus', valor, data: hojeISO(), recorrente: true, cliente_id: clienteId,
        });
      }
    } else if (existente) {
      await supabase.from('despesas').delete().eq('id', existente.id);
    }
  }

  async function salvar() {
    if (!form.nome.trim()) return toast('Informe o nome do cliente.', 'erro');
    setSalvando(true);
    const valor = parseFloat(form.valor || '0') || 0;
    const dataVencimento = form.data_vencimento || null;
    const telasApps = form.telas_apps.filter((a) => a);
    const registro = {
      nome: form.nome.trim(),
      telefone: form.telefone ? normalizarTelefone(form.telefone) : null,
      usuario: form.usuario || null,
      senha: form.senha || null,
      plano_id: form.plano_id || null,
      valor,
      dispositivo: form.dispositivo || null,
      aplicativo: form.aplicativo || null,
      telas_apps: telasApps,
      revendedor_id: form.revendedor_id || null,
      data_ativacao: form.data_ativacao || hojeISO(),
      data_vencimento: dataVencimento,
      status: form.status,
      observacoes: form.observacoes || null,
    };

    if (editandoId) {
      const { error } = await supabase.from('clientes').update(registro).eq('id', editandoId);
      if (error) {
        setSalvando(false);
        return toast(`Erro ao salvar: ${error.message}`, 'erro');
      }
      await sincronizarDespesaAssistPlus(editandoId, registro.nome, registro.aplicativo, telasApps);
      setSalvando(false);
      toast('Cliente atualizado.');
      setModal(false);
      carregar();
      return;
    }

    const { data: novo, error } = await supabase.from('clientes').insert(registro).select().single();
    if (error) {
      setSalvando(false);
      return toast(`Erro ao salvar: ${error.message}`, 'erro');
    }

    // Todo cliente novo já entra em Financeiro > Receitas automaticamente, sem precisar gerar nada
    if (registro.status === 'ativo' && dataVencimento && novo) {
      const plano = planos.find((p) => p.id === registro.plano_id);
      await supabase.from('cobrancas').insert({
        tipo: 'cliente',
        cliente_id: novo.id,
        descricao: plano ? `Assinatura — ${plano.nome}` : 'Assinatura',
        valor,
        vencimento: dataVencimento,
      });
    }
    if (novo) await sincronizarDespesaAssistPlus(novo.id, registro.nome, registro.aplicativo, telasApps);

    // Avisa o grupo de administradores no WhatsApp (Configurações > Avisos). Sem bloquear o
    // fechamento do modal — se o aviso falhar, o cadastro já está salvo.
    if (novo) {
      fetch('/api/avisos/cliente-novo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente_id: novo.id }),
      }).catch(() => {});
    }

    setSalvando(false);
    toast('Cliente cadastrado.');
    setModal(false);
    carregar();
  }

  async function excluir(c: Cliente) {
    if (!confirm(`Excluir o cliente "${c.nome}"? As cobranças e despesas ligadas a ele também serão removidas.`)) return;
    const { error } = await supabase.from('clientes').delete().eq('id', c.id);
    if (error) return toast(`Erro ao excluir: ${error.message}`, 'erro');
    toast('Cliente excluído.');
    carregar();
  }

  function linkM3UDoCliente(c: Cliente): string {
    return resolverLinkM3U(links?.m3u, c.usuario, c.senha);
  }

  function copiarAcesso(c: Cliente) {
    const m3u = linkM3UDoCliente(c);
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

  function copiarLinkM3U(c: Cliente) {
    const link = linkM3UDoCliente(c);
    if (!link) return toast('Nenhum link M3U configurado (nem do cliente, nem o padrão).', 'erro');
    navigator.clipboard.writeText(link);
    toast('Link M3U copiado.');
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
              <Th>Telas</Th>
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
                  <div className="text-xs text-slate-400 flex items-center gap-1">
                    {c.usuario && (
                      <span className="inline-flex items-center gap-1">
                        usuário: {c.usuario}
                        <button
                          onClick={() => copiarLinkM3U(c)}
                          title="Copiar link M3U deste usuário"
                          className="text-slate-300 hover:text-indigo-600"
                        >
                          <Copy size={11} />
                        </button>
                        {' · '}
                      </span>
                    )}
                    {c.dispositivo || ''}
                  </div>
                </Td>
                <Td>{fmtTelefone(c.telefone)}</Td>
                <Td>{c.planos?.nome ?? '—'}</Td>
                <Td>{fmtMoeda(c.valor)}</Td>
                <Td>
                  {(() => {
                    const todas = todasAsTelas(c.aplicativo, c.telas_apps ?? []);
                    return todas.length > 0 ? (
                      <span title={todas.join(', ')}>{todas.length}</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    );
                  })()}
                </Td>
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

          {resolverLinkM3U(links?.m3u, form.usuario, form.senha) && (
            <div className="sm:col-span-2">
              <span className="block text-xs font-medium text-slate-600 mb-1">Link M3U deste usuário</span>
              <div className="flex gap-2">
                <div className="flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs truncate">
                  {resolverLinkM3U(links?.m3u, form.usuario, form.senha)}
                </div>
                <Btn
                  type="button" size="sm" variant="secondary"
                  onClick={() => {
                    navigator.clipboard.writeText(resolverLinkM3U(links?.m3u, form.usuario, form.senha));
                    toast('Link M3U copiado.');
                  }}
                >
                  <Copy size={14} /> Copiar
                </Btn>
              </div>
            </div>
          )}

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
          <Select label="Aplicativo principal" value={form.aplicativo} onChange={(e) => setForm({ ...form, aplicativo: e.target.value })}>
            <option value="">Selecione…</option>
            {(appsDoDispositivo.length ? appsDoDispositivo : []).map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
            {form.aplicativo && !appsDoDispositivo.includes(form.aplicativo) && (
              <option value={form.aplicativo}>{form.aplicativo}</option>
            )}
          </Select>

          <div className="sm:col-span-2">
            <span className="block text-xs font-medium text-slate-600 mb-1">
              Telas adicionais {form.telas_apps.length > 0 && `(${form.telas_apps.length})`} — total de telas: {todasAsTelas(form.aplicativo || null, form.telas_apps).length}
            </span>
            <p className="text-[11px] text-slate-400 mb-2">
              O Dispositivo/Aplicativo principal já conta como a 1ª tela. Só adicione aqui se o cliente tiver mais telas simultâneas.
            </p>
            <div className="space-y-2">
              {form.telas_apps.map((app, i) => (
                <div key={i} className="flex gap-2">
                  <select
                    className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500"
                    value={app}
                    onChange={(e) => atualizarTela(i, e.target.value)}
                  >
                    <option value="">Selecione o app…</option>
                    {appsDisponiveis.map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removerTela(i)}
                    className="px-2 text-slate-400 hover:text-rose-600"
                    title="Remover tela"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              <Btn type="button" size="sm" variant="secondary" onClick={adicionarTela}>
                <Plus size={14} /> Adicionar tela extra
              </Btn>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Cada tela custa {fmtMoeda(custoPorTela)} (informativo, aparece só no relatório). Telas com{' '}
              <b>Assist Plus</b> (incluindo se for o app principal) geram automaticamente uma despesa de{' '}
              {fmtMoeda(custoAssistPlus)} cada em Financeiro &gt; Despesas.
            </p>
          </div>

          <Select
            label="Indicador (opcional)"
            value={form.revendedor_id}
            onChange={(e) => setForm({ ...form, revendedor_id: e.target.value })}
            className="sm:col-span-2"
            hint="Revendedor master não entra aqui — ele tem painel próprio e sua receita é lançada no cadastro dele"
          >
            <option value="">Nenhum indicador</option>
            {revendedores.map((r) => (
              <option key={r.id} value={r.id}>🤝 {r.nome}</option>
            ))}
          </Select>
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
