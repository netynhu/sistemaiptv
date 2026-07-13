// Avisos para o grupo de administradores no WhatsApp (Configurações > Avisos).
// Só roda no servidor — depende do token da instância Uazapi (secreto).

import { getSetting } from '@/lib/settings';
import { sendGroupText } from '@/lib/uazapi';
import { fmtMoeda, nomeComUsuario } from '@/lib/utils';
import type { AvisosConfig, Cobranca, UazapiConfig } from '@/types';

// Envia um aviso ao grupo de administradores, se configurado. Nunca lança: um aviso que
// falha (grupo não configurado, Uazapi fora do ar) não pode derrubar o fluxo que o disparou.
export async function avisarGrupo(texto: string): Promise<boolean> {
  try {
    const [avisos, uazapi] = await Promise.all([
      getSetting<AvisosConfig>('avisos'),
      getSetting<UazapiConfig>('uazapi'),
    ]);
    if (!avisos?.grupo_whatsapp_id || !uazapi?.server_url || !uazapi.instance_token) {
      return false;
    }
    await sendGroupText(uazapi, avisos.grupo_whatsapp_id, texto);
    return true;
  } catch (e) {
    console.error('Falha ao enviar aviso ao grupo de administradores:', e);
    return false;
  }
}

// Monta a mensagem de "pagamento recebido" — usada tanto pela baixa automática de gateway
// quanto pelo registro manual em Financeiro > Receitas.
export function montarAvisoPagamento(cobranca: Cobranca): string {
  const nome =
    cobranca.tipo === 'cliente'
      ? nomeComUsuario(cobranca.clientes?.nome, cobranca.clientes?.usuario)
      : cobranca.revendedores?.nome ?? '—';
  return [
    '✅ *Pagamento recebido*',
    `${cobranca.tipo === 'cliente' ? 'Cliente' : 'Revendedor'}: ${nome}`,
    `Valor: ${fmtMoeda(Number(cobranca.valor))}`,
    cobranca.forma_pagamento && `Forma: ${cobranca.forma_pagamento}`,
  ]
    .filter(Boolean)
    .join('\n');
}
