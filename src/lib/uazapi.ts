// Cliente da API Uazapi (https://uazapi.com) — usado apenas no servidor.
// Todos os métodos recebem a configuração salva em Configurações > WhatsApp.

import type { UazapiConfig } from '@/types';

type UazHeaders = Record<string, string>;

async function uaz(
  cfg: UazapiConfig,
  path: string,
  opts: { method?: string; body?: unknown; auth: 'admin' | 'instance' }
) {
  const base = (cfg.server_url || '').replace(/\/+$/, '');
  if (!base) throw new Error('URL do servidor Uazapi não configurada.');

  const headers: UazHeaders = { 'Content-Type': 'application/json' };
  if (opts.auth === 'admin') {
    if (!cfg.admin_token) throw new Error('Admin token da Uazapi não configurado.');
    headers['admintoken'] = cfg.admin_token;
  } else {
    if (!cfg.instance_token) throw new Error('Token da instância Uazapi não configurado. Crie a instância primeiro.');
    headers['token'] = cfg.instance_token;
  }

  const res = await fetch(`${base}${path}`, {
    method: opts.method ?? 'POST',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: 'no-store',
  });

  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = data?.error || data?.message || `Uazapi respondeu ${res.status}`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return data;
}

// Cria uma nova instância no servidor (requer admin token) → retorna token da instância
export async function initInstance(cfg: UazapiConfig) {
  return uaz(cfg, '/instance/init', {
    auth: 'admin',
    body: { name: cfg.instance_name || 'sistema' },
  });
}

// Inicia a conexão e retorna o QR Code (base64)
export async function connectInstance(cfg: UazapiConfig) {
  return uaz(cfg, '/instance/connect', { auth: 'instance', body: {} });
}

// Status atual da instância (connected / connecting / disconnected) + QR code se houver
export async function instanceStatus(cfg: UazapiConfig) {
  return uaz(cfg, '/instance/status', { auth: 'instance', method: 'GET' });
}

export async function disconnectInstance(cfg: UazapiConfig) {
  return uaz(cfg, '/instance/disconnect', { auth: 'instance', body: {} });
}

// Configura o webhook de mensagens recebidas
export async function setWebhook(cfg: UazapiConfig, url: string) {
  return uaz(cfg, '/webhook', {
    auth: 'instance',
    body: { enabled: true, url, events: ['messages'], excludeMessages: ['wasSentByApi'] },
  });
}

// Envia mensagem de texto para um número (formato 55DDDNÚMERO)
export async function sendText(cfg: UazapiConfig, number: string, text: string) {
  return uaz(cfg, '/send/text', { auth: 'instance', body: { number, text } });
}

// Envia mensagem de texto com um botão nativo de "copiar código" via /send/menu (type:
// "button"), usando o formato "texto|copy:codigo" documentado pela Uazapi. Não usamos o
// endpoint /send/pix-button porque ele serve para uma chave PIX estática do recebedor
// (CPF/CNPJ/telefone/email/EVP) — aqui o código pode ser um "copia e cola" dinâmico gerado
// pelo Asaas/Mercado Pago, que não é uma chave PIX válida.
export async function sendPixButton(
  cfg: UazapiConfig,
  number: string,
  text: string,
  pixCode: string,
  pixButtonText = 'Copiar código PIX'
) {
  try {
    return await uaz(cfg, '/send/menu', {
      auth: 'instance',
      body: { number, type: 'button', text, choices: [`${pixButtonText}|copy:${pixCode}`] },
    });
  } catch (err) {
    // Garante que a cobrança chegue mesmo se o botão falhar, mas registra o erro para diagnóstico.
    console.error('Falha ao enviar botão de copiar PIX via Uazapi, caindo para texto simples:', err);
    return sendText(cfg, number, text);
  }
}

// Envia mensagem de texto para um grupo (o id de grupo termina em @g.us)
export async function sendGroupText(cfg: UazapiConfig, groupId: string, text: string) {
  return uaz(cfg, '/send/text', { auth: 'instance', body: { number: groupId, text } });
}

// Extrai o QR code de respostas com formatos diferentes entre versões
export function extrairQr(data: any): string | null {
  const qr = data?.instance?.qrcode || data?.qrcode || data?.qr || null;
  if (!qr || typeof qr !== 'string') return null;
  return qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`;
}

export function extrairStatus(data: any): string {
  return data?.instance?.status || data?.status || 'desconhecido';
}
