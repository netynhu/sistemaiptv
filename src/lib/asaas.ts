// Cliente da API do Asaas (https://docs.asaas.com) — usado apenas no servidor.
// Aponta para produção (api.asaas.com); para testar em sandbox, troque BASE_URL
// por https://api-sandbox.asaas.com/v3.

import { normalizarTelefone } from '@/lib/utils';
import type { PagamentosConfig } from '@/types';

const BASE_URL = 'https://api.asaas.com/v3';

async function asaas(cfg: PagamentosConfig, path: string, opts: { method?: string; body?: unknown }) {
  if (!cfg.asaas_token) throw new Error('Token do Asaas não configurado (Configurações > Pagamentos).');
  const res = await fetch(`${BASE_URL}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      access_token: cfg.asaas_token,
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.errors?.[0]?.description || data?.message || `Asaas respondeu ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

async function buscarOuCriarCliente(cfg: PagamentosConfig, clienteId: string, nome: string, telefone: string | null) {
  const busca = await asaas(cfg, `/customers?externalReference=${encodeURIComponent(clienteId)}`, {});
  if (busca?.data?.length > 0) return busca.data[0].id as string;

  const criado = await asaas(cfg, '/customers', {
    method: 'POST',
    body: {
      name: nome,
      mobilePhone: telefone ? normalizarTelefone(telefone) : undefined,
      externalReference: clienteId,
    },
  });
  return criado.id as string;
}

export type DadosCobrancaPix = {
  cobrancaId: string;
  clienteId: string;
  nome: string;
  telefone: string | null;
  valor: number;
  vencimento: string; // YYYY-MM-DD
  descricao: string;
};

// Cria (ou reaproveita) o cliente no Asaas, gera uma cobrança PIX e retorna o código copia-e-cola.
export async function criarCobrancaPix(cfg: PagamentosConfig, dados: DadosCobrancaPix) {
  const customerId = await buscarOuCriarCliente(cfg, dados.clienteId, dados.nome, dados.telefone);

  const pagamento = await asaas(cfg, '/payments', {
    method: 'POST',
    body: {
      customer: customerId,
      billingType: 'PIX',
      value: dados.valor,
      dueDate: dados.vencimento,
      description: dados.descricao,
      externalReference: dados.cobrancaId,
    },
  });

  const qr = await asaas(cfg, `/payments/${pagamento.id}/pixQrCode`, {});

  return {
    externoId: String(pagamento.id),
    pixCopiaCola: (qr?.payload as string) ?? '',
    qrCodeBase64: (qr?.encodedImage as string) ?? null,
  };
}
