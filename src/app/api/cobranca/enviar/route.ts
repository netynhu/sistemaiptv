import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getSetting } from '@/lib/settings';
import { sendText } from '@/lib/uazapi';
import { aplicarTemplate, fmtData, fmtMoeda } from '@/lib/utils';
import type { PagamentosConfig, UazapiConfig } from '@/types';

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

    const destinatario = cobranca.tipo === 'cliente' ? cobranca.clientes : cobranca.revendedores;
    const telefone = destinatario?.telefone;
    if (!telefone) {
      return NextResponse.json(
        { error: 'O destinatário não tem WhatsApp cadastrado.' },
        { status: 400 }
      );
    }

    const [uazapi, mensagens, pagamentos] = await Promise.all([
      getSetting<UazapiConfig>('uazapi'),
      getSetting<{ cobranca: string }>('mensagens'),
      getSetting<PagamentosConfig>('pagamentos'),
    ]);
    if (!uazapi?.server_url || !uazapi?.instance_token) {
      return NextResponse.json(
        { error: 'Uazapi não configurada. Acesse Configurações > WhatsApp.' },
        { status: 400 }
      );
    }

    const template =
      mensagens?.cobranca ||
      'Olá {nome}! Sua assinatura vence em {vencimento}. Valor: {valor}. PIX: {pix}';

    const texto = aplicarTemplate(template, {
      nome: destinatario.nome ?? '',
      valor: fmtMoeda(Number(cobranca.valor)),
      vencimento: fmtData(cobranca.vencimento),
      descricao: cobranca.descricao ?? '',
      pix: pagamentos?.chave_pix || '(chave PIX não configurada)',
    });

    await sendText(uazapi, telefone, texto);

    await admin
      .from('cobrancas')
      .update({ whatsapp_enviado_em: new Date().toISOString() })
      .eq('id', cobranca_id);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Erro interno' }, { status: 500 });
  }
}
