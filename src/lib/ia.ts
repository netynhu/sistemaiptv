// Agente de IA do suporte — gera respostas usando a base de conhecimento
// (dispositivos/tutoriais do PDF + links padrão), o cadastro completo do cliente
// (identificado pelo WhatsApp) e a OpenAI (function calling).

import { createAdminClient } from '@/lib/supabase/server';
import { getSetting } from '@/lib/settings';
import { sincronizarDespesaAssistPlus } from '@/lib/despesas';
import { sendPixButton } from '@/lib/uazapi';
import { diasAte, fmtData, fmtMoeda, resolverLinkM3U } from '@/lib/utils';
import type { AgenteIAConfig, Cliente, LinksPadrao, PagamentosConfig, UazapiConfig } from '@/types';

export async function montarBaseConhecimento(): Promise<string> {
  const admin = createAdminClient();
  const [{ data: dispositivos }, { data: tutoriais }, links] = await Promise.all([
    admin.from('dispositivos').select('*').order('ordem'),
    admin.from('tutoriais').select('*').order('ordem'),
    getSetting<LinksPadrao>('links_padrao'),
  ]);

  const l: LinksPadrao = {
    m3u: links?.m3u ?? '',
    smarters_url: links?.smarters_url ?? '',
    smarters_nome: links?.smarters_nome ?? 'tv',
    xciptv_url: links?.xciptv_url ?? '',
    assist_plus_codigo: links?.assist_plus_codigo ?? '',
  };

  const linhasDisp = (dispositivos ?? [])
    .map((d) => `- ${d.nome}: ${(d.apps as string[]).join(', ')}`)
    .join('\n');

  const blocosTut = (tutoriais ?? [])
    .map((t) => {
      let inst = t.instrucoes as string;
      inst = inst
        .split('{assist_plus_codigo}').join(l.assist_plus_codigo)
        .split('{smarters_nome}').join(l.smarters_nome)
        .split('{smarters_url}').join(l.smarters_url)
        .split('{xciptv_url}').join(l.xciptv_url);
      return `### ${t.app}\n${inst}`;
    })
    .join('\n\n');

  const infoM3U = l.m3u
    ? [
        '## Link M3U',
        `O link M3U segue sempre o mesmo padrão para todos os clientes — só o usuário e a senha mudam de um cliente para outro. Não é possível personalizar o link em si (domínio/parâmetros) por cliente, apenas usuário e senha.`,
        `Modelo do link: ${l.m3u}`,
        'Para montar o link de um cliente específico, troque {{usuario}} pelo usuário dele e {{senha}} pela senha dele. Se o cliente perguntar se pode mudar o link, explique que o padrão é fixo e só usuário/senha são individuais.',
      ].join('\n')
    : '';

  return [
    '## Apps compatíveis por dispositivo',
    linhasDisp,
    '',
    '## Como configurar cada aplicativo',
    blocosTut,
    '',
    infoM3U,
  ].join('\n');
}

// Regras de comportamento SEMPRE aplicadas, independentemente do prompt configurado pelo admin.
const INSTRUCOES_NUCLEO = `Você é o atendente virtual de um serviço de IPTV, atendendo pelo WhatsApp. O cliente já foi identificado pelo número dele (bloco "DADOS DO CLIENTE").

COMO ATENDER:
1. Cumprimente pelo nome e descubra o que o cliente precisa. Entenda a INTENÇÃO da conversa:
   • PAGAMENTO/RENOVAÇÃO (quer pagar, renovar, "manda o pix", assinatura vencendo): use a ferramenta "enviar_cobranca_pix" para mandar o PIX com botão de copiar. Depois confirme de forma breve e simpática.
   • SUPORTE/INSTALAÇÃO (não está funcionando, como instalar, trocou de aparelho): ajude usando a BASE DE CONHECIMENTO, sempre com base no dispositivo e app que o cliente usa (nos DADOS DO CLIENTE).
2. Você TEM os dados de acesso do cliente (usuário, senha, link M3U) nos DADOS DO CLIENTE e PODE informá-los a ele — ele é o titular da conta, já identificado pelo WhatsApp. Nunca compartilhe dados de OUTRO cliente.
3. Para orientar instalação/configuração, use SEMPRE a BASE DE CONHECIMENTO (apps por dispositivo e passo a passo). Nunca invente passos, links, códigos ou nomes de apps que não estejam na base.
4. Se o cliente disser que TROCOU de aparelho ou vai usar outro app, use a ferramenta "atualizar_aparelho_cliente" (use exatamente os nomes de dispositivo/app da base de conhecimento) e então oriente a instalação no novo app.
5. Se NÃO conseguir resolver, se o cliente pedir para falar com uma pessoa, ou se o assunto fugir de pagamento/instalação (ex.: cancelamento, reclamação, cobrança indevida, pedido especial), use a ferramenta "transferir_para_humano". Um atendente humano será avisado.

ESTILO: mensagens curtas e calorosas, como um humano no WhatsApp. Português do Brasil. Não use markdown pesado; no máximo 1–2 emojis por mensagem.`;

function contextoCliente(cliente: Cliente | null, m3u: string): string {
  if (!cliente) {
    return 'Este número de WhatsApp NÃO está vinculado a nenhum cliente cadastrado. Pode ser um contato novo ou um cliente usando outro número. Pergunte o nome dele e como pode ajudar. NÃO forneça dados de acesso e não invente cadastro. Se ele disser que é cliente, use "transferir_para_humano" para um atendente confirmar.';
  }
  const appPrincipal = cliente.aplicativo || 'não informado';
  const telasExtras = (cliente.telas_apps ?? []).filter(Boolean);
  const dias = diasAte(cliente.data_vencimento ?? null);
  const situacao =
    cliente.status !== 'ativo'
      ? `cadastro ${cliente.status}`
      : dias === null
        ? 'sem data de vencimento cadastrada'
        : dias < 0
          ? `assinatura VENCIDA há ${-dias} dia(s)`
          : dias === 0
            ? 'assinatura vence HOJE'
            : `assinatura ativa (vence em ${dias} dia(s))`;

  return [
    `Nome: ${cliente.nome}`,
    `Situação: ${situacao}${cliente.data_vencimento ? ` — vencimento em ${fmtData(cliente.data_vencimento)}` : ''}`,
    cliente.planos?.nome ? `Plano: ${cliente.planos.nome}` : null,
    `Valor da mensalidade: ${fmtMoeda(Number(cliente.valor) || 0)}`,
    `Usuário: ${cliente.usuario || 'não cadastrado'}`,
    `Senha: ${cliente.senha || 'não cadastrada'}`,
    m3u ? `Link M3U do cliente: ${m3u}` : null,
    `Dispositivo cadastrado: ${cliente.dispositivo || 'não informado'}`,
    `App principal: ${appPrincipal}`,
    telasExtras.length ? `Telas adicionais: ${telasExtras.join(', ')}` : `Telas adicionais: nenhuma`,
  ].filter(Boolean).join('\n');
}

export type MensagemIA = { role: 'user' | 'assistant'; content: string };

export type ContextoConversa = { telefone: string; conversaId: string };

export type ResultadoIA = {
  resposta: string | null;
  escalar: { motivo: string } | null;
  atualizouAparelho: { dispositivo: string; aplicativo: string } | null;
  enviouPix: boolean;
};

const VAZIO: ResultadoIA = { resposta: null, escalar: null, atualizouAparelho: null, enviouPix: false };

export async function gerarRespostaIA(
  historico: MensagemIA[],
  cliente: Cliente | null,
  ctx: ContextoConversa
): Promise<ResultadoIA> {
  const cfg = await getSetting<AgenteIAConfig>('agente_ia');
  if (!cfg?.habilitado || !cfg.api_key) return VAZIO;

  const [base, links] = await Promise.all([
    montarBaseConhecimento(),
    getSetting<LinksPadrao>('links_padrao'),
  ]);
  const m3u = cliente ? resolverLinkM3U(links?.m3u, cliente.usuario, cliente.senha) : '';

  const system = [
    INSTRUCOES_NUCLEO,
    cfg.prompt_sistema?.trim() ? `\n=== INSTRUÇÕES ADICIONAIS DO ADMIN ===\n${cfg.prompt_sistema.trim()}` : '',
    `\n=== DADOS DO CLIENTE (deste WhatsApp) ===\n${contextoCliente(cliente, m3u)}`,
    `\n=== BASE DE CONHECIMENTO ===\n${base}`,
  ].join('\n');

  // Garante alternância válida e limita o histórico
  const msgs = historico.slice(-12).filter((m) => m.content?.trim());
  if (msgs.length === 0) return VAZIO;

  return responderOpenAI(cfg, system, msgs, cliente, ctx);
}

// Envia ao cliente o PIX (com botão de copiar) da cobrança pendente dele. Retorna o texto de
// resultado que volta para o modelo. Registra a mensagem enviada na conversa (aparece no CRM).
async function enviarCobrancaPix(cliente: Cliente, ctx: ContextoConversa): Promise<{ msg: string; ok: boolean }> {
  const admin = createAdminClient();
  const [uazapi, pagamentos] = await Promise.all([
    getSetting<UazapiConfig>('uazapi'),
    getSetting<PagamentosConfig>('pagamentos'),
  ]);
  if (!uazapi?.server_url || !uazapi.instance_token) {
    return { msg: 'WhatsApp não configurado — não foi possível enviar o PIX. Use transferir_para_humano.', ok: false };
  }

  const { data: cobrancas } = await admin
    .from('cobrancas')
    .select('*')
    .eq('tipo', 'cliente')
    .eq('cliente_id', cliente.id)
    .eq('status', 'pendente')
    .order('vencimento', { ascending: true })
    .limit(1);
  const cobranca = (cobrancas ?? [])[0];

  const pixCode = cobranca?.pix_copia_cola || pagamentos?.chave_pix || '';
  if (!pixCode) {
    return { msg: 'Não há chave PIX configurada nem cobrança gerada para este cliente. Use transferir_para_humano.', ok: false };
  }

  const valor = cobranca ? Number(cobranca.valor) : Number(cliente.valor) || 0;
  const venc = cobranca?.vencimento || cliente.data_vencimento;

  const texto = [
    'Segue o PIX pra renovar sua assinatura 💚',
    valor ? `Valor: ${fmtMoeda(valor)}` : null,
    venc ? `Vencimento: ${fmtData(venc)}` : null,
    '',
    'Toque no botão abaixo pra copiar o código e pagar no app do seu banco. Depois é só mandar o comprovante aqui!',
  ].filter(Boolean).join('\n');

  await sendPixButton(uazapi, ctx.telefone, texto, pixCode);

  await admin.from('mensagens').insert({
    conversa_id: ctx.conversaId,
    direcao: 'saida',
    autor: 'ia',
    conteudo: `${texto}\n\n[código PIX: ${pixCode}]`,
  });
  await admin
    .from('conversas')
    .update({ ultima_mensagem: 'PIX enviado ao cliente', atualizado_em: new Date().toISOString() })
    .eq('id', ctx.conversaId);

  return { msg: `PIX enviado ao cliente com botão de copiar (${fmtMoeda(valor)}). Confirme para ele, de forma breve e amigável, que já mandou o código.`, ok: true };
}

async function responderOpenAI(
  cfg: AgenteIAConfig,
  system: string,
  msgs: MensagemIA[],
  cliente: Cliente | null,
  ctx: ContextoConversa
): Promise<ResultadoIA> {
  const tools: any[] = [
    {
      type: 'function',
      function: {
        name: 'transferir_para_humano',
        description:
          'Transfere o atendimento para um atendente humano (que também é avisado num grupo). Use quando não conseguir resolver, quando o cliente pedir para falar com alguém, ou quando o assunto fugir de pagamento/instalação (cancelamento, reclamação, cobrança indevida, pedidos especiais).',
        parameters: {
          type: 'object',
          properties: {
            motivo: {
              type: 'string',
              description: 'Resumo curto do motivo da transferência e do que o cliente precisa, para o atendente humano se situar.',
            },
          },
          required: ['motivo'],
        },
      },
    },
  ];
  // Ferramentas que dependem de cliente identificado.
  if (cliente) {
    tools.push({
      type: 'function',
      function: {
        name: 'enviar_cobranca_pix',
        description:
          'Envia ao cliente, pelo WhatsApp, o PIX para pagar/renovar a assinatura, com um botão de copiar o código. Use quando o cliente quiser pagar ou renovar, ou pedir a chave/código PIX.',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    });
    tools.push({
      type: 'function',
      function: {
        name: 'atualizar_aparelho_cliente',
        description:
          'Atualiza o dispositivo e o aplicativo principal do cliente no cadastro. Use quando o cliente informar que trocou de aparelho ou passou a usar outro app. Use exatamente os nomes que aparecem na base de conhecimento.',
        parameters: {
          type: 'object',
          properties: {
            dispositivo: { type: 'string', description: 'Nome do novo dispositivo (ex.: "TV Smart LG", "Fire Stick / Fire TV", "Celular Android").' },
            aplicativo: { type: 'string', description: 'Nome do app principal que ele passará a usar nesse dispositivo.' },
          },
          required: ['dispositivo', 'aplicativo'],
        },
      },
    });
  }

  const messages: any[] = [{ role: 'system', content: system }, ...msgs.map((m) => ({ role: m.role, content: m.content }))];
  let escalar: ResultadoIA['escalar'] = null;
  let atualizou: ResultadoIA['atualizouAparelho'] = null;
  let enviouPix = false;

  // Loop agêntico: executa ferramentas e realimenta o resultado até o modelo produzir a resposta final.
  for (let i = 0; i < 5; i++) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.api_key}`,
      },
      body: JSON.stringify({
        model: cfg.model || 'gpt-4o-mini',
        max_tokens: 800,
        messages,
        tools,
        tool_choice: 'auto',
      }),
    });
    if (!res.ok) throw new Error(`OpenAI respondeu ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const choice = data.choices?.[0]?.message;
    const toolCalls: Array<{ id: string; function: { name: string; arguments: string } }> = choice?.tool_calls ?? [];

    if (!toolCalls.length) {
      const resposta = (choice?.content ?? '').trim();
      return { resposta: resposta || null, escalar, atualizouAparelho: atualizou, enviouPix };
    }

    // Precisa devolver a mensagem do assistente (com os tool_calls) antes das respostas das ferramentas
    messages.push(choice);

    for (const tc of toolCalls) {
      let args: any = {};
      try { args = JSON.parse(tc.function?.arguments || '{}'); } catch { /* ignora argumentos inválidos */ }
      let content = 'Ferramenta indisponível.';
      const nome = tc.function?.name;

      if (nome === 'transferir_para_humano') {
        escalar = { motivo: String(args.motivo ?? '').trim() || 'Cliente precisa de atendimento humano.' };
        content = 'Transferência registrada e um atendente humano será avisado. Diga ao cliente, de forma acolhedora e breve, que uma pessoa vai continuar o atendimento em instantes.';
      } else if (nome === 'enviar_cobranca_pix' && cliente) {
        const r = await enviarCobrancaPix(cliente, ctx);
        enviouPix = enviouPix || r.ok;
        content = r.msg;
      } else if (nome === 'atualizar_aparelho_cliente' && cliente) {
        const dispositivo = String(args.dispositivo ?? '').trim();
        const aplicativo = String(args.aplicativo ?? '').trim();
        if (dispositivo && aplicativo) {
          const admin = createAdminClient();
          const { error } = await admin
            .from('clientes')
            .update({ dispositivo, aplicativo })
            .eq('id', cliente.id);
          if (error) {
            content = `Não foi possível atualizar o cadastro: ${error.message}`;
          } else {
            // Mantém em Financeiro > Despesas o custo de telas do Assist Plus deste cliente
            await sincronizarDespesaAssistPlus(cliente.id).catch((e) => console.error('Erro ao sincronizar despesa Assist Plus:', e));
            atualizou = { dispositivo, aplicativo };
            content = `Cadastro atualizado: dispositivo "${dispositivo}", app principal "${aplicativo}". Agora oriente a instalação nesse app usando a base de conhecimento.`;
          }
        } else {
          content = 'Informe o dispositivo e o aplicativo para atualizar.';
        }
      }

      messages.push({ role: 'tool', tool_call_id: tc.id, content });
    }
  }

  // Se esgotou o loop sem resposta final, ao menos preserva ações executadas.
  return { resposta: null, escalar, atualizouAparelho: atualizou, enviouPix };
}
