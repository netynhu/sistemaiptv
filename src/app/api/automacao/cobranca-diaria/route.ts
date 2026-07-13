import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getSetting } from '@/lib/settings';
import { enviarCobrancaWhatsApp, type MensagensConfig } from '@/lib/cobranca';
import { hojeISO } from '@/lib/utils';
import type { Cobranca, PagamentosConfig, UazapiConfig } from '@/types';

// Rotina diária chamada por um cron externo (ex.: n8n) — não depende de sessão de admin,
// só do segredo compartilhado. Faz 2 coisas:
//  1. Envia a cobrança de quem vence hoje.
//  2. Envia o followup de atraso de quem venceu ontem e ainda não pagou.
// Os avisos ao grupo de administradores (novo cliente, pagamento recebido, atendimento humano)
// são enviados na hora do acontecimento, não mais em um resumo diário.
// Aceita POST e GET — cron externo (n8n, cron-job.org etc.) pode chamar com qualquer um dos dois.
export async function POST(req: NextRequest) {
  return executar(req);
}

export async function GET(req: NextRequest) {
  return executar(req);
}

async function executar(req: NextRequest) {
  const segredo = process.env.AUTOMACAO_SECRET;
  const enviado = req.headers.get('x-automacao-secret') || req.nextUrl.searchParams.get('secret');
  if (!segredo || enviado !== segredo) {
    return NextResponse.json({ error: 'Segredo inválido ou AUTOMACAO_SECRET não configurado no servidor.' }, { status: 401 });
  }

  const admin = createAdminClient();
  const hoje = hojeISO();
  const ontem = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  const resultado = {
    cobrancasEnviadas: 0,
    falhasEnvio: [] as string[],
  };

  try {
    const [uazapi, mensagens, pagamentos] = await Promise.all([
      getSetting<UazapiConfig>('uazapi'),
      getSetting<MensagensConfig>('mensagens'),
      getSetting<PagamentosConfig>('pagamentos'),
    ]);

    // ---- 1 + 2: cobranças de quem vence hoje e followup de quem venceu ontem ----
    if (uazapi?.server_url && uazapi?.instance_token) {
      const { data: pendentes } = await admin
        .from('cobrancas')
        .select('*, clientes(*, planos(*), revendedores(*))')
        .eq('tipo', 'cliente')
        .eq('status', 'pendente')
        .gte('vencimento', ontem)
        .lte('vencimento', hoje);

      for (const cobranca of (pendentes as Cobranca[]) ?? []) {
        // Já avisado hoje? não manda de novo (evita duplicar se o cron rodar 2x no mesmo dia)
        const jaAvisadoHoje = cobranca.whatsapp_enviado_em?.slice(0, 10) === hoje;
        if (jaAvisadoHoje) continue;

        const r = await enviarCobrancaWhatsApp(cobranca, uazapi, mensagens, pagamentos);
        if (r.ok) {
          resultado.cobrancasEnviadas++;
        } else {
          resultado.falhasEnvio.push(`${cobranca.clientes?.nome ?? cobranca.id}: ${r.erro}`);
        }
      }
    }

    return NextResponse.json({ ok: true, ...resultado });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? 'Erro interno', ...resultado }, { status: 500 });
  }
}
