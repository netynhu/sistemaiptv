'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Btn, Badge, Card, Carregando, Input, PageTitle, Select, TextArea, Toggle, toast,
} from '@/components/ui';
import type {
  AgenteIAConfig, LinksPadrao, PagamentosConfig, Plano, UazapiConfig,
} from '@/types';
import { Bot, CreditCard, Link2, MessageSquareText, QrCode, Tags } from 'lucide-react';

type Aba = 'planos' | 'links' | 'whatsapp' | 'pagamentos' | 'ia' | 'mensagens';

const CIDADES = [
  'Alfenas', 'Belo Horizonte', 'São Paulo', 'Rio de Janeiro', 'Varginha', 'Poços de Caldas',
  'Pouso Alegre', 'Uberlândia', 'Campinas', 'Curitiba', 'Porto Alegre', 'Salvador',
  'Recife', 'Fortaleza', 'Brasília', 'Goiânia',
];

export default function ConfiguracoesPage() {
  const supabase = useMemo(() => createClient(), []);
  const [aba, setAba] = useState<Aba>('planos');
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [planos, setPlanos] = useState<Plano[]>([]);
  const [links, setLinks] = useState<LinksPadrao>({ m3u: '', smarters_url: '', smarters_nome: '', xciptv_url: '', assist_plus_codigo: '' });
  const [uazapi, setUazapi] = useState<UazapiConfig>({ server_url: '', admin_token: '', instance_token: '', instance_name: 'sistema', proxy_host: '', proxy_porta: '', proxy_usuario: '', proxy_senha: '', proxy_cidade: '' });
  const [pagamentos, setPagamentos] = useState<PagamentosConfig>({ chave_pix: '', mercadopago_token: '', asaas_token: '', picpay_token: '' });
  const [ia, setIa] = useState<AgenteIAConfig>({ habilitado: false, provider: 'anthropic', api_key: '', model: '', auto_resposta: true, prompt_sistema: '' });
  const [mensagens, setMensagens] = useState<{ cobranca: string; boas_vindas: string }>({ cobranca: '', boas_vindas: '' });
  const [comissaoPadrao, setComissaoPadrao] = useState<{ tipo: string; valor: string }>({ tipo: 'fixo', valor: '' });
  const [revendaPadrao, setRevendaPadrao] = useState<{ valor_por_acesso: string }>({ valor_por_acesso: '' });

  // Estado da conexão WhatsApp
  const [qrcode, setQrcode] = useState<string | null>(null);
  const [statusWpp, setStatusWpp] = useState<string>('');
  const [acaoWpp, setAcaoWpp] = useState<string | null>(null);

  async function carregar() {
    setCarregando(true);
    const [pla, cfg] = await Promise.all([
      supabase.from('planos').select('*').order('meses'),
      supabase.from('settings').select('chave, valor'),
    ]);
    setPlanos((pla.data as Plano[]) ?? []);
    const mapa: Record<string, any> = {};
    for (const s of cfg.data ?? []) mapa[s.chave] = s.valor;
    if (mapa.links_padrao) setLinks({ ...links, ...mapa.links_padrao });
    if (mapa.uazapi) setUazapi((u) => ({ ...u, ...mapa.uazapi }));
    if (mapa.pagamentos) setPagamentos((p) => ({ ...p, ...mapa.pagamentos }));
    if (mapa.agente_ia) setIa((i) => ({ ...i, ...mapa.agente_ia }));
    if (mapa.mensagens) setMensagens((m) => ({ ...m, ...mapa.mensagens }));
    if (mapa.comissao_padrao) setComissaoPadrao({ tipo: mapa.comissao_padrao.tipo ?? 'fixo', valor: String(mapa.comissao_padrao.valor ?? '') });
    if (mapa.revenda_padrao) setRevendaPadrao({ valor_por_acesso: String(mapa.revenda_padrao.valor_por_acesso ?? '') });
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function salvarSetting(chave: string, valor: unknown, msg = 'Configurações salvas.') {
    setSalvando(true);
    const { error } = await supabase
      .from('settings')
      .upsert({ chave, valor, atualizado_em: new Date().toISOString() });
    setSalvando(false);
    if (error) return toast(`Erro ao salvar: ${error.message}`, 'erro');
    toast(msg);
  }

  async function salvarPlanos() {
    setSalvando(true);
    for (const p of planos) {
      const { error } = await supabase.from('planos').update({ valor: p.valor, ativo: p.ativo }).eq('id', p.id);
      if (error) {
        setSalvando(false);
        return toast(`Erro ao salvar plano ${p.nome}: ${error.message}`, 'erro');
      }
    }
    await salvarSetting('comissao_padrao', { tipo: comissaoPadrao.tipo, valor: parseFloat(comissaoPadrao.valor || '0') || 0 }, '');
    await salvarSetting('revenda_padrao', { valor_por_acesso: parseFloat(revendaPadrao.valor_por_acesso || '0') || 0 }, '');
    setSalvando(false);
    toast('Planos e padrões salvos.');
  }

  async function chamarUazapi(acao: string) {
    setAcaoWpp(acao);
    try {
      // Salva a configuração atual antes de qualquer ação
      await salvarSetting('uazapi', uazapi, '');
      const res = await fetch('/api/uazapi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha na chamada');
      if (acao === 'init' && data.token) {
        setUazapi((u) => ({ ...u, instance_token: data.token }));
        toast('Instância criada. Agora clique em "Conectar / Gerar QR".');
      }
      if (acao === 'connect' || acao === 'status') {
        setQrcode(data.qrcode ?? null);
        setStatusWpp(data.status ?? '');
        if (data.status === 'connected') toast('WhatsApp conectado!');
        else if (data.qrcode) toast('Escaneie o QR Code no WhatsApp do celular.');
      }
      if (acao === 'disconnect') {
        setStatusWpp('disconnected');
        setQrcode(null);
        toast('Instância desconectada.');
      }
      if (acao === 'proxy') toast('Proxy aplicado na instância.');
      if (acao === 'webhook') toast(`Webhook configurado: ${data.url}`);
    } catch (e: any) {
      toast(`Erro: ${e.message}`, 'erro');
    } finally {
      setAcaoWpp(null);
    }
  }

  if (carregando) return <Carregando />;

  const abas: { k: Aba; label: string; icon: any }[] = [
    { k: 'planos', label: 'Planos & Comissões', icon: Tags },
    { k: 'links', label: 'Links padrão', icon: Link2 },
    { k: 'whatsapp', label: 'WhatsApp (Uazapi)', icon: QrCode },
    { k: 'pagamentos', label: 'Pagamentos', icon: CreditCard },
    { k: 'ia', label: 'Agente de IA', icon: Bot },
    { k: 'mensagens', label: 'Mensagens', icon: MessageSquareText },
  ];

  return (
    <div>
      <PageTitle title="Configurações" subtitle="Padrões do sistema, integrações e agente de IA" />

      <div className="flex flex-wrap gap-1 mb-5 bg-slate-200/70 rounded-lg p-1 w-fit">
        {abas.map(({ k, label, icon: Icon }) => (
          <button
            key={k}
            onClick={() => setAba(k)}
            className={
              aba === k
                ? 'flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white shadow text-sm font-medium text-slate-800'
                : 'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-slate-500 hover:text-slate-800'
            }
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {/* ---------------- PLANOS ---------------- */}
      {aba === 'planos' && (
        <div className="space-y-5 max-w-2xl">
          <Card title="Valores padrão dos planos">
            <div className="space-y-3">
              {planos.map((p, i) => (
                <div key={p.id} className="flex items-center gap-3">
                  <span className="w-28 text-sm font-medium">{p.nome}</span>
                  <span className="text-xs text-slate-400 w-16">{p.meses} {p.meses === 1 ? 'mês' : 'meses'}</span>
                  <input
                    type="number" step="0.01"
                    className="w-32 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                    value={p.valor}
                    onChange={(e) => {
                      const novo = [...planos];
                      novo[i] = { ...p, valor: parseFloat(e.target.value || '0') };
                      setPlanos(novo);
                    }}
                  />
                  <Toggle label="Ativo" checked={p.ativo} onChange={(v) => {
                    const novo = [...planos];
                    novo[i] = { ...p, ativo: v };
                    setPlanos(novo);
                  }} />
                </div>
              ))}
              <p className="text-xs text-slate-400">
                Estes são os valores sugeridos ao cadastrar um cliente — em cada cliente você pode cobrar um valor diferente.
              </p>
            </div>
          </Card>

          <Card title="Padrões de revenda e indicação">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input
                label="Valor por acesso (revendedor master)"
                type="number" step="0.01"
                value={revendaPadrao.valor_por_acesso}
                onChange={(e) => setRevendaPadrao({ valor_por_acesso: e.target.value })}
                hint="Sugerido ao cadastrar novo revendedor"
              />
              <Select label="Tipo de comissão (indicador)" value={comissaoPadrao.tipo} onChange={(e) => setComissaoPadrao({ ...comissaoPadrao, tipo: e.target.value })}>
                <option value="fixo">Valor fixo (R$)</option>
                <option value="percentual">Percentual (%)</option>
              </Select>
              <Input
                label={comissaoPadrao.tipo === 'percentual' ? 'Comissão padrão (%)' : 'Comissão padrão (R$)'}
                type="number" step="0.01"
                value={comissaoPadrao.valor}
                onChange={(e) => setComissaoPadrao({ ...comissaoPadrao, valor: e.target.value })}
                hint="Sugerida ao cadastrar novo indicador"
              />
            </div>
          </Card>

          <Btn onClick={salvarPlanos} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar planos e padrões'}</Btn>
        </div>
      )}

      {/* ---------------- LINKS ---------------- */}
      {aba === 'links' && (
        <div className="space-y-5 max-w-2xl">
          <Card title="Links e códigos padrão dos aplicativos">
            <div className="space-y-3">
              <Input
                label="Link M3U padrão"
                value={links.m3u}
                onChange={(e) => setLinks({ ...links, m3u: e.target.value })}
                hint={'Use {{usuario}} e {{senha}} no lugar do usuário/senha — o sistema troca automaticamente pelos dados de cada cliente. Ex.: http://seudominio.com/get.php?username={{usuario}}&password={{senha}}&type=m3u_plus. O domínio e os parâmetros são iguais para todos — não é possível personalizar isso por cliente, só usuário e senha mudam.'}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input label="URL — IPTV Smarters Pro" value={links.smarters_url} onChange={(e) => setLinks({ ...links, smarters_url: e.target.value })} />
                <Input label="Nome (campo do Smarters)" value={links.smarters_nome} onChange={(e) => setLinks({ ...links, smarters_nome: e.target.value })} />
                <Input label="URL — XCIPTV" value={links.xciptv_url} onChange={(e) => setLinks({ ...links, xciptv_url: e.target.value })} />
                <Input label="Código — Assist Plus" value={links.assist_plus_codigo} onChange={(e) => setLinks({ ...links, assist_plus_codigo: e.target.value })} />
              </div>
              <p className="text-xs text-slate-400">
                Estes valores alimentam o guia de instalação da aba Suporte e a base de conhecimento do agente de IA.
              </p>
            </div>
          </Card>
          <Btn onClick={() => salvarSetting('links_padrao', links)} disabled={salvando}>Salvar links</Btn>
        </div>
      )}

      {/* ---------------- WHATSAPP ---------------- */}
      {aba === 'whatsapp' && (
        <div className="space-y-5 max-w-3xl">
          <Card title="Servidor Uazapi">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="URL do servidor" placeholder="https://seuservidor.uazapi.com" value={uazapi.server_url} onChange={(e) => setUazapi({ ...uazapi, server_url: e.target.value })} />
              <Input label="Admin token" type="password" value={uazapi.admin_token} onChange={(e) => setUazapi({ ...uazapi, admin_token: e.target.value })} hint="Necessário apenas para criar a instância" />
              <Input label="Nome da instância" value={uazapi.instance_name} onChange={(e) => setUazapi({ ...uazapi, instance_name: e.target.value })} />
              <Input label="Token da instância" type="password" value={uazapi.instance_token} onChange={(e) => setUazapi({ ...uazapi, instance_token: e.target.value })} hint="Preenchido automaticamente ao criar a instância" />
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              <Btn variant="secondary" onClick={() => chamarUazapi('init')} disabled={!!acaoWpp}>
                {acaoWpp === 'init' ? 'Criando…' : 'Criar instância'}
              </Btn>
              <Btn onClick={() => chamarUazapi('connect')} disabled={!!acaoWpp}>
                <QrCode size={15} /> {acaoWpp === 'connect' ? 'Conectando…' : 'Conectar / Gerar QR'}
              </Btn>
              <Btn variant="secondary" onClick={() => chamarUazapi('status')} disabled={!!acaoWpp}>
                {acaoWpp === 'status' ? 'Verificando…' : 'Verificar status'}
              </Btn>
              <Btn variant="secondary" onClick={() => chamarUazapi('webhook')} disabled={!!acaoWpp}>
                {acaoWpp === 'webhook' ? 'Configurando…' : 'Configurar webhook'}
              </Btn>
              <Btn variant="danger" onClick={() => chamarUazapi('disconnect')} disabled={!!acaoWpp}>
                Desconectar
              </Btn>
            </div>

            {(statusWpp || qrcode) && (
              <div className="mt-4 flex flex-col items-center gap-3 border-t border-slate-100 pt-4">
                {statusWpp && (
                  <div>
                    Status:{' '}
                    {statusWpp === 'connected' ? (
                      <Badge cor="verde">Conectado</Badge>
                    ) : statusWpp === 'connecting' ? (
                      <Badge cor="amarelo">Aguardando leitura do QR</Badge>
                    ) : (
                      <Badge cor="cinza">{statusWpp}</Badge>
                    )}
                  </div>
                )}
                {qrcode && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qrcode} alt="QR Code do WhatsApp" className="w-64 h-64 border rounded-xl" />
                )}
              </div>
            )}
          </Card>

          <Card title="Proxy (cidade do IP)">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="Host do proxy" value={uazapi.proxy_host} onChange={(e) => setUazapi({ ...uazapi, proxy_host: e.target.value })} />
              <Input label="Porta" value={uazapi.proxy_porta} onChange={(e) => setUazapi({ ...uazapi, proxy_porta: e.target.value })} />
              <Input label="Usuário do proxy" value={uazapi.proxy_usuario} onChange={(e) => setUazapi({ ...uazapi, proxy_usuario: e.target.value })} hint="Use {cidade} no usuário para inserir a cidade selecionada (ex.: user-city-{cidade})" />
              <Input label="Senha do proxy" type="password" value={uazapi.proxy_senha} onChange={(e) => setUazapi({ ...uazapi, proxy_senha: e.target.value })} />
              <Select label="Cidade" value={uazapi.proxy_cidade} onChange={(e) => setUazapi({ ...uazapi, proxy_cidade: e.target.value })}>
                <option value="">Selecione a cidade…</option>
                {CIDADES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
            </div>
            <div className="mt-4">
              <Btn variant="secondary" onClick={() => chamarUazapi('proxy')} disabled={!!acaoWpp}>
                {acaoWpp === 'proxy' ? 'Aplicando…' : 'Aplicar proxy na instância'}
              </Btn>
            </div>
          </Card>

          <Btn onClick={() => salvarSetting('uazapi', uazapi)} disabled={salvando}>Salvar configurações do WhatsApp</Btn>
        </div>
      )}

      {/* ---------------- PAGAMENTOS ---------------- */}
      {aba === 'pagamentos' && (
        <div className="space-y-5 max-w-2xl">
          <Card title="PIX e tokens dos gateways">
            <div className="space-y-3">
              <Input label="Chave PIX (usada nas mensagens de cobrança)" value={pagamentos.chave_pix} onChange={(e) => setPagamentos({ ...pagamentos, chave_pix: e.target.value })} />
              <Input label="Token — Mercado Pago (Access Token)" type="password" value={pagamentos.mercadopago_token} onChange={(e) => setPagamentos({ ...pagamentos, mercadopago_token: e.target.value })} />
              <Input label="Token — Asaas (API Key)" type="password" value={pagamentos.asaas_token} onChange={(e) => setPagamentos({ ...pagamentos, asaas_token: e.target.value })} />
              <Input label="Token — PicPay Empresas" type="password" value={pagamentos.picpay_token} onChange={(e) => setPagamentos({ ...pagamentos, picpay_token: e.target.value })} hint="Disponível se sua conta PicPay Empresas tiver acesso à API de pagamentos" />
              <p className="text-xs text-slate-400">
                Os tokens ficam guardados para as integrações de cobrança automática. O envio de cobrança por WhatsApp usa a chave PIX acima.
              </p>
            </div>
          </Card>
          <Btn onClick={() => salvarSetting('pagamentos', pagamentos)} disabled={salvando}>Salvar pagamentos</Btn>
        </div>
      )}

      {/* ---------------- AGENTE IA ---------------- */}
      {aba === 'ia' && (
        <div className="space-y-5 max-w-2xl">
          <Card title="Agente de IA do suporte">
            <div className="space-y-4">
              <div className="flex flex-wrap gap-6">
                <Toggle label="Agente habilitado" checked={ia.habilitado} onChange={(v) => setIa({ ...ia, habilitado: v })} />
                <Toggle label="Responder automaticamente novas mensagens" checked={ia.auto_resposta} onChange={(v) => setIa({ ...ia, auto_resposta: v })} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Select label="Provedor" value={ia.provider} onChange={(e) => setIa({ ...ia, provider: e.target.value as any, model: '' })}>
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="openai">OpenAI (GPT)</option>
                </Select>
                <Input
                  label="Modelo"
                  placeholder={ia.provider === 'anthropic' ? 'claude-haiku-4-5-20251001' : 'gpt-4o-mini'}
                  value={ia.model}
                  onChange={(e) => setIa({ ...ia, model: e.target.value })}
                />
              </div>
              <Input label="Chave de API" type="password" value={ia.api_key} onChange={(e) => setIa({ ...ia, api_key: e.target.value })} />
              <TextArea
                label="Prompt do sistema (personalidade e regras do agente)"
                value={ia.prompt_sistema}
                onChange={(e) => setIa({ ...ia, prompt_sistema: e.target.value })}
                rows={6}
              />
              <p className="text-xs text-slate-400">
                Além do prompt, o agente recebe automaticamente a base de conhecimento com os apps compatíveis
                por dispositivo e os passos de instalação (aba Suporte &gt; Guia de apps), já com os links padrão preenchidos.
                Quando você assume uma conversa no Suporte, a IA para de responder aquele contato.
              </p>
            </div>
          </Card>
          <Btn onClick={() => salvarSetting('agente_ia', ia)} disabled={salvando}>Salvar agente de IA</Btn>
        </div>
      )}

      {/* ---------------- MENSAGENS ---------------- */}
      {aba === 'mensagens' && (
        <div className="space-y-5 max-w-2xl">
          <Card title="Modelos de mensagem (WhatsApp)">
            <div className="space-y-3">
              <TextArea
                label="Mensagem de cobrança"
                rows={7}
                value={mensagens.cobranca}
                onChange={(e) => setMensagens({ ...mensagens, cobranca: e.target.value })}
              />
              <TextArea
                label="Mensagem de boas-vindas"
                rows={4}
                value={mensagens.boas_vindas}
                onChange={(e) => setMensagens({ ...mensagens, boas_vindas: e.target.value })}
              />
              <p className="text-xs text-slate-400">
                Variáveis disponíveis: {'{nome}'}, {'{valor}'}, {'{vencimento}'}, {'{descricao}'} e {'{pix}'}.
              </p>
            </div>
          </Card>
          <Btn onClick={() => salvarSetting('mensagens', mensagens)} disabled={salvando}>Salvar mensagens</Btn>
        </div>
      )}
    </div>
  );
}
