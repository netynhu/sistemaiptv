// Sincroniza, em Financeiro > Despesas, a linha de custo do Assist Plus de um cliente.
// Cada tela que usa Assist Plus custa `custo_assist_plus` (Configurações > telas). As demais
// telas são apenas informativas e não viram despesa.
//
// A tela de Clientes tem a sua própria versão desta lógica (client-side). Este helper é a
// versão de servidor, usada quando o agente de IA altera o app do cliente.

import { createAdminClient } from '@/lib/supabase/server';
import { getSetting } from '@/lib/settings';
import { hojeISO } from '@/lib/utils';

const APP_ASSIST_PLUS = 'Assist Plus';

export async function sincronizarDespesaAssistPlus(clienteId: string): Promise<void> {
  const admin = createAdminClient();

  const { data: cliente } = await admin
    .from('clientes')
    .select('nome, aplicativo, telas_apps')
    .eq('id', clienteId)
    .single();
  if (!cliente) return;

  const telasCfg = await getSetting<{ custo_por_tela?: number | string; custo_assist_plus?: number | string }>('telas_config');
  const custoAssistPlus = Number(telasCfg?.custo_assist_plus ?? telasCfg?.custo_por_tela ?? 1.5) || 1.5;

  // O app principal já conta como a 1ª tela
  const todas = [cliente.aplicativo, ...((cliente.telas_apps as string[]) ?? [])].filter(Boolean);
  const qtd = todas.filter((a) => a === APP_ASSIST_PLUS).length;

  const { data: existente } = await admin
    .from('despesas')
    .select('id')
    .eq('cliente_id', clienteId)
    .eq('categoria', 'Assist Plus')
    .maybeSingle();

  if (qtd > 0) {
    const valor = Math.round(qtd * custoAssistPlus * 100) / 100;
    const descricao = `Assist Plus — ${cliente.nome} (${qtd} tela${qtd > 1 ? 's' : ''})`;
    if (existente) {
      await admin.from('despesas').update({ descricao, valor }).eq('id', existente.id);
    } else {
      await admin.from('despesas').insert({
        descricao, categoria: 'Assist Plus', valor, data: hojeISO(), recorrente: true, cliente_id: clienteId,
      });
    }
  } else if (existente) {
    await admin.from('despesas').delete().eq('id', existente.id);
  }
}
