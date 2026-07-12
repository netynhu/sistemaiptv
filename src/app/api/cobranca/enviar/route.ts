import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getSetting } from '@/lib/settings';
import { enviarCobrancaWhatsApp, type MensagensConfig } from '@/lib/cobranca';
import type { Cobranca, PagamentosConfig, UazapiConfig } from '@/types';

export async function POST(req: NextRequest) {
  try {
    // Somente administradores logados
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const { cobranca_id } = await req.json();
    if (!cobranca_id) return NextResponse.json({ error: 'cobranca_id obrigatório' }, { status: 400 });

    const admin = createAdminClient();
    const { data: cobranca, error } = await admin
      .from('cobrancas')
      .select('*, clientes(*), revendedores(*)')
      .eq('id', cobranca_id)
      .single();
    if (error || !cobranca) return NextResponse.json({ error: 'Cobrança não encontrada' }, { status: 404 });

    const [uazapi, mensagens, pagamentos] = await Promise.all([
      getSetting<UazapiConfig>('uazapi'),
      getSetting<MensagensConfig>('mensagens'),
      getSetting<PagamentosConfig>('pagamentos'),
    ]);
    if (!uazapi?.server_url || !uazapi?.instance_token) {
      return NextResponse.json(
        { error: 'Uazapi não configurada. Acesse Configurações > WhatsApp.' },
        { status: 400 }
      );
    }

    const resultado = await enviarCobrancaWhatsApp(cobranca as Cobranca, uazapi, mensagens, pagamentos);
    if (!resultado.ok) return NextResponse.json({ error: resultado.erro }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Erro interno' }, { status: 500 });
  }
}
