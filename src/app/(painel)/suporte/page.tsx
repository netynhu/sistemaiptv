'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Btn, Badge, Card, Carregando, PageTitle, toast, Vazio, cls } from '@/components/ui';
import { diasAte, fmtData, fmtMoeda, fmtTelefone } from '@/lib/utils';
import type { Conversa, ConversaStatus, Dispositivo, LinksPadrao, Mensagem, Tutorial } from '@/types';
import { AlertTriangle, Bot, BookOpenText, CheckCheck, Copy, MessagesSquare, RotateCcw, Send, UserRound } from 'lucide-react';

// Renderizador simples de markdown (negrito, código e listas) para os tutoriais
function md(texto: string): string {
  const esc = texto
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/`(.+?)`/g, '<code class="bg-slate-100 text-indigo-700 px-1.5 py-0.5 rounded text-[13px]">$1</code>')
    .replace(/^### (.+)$/gm, '<h3 class="font-semibold mt-3">$1</h3>')
    .replace(/\n/g, '<br/>');
}

function aplicarLinks(texto: string, links: LinksPadrao | null): string {
  if (!links) return texto;
  return texto
    .split('{assist_plus_codigo}').join(links.assist_plus_codigo || '—')
    .split('{smarters_nome}').join(links.smarters_nome || '—')
    .split('{smarters_url}').join(links.smarters_url || '—')
    .split('{xciptv_url}').join(links.xciptv_url || '—')
    .split('{m3u}').join(links.m3u || '—');
}

type CorBadge = 'roxo' | 'amarelo' | 'azul' | 'verde';
const STATUS_META: Record<ConversaStatus, { label: string; cor: CorBadge }> = {
  ia: { label: 'IA atendendo', cor: 'roxo' },
  aguardando: { label: 'Aguardando humano', cor: 'amarelo' },
  humano: { label: 'Em atendimento', cor: 'azul' },
  resolvida: { label: 'Resolvida', cor: 'verde' },
};

type FiltroStatus = 'aguardando' | 'ia' | 'humano' | 'resolvida' | 'todas';
const FILTROS: [FiltroStatus, string][] = [
  ['aguardando', 'Aguardando'],
  ['ia', 'IA'],
  ['humano', 'Em atendimento'],
  ['resolvida', 'Resolvidas'],
  ['todas', 'Todas'],
];

export default function SuportePage() {
  const supabase = useMemo(() => createClient(), []);
  const [aba, setAba] = useState<'conversas' | 'guia'>('conversas');

  // ---- Conversas ----
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>('todas');
  const fimRef = useRef<HTMLDivElement>(null);

  // ---- Guia ----
  const [dispositivos, setDispositivos] = useState<Dispositivo[]>([]);
  const [tutoriais, setTutoriais] = useState<Tutorial[]>([]);
  const [links, setLinks] = useState<LinksPadrao | null>(null);
  const [dispSel, setDispSel] = useState<Dispositivo | null>(null);
  const [appSel, setAppSel] = useState<string | null>(null);

  const selecionada = conversas.find((c) => c.id === selecionadaId) ?? null;

  const carregarConversas = useCallback(async () => {
    const { data } = await supabase
      .from('conversas')
      .select('*, clientes(*, planos(*))')
      .order('atualizado_em', { ascending: false });
    setConversas((data as Conversa[]) ?? []);
  }, [supabase]);

  const carregarMensagens = useCallback(
    async (conversaId: string) => {
      const { data } = await supabase
        .from('mensagens')
        .select('*')
        .eq('conversa_id', conversaId)
        .order('criado_em', { ascending: true })
        .limit(200);
      setMensagens((data as Mensagem[]) ?? []);
    },
    [supabase]
  );

  useEffect(() => {
    (async () => {
      const [disp, tut, cfg] = await Promise.all([
        supabase.from('dispositivos').select('*').order('ordem'),
        supabase.from('tutoriais').select('*').order('ordem'),
        supabase.from('settings').select('valor').eq('chave', 'links_padrao').maybeSingle(),
      ]);
      setDispositivos((disp.data as Dispositivo[]) ?? []);
      setTutoriais((tut.data as Tutorial[]) ?? []);
      setLinks((cfg.data?.valor as LinksPadrao) ?? null);
      await carregarConversas();
      setCarregando(false);
    })();
  }, [supabase, carregarConversas]);

  // Atualização periódica (novas mensagens chegam pelo webhook)
  useEffect(() => {
    const timer = setInterval(() => {
      carregarConversas();
      if (selecionadaId) carregarMensagens(selecionadaId);
    }, 8000);
    return () => clearInterval(timer);
  }, [carregarConversas, carregarMensagens, selecionadaId]);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensagens.length]);

  async function abrirConversa(c: Conversa) {
    setSelecionadaId(c.id);
    await carregarMensagens(c.id);
    if (c.nao_lidas > 0) {
      await supabase.from('conversas').update({ nao_lidas: 0 }).eq('id', c.id);
      carregarConversas();
    }
  }

  async function mudarEstado(patch: Partial<Pick<Conversa, 'modo' | 'status'>>, msg: string) {
    if (!selecionada) return;
    const { error } = await supabase.from('conversas').update(patch).eq('id', selecionada.id);
    if (error) return toast(`Erro: ${error.message}`, 'erro');
    await carregarConversas();
    toast(msg);
  }

  const assumir = () => mudarEstado({ modo: 'humano', status: 'humano' }, 'Você assumiu a conversa — a IA não responde mais este contato.');
  const devolverIA = () => mudarEstado({ modo: 'ia', status: 'ia' }, 'Conversa devolvida para a IA.');
  const resolver = () => mudarEstado({ modo: 'ia', status: 'resolvida' }, 'Conversa marcada como resolvida.');
  const reabrir = () => mudarEstado({ modo: 'ia', status: 'ia' }, 'Conversa reaberta.');

  async function enviar() {
    if (!selecionada || !texto.trim()) return;
    setEnviando(true);
    try {
      const res = await fetch('/api/suporte/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversa_id: selecionada.id, texto }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha no envio');
      setTexto('');
      await carregarMensagens(selecionada.id);
      await carregarConversas();
    } catch (e: any) {
      toast(`Erro ao enviar: ${e.message}`, 'erro');
    } finally {
      setEnviando(false);
    }
  }

  function copiarTutorial(t: Tutorial) {
    const textoLimpo = aplicarLinks(t.instrucoes, links)
      .replace(/\*\*(.+?)\*\*/g, '*$1*') // negrito estilo WhatsApp
      .replace(/`(.+?)`/g, '$1');
    navigator.clipboard.writeText(`📲 *Como instalar o ${t.app}*\n\n${textoLimpo}`);
    toast('Instruções copiadas — cole na conversa do cliente.');
  }

  const tutorialSel = tutoriais.find((t) => t.app === appSel) ?? null;

  const contadores = useMemo(() => {
    const c: Record<FiltroStatus, number> = { aguardando: 0, ia: 0, humano: 0, resolvida: 0, todas: conversas.length };
    for (const conv of conversas) c[conv.status] = (c[conv.status] ?? 0) + 1;
    return c;
  }, [conversas]);

  const conversasVisiveis = conversas.filter((c) => filtroStatus === 'todas' || c.status === filtroStatus);

  return (
    <div>
      <PageTitle title="Suporte" subtitle="Atendimento via WhatsApp com agente de IA e guia de instalação" />

      <div className="flex gap-1 mb-4 bg-slate-200/70 rounded-lg p-1 w-fit">
        <button
          onClick={() => setAba('conversas')}
          className={cls(
            'flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm',
            aba === 'conversas' ? 'bg-white shadow font-medium text-slate-800' : 'text-slate-500 hover:text-slate-800'
          )}
        >
          <MessagesSquare size={15} /> Conversas
          {contadores.aguardando > 0 && (
            <span className="bg-amber-500 text-white text-[10px] rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
              {contadores.aguardando}
            </span>
          )}
        </button>
        <button
          onClick={() => setAba('guia')}
          className={cls(
            'flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm',
            aba === 'guia' ? 'bg-white shadow font-medium text-slate-800' : 'text-slate-500 hover:text-slate-800'
          )}
        >
          <BookOpenText size={15} /> Guia de apps
        </button>
      </div>

      {aba === 'conversas' ? (
        carregando ? (
          <Carregando />
        ) : (
          <div>
            {/* Filtros do pipeline */}
            <div className="flex flex-wrap gap-1 mb-3 bg-slate-100 rounded-lg p-1 w-fit">
              {FILTROS.map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setFiltroStatus(k)}
                  className={cls(
                    'flex items-center gap-1.5 px-3 py-1 rounded-md text-xs',
                    filtroStatus === k ? 'bg-white shadow font-medium text-slate-800' : 'text-slate-500 hover:text-slate-800'
                  )}
                >
                  {label}
                  <span className={cls('text-[10px]', filtroStatus === k ? 'text-slate-500' : 'text-slate-400')}>
                    {contadores[k]}
                  </span>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4" style={{ height: 'calc(100vh - 290px)', minHeight: 420 }}>
              {/* Lista de conversas */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-y-auto">
                {conversasVisiveis.length === 0 ? (
                  <Vazio>
                    {conversas.length === 0 ? (
                      <>Nenhuma conversa ainda.<br />Configure o webhook em Configurações &gt; WhatsApp.</>
                    ) : (
                      'Nenhuma conversa neste filtro.'
                    )}
                  </Vazio>
                ) : (
                  conversasVisiveis.map((c) => {
                    const meta = STATUS_META[c.status];
                    return (
                      <button
                        key={c.id}
                        onClick={() => abrirConversa(c)}
                        className={cls(
                          'w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-slate-50',
                          selecionadaId === c.id && 'bg-indigo-50',
                          c.status === 'aguardando' && 'border-l-4 border-l-amber-400'
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-sm text-slate-800 truncate">
                            {c.nome || c.clientes?.nome || fmtTelefone(c.telefone)}
                          </span>
                          <span className="flex items-center gap-1.5 shrink-0">
                            {c.nao_lidas > 0 && (
                              <span className="bg-emerald-500 text-white text-[10px] rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                                {c.nao_lidas}
                              </span>
                            )}
                            <Badge cor={meta.cor}>{meta.label}</Badge>
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 truncate mt-0.5">{c.ultima_mensagem ?? ''}</div>
                        {c.status === 'aguardando' && c.motivo_escalacao && (
                          <div className="text-[11px] text-amber-700 truncate mt-0.5 flex items-center gap-1">
                            <AlertTriangle size={11} /> {c.motivo_escalacao}
                          </div>
                        )}
                      </button>
                    );
                  })
                )}
              </div>

              {/* Thread */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
                {!selecionada ? (
                  <Vazio>Selecione uma conversa ao lado.</Vazio>
                ) : (
                  <>
                    <div className="px-4 py-3 border-b border-slate-100 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold text-sm text-slate-800 truncate">
                            {selecionada.nome || selecionada.clientes?.nome || fmtTelefone(selecionada.telefone)}
                          </div>
                          <div className="text-xs text-slate-400">{fmtTelefone(selecionada.telefone)}</div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Badge cor={STATUS_META[selecionada.status].cor}>{STATUS_META[selecionada.status].label}</Badge>
                          {(selecionada.status === 'ia' || selecionada.status === 'aguardando') && (
                            <Btn size="sm" variant="primary" onClick={assumir}>
                              <UserRound size={14} /> Assumir
                            </Btn>
                          )}
                          {selecionada.modo === 'humano' && (
                            <Btn size="sm" variant="secondary" onClick={devolverIA}>
                              <Bot size={14} /> Devolver p/ IA
                            </Btn>
                          )}
                          {selecionada.status !== 'resolvida' ? (
                            <Btn size="sm" variant="success" onClick={resolver}>
                              <CheckCheck size={14} /> Resolver
                            </Btn>
                          ) : (
                            <Btn size="sm" variant="secondary" onClick={reabrir}>
                              <RotateCcw size={14} /> Reabrir
                            </Btn>
                          )}
                        </div>
                      </div>

                      {/* Ficha do cliente (CRM) */}
                      <InfoCliente conversa={selecionada} />

                      {selecionada.status === 'aguardando' && selecionada.motivo_escalacao && (
                        <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                          <span><b>A IA transferiu para você:</b> {selecionada.motivo_escalacao}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50">
                      {mensagens.map((m) => (
                        <div key={m.id} className={cls('flex', m.direcao === 'saida' ? 'justify-end' : 'justify-start')}>
                          <div
                            className={cls(
                              'max-w-[75%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap',
                              m.direcao === 'saida'
                                ? m.autor === 'ia'
                                  ? 'bg-violet-600 text-white rounded-br-sm'
                                  : 'bg-indigo-600 text-white rounded-br-sm'
                                : 'bg-white border border-slate-200 rounded-bl-sm'
                            )}
                          >
                            {m.direcao === 'saida' && (
                              <div className="text-[10px] opacity-75 mb-0.5">
                                {m.autor === 'ia' ? '🤖 Agente IA' : '👤 Atendente'}
                              </div>
                            )}
                            {m.conteudo}
                          </div>
                        </div>
                      ))}
                      <div ref={fimRef} />
                    </div>

                    <div className="flex gap-2 p-3 border-t border-slate-100">
                      <input
                        className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                        placeholder={
                          selecionada.modo === 'ia'
                            ? 'A IA está atendendo — enviar mensagem também assume a conversa…'
                            : 'Digite sua mensagem…'
                        }
                        value={texto}
                        onChange={(e) => setTexto(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && enviar()}
                      />
                      <Btn onClick={enviar} disabled={enviando || !texto.trim()}>
                        <Send size={15} /> {enviando ? '…' : 'Enviar'}
                      </Btn>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )
      ) : (
        /* ---------------- GUIA DE APPS ---------------- */
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4">
          <Card title="1. Qual é o dispositivo do cliente?">
            <div className="space-y-1.5">
              {dispositivos.map((d) => (
                <button
                  key={d.id}
                  onClick={() => {
                    setDispSel(d);
                    setAppSel(d.apps[0] ?? null);
                  }}
                  className={cls(
                    'w-full text-left px-3 py-2 rounded-lg text-sm border',
                    dispSel?.id === d.id
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700 font-medium'
                      : 'border-slate-200 hover:bg-slate-50'
                  )}
                >
                  {d.nome}
                  <div className="text-[11px] text-slate-400">{d.apps.join(' · ')}</div>
                </button>
              ))}
            </div>
          </Card>

          <div className="space-y-4">
            {!dispSel ? (
              <Card>
                <Vazio>Selecione o dispositivo do cliente para ver os apps compatíveis e o passo a passo de instalação.</Vazio>
              </Card>
            ) : (
              <>
                <Card title={`2. Apps compatíveis com ${dispSel.nome}`}>
                  <div className="flex flex-wrap gap-2">
                    {dispSel.apps.map((a) => (
                      <button
                        key={a}
                        onClick={() => setAppSel(a)}
                        className={cls(
                          'px-3 py-1.5 rounded-full text-sm border',
                          appSel === a
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'border-slate-300 hover:bg-slate-50'
                        )}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                </Card>

                {tutorialSel ? (
                  <Card
                    title={`3. Como instalar — ${tutorialSel.app}`}
                    action={
                      <Btn size="sm" variant="secondary" onClick={() => copiarTutorial(tutorialSel)}>
                        <Copy size={14} /> Copiar para WhatsApp
                      </Btn>
                    }
                  >
                    <div
                      className="text-sm leading-relaxed text-slate-700"
                      dangerouslySetInnerHTML={{ __html: md(aplicarLinks(tutorialSel.instrucoes, links)) }}
                    />
                  </Card>
                ) : (
                  appSel && (
                    <Card>
                      <Vazio>Nenhum tutorial cadastrado para {appSel}.</Vazio>
                    </Card>
                  )
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Ficha resumida do cliente vinculado à conversa — dá ao atendente humano o contexto do CRM.
function InfoCliente({ conversa }: { conversa: Conversa }) {
  const c = conversa.clientes;
  if (!c) {
    return (
      <div className="text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
        Contato não vinculado a nenhum cliente cadastrado.
      </div>
    );
  }
  const apps = [c.aplicativo, ...(c.telas_apps ?? [])].filter(Boolean);
  const dias = diasAte(c.data_vencimento);
  const venc =
    c.status !== 'ativo'
      ? { txt: c.status === 'suspenso' ? 'Suspenso' : 'Cancelado', cor: 'text-slate-500' }
      : dias === null
        ? { txt: 'Sem vencimento', cor: 'text-slate-500' }
        : dias < 0
          ? { txt: `Vencido há ${-dias}d`, cor: 'text-rose-600' }
          : dias === 0
            ? { txt: 'Vence hoje', cor: 'text-rose-600' }
            : dias <= 7
              ? { txt: `Vence em ${dias}d`, cor: 'text-amber-600' }
              : { txt: 'Em dia', cor: 'text-emerald-600' };

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
      {c.planos?.nome && <span><span className="text-slate-400">Plano:</span> {c.planos.nome}</span>}
      <span><span className="text-slate-400">Valor:</span> {fmtMoeda(c.valor)}</span>
      <span>
        <span className="text-slate-400">Vencimento:</span> {fmtData(c.data_vencimento)}{' '}
        <b className={venc.cor}>({venc.txt})</b>
      </span>
      <span><span className="text-slate-400">Dispositivo:</span> {c.dispositivo || '—'}</span>
      <span><span className="text-slate-400">Apps:</span> {apps.length ? apps.join(', ') : '—'}</span>
    </div>
  );
}
