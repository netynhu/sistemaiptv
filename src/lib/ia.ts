// Agente de IA do suporte — gera respostas usando a base de conhecimento
// (dispositivos/tutoriais do PDF + links padrão) e o provedor configurado.

import { createAdminClient } from '@/lib/supabase/server';
import { getSetting } from '@/lib/settings';
import type { AgenteIAConfig, LinksPadrao } from '@/types';

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

export type MensagemIA = { role: 'user' | 'assistant'; content: string };

export async function gerarRespostaIA(historico: MensagemIA[]): Promise<string | null> {
  const cfg = await getSetting<AgenteIAConfig>('agente_ia');
  if (!cfg?.habilitado || !cfg.api_key) return null;

  const base = await montarBaseConhecimento();
  const system = `${cfg.prompt_sistema}\n\n=== BASE DE CONHECIMENTO ===\n${base}`;

  // Garante alternância válida e limita o histórico
  const msgs = historico.slice(-12).filter((m) => m.content?.trim());
  if (msgs.length === 0) return null;

  if (cfg.provider === 'openai') {
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

  // Anthropic (padrão)
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
      messages: msgs,
    }),
  });
  if (!res.ok) throw new Error(`Anthropic respondeu ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const bloco = Array.isArray(data.content) ? data.content.find((b: any) => b.type === 'text') : null;
  return bloco?.text ?? null;
}
