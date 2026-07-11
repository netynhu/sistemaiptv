import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getSetting } from '@/lib/settings';
import { sendText } from '@/lib/uazapi';
import type { UazapiConfig } from '@/types';

// Envia mensagem manual (atendente humano) em uma conversa do suporte
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const { conversa_id, texto } = await req.json();
    if (!conversa_id || !texto?.trim()) {
      return NextResponse.json({ error: 'conversa_id e texto são obrigatórios' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: conversa } = await admin
      .from('conversas')
      .select('*')
      .eq('id', conversa_id)
      .single();
    if (!conversa) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 });

    const uazapi = await getSetting<UazapiConfig>('uazapi');
    if (!uazapi?.server_url || !uazapi.instance_token) {
      return NextResponse.json(
        { error: 'Uazapi não configurada. Acesse Configurações > WhatsApp.' },
        { status: 400 }
      );
    }

    await sendText(uazapi, conversa.telefone, texto.trim());

    await admin.from('mensagens').insert({
      conversa_id,
      direcao: 'saida',
      autor: 'humano',
      conteudo: texto.trim(),
    });
    await admin
      .from('conversas')
      .update({ ultima_mensagem: texto.trim().slice(0, 200), atualizado_em: new Date().toISOString() })
      .eq('id', conversa_id);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Erro interno' }, { status: 500 });
  }
}
