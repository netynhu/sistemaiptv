// Dá baixa automática numa cobrança quando o Mercado Pago confirma o pagamento
// via webhook. Replica os mesmos efeitos do "Registrar pagamento" manual em Financeiro > Receitas:
// marca como paga, renova o vencimento do cliente e já lança a próxima receita, e gera a comissão
// do indicador quando aplicável.

import { createAdminClient } from '@/lib/supabase/server';
import { avisarGrupo, montarAvisoPagamento } from '@/lib/avisos';
import { addMeses, hojeISO } from '@/lib/utils';
import type { Cliente, Cobranca } from '@/types';

export async function darBaixaAutomatica(
  externoProvedor: 'mercadopago',
  externoId: string,
  formaPagamento: string
): Promise<{ ok: true; cobrancaId: string; jaEstavaPaga: boolean } | { ok: false; motivo: string }> {
  const admin = createAdminClient();
  const { data: cobrancaRaw, error } = await admin
    .from('cobrancas')
    .select('*, clientes(*, planos(*), revendedores(*)), revendedores(*)')
    .eq('externo_provedor', externoProvedor)
    .eq('externo_id', externoId)
    .maybeSingle();

  if (error) return { ok: false, motivo: error.message };
  if (!cobrancaRaw) return { ok: false, motivo: 'Nenhuma cobrança local vinculada a este pagamento.' };

  const cobranca = cobrancaRaw as Cobranca;
  if (cobranca.status === 'pago') {
    return { ok: true, cobrancaId: cobranca.id, jaEstavaPaga: true }; // idempotente — webhook pode repetir
  }

  const hoje = hojeISO();
  const { error: erroUpdate } = await admin
    .from('cobrancas')
    .update({ status: 'pago', pago_em: hoje, forma_pagamento: formaPagamento })
    .eq('id', cobranca.id);
  if (erroUpdate) return { ok: false, motivo: erroUpdate.message };

  const cliente = cobranca.clientes as Cliente | null | undefined;

  if (cobranca.tipo === 'cliente' && cliente?.planos) {
    const base = cliente.data_vencimento && cliente.data_vencimento >= hoje ? cliente.data_vencimento : hoje;
    const novoVencimento = addMeses(base, cliente.planos.meses);
    await admin.from('clientes').update({ data_vencimento: novoVencimento }).eq('id', cliente.id);
    await admin.from('cobrancas').insert({
      tipo: 'cliente',
      cliente_id: cliente.id,
      descricao: `Assinatura — ${cliente.planos.nome}`,
      valor: cliente.valor,
      vencimento: novoVencimento,
    });
  }

  const indicador = cliente?.revendedores;
  if (cobranca.tipo === 'cliente' && indicador && indicador.tipo === 'indicacao' && indicador.ativo) {
    const valor =
      indicador.comissao_tipo === 'percentual'
        ? (Number(cobranca.valor) * Number(indicador.comissao_valor)) / 100
        : Number(indicador.comissao_valor);
    if (valor > 0) {
      await admin.from('comissoes').insert({
        indicador_id: indicador.id,
        cliente_id: cliente!.id,
        cobranca_id: cobranca.id,
        valor: Math.round(valor * 100) / 100,
      });
    }
  }

  // Avisa o grupo de administradores que o pagamento entrou (só na primeira baixa —
  // o webhook pode repetir, mas jaEstavaPaga acima já corta as repetições).
  await avisarGrupo(montarAvisoPagamento({ ...cobranca, forma_pagamento: formaPagamento }));

  return { ok: true, cobrancaId: cobranca.id, jaEstavaPaga: false };
}
