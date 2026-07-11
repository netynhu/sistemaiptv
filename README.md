# Sistema Alfenas — Gestão e Controle

Sistema de gestão de clientes de TV por assinatura com revendedores, comissões, cobrança via WhatsApp (Uazapi), agente de IA para suporte, controle financeiro e relatórios.

**Stack:** Next.js 14 (App Router) + Supabase (banco + autenticação) + Vercel (hospedagem).

---

## Funcionalidades

| Módulo | O que faz |
|---|---|
| **Dashboard** | KPIs (clientes ativos, vencimentos, receita, despesas, lucro) e gráfico receita × despesas |
| **Clientes** | Cadastro com plano, usuário/senha, link M3U (padrão ou próprio), dispositivo/app e vínculo opcional com um indicador. Ao cadastrar, a receita já é lançada sozinha — nenhum botão para gerar cobrança |
| **Revendedores Master** | Têm painel próprio (não cadastramos os clientes deles aqui) — só informamos quanto pagam por acesso e quantos clientes têm, e a receita mensal é gerada/atualizada sozinha |
| **Indicação** | Recebem comissão (fixa ou %) gerada automaticamente em Despesas assim que o cliente indicado paga |
| **Financeiro > Receitas** | Cobranças de clientes e mensalidade de revendas — tudo gerado automaticamente, só falta clicar em "Cobrar" (WhatsApp) e "Receber" |
| **Financeiro > Despesas** | Lançamentos por categoria com filtro mensal + aba de Comissões dos indicadores |
| **Relatórios** | Resumo mensal: receita, despesas, lucro, comissões, novos clientes — com impressão/PDF |
| **Suporte** | Inbox das conversas de WhatsApp, agente de IA que responde sozinho, botão "Assumir conversa" e guia de instalação de apps por dispositivo |
| **Configurações** | Valores dos planos, comissões padrão, links padrão (M3U, Smarters, XCIPTV, Assist Plus), Uazapi (QR Code + proxy por cidade), tokens (Mercado Pago, Asaas, PicPay), agente de IA e modelos de mensagem |

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
```

```bash
npm run dev
```

Acesse http://localhost:3000 e entre com o usuário criado no Passo 1.

## Passo 3 — Publicar na Vercel

1. Suba o projeto para um repositório no GitHub.
2. Em [vercel.com](https://vercel.com), **Add New > Project** e importe o repositório.
3. Em **Environment Variables**, cadastre as mesmas 4 variáveis do `.env.local`.
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
supabase/schema.sql        ← script do banco (rodar no Supabase)
docs/                      ← PDF original de apps compatíveis
src/app/(painel)/          ← páginas: dashboard, clientes,
                              revendas/revendedores, revendas/indicacao,
                              financeiro/receitas, financeiro/despesas,
                              relatorios, suporte, configuracoes
src/app/api/uazapi/        ← ações na instância (criar, QR, status, proxy, webhook)
src/app/api/webhook/uazapi ← recebe mensagens do WhatsApp (+ resposta da IA)
src/app/api/cobranca/enviar← envia cobrança por WhatsApp
src/app/api/suporte/enviar ← envio manual do atendente
src/lib/uazapi.ts          ← cliente da API Uazapi
src/lib/ia.ts              ← agente de IA + base de conhecimento
```

## Observações

- **Tokens de pagamento** (Mercado Pago, Asaas, PicPay Empresas) ficam salvos em Configurações > Pagamentos, prontos para integrações de cobrança automática; hoje a cobrança usa a chave PIX no texto do WhatsApp.
- Os endpoints da Uazapi variam um pouco entre versões do servidor; se "Aplicar proxy" falhar, confira o caminho correto na documentação do seu servidor e ajuste `src/lib/uazapi.ts`.
- As tabelas `dispositivos`/`tutoriais` podem ser editadas direto no Supabase para incluir novos apps no guia e na base da IA.
