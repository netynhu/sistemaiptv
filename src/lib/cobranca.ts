// Lógica compartilhada de envio de cobrança por WhatsApp — usada tanto pelo botão manual
// "Cobrar" (Financeiro > Receitas) quanto pela automação diária (n8n).

import { createAdminClient } from '@/lib/supabase/server';
import { sendPixButton, sendText } from '@/lib/uazapi';
import { aplicarTemplate, diasAte, fmtData, fmtMoeda } from '@/lib/utils';
import type { Cobranca, PagamentosConfig, UazapiConfig } from '@/types';

export type MensagensConfig = {
  cobranca: string;
  atraso: string;
  boas_vindas: string;
  cobranca_botao?: boolean;
  atraso_botao?: boolean;
  texto_botao_pix?: string;
};

const TEMPLATE_COBRANCA_PADRAO =
  'Olá {nome}! 👋 Sua assinatura vence em {vencimento}. Valor: {valor}. PIX: {pix}';
const TEMPLATE_ATRASO_PADRAO =
  'Olá {nome}! ⚠️ Sua assinatura venceu em {vencimento} e ainda não identificamos o pagamento. Valor: {valor}. PIX: {pix}';

export async function enviarCobrancaWhatsApp(
  cobranca: Cobranca,
  uazapi: UazapiConfig,
  mensagens: MensagensConfig | null,
  pagamentos: PagamentosConfig | null
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const destinatario = cobranca.tipo === 'cliente' ? cobranca.clientes : cobranca.revendedores;
  const telefone = destinatario?.telefone;
  if (!destinatario || !telefone) {
    return { ok: false, erro: 'Destinatário sem WhatsApp cadastrado.' };
  }

  const dias = diasAte(cobranca.vencimento);
  const atrasada = dias !== null && dias < 0;
  const template = atrasada
    ? mensagens?.atraso || TEMPLATE_ATRASO_PADRAO
    : mensagens?.cobranca || TEMPLATE_COBRANCA_PADRAO;

  // Se já existe uma cobrança PIX real gerada (Mercado Pago), usa o código dela;
  // senão cai para a chave PIX estática configurada.
  const pixCode = cobranca.pix_copia_cola || pagamentos?.chave_pix || '';
  const usarBotao = atrasada ? (mensagens?.atraso_botao ?? true) : (mensagens?.cobranca_botao ?? true);

  const texto = aplicarTemplate(template, {
    nome: destinatario.nome ?? '',
    valor: fmtMoeda(Number(cobranca.valor)),
    vencimento: fmtData(cobranca.vencimento),
    descricao: cobranca.descricao ?? '',
    pix: pixCode || '(chave PIX não configurada)',
  });

  if (pixCode && usarBotao) {
    await sendPixButton(uazapi, telefone, texto, pixCode, mensagens?.texto_botao_pix || undefined);
  } else {
    await sendText(uazapi, telefone, texto);
  }

  const admin = createAdminClient();
  await admin
    .from('cobrancas')
    .update({ whatsapp_enviado_em: new Date().toISOString() })
    .eq('id', cobranca.id);

  return { ok: true };
}
