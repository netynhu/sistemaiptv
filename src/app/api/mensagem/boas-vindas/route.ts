import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getSetting } from '@/lib/settings';
import { type MensagensConfig } from '@/lib/cobranca';
import { sendText } from '@/lib/uazapi';
import { aplicarTemplate, fmtData, fmtMoeda } from '@/lib/utils';
import type { Cliente, UazapiConfig } from '@/types';

// Mensagem de boas-vindas enviada ao WhatsApp do próprio cliente logo após o cadastro
// (Configurações > Mensagens > "Mensagem de boas-vindas"). Serve para o cliente já salvar
// este número como o canal de suporte.
const TEMPLATE_BOAS_VINDAS_PADRAO =
  'Olá {nome}! Seja bem-vindo(a)! 🎉📺 Seu acesso já está ativo.\n\n' +
  '☎️ Guarde este número: é o nosso *suporte*. Sempre que precisar de qualquer coisa, é só chamar aqui! 😊';

export async function POST(req: NextRequest) {
  try {
    // Somente administradores logados
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const { cliente_id } = await req.json();
    if (!cliente_id) return NextResponse.json({ error: 'cliente_id obrigatório' }, { status: 400 });

    const admin = createAdminClient();
    const { data: cliente } = await admin
      .from('clientes')
      .select('*, planos(nome)')
      .eq('id', cliente_id)
      .single<Cliente>();
    if (!cliente) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });
    if (!cliente.telefone) {
      return NextResponse.json({ ok: true, enviado: false, motivo: 'Cliente sem WhatsApp cadastrado.' });
    }

    const [uazapi, mensagens] = await Promise.all([
      getSetting<UazapiConfig>('uazapi'),
      getSetting<MensagensConfig>('mensagens'),
    ]);
    if (!uazapi?.server_url || !uazapi.instance_token) {
      return NextResponse.json({ ok: true, enviado: false, motivo: 'Uazapi não configurada.' });
    }

    const texto = aplicarTemplate(mensagens?.boas_vindas || TEMPLATE_BOAS_VINDAS_PADRAO, {
      nome: cliente.nome ?? '',
      valor: fmtMoeda(Number(cliente.valor)),
      vencimento: fmtData(cliente.data_vencimento),
      descricao: cliente.planos?.nome ?? '',
    });

    await sendText(uazapi, cliente.telefone, texto);
    return NextResponse.json({ ok: true, enviado: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Erro interno' }, { status: 500 });
  }
}
