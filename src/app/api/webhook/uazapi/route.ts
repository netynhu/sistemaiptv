import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getSetting } from '@/lib/settings';
import { gerarRespostaIA, type MensagemIA } from '@/lib/ia';
import { sendText } from '@/lib/uazapi';
import type { AgenteIAConfig, Cliente, UazapiConfig } from '@/types';

// Webhook de mensagens recebidas da Uazapi.
// Configure em Configurações > WhatsApp > "Configurar webhook".

function extrairMensagem(body: any) {
  // Formatos variam entre versões da Uazapi — extrai defensivamente.
  const msg = body?.message ?? body?.data?.message ?? body?.data ?? body ?? {};
  const chatid: string = msg.chatid ?? msg.from ?? msg.sender ?? msg.remoteJid ?? '';
  const texto: string =
    msg.text ?? msg.body ?? msg.content ?? msg.conversation ?? msg.message?.text ?? '';
  const nome: string = msg.senderName ?? msg.pushName ?? msg.notifyName ?? '';
  const fromMe: boolean = !!(msg.fromMe ?? msg.wasSentByApi ?? msg.fromApi);
  const grupo = typeof chatid === 'string' && chatid.includes('@g.us');
  const telefone = String(chatid).replace(/@.*$/, '').replace(/\D/g, '');
  return { telefone, texto: String(texto || ''), nome, fromMe, grupo };
}

// Localiza o cliente pelo WhatsApp. Compara pelos últimos 8 dígitos para ser tolerante a
// diferenças de DDI/nono dígito entre o número salvo e o que chega no webhook.
async function localizarCliente(admin: ReturnType<typeof createAdminClient>, telefone: string): Promise<Cliente | null> {
  if (telefone.length < 8) return null;
  const sufixo = telefone.slice(-8);
  const { data } = await admin
    .from('clientes')
    .select('*, planos(*)')
    .ilike('telefone', `%${sufixo}`)
    .limit(1);
  return ((data as Cliente[]) ?? [])[0] ?? null;
}

export async function POST(req: NextRequest) {
  try {
    const segredo = process.env.WEBHOOK_SECRET;
    if (segredo && req.nextUrl.searchParams.get('secret') !== segredo) {
      return NextResponse.json({ error: 'Segredo inválido' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { telefone, texto, nome, fromMe, grupo } = extrairMensagem(body);

    // Ignora grupos, mensagens próprias e eventos sem texto
    if (!telefone || !texto.trim() || fromMe || grupo) {
      return NextResponse.json({ ok: true, ignorado: true });
    }

    const admin = createAdminClient();
    const cliente = await localizarCliente(admin, telefone);

    // Encontra ou cria a conversa
    let { data: conversa } = await admin
      .from('conversas')
      .select('*')
      .eq('telefone', telefone)
      .maybeSingle();

    if (!conversa) {
      const { data: nova, error } = await admin
        .from('conversas')
        .insert({
          telefone,
          nome: cliente?.nome || nome || null,
          cliente_id: cliente?.id ?? null,
          modo: 'ia',
          status: 'ia',
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      conversa = nova;
    } else if (cliente && conversa.cliente_id !== cliente.id) {
      // Vincula o cliente a uma conversa antiga (cadastro feito depois do 1º contato)
      await admin
        .from('conversas')
        .update({ cliente_id: cliente.id, nome: conversa.nome || cliente.nome })
        .eq('id', conversa.id);
      conversa.cliente_id = cliente.id;
    }

    await admin.from('mensagens').insert({
      conversa_id: conversa.id,
      direcao: 'entrada',
      autor: 'cliente',
      conteudo: texto,
    });

    // Reabre conversas encerradas quando o cliente volta a escrever
    const reabrindo = conversa.status === 'resolvida';
    const modoAtual = reabrindo ? 'ia' : conversa.modo;
    const statusAtual = reabrindo ? 'ia' : conversa.status;

    await admin
      .from('conversas')
      .update({
        ultima_mensagem: texto.slice(0, 200),
        nome: conversa.nome || cliente?.nome || nome || null,
        modo: modoAtual,
        status: statusAtual,
        nao_lidas: (conversa.nao_lidas ?? 0) + 1,
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', conversa.id);

    // Resposta automática da IA (somente se a conversa estiver no modo IA)
    const agente = await getSetting<AgenteIAConfig>('agente_ia');
    if (agente?.habilitado && agente.auto_resposta && modoAtual === 'ia') {
      const { data: ultimas } = await admin
        .from('mensagens')
        .select('direcao, conteudo')
        .eq('conversa_id', conversa.id)
        .order('criado_em', { ascending: false })
        .limit(12);

      const historico: MensagemIA[] = (ultimas ?? [])
        .reverse()
        .map((m) => ({
          role: m.direcao === 'entrada' ? ('user' as const) : ('assistant' as const),
          content: m.conteudo,
        }));

      try {
        const resultado = await gerarRespostaIA(historico, cliente);

        if (resultado.resposta) {
          const uazapi = await getSetting<UazapiConfig>('uazapi');
          if (uazapi?.server_url && uazapi.instance_token) {
            await sendText(uazapi, telefone, resultado.resposta);
          }
          await admin.from('mensagens').insert({
            conversa_id: conversa.id,
            direcao: 'saida',
            autor: 'ia',
            conteudo: resultado.resposta,
          });
        }

        // A IA pediu transferência para um humano — marca a conversa para o CRM.
        if (resultado.escalar) {
          await admin
            .from('conversas')
            .update({
              modo: 'humano',
              status: 'aguardando',
              motivo_escalacao: resultado.escalar.motivo,
              ultima_mensagem: (resultado.resposta ?? texto).slice(0, 200),
              nao_lidas: (conversa.nao_lidas ?? 0) + 1,
              atualizado_em: new Date().toISOString(),
            })
            .eq('id', conversa.id);
        } else if (resultado.resposta) {
          await admin
            .from('conversas')
            .update({ ultima_mensagem: resultado.resposta.slice(0, 200), atualizado_em: new Date().toISOString() })
            .eq('id', conversa.id);
        }
      } catch (e) {
        // Falha da IA não pode derrubar o webhook — a mensagem já foi salva.
        console.error('Erro do agente de IA:', e);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('Erro no webhook:', e);
    return NextResponse.json({ error: e.message ?? 'Erro interno' }, { status: 500 });
  }
}
