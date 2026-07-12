import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSetting, setSetting } from '@/lib/settings';
import {
  connectInstance, disconnectInstance, extrairQr, extrairStatus,
  initInstance, instanceStatus, setWebhook,
} from '@/lib/uazapi';
import type { UazapiConfig } from '@/types';

// Ações administrativas na instância Uazapi (criar, conectar/QR, status, proxy, webhook)
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const { acao } = await req.json();
    const cfg = await getSetting<UazapiConfig>('uazapi');
    if (!cfg) return NextResponse.json({ error: 'Configuração da Uazapi não encontrada.' }, { status: 400 });

    switch (acao) {
      case 'init': {
        const data = await initInstance(cfg);
        const token = data?.token || data?.instance?.token;
        if (token) {
          await setSetting('uazapi', { ...cfg, instance_token: token });
        }
        return NextResponse.json({ ok: true, token: token ?? null, resposta: data });
      }
      case 'connect': {
        const data = await connectInstance(cfg);
        return NextResponse.json({
          ok: true,
          qrcode: extrairQr(data),
          status: extrairStatus(data),
        });
      }
      case 'status': {
        const data = await instanceStatus(cfg);
        return NextResponse.json({
          ok: true,
          status: extrairStatus(data),
          qrcode: extrairQr(data),
        });
      }
      case 'disconnect': {
        await disconnectInstance(cfg);
        return NextResponse.json({ ok: true });
      }
      case 'webhook': {
        const origem = req.nextUrl.origin;
        const segredo = process.env.WEBHOOK_SECRET || '';
        const url = `${origem}/api/webhook/uazapi${segredo ? `?secret=${segredo}` : ''}`;
        const data = await setWebhook(cfg, url);
        return NextResponse.json({ ok: true, url, resposta: data });
      }
      default:
        return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Erro interno' }, { status: 500 });
  }
}
