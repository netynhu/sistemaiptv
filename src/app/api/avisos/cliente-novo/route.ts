import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { avisarGrupo } from '@/lib/avisos';
import { fmtData, fmtMoeda, fmtTelefone } from '@/lib/utils';
import type { Cliente } from '@/types';

// Avisa o grupo de administradores que um novo cliente foi cadastrado.
// Chamado pela tela Clientes logo após inserir o cliente.
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
      .select('*, planos(nome), revendedores(nome)')
      .eq('id', cliente_id)
      .single<Cliente>();
    if (!cliente) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });

    const linhas = [
      '🆕 *Novo cliente cadastrado*',
      `Nome: ${cliente.nome}`,
      cliente.telefone && `WhatsApp: ${fmtTelefone(cliente.telefone)}`,
      cliente.planos?.nome && `Plano: ${cliente.planos.nome}`,
      `Valor: ${fmtMoeda(cliente.valor)}`,
      cliente.data_vencimento && `Vencimento: ${fmtData(cliente.data_vencimento)}`,
      cliente.revendedores?.nome && `Indicado por: ${cliente.revendedores.nome}`,
    ].filter(Boolean);

    const enviado = await avisarGrupo(linhas.join('\n'));
    return NextResponse.json({ ok: true, enviado });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Erro interno' }, { status: 500 });
  }
}
