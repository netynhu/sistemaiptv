// Agente de IA do suporte — gera respostas usando a base de conhecimento
// (dispositivos/tutoriais do PDF + links padrão), o cadastro do cliente
// (identificado pelo WhatsApp) e o provedor configurado.

import { createAdminClient } from '@/lib/supabase/server';
import { getSetting } from '@/lib/settings';
import { diasAte, fmtData } from '@/lib/utils';
import type { AgenteIAConfig, Cliente, LinksPadrao } from '@/types';

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
// É aqui que garantimos que o agente identifique o cliente, pergunte o problema, use os apps do
// cadastro, atualize o aparelho e transfira para um humano quando necessário.
const INSTRUCOES_NUCLEO = `Você é o atendente virtual de suporte de um serviço de IPTV, atendendo pelo WhatsApp.

COMO ATENDER:
1. Comece descobrindo o problema: cumprimente pelo nome (quando souber) e pergunte, de forma objetiva, o que está acontecendo. Não despeje tutoriais antes de entender a dúvida.
2. Baseie-se no cadastro do cliente (bloco "DADOS DO CLIENTE"): use o dispositivo e o(s) app(s) que ELE já usa para direcionar a ajuda. Não peça informações que já estão no cadastro.
3. Para orientar instalação/configuração, use SEMPRE a BASE DE CONHECIMENTO (apps por dispositivo e passo a passo). Nunca invente passos, links, códigos ou nomes de apps que não estejam na base.
4. Se o cliente disser que TROCOU de aparelho ou vai passar a usar outro aplicativo, use a ferramenta "atualizar_aparelho_cliente" para atualizar o cadastro dele com o novo dispositivo/app (use exatamente os nomes que aparecem na base de conhecimento) e então oriente a instalação nesse novo app.
5. NUNCA revele usuário e senha do cliente. Se ele não lembrar os dados de acesso, transfira para um humano.
6. Transfira para um atendente humano (ferramenta "transferir_para_humano") quando: não conseguir resolver, o cliente pedir para falar com alguém, ou o assunto for financeiro/pagamento/renovação/cancelamento/troca de plano — esses assuntos NÃO são resolvidos por você.

ESTILO: mensagens curtas e calorosas, como um humano no WhatsApp. Português do Brasil. Não use markdown pesado; no máximo 1–2 emojis por mensagem.`;

function contextoCliente(cliente: Cliente | null): string {
  if (!cliente) {
    return 'Este número de WhatsApp NÃO está vinculado a nenhum cliente cadastrado. Pode ser um contato novo ou um cliente usando outro número. Pergunte o nome dele e como pode ajudar. Não forneça dados de acesso e não invente cadastro. Se ele disser que é cliente, ofereça transferir para um humano confirmar.';
  }
  const apps = [cliente.aplicativo, ...(cliente.telas_apps ?? [])].filter(Boolean) as string[];
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
    `Dispositivo cadastrado: ${cliente.dispositivo || 'não informado'}`,
    `App(s) que o cliente usa: ${apps.length ? apps.join(', ') : 'não informado'}`,
  ].filter(Boolean).join('\n');
}

export type MensagemIA = { role: 'user' | 'assistant'; content: string };

export type ResultadoIA = {
  resposta: string | null;
  escalar: { motivo: string } | null;
  atualizouAparelho: { dispositivo: string; aplicativo: string } | null;
};

const VAZIO: ResultadoIA = { resposta: null, escalar: null, atualizouAparelho: null };

export async function gerarRespostaIA(
  historico: MensagemIA[],
  cliente: Cliente | null
): Promise<ResultadoIA> {
  const cfg = await getSetting<AgenteIAConfig>('agente_ia');
  if (!cfg?.habilitado || !cfg.api_key) return VAZIO;

  const base = await montarBaseConhecimento();
  const system = [
    INSTRUCOES_NUCLEO,
    cfg.prompt_sistema?.trim() ? `\n=== INSTRUÇÕES ADICIONAIS DO ADMIN ===\n${cfg.prompt_sistema.trim()}` : '',
    `\n=== DADOS DO CLIENTE (deste WhatsApp) ===\n${contextoCliente(cliente)}`,
    `\n=== BASE DE CONHECIMENTO ===\n${base}`,
  ].join('\n');

  // Garante alternância válida e limita o histórico
  const msgs = historico.slice(-12).filter((m) => m.content?.trim());
  if (msgs.length === 0) return VAZIO;

  if (cfg.provider === 'openai') {
    // OpenAI recebe todo o contexto do cliente, mas sem ferramentas (transferência/atualização
    // automáticas só no provedor Anthropic, que é o padrão).
    const texto = await responderOpenAI(cfg, system, msgs);
    return { resposta: texto, escalar: null, atualizouAparelho: null };
  }

  return responderAnthropic(cfg, system, msgs, cliente);
}

async function responderOpenAI(cfg: AgenteIAConfig, system: string, msgs: MensagemIA[]): Promise<string | null> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.api_key}`,
    },
    body: JSON.stringify({
      model: cfg.model || 'gpt-4o-mini',
      max_tokens: 800,
      messages: [{ role: 'system', content: system }, ...msgs],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI respondeu ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? null;
}

type BlocoAnthropic =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: any }
  | { type: string; [k: string]: any };

async function responderAnthropic(
  cfg: AgenteIAConfig,
  system: string,
  msgs: MensagemIA[],
  cliente: Cliente | null
): Promise<ResultadoIA> {
  const tools: any[] = [
    {
      name: 'transferir_para_humano',
      description:
        'Transfere o atendimento para um atendente humano. Use quando não conseguir resolver, quando o cliente pedir para falar com alguém, ou quando o assunto for financeiro/pagamento/renovação/cancelamento/troca de plano.',
      input_schema: {
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
  ];
  // Só oferece a atualização de cadastro se o cliente estiver identificado.
  if (cliente) {
    tools.push({
      name: 'atualizar_aparelho_cliente',
      description:
        'Atualiza o dispositivo e o aplicativo principal do cliente no cadastro. Use quando o cliente informar que trocou de aparelho ou passou a usar outro app. Use exatamente os nomes que aparecem na base de conhecimento.',
      input_schema: {
        type: 'object',
        properties: {
          dispositivo: { type: 'string', description: 'Nome do novo dispositivo (ex.: "TV Smart LG", "Fire Stick / Fire TV", "Celular Android").' },
          aplicativo: { type: 'string', description: 'Nome do app principal que ele passará a usar nesse dispositivo.' },
        },
        required: ['dispositivo', 'aplicativo'],
      },
    });
  }

  const messages: any[] = msgs.map((m) => ({ role: m.role, content: m.content }));
  let escalar: ResultadoIA['escalar'] = null;
  let atualizou: ResultadoIA['atualizouAparelho'] = null;

  // Loop agêntico: executa ferramentas e realimenta o resultado até o modelo produzir a resposta final.
  for (let i = 0; i < 5; i++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': cfg.api_key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: cfg.model || 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        system,
        tools,
        messages,
      }),
    });
    if (!res.ok) throw new Error(`Anthropic respondeu ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const content: BlocoAnthropic[] = Array.isArray(data.content) ? data.content : [];

    const textos = content.filter((b) => b.type === 'text').map((b: any) => b.text as string);
    const toolUses = content.filter((b) => b.type === 'tool_use') as Array<{ id: string; name: string; input: any }>;

    if (toolUses.length === 0) {
      const resposta = textos.join('\n').trim();
      return { resposta: resposta || null, escalar, atualizouAparelho: atualizou };
    }

    // Precisa devolver a mensagem do assistente (com os tool_use) antes dos tool_result
    messages.push({ role: 'assistant', content });

    const toolResults: any[] = [];
    for (const tu of toolUses) {
      if (tu.name === 'transferir_para_humano') {
        escalar = { motivo: String(tu.input?.motivo ?? '').trim() || 'Cliente precisa de atendimento humano.' };
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: 'Transferência registrada. Diga ao cliente, de forma acolhedora e breve, que um atendente humano vai continuar o atendimento em instantes.',
        });
      } else if (tu.name === 'atualizar_aparelho_cliente' && cliente) {
        const dispositivo = String(tu.input?.dispositivo ?? '').trim();
        const aplicativo = String(tu.input?.aplicativo ?? '').trim();
        if (dispositivo && aplicativo) {
          const admin = createAdminClient();
          const { error } = await admin
            .from('clientes')
            .update({ dispositivo, aplicativo })
            .eq('id', cliente.id);
          if (error) {
            toolResults.push({ type: 'tool_result', tool_use_id: tu.id, is_error: true, content: `Não foi possível atualizar o cadastro: ${error.message}` });
          } else {
            atualizou = { dispositivo, aplicativo };
            toolResults.push({
              type: 'tool_result',
              tool_use_id: tu.id,
              content: `Cadastro atualizado: dispositivo "${dispositivo}", app principal "${aplicativo}". Agora oriente a instalação nesse app usando a base de conhecimento.`,
            });
          }
        } else {
          toolResults.push({ type: 'tool_result', tool_use_id: tu.id, is_error: true, content: 'Informe o dispositivo e o aplicativo para atualizar.' });
        }
      } else {
        toolResults.push({ type: 'tool_result', tool_use_id: tu.id, is_error: true, content: 'Ferramenta indisponível.' });
      }
    }
    messages.push({ role: 'user', content: toolResults });
  }

  // Se esgotou o loop sem resposta final, ao menos preserva ações executadas.
  return { resposta: null, escalar, atualizouAparelho: atualizou };
}
