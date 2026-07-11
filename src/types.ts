export type Plano = {
  id: string;
  nome: string;
  meses: number;
  valor: number;
  ativo: boolean;
};

export type Revendedor = {
  id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  tipo: 'master' | 'indicacao';
  valor_por_acesso: number;
  quantidade_clientes: number;
  comissao_tipo: 'fixo' | 'percentual';
  comissao_valor: number;
  dia_vencimento: number;
  chave_pix: string | null;
  ativo: boolean;
  observacoes: string | null;
};

export type Cliente = {
  id: string;
  nome: string;
  telefone: string | null;
  usuario: string | null;
  senha: string | null;
  plano_id: string | null;
  valor: number;
  m3u_link: string | null;
  dispositivo: string | null;
  aplicativo: string | null;
  telas_apps: string[];
  revendedor_id: string | null;
  data_ativacao: string;
  data_vencimento: string | null;
  status: 'ativo' | 'suspenso' | 'cancelado';
  observacoes: string | null;
  planos?: Plano | null;
  revendedores?: Revendedor | null;
};

export type Cobranca = {
  id: string;
  tipo: 'cliente' | 'revendedor';
  cliente_id: string | null;
  revendedor_id: string | null;
  descricao: string | null;
  valor: number;
  vencimento: string;
  status: 'pendente' | 'pago' | 'cancelado';
  pago_em: string | null;
  forma_pagamento: string | null;
  whatsapp_enviado_em: string | null;
  clientes?: Cliente | null;
  revendedores?: Revendedor | null;
};

export type Comissao = {
  id: string;
  indicador_id: string;
  cliente_id: string | null;
  cobranca_id: string | null;
  valor: number;
  status: 'pendente' | 'pago';
  pago_em: string | null;
  revendedores?: Revendedor | null;
  clientes?: Cliente | null;
};

export type Despesa = {
  id: string;
  descricao: string;
  categoria: string;
  valor: number;
  data: string;
  recorrente: boolean;
  pago: boolean;
  pago_em: string | null;
  cliente_id: string | null;
  observacoes: string | null;
};

export type Conversa = {
  id: string;
  telefone: string;
  nome: string | null;
  ultima_mensagem: string | null;
  modo: 'ia' | 'humano';
  nao_lidas: number;
  atualizado_em: string;
};

export type Mensagem = {
  id: string;
  conversa_id: string;
  direcao: 'entrada' | 'saida';
  autor: 'cliente' | 'ia' | 'humano';
  conteudo: string;
  criado_em: string;
};

export type Dispositivo = {
  id: string;
  nome: string;
  apps: string[];
  ordem: number;
};

export type Tutorial = {
  id: string;
  app: string;
  instrucoes: string;
  ordem: number;
};

export type LinksPadrao = {
  m3u: string;
  smarters_url: string;
  smarters_nome: string;
  xciptv_url: string;
  assist_plus_codigo: string;
};

export type UazapiConfig = {
  server_url: string;
  admin_token: string;
  instance_token: string;
  instance_name: string;
  proxy_host: string;
  proxy_porta: string;
  proxy_usuario: string;
  proxy_senha: string;
  proxy_cidade: string;
};

export type PagamentosConfig = {
  chave_pix: string;
  mercadopago_token: string;
  asaas_token: string;
  picpay_token: string;
};

export type AgenteIAConfig = {
  habilitado: boolean;
  provider: 'anthropic' | 'openai';
  api_key: string;
  model: string;
  auto_resposta: boolean;
  prompt_sistema: string;
};
