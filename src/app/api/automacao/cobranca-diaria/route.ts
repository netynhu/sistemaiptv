import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getSetting } from '@/lib/settings';
import { enviarCobrancaWhatsApp, type MensagensConfig } from '@/lib/cobranca';
import { sendGroupText } from '@/lib/uazapi';
import { fmtMoeda, hojeISO, nomeComUsuario } from '@/lib/utils';
import type { AvisosConfig, Cobranca, PagamentosConfig, UazapiConfig } from '@/types';

// Rotina diária chamada por um cron externo (ex.: n8n) — não depende de sessão de admin,
// só do segredo compartilhado. Faz 3 coisas:
//  1. Envia a cobrança de quem vence hoje.
//  2. Envia o followup de atraso de quem venceu ontem e ainda não pagou.
//  3. Manda o resumo dos recebimentos de ontem para o grupo de aviso dos administradores.
export async function POST(req: NextRequest) {
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
    resumoEnviado: false,
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

      // ---- 3: resumo de recebimentos de ontem para o grupo de aviso ----
      const avisos = await getSetting<AvisosConfig>('avisos');
      if (avisos?.grupo_whatsapp_id) {
        const { data: pagasOntem } = await admin
          .from('cobrancas')
          .select('*, clientes(*), revendedores(*)')
          .eq('status', 'pago')
          .gte('pago_em', ontem)
          .lte('pago_em', ontem);

        const lista = (pagasOntem as Cobranca[]) ?? [];
        const total = lista.reduce((s, c) => s + Number(c.valor), 0);
        const linhas = lista.map((c) => {
          const nome = c.tipo === 'cliente' ? nomeComUsuario(c.clientes?.nome, c.clientes?.usuario) : c.revendedores?.nome ?? '—';
          return `• ${nome} — ${fmtMoeda(c.valor)}`;
        });

        const texto = [
          `📊 *Resumo de recebimentos — ${ontem.split('-').reverse().join('/')}*`,
          '',
          lista.length === 0 ? 'Nenhum recebimento ontem.' : linhas.join('\n'),
          '',
          `💰 *Total: ${fmtMoeda(total)}*`,
        ].join('\n');

        await sendGroupText(uazapi, avisos.grupo_whatsapp_id, texto);
        resultado.resumoEnviado = true;
      }
    }

    return NextResponse.json({ ok: true, ...resultado });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? 'Erro interno', ...resultado }, { status: 500 });
  }
}
