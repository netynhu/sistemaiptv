# Sistema IPTV — Gestão e Controle

Sistema de gestão de clientes de TV por assinatura com revendedores, comissões, cobrança via WhatsApp (Uazapi), agente de IA para suporte, controle financeiro e relatórios.

**Stack:** Next.js 14 (App Router) + Supabase (banco + autenticação) + Vercel (hospedagem).

---

## Funcionalidades

| Módulo | O que faz |
|---|---|
| **Dashboard** | KPIs (clientes ativos, vencimentos, receita, despesas, lucro) e gráfico receita × despesas |
| **Clientes** | Cadastro com plano, usuário/senha, link M3U (padrão ou próprio), dispositivo/app, telas simultâneas (um app por tela) e vínculo opcional com um indicador. Ao cadastrar, a receita já é lançada sozinha — nenhum botão para gerar cobrança |
| **Revendedores Master** | Têm painel próprio (não cadastramos os clientes deles aqui) — só informamos quanto pagam por acesso e quantos clientes têm, e a receita mensal é gerada/atualizada sozinha |
| **Indicação** | Recebem comissão (fixa ou %) gerada automaticamente em Despesas assim que o cliente indicado paga |
| **Financeiro > Receitas** | Cobranças de clientes e mensalidade de revendas — geradas automaticamente. Botão "Cobrar" manda a mensagem por WhatsApp com botão de copiar PIX; "Gerar cobrança Asaas/MP" cria um PIX real que dá baixa sozinho quando pago |
| **Financeiro > Despesas** | Dashboard de KPIs, lançamentos por categoria (com botão "Pagar tudo"), e aba **Indicações** agrupada por indicador com acesso direto ao PIX dele para pagar manualmente |
| **Plano de vendas** | Calculadora de meta (quantas telas faltam vender) e página de Regras e Planos (referência de comissões/valores por faixa para negociar) |
| **Relatórios** | Resumo mensal: receita, despesas (já somando comissões), lucro, novos clientes, custo estimado de telas — com impressão/PDF |
| **Suporte** | Inbox das conversas de WhatsApp, agente de IA que responde sozinho, botão "Assumir conversa" e guia de instalação de apps por dispositivo |
| **Configurações** | Planos, comissões padrão, preço por tela adicional, links padrão, Uazapi (QR Code + proxy por cidade), Pagamentos (PIX, forma padrão, tokens e webhooks do Asaas/Mercado Pago), agente de IA, modelos de mensagem e grupo de WhatsApp para avisos |
| **Automação diária** | Rotina chamada por um cron externo (n8n): cobra quem vence hoje, avisa quem atrasou ontem e manda o resumo dos recebimentos para o grupo de aviso |

---

## Passo 1 — Criar o projeto no Supabase

1. Acesse [supabase.com](https://supabase.com) e crie um projeto novo.
2. No menu lateral, abra **SQL Editor**, cole todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**. Isso cria as tabelas, a segurança (RLS) e os dados iniciais (planos, apps compatíveis e tutoriais do PDF). O arquivo é seguro para rodar de novo a qualquer momento (ex.: depois de um `git pull` com mudanças no schema) — ele só cria o que ainda não existe e adiciona colunas novas sem apagar dados.
3. Crie o(s) usuário(s) administrador(es): **Authentication > Users > Add user** → informe e-mail e senha (marque *Auto confirm*). São esses logins que acessam o sistema.
4. Copie as chaves em **Project Settings > API**:
   - `Project URL`
   - `anon public` key
   - `service_role` key (secreta — nunca exponha no navegador)

## Passo 2 — Rodar localmente (opcional)

```bash
npm install
```

Edite o arquivo `.env.local` com os dados reais do Supabase:

```env
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-anon-key
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key
WEBHOOK_SECRET=um-segredo-aleatorio-qualquer
AUTOMACAO_SECRET=outro-segredo-aleatorio-qualquer
```

```bash
npm run dev
```

Acesse http://localhost:3000 e entre com o usuário criado no Passo 1.

## Passo 3 — Publicar na Vercel

1. Suba o projeto para um repositório no GitHub.
2. Em [vercel.com](https://vercel.com), **Add New > Project** e importe o repositório.
3. Em **Environment Variables**, cadastre as mesmas 5 variáveis do `.env.local` (incluindo `AUTOMACAO_SECRET`).
4. Deploy. O sistema ficará em `https://seu-projeto.vercel.app`.

## Passo 4 — Conectar o WhatsApp (Uazapi)

1. No sistema, abra **Configurações > WhatsApp (Uazapi)**.
2. Preencha a **URL do servidor** (ex.: `https://seuservidor.uazapi.com`) e o **Admin token** do seu plano Uazapi.
3. Clique em **Criar instância** (o token da instância é salvo sozinho).
4. *(Opcional)* Na seção **Proxy**, preencha host/porta/usuário/senha do seu provedor de proxy e selecione a **cidade** — use `{cidade}` no usuário se o provedor aceitar cidade no login (ex.: `user-city-{cidade}`). Clique em **Aplicar proxy** *antes* de conectar.
5. Clique em **Conectar / Gerar QR** e escaneie o QR Code no WhatsApp do celular (Aparelhos conectados).
6. Clique em **Configurar webhook** — isso faz as mensagens recebidas caírem na aba **Suporte**.

## Passo 5 — Ativar o agente de IA do suporte

1. Abra **Configurações > Agente de IA**.
2. Escolha o provedor (Anthropic/Claude ou OpenAI), cole a **chave de API** e ative o agente.
3. O agente já recebe automaticamente a base de conhecimento com os **apps compatíveis por dispositivo e os passos de instalação** (importados do PDF), com os links padrão preenchidos.
4. Na aba **Suporte**, você acompanha as conversas em tempo real. Clique em **Assumir conversa** para o humano atender (a IA para de responder aquele contato) e **Devolver para IA** quando terminar.

## Passo 6 — Automação diária (n8n)

A rotina que cobra quem vence hoje, avisa quem atrasou e manda o resumo de recebimentos ao grupo de
WhatsApp fica no endpoint `POST /api/automacao/cobranca-diaria`, protegido pela variável de ambiente
`AUTOMACAO_SECRET`. Ela não roda sozinha — precisa de algo externo chamando-a todo dia. O jeito pronto:

1. No n8n, importe o fluxo [`n8n/cobranca-diaria.json`](n8n/cobranca-diaria.json) (`Workflows > Import from File`).
2. Abra o node de HTTP Request e troque `SEU-DOMINIO.vercel.app` pelo domínio real do seu sistema.
3. Configure o mesmo valor de `AUTOMACAO_SECRET` no n8n (variável `AUTOMACAO_SECRET` em *Settings > Variables*, ou cole o valor direto no header `x-automacao-secret` do node).
4. Ative o fluxo. Ele já vem programado para rodar todo dia às 10h — veja mais detalhes em [`n8n/README.md`](n8n/README.md).
5. *(Opcional)* Em **Configurações > Avisos**, cole o ID de um grupo do WhatsApp (termina em `@g.us`) para receber o resumo diário de recebimentos.
6. *(Opcional)* Em **Configurações > Mensagens**, personalize o texto de atraso enviado no dia seguinte ao vencimento.

## Passo 7 — Baixa automática via Asaas / Mercado Pago (opcional)

Com o token do gateway configurado, o botão **"Gerar cobrança"** (Asaas/MP) em Financeiro > Receitas cria um
PIX real — quando o cliente paga, o gateway avisa o sistema e a cobrança é dada como paga sozinha (o
vencimento renova e a comissão do indicador é gerada, exatamente como no fluxo manual).

**Asaas:**
1. Em **Configurações > Pagamentos**, preencha a **API Key** e defina um **token de autenticação do Webhook** (qualquer valor).
2. No painel do Asaas, vá em **Integrações > Webhooks**, crie um novo webhook com a URL mostrada na tela (botão de copiar) e cole o **mesmo token de autenticação** no campo correspondente do Asaas.
3. Marque pelo menos os eventos `PAYMENT_RECEIVED` e `PAYMENT_CONFIRMED`.

**Mercado Pago:**
1. Em **Configurações > Pagamentos**, preencha o **Access Token**.
2. No painel do Mercado Pago (*Suas integrações > sua aplicação > Webhooks*), cadastre a URL mostrada na tela (botão de copiar) e marque o evento **Pagamentos**.
3. Esse webhook não confia direto no corpo da notificação: ele busca o pagamento na API do Mercado Pago com o seu token antes de dar baixa, então funciona mesmo sem configurar assinatura extra.

## Rotina de uso sugerida

1. **Configurações > Planos** — confira os valores dos planos e padrões de comissão.
2. **Configurações > Links padrão** — cadastre o link M3U padrão (se ele mudar, atualize só aqui).
3. Em **Revendas > Revendedores**, cadastre os revendedores master: nome, quanto pagam por acesso e **quantos clientes têm** (os clientes deles ficam no painel próprio — não são cadastrados aqui). A receita mensal desse revendedor já é lançada/atualizada sozinha em Financeiro > Receitas.
4. Em **Revendas > Indicação**, cadastre quem indica clientes e a comissão (fixa ou %).
5. Cadastre os **clientes** normalmente — ao salvar, a receita dele já cai em **Financeiro > Receitas**, sem precisar gerar nada. Se o cliente veio de indicação, vincule o indicador no cadastro.
6. Em **Financeiro > Receitas**, clique em **Cobrar** para enviar a cobrança por WhatsApp e **Receber** quando o pagamento chegar — o vencimento renova e a próxima receita já é lançada sozinha. Se o cliente tinha indicador, a comissão vai direto para **Financeiro > Despesas > Comissões**.
7. Lance as **despesas gerais** em **Financeiro > Despesas** e acompanhe o **relatório mensal**.

## Estrutura do projeto

```
supabase/schema.sql              ← script do banco (rodar no Supabase)
n8n/cobranca-diaria.json         ← fluxo importável do n8n (cron 10h)
docs/                            ← PDF original de apps compatíveis
src/app/(painel)/                ← páginas: dashboard, clientes,
                                    revendas/revendedores, revendas/indicacao,
                                    financeiro/receitas, financeiro/despesas,
                                    plano-vendas/calculadora, plano-vendas/regras,
                                    relatorios, suporte, configuracoes
src/app/api/uazapi/              ← ações na instância (criar, QR, status, proxy, webhook)
src/app/api/webhook/uazapi       ← recebe mensagens do WhatsApp (+ resposta da IA)
src/app/api/webhook/asaas        ← baixa automática de pagamentos do Asaas
src/app/api/webhook/mercadopago  ← baixa automática de pagamentos do Mercado Pago
src/app/api/pagamento/asaas      ← gera uma cobrança PIX real no Asaas
src/app/api/pagamento/mercadopago← gera uma cobrança PIX real no Mercado Pago
src/app/api/automacao/cobranca-diaria ← rotina diária chamada pelo n8n
src/app/api/cobranca/enviar      ← envia cobrança por WhatsApp (manual)
src/app/api/suporte/enviar       ← envio manual do atendente
src/lib/uazapi.ts                ← cliente da API Uazapi (texto, botão PIX, grupo)
src/lib/asaas.ts / mercadopago.ts← clientes das APIs de pagamento
src/lib/pagamento.ts             ← dar baixa automática numa cobrança (usado pelos webhooks)
src/lib/cobranca.ts              ← monta e envia a mensagem de cobrança/atraso
src/lib/ia.ts                    ← agente de IA + base de conhecimento
```

## Observações

- O botão de **copiar PIX** na mensagem de cobrança usa o endpoint `/send/pix-button` da Uazapi, cuja documentação pública é limitada — se o botão não aparecer certinho no seu servidor, a mensagem cai automaticamente para texto simples (a cobrança nunca deixa de ser enviada por causa disso).
- Os endpoints da Uazapi variam um pouco entre versões do servidor; se "Aplicar proxy" falhar, confira o caminho correto na documentação do seu servidor e ajuste `src/lib/uazapi.ts`.
- A integração com Asaas aponta para produção (`api.asaas.com`); para testar em sandbox, troque a URL base em `src/lib/asaas.ts`.
- Como o sistema não coleta e-mail de clientes, a cobrança do Mercado Pago usa um e-mail sintético gerado a partir do telefone — é só para a API aceitar a criação do pagamento, não é usado para nada além disso.
- As tabelas `dispositivos`/`tutoriais` podem ser editadas direto no Supabase para incluir novos apps no guia e na base da IA.
- As faixas em **Plano de vendas > Regras e planos** são só uma referência — aplicar o valor no revendedor/indicador continua sendo manual (Revendas), para não arriscar mudar comissão de ninguém sozinho.
