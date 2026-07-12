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

// Define o proxy da instância (usado para escolher a cidade do IP)
export async function setProxy(cfg: UazapiConfig) {
  // Provedores de proxy costumam aceitar a cidade no usuário (ex.: user-city-{cidade}).
  const username = (cfg.proxy_usuario || '')
    .split('{cidade}')
    .join((cfg.proxy_cidade || '').toLowerCase().replace(/\s+/g, ''));
  const body = {
    host: cfg.proxy_host,
    port: cfg.proxy_porta,
    username,
    password: cfg.proxy_senha,
  };
  // O caminho pode variar conforme a versão do servidor Uazapi — tenta os conhecidos.
  const paths = ['/instance/updateProxy', '/instance/proxy', '/proxy/set'];
  let lastErr: unknown;
  for (const p of paths) {
    try {
      return await uaz(cfg, p, { auth: 'instance', body });
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Não foi possível definir o proxy.');
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

// Envia mensagem de texto com um botão de "copiar código PIX" (endpoint /send/pix-button
// da Uazapi). A documentação pública dessa rota é limitada, então isso tenta o formato mais
// comum e, se falhar por qualquer motivo, cai para uma mensagem de texto simples — a cobrança
// nunca deixa de ser enviada por causa disso.
export async function sendPixButton(
  cfg: UazapiConfig,
  number: string,
  text: string,
  pixCode: string,
  pixButtonText = 'Copiar código PIX'
) {
  try {
    return await uaz(cfg, '/send/pix-button', {
      auth: 'instance',
      body: { number, text, pixKey: pixCode, key: pixCode, buttonText: pixButtonText },
    });
  } catch {
    // Endpoint indisponível/formato diferente no seu servidor — garante que a mensagem chegue.
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
