-- ============================================================
-- SISTEMA ALFENAS — Schema do Supabase
-- Execute este arquivo no SQL Editor do seu projeto Supabase.
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- CONFIGURAÇÕES (chave/valor em JSONB)
-- ------------------------------------------------------------
create table if not exists public.settings (
  chave text primary key,
  valor jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);

-- ------------------------------------------------------------
-- PLANOS
-- ------------------------------------------------------------
create table if not exists public.planos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  meses int not null default 1,
  valor numeric(10,2) not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- ------------------------------------------------------------
-- REVENDEDORES (master) e INDICADORES (indicação)
-- ------------------------------------------------------------
create table if not exists public.revendedores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text,
  email text,
  tipo text not null check (tipo in ('master','indicacao')),
  -- master: quanto ele paga por acesso e quantos clientes ele tem (informado manualmente —
  -- o revendedor master opera o próprio painel, os clientes dele não são cadastrados aqui)
  valor_por_acesso numeric(10,2) not null default 0,
  quantidade_clientes int not null default 0,
  -- indicação: comissão por pagamento de cliente indicado (cliente É cadastrado aqui, vinculado)
  comissao_tipo text not null default 'fixo' check (comissao_tipo in ('fixo','percentual')),
  comissao_valor numeric(10,2) not null default 0,
  dia_vencimento int not null default 10 check (dia_vencimento between 1 and 28),
  chave_pix text,
  ativo boolean not null default true,
  observacoes text,
  criado_em timestamptz not null default now()
);

-- Migração para bancos já existentes (roda seguro mesmo se a tabela já foi criada antes)
alter table public.revendedores add column if not exists quantidade_clientes int not null default 0;

-- ------------------------------------------------------------
-- CLIENTES
-- ------------------------------------------------------------
create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text, -- WhatsApp com DDD (ex.: 5535999990000)
  usuario text,
  senha text,
  plano_id uuid references public.planos(id) on delete set null,
  valor numeric(10,2) not null default 0, -- valor cobrado deste cliente
  m3u_link text, -- vazio = usa o link padrão das Configurações
  dispositivo text,
  aplicativo text,
  telas_apps text[] not null default '{}', -- um app por tela simultânea (custo informativo: R$1,50/tela)
  revendedor_id uuid references public.revendedores(id) on delete set null,
  data_ativacao date not null default current_date,
  data_vencimento date,
  status text not null default 'ativo' check (status in ('ativo','suspenso','cancelado')),
  observacoes text,
  criado_em timestamptz not null default now()
);
create index if not exists idx_clientes_vencimento on public.clientes(data_vencimento);
create index if not exists idx_clientes_revendedor on public.clientes(revendedor_id);
alter table public.clientes add column if not exists telas_apps text[] not null default '{}';

-- ------------------------------------------------------------
-- COBRANÇAS (clientes e mensalidades de revendedores master)
-- ------------------------------------------------------------
create table if not exists public.cobrancas (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('cliente','revendedor')),
  cliente_id uuid references public.clientes(id) on delete cascade,
  revendedor_id uuid references public.revendedores(id) on delete cascade,
  descricao text,
  valor numeric(10,2) not null,
  vencimento date not null,
  status text not null default 'pendente' check (status in ('pendente','pago','cancelado')),
  pago_em date,
  forma_pagamento text, -- pix, mercadopago, asaas, picpay, dinheiro...
  whatsapp_enviado_em timestamptz,
  -- cobrança PIX gerada de verdade no Asaas/Mercado Pago (para dar baixa automática via webhook)
  externo_provedor text check (externo_provedor in ('asaas','mercadopago')),
  externo_id text,
  pix_copia_cola text,
  criado_em timestamptz not null default now()
);
create index if not exists idx_cobrancas_status on public.cobrancas(status);
create index if not exists idx_cobrancas_vencimento on public.cobrancas(vencimento);
create index if not exists idx_cobrancas_externo on public.cobrancas(externo_provedor, externo_id);
alter table public.cobrancas add column if not exists externo_provedor text check (externo_provedor in ('asaas','mercadopago'));
alter table public.cobrancas add column if not exists externo_id text;
alter table public.cobrancas add column if not exists pix_copia_cola text;

-- ------------------------------------------------------------
-- COMISSÕES (para indicadores)
-- ------------------------------------------------------------
create table if not exists public.comissoes (
  id uuid primary key default gen_random_uuid(),
  indicador_id uuid not null references public.revendedores(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete set null,
  cobranca_id uuid references public.cobrancas(id) on delete set null,
  valor numeric(10,2) not null,
  status text not null default 'pendente' check (status in ('pendente','pago')),
  pago_em date,
  criado_em timestamptz not null default now()
);
create index if not exists idx_comissoes_indicador on public.comissoes(indicador_id);

-- ------------------------------------------------------------
-- DESPESAS
-- ------------------------------------------------------------
create table if not exists public.despesas (
  id uuid primary key default gen_random_uuid(),
  descricao text not null,
  categoria text not null default 'Geral',
  valor numeric(10,2) not null,
  data date not null default current_date,
  recorrente boolean not null default false,
  pago boolean not null default false,
  pago_em date,
  -- preenchido automaticamente quando a despesa é o custo de telas do Assist Plus de um cliente
  cliente_id uuid references public.clientes(id) on delete cascade,
  observacoes text,
  criado_em timestamptz not null default now()
);
create index if not exists idx_despesas_data on public.despesas(data);
alter table public.despesas add column if not exists pago boolean not null default false;
alter table public.despesas add column if not exists pago_em date;
alter table public.despesas add column if not exists cliente_id uuid references public.clientes(id) on delete cascade;

-- ------------------------------------------------------------
-- SUPORTE (conversas WhatsApp via Uazapi)
-- ------------------------------------------------------------
create table if not exists public.conversas (
  id uuid primary key default gen_random_uuid(),
  telefone text not null unique,
  nome text,
  ultima_mensagem text,
  modo text not null default 'ia' check (modo in ('ia','humano')),
  nao_lidas int not null default 0,
  atualizado_em timestamptz not null default now(),
  criado_em timestamptz not null default now()
);

create table if not exists public.mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.conversas(id) on delete cascade,
  direcao text not null check (direcao in ('entrada','saida')),
  autor text not null check (autor in ('cliente','ia','humano')),
  conteudo text not null,
  criado_em timestamptz not null default now()
);
create index if not exists idx_mensagens_conversa on public.mensagens(conversa_id, criado_em);

-- ------------------------------------------------------------
-- BASE DE CONHECIMENTO — dispositivos e tutoriais de apps
-- ------------------------------------------------------------
create table if not exists public.dispositivos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  apps text[] not null default '{}',
  ordem int not null default 0
);

create table if not exists public.tutoriais (
  id uuid primary key default gen_random_uuid(),
  app text not null unique,
  instrucoes text not null,
  ordem int not null default 0
);

-- ============================================================
-- RLS — acesso somente para administradores autenticados
-- (as rotas de servidor usam a service_role, que ignora RLS)
-- ============================================================
alter table public.settings enable row level security;
alter table public.planos enable row level security;
alter table public.revendedores enable row level security;
alter table public.clientes enable row level security;
alter table public.cobrancas enable row level security;
alter table public.comissoes enable row level security;
alter table public.despesas enable row level security;
alter table public.conversas enable row level security;
alter table public.mensagens enable row level security;
alter table public.dispositivos enable row level security;
alter table public.tutoriais enable row level security;

do $$
declare t text;
begin
  foreach t in array array['settings','planos','revendedores','clientes','cobrancas','comissoes','despesas','conversas','mensagens','dispositivos','tutoriais']
  loop
    execute format('drop policy if exists "admin_all_%s" on public.%I', t, t);
    execute format('create policy "admin_all_%s" on public.%I for all to authenticated using (true) with check (true)', t, t);
  end loop;
end $$;

-- ============================================================
-- SEEDS
-- ============================================================

-- Planos padrão (edite os valores em Configurações)
insert into public.planos (nome, meses, valor)
select * from (values
  ('Mensal', 1, 25.00),
  ('Trimestral', 3, 70.00),
  ('Semestral', 6, 135.00),
  ('Anual', 12, 260.00)
) as v(nome, meses, valor)
where not exists (select 1 from public.planos);

-- Configurações padrão
insert into public.settings (chave, valor) values
  ('links_padrao', '{
    "m3u": "",
    "smarters_url": "http://fx12.sbs",
    "smarters_nome": "tv",
    "xciptv_url": "http://cdnsec.cyou",
    "assist_plus_codigo": "rota1"
  }'::jsonb),
  ('uazapi', '{
    "server_url": "",
    "admin_token": "",
    "instance_token": "",
    "instance_name": "sistema",
    "proxy_host": "",
    "proxy_porta": "",
    "proxy_usuario": "",
    "proxy_senha": "",
    "proxy_cidade": ""
  }'::jsonb),
  ('pagamentos', '{
    "chave_pix": "",
    "chave_pix_tipo": "aleatoria",
    "forma_pagamento_padrao": "PIX",
    "mercadopago_token": "",
    "mercadopago_webhook_secret": "",
    "asaas_token": "",
    "asaas_webhook_token": "",
    "picpay_token": ""
  }'::jsonb),
  ('avisos', '{
    "grupo_whatsapp_id": ""
  }'::jsonb),
  ('agente_ia', '{
    "habilitado": false,
    "provider": "anthropic",
    "api_key": "",
    "model": "claude-haiku-4-5-20251001",
    "auto_resposta": true,
    "prompt_sistema": "Você é o atendente virtual de um serviço de TV por assinatura. Seja educado, objetivo e responda em português do Brasil. Ajude o cliente a instalar o aplicativo correto para o dispositivo dele usando a base de conhecimento fornecida. Nunca invente informações: se não souber, diga que vai transferir para um atendente humano. Não informe usuário e senha de clientes."
  }'::jsonb),
  ('comissao_padrao', '{"tipo": "fixo", "valor": 10.00}'::jsonb),
  ('revenda_padrao', '{"valor_por_acesso": 15.00}'::jsonb),
  ('mensagens', '{
    "cobranca": "Olá {nome}! 👋😊\n\n📺 Sua assinatura vence em *{vencimento}*.\n💰 Valor: *{valor}*\n\n✅ Para renovar, é só pagar o PIX abaixo (toque para copiar):\n{pix}\n\n📩 Depois do pagamento, envie o comprovante aqui que já renovamos seu acesso! 🚀",
    "atraso": "Olá {nome}! ⚠️\n\n📺 Sua assinatura venceu em *{vencimento}* e o pagamento ainda não caiu por aqui.\n💰 Valor: *{valor}*\n\n✅ Para evitar que seu acesso seja suspenso, faça o PIX abaixo (toque para copiar):\n{pix}\n\n📩 Já pagou? Manda o comprovante aqui que a gente confirma rapidinho! 🙏",
    "boas_vindas": "Olá {nome}! Seja bem-vindo(a)! 🎉📺 Seu acesso já está ativo. Qualquer dúvida sobre a instalação, é só chamar aqui! 😊"
  }'::jsonb)
on conflict (chave) do nothing;

-- Dispositivos e apps compatíveis (do PDF "Aplicativos compatíveis")
insert into public.dispositivos (nome, apps, ordem)
select * from (values
  ('TV Smart LG',          array['Assist Plus','IPTV Smarters Pro'], 1),
  ('TV Smart Samsung',     array['Assist Plus','IPTV Smarters Pro'], 2),
  ('TV Box (genérico)',    array['XCIPTV','ONE UHD'], 3),
  ('Fire Stick / Fire TV', array['Assist Plus'], 4),
  ('Roku TV',              array['Assist Plus'], 5),
  ('Google TV',            array['Assist Plus','XCIPTV'], 6),
  ('TV Smart Sony (Bravia)', array['Clouddy (PAGO)'], 7),
  ('TV Smart TCL',         array['Assist Plus','XCIPTV'], 8),
  ('TV Smart Philips',     array['Clouddy (PAGO)'], 9),
  ('Celular Android',      array['ONE UHD'], 10),
  ('iPhone',               array['VU IPTV Player','Smarter Player Lite'], 11)
) as v(nome, apps, ordem)
where not exists (select 1 from public.dispositivos);

-- Tutoriais de instalação (do PDF)
insert into public.tutoriais (app, instrucoes, ordem)
select * from (values
  ('Assist Plus', E'**Compatível com:** LG, Samsung, Fire Stick, Roku\n\n1. Baixe e abra o app **Assist Plus** na loja de apps do seu dispositivo.\n2. Na tela inicial, insira o **Código**: `{assist_plus_codigo}`\n3. Digite o **Usuário** (enviado individualmente para cada cliente).\n4. Digite a **Senha** (enviada individualmente para cada cliente).\n5. Confirme e aguarde o carregamento da lista de canais.', 1),
  ('IPTV Smarters Pro', E'**Compatível com:** LG e Samsung\n\n1. Baixe e abra o app **IPTV Smarters Pro** na loja de apps do seu dispositivo.\n2. Selecione a opção de login via **Usuário e Senha** (Xtream Codes API/M3U URL).\n3. Preencha os campos:\n   - **Nome:** `{smarters_nome}`\n   - **Usuário:** (gerado individualmente para cada cliente)\n   - **Senha:** (gerada individualmente para cada cliente)\n   - **URL:** `{smarters_url}`\n4. Confirme e aguarde o carregamento da lista de canais.', 2),
  ('XCIPTV', E'**Compatível com:** TV Box, Google TV e outros apps universais\n\n1. Baixe e abra o app **XCIPTV** (ou app universal compatível) na loja de apps do seu dispositivo.\n2. Selecione a opção de login via **Usuário e Senha** (Xtream Codes API).\n3. Preencha os campos:\n   - **URL:** `{xciptv_url}`\n   - **Usuário:** (gerado individualmente para cada cliente)\n   - **Senha:** (gerada individualmente para cada cliente)\n4. Confirme e aguarde o carregamento da lista de canais.', 3),
  ('ONE UHD', E'**Compatível com:** TV Box e Celular Android\n\n**Atenção:** o ONE UHD não fica disponível nas lojas de aplicativos (Play Store/App Store). Ele é instalado via APK, baixado pelo navegador do próprio dispositivo.\n\n1. Abra o navegador do dispositivo e acesse: `https://central.tech.appscineblack1.com.br/`\n2. Na lista de aplicativos do site, escolha **ONE UHD** para baixar o APK.\n3. Instale o APK baixado (pode ser necessário permitir "instalar de fontes desconhecidas" nas configurações do aparelho).\n4. Abra o app **ONE UHD** e selecione a opção de login via **Usuário e Senha**.\n5. Preencha os campos:\n   - **Usuário:** (gerado individualmente para cada cliente)\n   - **Senha:** (gerada individualmente para cada cliente)\n6. Confirme e aguarde o carregamento da lista de canais.', 4),
  ('Clouddy (PAGO)', E'**Compatível com:** TV Smart Sony e Philips — *aplicativo pago*\n\n1. Baixe e abra o app **Clouddy** na loja de apps do seu dispositivo.\n2. Selecione a opção de login via **Link M3U**.\n3. Insira o **Link M3U** gerado individualmente para cada cliente.\n4. Confirme e aguarde o carregamento da lista de canais.', 5),
  ('VU IPTV Player', E'**Compatível com:** iPhone — usa os mesmos dados do IPTV Smarters Pro\n\n1. Baixe e abra o app **VU IPTV Player** na App Store.\n2. Selecione a opção de login via **Usuário e Senha** (Xtream Codes API/M3U URL).\n3. Preencha os campos:\n   - **Nome:** `{smarters_nome}`\n   - **Usuário:** (gerado individualmente para cada cliente)\n   - **Senha:** (gerada individualmente para cada cliente)\n   - **URL:** `{smarters_url}`\n4. Confirme e aguarde o carregamento da lista de canais.', 6),
  ('Smarter Player Lite', E'**Compatível com:** iPhone — usa os mesmos dados do IPTV Smarters Pro\n\n1. Baixe e abra o app **Smarter Player Lite** na App Store.\n2. Selecione a opção de login via **Usuário e Senha** (Xtream Codes API/M3U URL).\n3. Preencha os campos:\n   - **Nome:** `{smarters_nome}`\n   - **Usuário:** (gerado individualmente para cada cliente)\n   - **Senha:** (gerada individualmente para cada cliente)\n   - **URL:** `{smarters_url}`\n4. Confirme e aguarde o carregamento da lista de canais.', 7)
) as v(app, instrucoes, ordem)
where not exists (select 1 from public.tutoriais);
