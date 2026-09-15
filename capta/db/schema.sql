-- Esquema do Captapp.
-- A camada de conta, conexao e cobranca e generica de proposito: o chat de
-- captacao e o primeiro modulo, nao o unico. Nada aqui referencia "chat".

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- contas ---

create table if not exists contas (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  email         text not null unique,
  senha_hash    text not null,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Documento e id de cliente na cobranca. O Asaas identifica o pagador pelo
-- id de cliente dele, e o webhook casa a cobranca com a conta por aqui.
alter table contas add column if not exists documento text;
alter table contas add column if not exists cliente_externo text;

-- Preferencias de aviso. O e-mail de aviso pode ser diferente do login (o
-- dono entra, a equipe atende). O WhatsApp da loja e o que o visitante ve na
-- tela final quando o beneficio e o contato humano.
alter table contas add column if not exists email_aviso text;
alter table contas add column if not exists whatsapp text;
alter table contas add column if not exists avisar_lead boolean not null default true;

-- Recuperacao de senha. Guarda o hash do token, nunca o token: quem le o
-- banco nao consegue usar a linha para entrar.
create table if not exists recuperacoes_senha (
  id         uuid primary key default gen_random_uuid(),
  conta_id   uuid not null references contas(id) on delete cascade,
  token_hash text not null unique,
  expira_em  timestamptz not null,
  usado_em   timestamptz,
  criado_em  timestamptz not null default now()
);

create table if not exists sessoes (
  id        text primary key,
  conta_id  uuid not null references contas(id) on delete cascade,
  expira_em timestamptz not null,
  criado_em timestamptz not null default now()
);
create index if not exists sessoes_conta_idx on sessoes(conta_id);

-- Modulos ativaveis por conta. O chat de captacao entra como 'captacao'.
create table if not exists modulos_conta (
  conta_id  uuid not null references contas(id) on delete cascade,
  modulo    text not null,
  ativo     boolean not null default true,
  criado_em timestamptz not null default now(),
  primary key (conta_id, modulo)
);

-- -------------------------------------------------------------- conexoes ---

-- credenciais guarda token de API de loja de terceiro. Cifrada na aplicacao
-- (AES-256-GCM, src/cripto.js), nunca em claro e nunca em log.
create table if not exists conexoes (
  id              uuid primary key default gen_random_uuid(),
  conta_id        uuid not null references contas(id) on delete cascade,
  plataforma      text not null check (plataforma in ('nuvemshop','woocommerce','tray','loja_integrada')),
  nome_loja       text not null,
  dominio         text,
  credenciais     text not null,
  chave_publica   text not null unique,
  modo_instalacao text not null default 'pendente'
                  check (modo_instalacao in ('pendente','auto','manual','bloqueado')),
  status          text not null default 'ativa'
                  check (status in ('ativa','pausada','erro','inadimplente_plataforma')),
  detalhe_status  text,
  varrido_em      timestamptz,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);
create index if not exists conexoes_conta_idx on conexoes(conta_id);

-- ----------------------------------------------------------------- fluxo ---

create table if not exists fluxos (
  id            uuid primary key default gen_random_uuid(),
  conta_id      uuid not null references contas(id) on delete cascade,
  conexao_id    uuid not null references conexoes(id) on delete cascade,
  convite       text not null default 'Ganhe cupom',
  consentimento text not null,
  desconto      integer not null default 10,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
-- O beneficio do fim do chat. Loja oferece cupom ou frete gratis, que viram
-- cupom na plataforma. Operacao que nao e loja oferece diagnostico, conversa
-- com especialista ou consultoria, que nao criam nada: o lead vai para a
-- fila e a recompensa e o contato humano.
alter table fluxos add column if not exists recompensa text not null default 'cupom'
  check (recompensa in ('cupom','frete_gratis','diagnostico','especialista','consultoria'));

-- Formato do widget. painel e a janela compacta com o contato no fim; chat e
-- o popup em balões no formato do projeto original, com nome e WhatsApp
-- como primeiras perguntas. abrir_apos em segundos abre sozinho uma vez por
-- navegador; zero desliga.
alter table fluxos add column if not exists modo text not null default 'painel'
  check (modo in ('painel','chat'));
alter table fluxos add column if not exists abrir_apos integer not null default 0
  check (abrir_apos between 0 and 120);
-- Cor do botao e do cabecalho do widget, em hex. Nula usa o preto padrao.
alter table fluxos add column if not exists cor text
  check (cor is null or cor ~ '^#[0-9a-fA-F]{6}$');

create unique index if not exists fluxos_conexao_idx on fluxos(conexao_id);

-- Teto de quatro perguntas no banco, nao so na tela: a ultima e a de contato
-- e nao pode ser removida, entao ela nao vive nesta tabela.
create table if not exists perguntas (
  id        uuid primary key default gen_random_uuid(),
  fluxo_id  uuid not null references fluxos(id) on delete cascade,
  ordem     integer not null check (ordem between 1 and 3),
  texto     text not null,
  opcoes    jsonb not null default '[]'::jsonb,
  criado_em timestamptz not null default now(),
  unique (fluxo_id, ordem)
);

-- ----------------------------------------------------------------- leads ---

create table if not exists leads (
  id              uuid primary key default gen_random_uuid(),
  conta_id        uuid not null references contas(id) on delete cascade,
  conexao_id      uuid not null references conexoes(id) on delete cascade,
  nome            text not null,
  email           text,
  telefone        text,
  respostas       jsonb not null default '[]'::jsonb,
  anonimo_id      text,
  consentido_em   timestamptz not null,
  rede_mascarada  text,
  criado_em       timestamptz not null default now()
);
-- Lead capturado nao e lead trabalhado. Sem marcar quem ja foi contatado, o
-- painel vira uma lista que so cresce e o lojista para de abrir.
alter table leads add column if not exists contatado_em timestamptz;
alter table leads add column if not exists resultado text
  check (resultado in ('contatado','vendeu','perdeu'));

create index if not exists leads_conta_idx   on leads(conta_id, criado_em desc);
create index if not exists leads_a_contatar_idx on leads(conta_id, criado_em desc)
  where contatado_em is null;
create index if not exists leads_conexao_idx on leads(conexao_id, criado_em desc);
create index if not exists leads_anonimo_idx on leads(conexao_id, anonimo_id);

-- ---------------------------------------------------------------- cupons ---

create table if not exists cupons (
  id         uuid primary key default gen_random_uuid(),
  conta_id   uuid not null references contas(id) on delete cascade,
  conexao_id uuid not null references conexoes(id) on delete cascade,
  lead_id    uuid not null references leads(id) on delete cascade,
  codigo     text not null,
  desconto   integer not null,
  status     text not null default 'pendente'
             check (status in ('pendente','criado','falhou','usado')),
  erro       text,
  criado_em  timestamptz not null default now(),
  usado_em   timestamptz,
  unique (conexao_id, codigo)
);
alter table cupons add column if not exists tipo text not null default 'percentual'
  check (tipo in ('percentual','frete'));

create index if not exists cupons_lead_idx   on cupons(lead_id);
create index if not exists cupons_status_idx on cupons(status, criado_em desc);

-- Lote pre-cadastrado, usado pela Loja Integrada, que nao expoe endpoint de
-- cupom na v1 publica. Um codigo sai do lote por lead, nunca dois.
create table if not exists lote_cupons (
  id         uuid primary key default gen_random_uuid(),
  conta_id   uuid not null references contas(id) on delete cascade,
  conexao_id uuid not null references conexoes(id) on delete cascade,
  codigo     text not null,
  lead_id    uuid references leads(id) on delete set null,
  usado_em   timestamptz,
  criado_em  timestamptz not null default now(),
  unique (conexao_id, codigo)
);
create index if not exists lote_disponivel_idx on lote_cupons(conexao_id) where lead_id is null;

-- --------------------------------------------------------------- eventos ---

-- rede_mascarada guarda a rede, nunca o IP inteiro (LGPD).
-- lead_id comeca nulo e e preenchido na costura, quando o anonimo se
-- identifica. A costura casa por (conexao_id, anonimo_id), nunca so por
-- anonimo_id, senao navegacao de uma pessoa aparece no perfil de outra.
create table if not exists eventos (
  id             bigserial primary key,
  conta_id       uuid not null references contas(id) on delete cascade,
  conexao_id     uuid not null references conexoes(id) on delete cascade,
  anonimo_id     text not null,
  lead_id        uuid references leads(id) on delete cascade,
  tipo           text not null,
  url            text,
  titulo         text,
  dados          jsonb not null default '{}'::jsonb,
  rede_mascarada text,
  criado_em      timestamptz not null default now()
);
create index if not exists eventos_costura_idx on eventos(conexao_id, anonimo_id);
create index if not exists eventos_lead_idx    on eventos(lead_id, criado_em);
create index if not exists eventos_conta_idx   on eventos(conta_id, criado_em desc);

-- --------------------------------------------------------------- pedidos ---

-- Atribuicao de faturamento. Chega por webhook onde a plataforma tem, e por
-- varredura de 30 em 30 minutos na Loja Integrada, que nao tem.
create table if not exists pedidos (
  id            uuid primary key default gen_random_uuid(),
  conta_id      uuid not null references contas(id) on delete cascade,
  conexao_id    uuid not null references conexoes(id) on delete cascade,
  id_externo    text not null,
  valor         numeric(12,2) not null default 0,
  cupom_codigo  text,
  lead_id       uuid references leads(id) on delete set null,
  feito_em      timestamptz not null,
  criado_em     timestamptz not null default now(),
  unique (conexao_id, id_externo)
);
create index if not exists pedidos_conta_idx on pedidos(conta_id, feito_em desc);
create index if not exists pedidos_lead_idx  on pedidos(lead_id);

-- -------------------------------------------------------------- cobranca ---

create table if not exists assinaturas (
  id          uuid primary key default gen_random_uuid(),
  conta_id    uuid not null references contas(id) on delete cascade,
  plano       text not null check (plano in ('essencial','crescimento','escala')),
  ciclo       text not null default 'mensal' check (ciclo in ('mensal','anual')),
  status      text not null default 'ativa'
              check (status in ('ativa','cancelada','pausada')),
  origem      text not null default 'asaas' check (origem in ('asaas','kiwify','manual')),
  id_externo  text,
  inicio_em   timestamptz not null default now(),
  fim_em      timestamptz,
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists assinaturas_conta_idx on assinaturas(conta_id);

-- A regua de inadimplencia le daqui. A Kiwify escreve nesta tabela como
-- qualquer outra origem, mas quem decide o acesso e sempre src/billing/acesso.js,
-- a partir da cobranca vencida mais antiga em aberto.
create table if not exists cobrancas (
  id            uuid primary key default gen_random_uuid(),
  conta_id      uuid not null references contas(id) on delete cascade,
  assinatura_id uuid references assinaturas(id) on delete set null,
  tipo          text not null default 'assinatura'
                check (tipo in ('assinatura','implantacao')),
  valor         numeric(12,2) not null,
  status        text not null default 'aberta'
                check (status in ('aberta','paga','cancelada','estornada')),
  origem        text not null default 'asaas' check (origem in ('asaas','kiwify','manual')),
  id_externo    text,
  vence_em      date not null,
  pago_em       timestamptz,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (origem, id_externo)
);
create index if not exists cobrancas_conta_idx  on cobrancas(conta_id, vence_em);
create index if not exists cobrancas_aberta_idx on cobrancas(conta_id, vence_em) where status = 'aberta';

-- ------------------------------------------------------------- operacao ----

-- Alerta operacional. Cupom que falha e lead entregue sem a recompensa
-- prometida, e webhook de cobranca que nao processa vira cliente cortado
-- por engano. Os dois precisam aparecer em algum lugar.
create table if not exists alertas (
  id         bigserial primary key,
  conta_id   uuid references contas(id) on delete cascade,
  tipo       text not null,
  gravidade  text not null default 'aviso' check (gravidade in ('aviso','erro')),
  mensagem   text not null,
  dados      jsonb not null default '{}'::jsonb,
  resolvido  boolean not null default false,
  criado_em  timestamptz not null default now()
);
create index if not exists alertas_abertos_idx on alertas(criado_em desc) where resolvido = false;

-- Limite dos endpoints publicos. Contador por janela, em banco, para
-- sobreviver a restart e a mais de um processo.
create table if not exists limites (
  chave     text not null,
  janela    bigint not null,
  contagem  integer not null default 0,
  primary key (chave, janela)
);
