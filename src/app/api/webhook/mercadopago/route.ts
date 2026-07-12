import { NextRequest, NextResponse } from 'next/server';
import { getSetting } from '@/lib/settings';
import { buscarPagamento } from '@/lib/mercadopago';
import { darBaixaAutomatica } from '@/lib/pagamento';
import type { PagamentosConfig } from '@/types';

// Webhook de notificações do Mercado Pago. Configure em Configurações > Pagamentos >
// Mercado Pago: cole a URL deste endpoint no painel do Mercado Pago.
//
// Em vez de confiar no corpo da notificação (formato de assinatura pode variar entre contas),
// este endpoint busca o pagamento direto na API do Mercado Pago usando o token salvo — só um
// token válido nosso consegue confirmar o status real, o que já garante a autenticidade.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const tipo = body?.type || req.nextUrl.searchParams.get('type');
    const paymentId = body?.data?.id || req.nextUrl.searchParams.get('data.id') || req.nextUrl.searchParams.get('id');

    if (tipo && tipo !== 'payment') return NextResponse.json({ ok: true, ignorado: true });
    if (!paymentId) return NextResponse.json({ ok: true, ignorado: true });

    const pagamentos = await getSetting<PagamentosConfig>('pagamentos');
    if (!pagamentos?.mercadopago_token) {
      return NextResponse.json({ error: 'Mercado Pago não configurado.' }, { status: 400 });
    }

    const pagamento = await buscarPagamento(pagamentos, String(paymentId));
    if (!pagamento || pagamento.status !== 'approved') {
      return NextResponse.json({ ok: true, ignorado: true, status: pagamento?.status ?? 'não encontrado' });
    }

    const resultado = await darBaixaAutomatica('mercadopago', String(pagamento.id), 'Mercado Pago');
    return NextResponse.json({ ok: true, resultado });
  } catch (e: any) {
    console.error('Erro no webhook Mercado Pago:', e);
    return NextResponse.json({ error: e.message ?? 'Erro interno' }, { status: 500 });
  }
}
