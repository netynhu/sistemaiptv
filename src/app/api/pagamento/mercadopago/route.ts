import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getSetting } from '@/lib/settings';
import { criarCobrancaPix } from '@/lib/mercadopago';
import type { Cobranca, PagamentosConfig } from '@/types';

// Gera uma cobrança PIX real no Mercado Pago a partir de uma cobrança já existente no sistema
// (Financeiro > Receitas > "Gerar cobrança Mercado Pago").
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const { cobranca_id } = await req.json();
    if (!cobranca_id) return NextResponse.json({ error: 'cobranca_id obrigatório' }, { status: 400 });

    const admin = createAdminClient();
    const { data: cobrancaRaw, error } = await admin
      .from('cobrancas')
      .select('*, clientes(*), revendedores(*)')
      .eq('id', cobranca_id)
      .single();
    if (error || !cobrancaRaw) return NextResponse.json({ error: 'Cobrança não encontrada' }, { status: 404 });

    const cobranca = cobrancaRaw as Cobranca;
    const destinatario = cobranca.tipo === 'cliente' ? cobranca.clientes : cobranca.revendedores;
    if (!destinatario) return NextResponse.json({ error: 'Destinatário não encontrado' }, { status: 400 });

    const pagamentos = await getSetting<PagamentosConfig>('pagamentos');
    if (!pagamentos?.mercadopago_token) {
      return NextResponse.json({ error: 'Access Token do Mercado Pago não configurado. Acesse Configurações > Pagamentos.' }, { status: 400 });
    }

    const resultado = await criarCobrancaPix(pagamentos, {
      cobrancaId: cobranca.id,
      nome: destinatario.nome,
      telefone: destinatario.telefone,
      valor: Number(cobranca.valor),
      descricao: cobranca.descricao || 'Assinatura',
    });

    await admin
      .from('cobrancas')
      .update({
        externo_provedor: 'mercadopago',
        externo_id: resultado.externoId,
        pix_copia_cola: resultado.pixCopiaCola,
      })
      .eq('id', cobranca.id);

    return NextResponse.json({ ok: true, pixCopiaCola: resultado.pixCopiaCola });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Erro interno' }, { status: 500 });
  }
}
