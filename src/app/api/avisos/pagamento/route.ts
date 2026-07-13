import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { avisarGrupo, montarAvisoPagamento } from '@/lib/avisos';
import type { Cobranca } from '@/types';

// Avisa o grupo de administradores que um pagamento foi registrado manualmente
// (Financeiro > Receitas > Receber). Os pagamentos confirmados pelo Mercado Pago já
// avisam sozinhos na baixa automática.
export async function POST(req: NextRequest) {
  try {
    // Somente administradores logados
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const { cobranca_id } = await req.json();
    if (!cobranca_id) return NextResponse.json({ error: 'cobranca_id obrigatório' }, { status: 400 });

    const admin = createAdminClient();
    const { data: cobranca } = await admin
      .from('cobrancas')
      .select('*, clientes(nome, usuario), revendedores(nome)')
      .eq('id', cobranca_id)
      .single<Cobranca>();
    if (!cobranca) return NextResponse.json({ error: 'Cobrança não encontrada' }, { status: 404 });

    const enviado = await avisarGrupo(montarAvisoPagamento(cobranca));
    return NextResponse.json({ ok: true, enviado });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Erro interno' }, { status: 500 });
  }
}
