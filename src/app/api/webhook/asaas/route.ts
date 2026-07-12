import { NextRequest, NextResponse } from 'next/server';
import { getSetting } from '@/lib/settings';
import { darBaixaAutomatica } from '@/lib/pagamento';
import type { PagamentosConfig } from '@/types';

// Webhook de eventos do Asaas. Configure em Configurações > Pagamentos > Asaas:
// cole a URL deste endpoint no painel do Asaas e defina o mesmo "Token de autenticação".
const EVENTOS_PAGOS = ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'];

export async function POST(req: NextRequest) {
  try {
    const pagamentos = await getSetting<PagamentosConfig>('pagamentos');
    const tokenEsperado = pagamentos?.asaas_webhook_token;
    const tokenRecebido = req.headers.get('asaas-access-token');
    if (!tokenEsperado || tokenRecebido !== tokenEsperado) {
      return NextResponse.json({ error: 'Token de autenticação inválido.' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const evento = body?.event;
    const paymentId = body?.payment?.id;

    if (!EVENTOS_PAGOS.includes(evento) || !paymentId) {
      return NextResponse.json({ ok: true, ignorado: true });
    }

    const resultado = await darBaixaAutomatica('asaas', String(paymentId), 'Asaas');
    return NextResponse.json({ ok: true, resultado });
  } catch (e: any) {
    console.error('Erro no webhook Asaas:', e);
    return NextResponse.json({ error: e.message ?? 'Erro interno' }, { status: 500 });
  }
}
