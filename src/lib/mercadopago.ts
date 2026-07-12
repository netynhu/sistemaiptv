// Cliente da API do Mercado Pago (https://api.mercadopago.com) — usado apenas no servidor.

import { normalizarTelefone } from '@/lib/utils';
import type { PagamentosConfig } from '@/types';

export type DadosCobrancaPix = {
  cobrancaId: string;
  nome: string;
  telefone: string | null;
  valor: number;
  descricao: string;
};

// O Mercado Pago exige um e-mail do pagador para criar o pagamento. Como o sistema não
// coleta e-mail de clientes, geramos um endereço sintético a partir do telefone.
function emailSintetico(telefone: string | null): string {
  const digitos = telefone ? normalizarTelefone(telefone) : String(Date.now());
  return `cliente${digitos}@sememail.com.br`;
}

// Cria um pagamento PIX e retorna o código copia-e-cola.
export async function criarCobrancaPix(cfg: PagamentosConfig, dados: DadosCobrancaPix) {
  if (!cfg.mercadopago_token) throw new Error('Access Token do Mercado Pago não configurado (Configurações > Pagamentos).');

  const res = await fetch('https://api.mercadopago.com/v1/payments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.mercadopago_token}`,
      'X-Idempotency-Key': dados.cobrancaId,
    },
    body: JSON.stringify({
      transaction_amount: dados.valor,
      description: dados.descricao,
      payment_method_id: 'pix',
      external_reference: dados.cobrancaId,
      payer: {
        email: emailSintetico(dados.telefone),
        first_name: dados.nome,
      },
    }),
    cache: 'no-store',
  });

  const data = await res.json();
  if (!res.ok) {
    const msg = data?.message || data?.cause?.[0]?.description || `Mercado Pago respondeu ${res.status}`;
    throw new Error(msg);
  }

  const pixCopiaCola = data?.point_of_interaction?.transaction_data?.qr_code ?? '';
  const qrCodeBase64 = data?.point_of_interaction?.transaction_data?.qr_code_base64 ?? null;

  return { externoId: String(data.id), pixCopiaCola, qrCodeBase64 };
}

// Busca o pagamento direto na API (mais confiável que confiar só no corpo do webhook)
export async function buscarPagamento(cfg: PagamentosConfig, paymentId: string) {
  if (!cfg.mercadopago_token) throw new Error('Access Token do Mercado Pago não configurado.');
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${cfg.mercadopago_token}` },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return res.json();
}
