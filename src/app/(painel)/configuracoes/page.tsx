'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Btn, Badge, Card, Carregando, Input, PageTitle, Select, TextArea, Toggle, toast,
} from '@/components/ui';
import type { MensagensConfig } from '@/lib/cobranca';
import type {
  AgenteIAConfig, AvisosConfig, LinksPadrao, PagamentosConfig, Plano, UazapiConfig,
} from '@/types';
import { Bell, Bot, Copy, CreditCard, Link2, MessageSquareText, QrCode, Tags } from 'lucide-react';

type Aba = 'planos' | 'links' | 'whatsapp' | 'pagamentos' | 'ia' | 'mensagens' | 'avisos';

const FORMAS_PAGAMENTO = ['PIX', 'Mercado Pago', 'Asaas', 'PicPay', 'Dinheiro', 'Outro'];

export default function ConfiguracoesPage() {
  const supabase = useMemo(() => createClient(), []);
  const [aba, setAba] = useState<Aba>('planos');
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [planos, setPlanos] = useState<Plano[]>([]);
  const [links, setLinks] = useState<LinksPadrao>({ m3u: '', smarters_url: '', smarters_nome: '', xciptv_url: '', assist_plus_codigo: '' });
  const [uazapi, setUazapi] = useState<UazapiConfig>({ server_url: '', admin_token: '', instance_token: '', instance_name: 'sistema', proxy_host: '', proxy_porta: '', proxy_usuario: '', proxy_senha: '', proxy_cidade: 'São Paulo SP' });
  const [pagamentos, setPagamentos] = useState<PagamentosConfig>({
    chave_pix: '', chave_pix_tipo: 'aleatoria', forma_pagamento_padrao: 'PIX',
    mercadopago_token: '', mercadopago_webhook_secret: '',
    asaas_token: '', asaas_webhook_token: '', picpay_token: '',
  });
  const [avisos, setAvisos] = useState<AvisosConfig>({ grupo_whatsapp_id: '' });
  const [telasConfig, setTelasConfig] = useState<{ custo_por_tela: string }>({ custo_por_tela: '1.5' });
  const [ia, setIa] = useState<AgenteIAConfig>({ habilitado: false, provider: 'anthropic', api_key: '', model: '', auto_resposta: true, prompt_sistema: '' });
  const [mensagens, setMensagens] = useState<MensagensConfig>({
    cobranca: '', atraso: '', boas_vindas: '',
    cobranca_botao: true, atraso_botao: true, texto_botao_pix: 'Copiar código PIX',
  });
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
    if (mapa.uazapi) setUazapi((u) => ({ ...u, ...mapa.uazapi, proxy_cidade: 'São Paulo SP' }));
    if (mapa.pagamentos) setPagamentos((p) => ({ ...p, ...mapa.pagamentos }));
    if (mapa.avisos) setAvisos((a) => ({ ...a, ...mapa.avisos }));
    if (mapa.agente_ia) setIa((i) => ({ ...i, ...mapa.agente_ia }));
    if (mapa.mensagens) setMensagens((m) => ({ ...m, ...mapa.mensagens }));
    if (mapa.comissao_padrao) setComissaoPadrao({ tipo: mapa.comissao_padrao.tipo ?? 'fixo', valor: String(mapa.comissao_padrao.valor ?? '') });
    if (mapa.revenda_padrao) setRevendaPadrao({ valor_por_acesso: String(mapa.revenda_padrao.valor_por_acesso ?? '') });
    if (mapa.telas_config) setTelasConfig({ custo_por_tela: String(mapa.telas_config.custo_por_tela ?? '1.5') });
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
    await salvarSetting('telas_config', { custo_por_tela: parseFloat(telasConfig.custo_por_tela || '0') || 0 }, '');
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
    { k: 'avisos', label: 'Avisos', icon: Bell },
  ];

  const origem = typeof window !== 'undefined' ? window.location.origin : '';

  function copiar(texto: string, msg = 'Copiado.') {
    navigator.clipboard.writeText(texto);
    toast(msg);
  }

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

          <Card title="Telas simultâneas">
            <Input
              label="Preço por tela adicional (R$)"
              type="number" step="0.01"
              value={telasConfig.custo_por_tela}
              onChange={(e) => setTelasConfig({ custo_por_tela: e.target.value })}
              hint="Usado no custo informativo de telas (Relatórios) e na despesa automática do Assist Plus por tela"
              className="max-w-xs"
            />
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
              <Input label="Cidade" value="São Paulo SP" disabled hint="Fixo — mesmo formato usado na Uazapi" />
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
          <Card title="PIX">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="Chave PIX (usada nas mensagens de cobrança)" className="sm:col-span-2" value={pagamentos.chave_pix} onChange={(e) => setPagamentos({ ...pagamentos, chave_pix: e.target.value })} />
              <Select label="Tipo da chave" value={pagamentos.chave_pix_tipo} onChange={(e) => setPagamentos({ ...pagamentos, chave_pix_tipo: e.target.value as any })}>
                <option value="aleatoria">Aleatória</option>
                <option value="cpf">CPF</option>
                <option value="cnpj">CNPJ</option>
                <option value="email">E-mail</option>
                <option value="telefone">Telefone</option>
              </Select>
              <Select label="Forma de pagamento padrão" value={pagamentos.forma_pagamento_padrao} onChange={(e) => setPagamentos({ ...pagamentos, forma_pagamento_padrao: e.target.value })} hint="Já vem selecionada ao registrar um pagamento em Receitas">
                {FORMAS_PAGAMENTO.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </Select>
            </div>
          </Card>

          <Card title="Mercado Pago">
            <div className="space-y-3">
              <Input label="Access Token" type="password" value={pagamentos.mercadopago_token} onChange={(e) => setPagamentos({ ...pagamentos, mercadopago_token: e.target.value })} />
              <Input label="Chave secreta do Webhook" type="password" value={pagamentos.mercadopago_webhook_secret} onChange={(e) => setPagamentos({ ...pagamentos, mercadopago_webhook_secret: e.target.value })} hint="Gerada ao configurar o webhook no painel do Mercado Pago — cole aqui o mesmo valor" />
              {origem && (
                <div>
                  <span className="block text-xs font-medium text-slate-600 mb-1">URL do Webhook (cole no painel do Mercado Pago)</span>
                  <div className="flex gap-2">
                    <div className="flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs truncate">{origem}/api/webhook/mercadopago</div>
                    <Btn size="sm" variant="secondary" onClick={() => copiar(`${origem}/api/webhook/mercadopago`)}><Copy size={14} /></Btn>
                  </div>
                </div>
              )}
            </div>
          </Card>

          <Card title="Asaas">
            <div className="space-y-3">
              <Input label="API Key" type="password" value={pagamentos.asaas_token} onChange={(e) => setPagamentos({ ...pagamentos, asaas_token: e.target.value })} />
              <Input label="Token de autenticação do Webhook" type="password" value={pagamentos.asaas_webhook_token} onChange={(e) => setPagamentos({ ...pagamentos, asaas_webhook_token: e.target.value })} hint="Defina um valor aqui e cole o mesmo no campo 'Token de autenticação' ao criar o webhook no Asaas" />
              {origem && (
                <div>
                  <span className="block text-xs font-medium text-slate-600 mb-1">URL do Webhook (cole no painel do Asaas)</span>
                  <div className="flex gap-2">
                    <div className="flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs truncate">{origem}/api/webhook/asaas</div>
                    <Btn size="sm" variant="secondary" onClick={() => copiar(`${origem}/api/webhook/asaas`)}><Copy size={14} /></Btn>
                  </div>
                </div>
              )}
            </div>
          </Card>

          <Card title="PicPay">
            <Input label="Token — PicPay Empresas" type="password" value={pagamentos.picpay_token} onChange={(e) => setPagamentos({ ...pagamentos, picpay_token: e.target.value })} hint="Disponível se sua conta PicPay Empresas tiver acesso à API de pagamentos" />
          </Card>

          <p className="text-xs text-slate-400">
            Com o token e o webhook configurados, use o botão &quot;Gerar cobrança&quot; em Financeiro &gt; Receitas
            para criar um PIX real no Asaas/Mercado Pago — quando o cliente pagar, a cobrança é dada como paga
            automaticamente aqui no sistema.
          </p>

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
              <div className="space-y-2">
                <TextArea
                  label="Mensagem de cobrança (vence hoje)"
                  rows={7}
                  value={mensagens.cobranca}
                  onChange={(e) => setMensagens({ ...mensagens, cobranca: e.target.value })}
                />
                <Toggle
                  label="Enviar com botão de copiar PIX"
                  checked={mensagens.cobranca_botao ?? true}
                  onChange={(v) => setMensagens({ ...mensagens, cobranca_botao: v })}
                />
              </div>
              <div className="space-y-2">
                <TextArea
                  label="Mensagem de atraso (enviada automaticamente no dia seguinte ao vencimento)"
                  rows={7}
                  value={mensagens.atraso}
                  onChange={(e) => setMensagens({ ...mensagens, atraso: e.target.value })}
                />
                <Toggle
                  label="Enviar com botão de copiar PIX"
                  checked={mensagens.atraso_botao ?? true}
                  onChange={(v) => setMensagens({ ...mensagens, atraso_botao: v })}
                />
              </div>
              {(mensagens.cobranca_botao ?? true) || (mensagens.atraso_botao ?? true) ? (
                <Input
                  label="Texto do botão de copiar PIX"
                  value={mensagens.texto_botao_pix ?? ''}
                  onChange={(e) => setMensagens({ ...mensagens, texto_botao_pix: e.target.value })}
                  placeholder="Copiar código PIX"
                />
              ) : null}
              <TextArea
                label="Mensagem de boas-vindas"
                rows={4}
                value={mensagens.boas_vindas}
                onChange={(e) => setMensagens({ ...mensagens, boas_vindas: e.target.value })}
              />
              <p className="text-xs text-slate-400">
                Variáveis disponíveis: {'{nome}'}, {'{valor}'}, {'{vencimento}'}, {'{descricao}'} e {'{pix}'}. O botão de
                copiar PIX é enviado junto com a mensagem quando há um código PIX disponível (gerado no Asaas/Mercado
                Pago ou a chave PIX fixa em Pagamentos).
              </p>
            </div>
          </Card>
          <Btn onClick={() => salvarSetting('mensagens', mensagens)} disabled={salvando}>Salvar mensagens</Btn>
        </div>
      )}

      {/* ---------------- AVISOS ---------------- */}
      {aba === 'avisos' && (
        <div className="space-y-5 max-w-2xl">
          <Card title="Grupo de WhatsApp para avisos aos administradores">
            <div className="space-y-3">
              <Input
                label="ID do grupo"
                placeholder="120363012345678901@g.us"
                value={avisos.grupo_whatsapp_id}
                onChange={(e) => setAvisos({ ...avisos, grupo_whatsapp_id: e.target.value })}
                hint="O ID de um grupo do WhatsApp sempre termina em @g.us. Peça o ID do grupo ao suporte do seu servidor Uazapi, ou verifique no painel dele em Grupos."
              />
              <p className="text-xs text-slate-400">
                Todo dia, junto com a rotina de cobrança automática (10h), o sistema envia um resumo dos
                recebimentos do dia anterior para este grupo — assim os administradores acompanham sem precisar
                abrir o painel.
              </p>
            </div>
          </Card>
          <Btn onClick={() => salvarSetting('avisos', avisos)} disabled={salvando}>Salvar avisos</Btn>
        </div>
      )}
    </div>
  );
}
