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
-- Teste de 7 dias. A data fica na conta e nao na assinatura porque o teste
-- acontece ANTES de existir assinatura: e justamente a janela em que a pessoa
-- usa sem ter escolhido plano. Nula significa conta antiga, de antes desta
-- regra, e essas nao perdem nada.
alter table contas add column if not exists teste_ate timestamptz;

alter table contas add column if not exists email_aviso text;
alter table contas add column if not exists whatsapp text;
alter table contas add column if not exists avisar_lead boolean not null default true;

-- Conexao de loja iniciada por OAuth e ainda sem dono.
--
-- A troca do code pelo token acontece na callback da plataforma, antes de
-- saber qual conta do Captapp vai ficar com a loja. O token fica AQUI,
-- cifrado, e o que viaja ate o painel e so este id. Assim a credencial da
-- loja nunca entra numa URL, nunca cai no historico do navegador, e o id e
-- de uso unico: se vazar depois de usado, nao vale mais nada.
create table if not exists conexoes_pendentes (
  id          uuid primary key default gen_random_uuid(),
  plataforma  text not null,
  credenciais text not null,
  extras      jsonb not null default '{}'::jsonb,
  expira_em   timestamptz not null,
  usado_em    timestamptz,
  criado_em   timestamptz not null default now()
);
create index if not exists conexoes_pendentes_expira_idx on conexoes_pendentes(expira_em);

-- Aceite dos termos. Guardar a versao junto da data e o que foi aceito: sem
-- isso, "o cliente aceitou" nao prova nada depois que o texto mudar. A rede
-- vai mascarada, pela mesma razao que o evento do visitante nao guarda IP.
alter table contas add column if not exists termos_versao text;
alter table contas add column if not exists termos_aceitos_em timestamptz;
alter table contas add column if not exists termos_rede text;

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

-- Quem entrou na conta do cliente como operador. Sem esta coluna, a sessao de
-- personificacao e indistinguivel da do lojista, e o log das acoes seguintes
-- (inclusive a exportacao da base de leads) sai so com o id da conta dele.
alter table sessoes add column if not exists operador_id uuid references contas(id) on delete set null;

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
  -- 'outra' e qualquer loja fora das quatro que integram: Shopify, VTEX,
  -- Magento, Wix, site proprio. O widget e uma tag de script, entao funciona
  -- em todas; o que nao existe e API, e o adaptador diz isso na cara.
  plataforma      text not null check (plataforma in ('nuvemshop','woocommerce','tray','loja_integrada','outra')),
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

-- O create table acima so vale em banco novo: onde a tabela ja existe, o
-- check nasceu com a lista antiga de plataformas e nenhum `if not exists`
-- atualiza uma restricao. Sem este bloco, o banco de producao recusaria a
-- plataforma nova e o defeito so apareceria na primeira loja cadastrada.
alter table conexoes drop constraint if exists conexoes_plataforma_check;
alter table conexoes add constraint conexoes_plataforma_check
  check (plataforma in ('nuvemshop','woocommerce','tray','loja_integrada','outra'));

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

-- Formato do widget. chat e o popup em balões no meio da tela, e e o padrao
-- porque e o que converte: ocupa a tela e a pessoa responde. painel e a
-- janela compacta no canto, para loja que nao quer interromper a navegacao.
-- Muda so a aparencia: a ordem das perguntas e a mesma nos dois, a do quadro
-- do painel. abrir_apos em segundos abre sozinho uma vez por navegador; zero
-- desliga.
alter table fluxos add column if not exists modo text not null default 'chat'
  check (modo in ('painel','chat'));
-- O add acima nao roda em banco que ja tem a coluna, e foi assim que ela
-- nasceu com 'painel'. O default novo precisa ser dito em separado. Linha
-- nenhuma muda de valor: quem ja escolheu continua com o que escolheu.
alter table fluxos alter column modo set default 'chat';
alter table fluxos add column if not exists abrir_apos integer not null default 0
  check (abrir_apos between 0 and 120);
-- Cor do botao e do cabecalho do widget, em hex. Nula usa o preto padrao.
alter table fluxos add column if not exists cor text
  check (cor is null or cor ~ '^#[0-9a-fA-F]{6}$');

-- Aparencia e lugar do botao flutuante na loja.
--
-- retangular e o botao com o texto do convite, que e o que existia antes e
-- por isso e o padrao: loja ja instalada nao pode mudar de cara sozinha num
-- deploy. redondo e so o icone, para quem nao quer texto sobre a vitrine.
--
-- A posicao e lado mais altura, porque e assim que o lojista pensa ("canto
-- inferior direito"), e porque o canto errado cobre o botao de comprar de
-- alguns temas, que e o motivo real desta opcao existir.
alter table fluxos add column if not exists botao_formato text not null default 'retangular'
  check (botao_formato in ('retangular','redondo'));
alter table fluxos add column if not exists botao_posicao text not null default 'direita-inferior'
  check (botao_posicao in ('direita-inferior','direita-central','direita-superior',
                           'esquerda-inferior','esquerda-central','esquerda-superior'));

create unique index if not exists fluxos_conexao_idx on fluxos(conexao_id);

-- Teto de perguntas no banco, nao so na tela. A de contato nao vive nesta
-- tabela: ela vem sempre junto e nao pode ser removida.
create table if not exists perguntas (
  id        uuid primary key default gen_random_uuid(),
  fluxo_id  uuid not null references fluxos(id) on delete cascade,
  ordem     integer not null check (ordem between 1 and 6),
  texto     text not null,
  opcoes    jsonb not null default '[]'::jsonb,
  criado_em timestamptz not null default now(),
  unique (fluxo_id, ordem)
);
-- O create table acima nao roda em banco que ja tem a tabela, e foi assim que
-- a trava nasceu em tres. Em loja de ticket alto tres perguntas qualificavam
-- de menos, e o teto novo precisa ser dito em separado.
alter table perguntas drop constraint if exists perguntas_ordem_check;
alter table perguntas add constraint perguntas_ordem_check check (ordem between 1 and 6);

-- Relatorio semanal por e-mail.
--
-- relatorio_em guarda o ultimo envio, e e o que impede a enxurrada: a tarefa
-- roda de hora em hora e so manda para quem nao recebe ha sete dias. Assim o
-- relatorio cai sempre no mesmo dia da semana em que o primeiro caiu, sem
-- precisar de fuso nem de agenda.
alter table contas add column if not exists relatorio_em timestamptz;
alter table contas add column if not exists relatorio_semanal boolean not null default true;

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
  -- 'escala' saiu da oferta quando os planos viraram dois. Continua aceito
  -- aqui para nao invalidar assinatura antiga; nada novo e criado com ele.
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

-- --------------------------------------------------------- atendimento ----

-- Base de conhecimento do atendimento no WhatsApp.
--
-- O agente que responde o cliente final nao vive aqui: ele e servico
-- separado e le esta base por uma rota interna. O que o Capta guarda e a
-- fonte, e quem edita passa a ser o proprio lojista, em vez de alguem da
-- nossa equipe mexendo na mao.
--
-- Uma base por conta, e a unicidade esta no banco: duas bases para a mesma
-- loja significa o agente respondendo por uma enquanto o lojista edita a
-- outra, sem ninguem perceber qual esta no ar.
create table if not exists bases_conhecimento (
  id                    uuid primary key default gen_random_uuid(),
  conta_id              uuid not null unique references contas(id) on delete cascade,
  nome_loja             text not null default '',
  segmento              text not null default '',
  -- Lista de {regiao, prazo}: prazo de entrega nao e um numero so, muda de
  -- Sudeste para Norte, e e a pergunta que mais chega no atendimento.
  prazos_entrega        jsonb not null default '[]'::jsonb,
  formas_pagamento      jsonb not null default '[]'::jsonb,
  politica_troca        text not null default '',
  horario_atendimento   text not null default '',
  link_site             text not null default '',
  -- Nulo quer dizer que a loja nao tem frete gratis, que e diferente de
  -- zero, que seria frete gratis em qualquer valor.
  frete_gratis_acima    numeric(12,2),
  tom_de_voz            text not null default '',
  perguntas_frequentes  text not null default '',
  observacoes           text not null default '',
  atualizado_em         timestamptz not null default now(),
  criado_em             timestamptz not null default now()
);

-- Historico. Cada gravacao guarda o conteudo ANTERIOR inteiro, nao o diff:
-- restaurar precisa funcionar daqui a um ano, com campo novo que ainda nao
-- existe hoje, e remontar estado a partir de uma pilha de diffs e onde esse
-- tipo de funcionalidade costuma quebrar.
--
-- conta_id repetido de proposito, mesmo dando para chegar nele pela base: e
-- o que deixa toda consulta filtrar por conta sem depender de join, que e a
-- regra do projeto inteiro.
create table if not exists base_versoes (
  id                uuid primary key default gen_random_uuid(),
  conta_id          uuid not null references contas(id) on delete cascade,
  base_id           uuid not null references bases_conhecimento(id) on delete cascade,
  conteudo          jsonb not null,
  autor_email       text,
  autor_operador_id uuid,
  origem            text not null check (origem in ('formulario','chat','restauracao')),
  criado_em         timestamptz not null default now()
);
create index if not exists base_versoes_conta_idx on base_versoes(conta_id, criado_em desc);

-- Conversa do chat de comando, por conta.
--
-- A proposta do assistente mora aqui, nao na memoria do servidor: ela precisa
-- sobreviver a um F5 e a um restart entre o "proponho isto" e o "confirmo".
-- Estado pendente e o unico que pode virar gravacao, e so o mais recente da
-- conta, para um confirmar atrasado nao aplicar uma proposta velha.
create table if not exists base_mensagens (
  id          uuid primary key default gen_random_uuid(),
  conta_id    uuid not null references contas(id) on delete cascade,
  papel       text not null check (papel in ('lojista','assistente')),
  texto       text not null,
  proposta    jsonb,
  estado      text not null default 'conversa'
              check (estado in ('conversa','pendente','confirmada','descartada')),
  autor_email text,
  criado_em   timestamptz not null default now()
);
create index if not exists base_mensagens_conta_idx on base_mensagens(conta_id, criado_em);

-- Quem enxerga o modulo. Desligado por padrao: o atendimento e vendido a
-- parte, e modulo vazio na barra de quem nao assina vira chamado de suporte.
alter table contas add column if not exists modulo_atendimento boolean not null default false;
alter table contas add column if not exists faixa_atendimento text;
alter table contas add column if not exists numero_atendimento text;

-- A pausa do atendimento.
--
-- Fica na conta e nao na base: nao e conhecimento, e estado de operacao. Na
-- base ela entraria no historico de versoes e poderia voltar sozinha numa
-- restauracao, que e o jeito mais silencioso de religar um atendimento que o
-- lojista tinha desligado de proposito.
alter table contas add column if not exists atendimento_pausado boolean not null default false;
alter table contas add column if not exists atendimento_recado text;

-- O numero que o lojista diz ser dele.
--
-- Separado do numero_atendimento de proposito. Este e pedido; aquele e o que
-- decide de quem e a conversa que chega. Se o lojista escrevesse direto no
-- que roteia, bastaria ele digitar o numero do vizinho para receber a base e
-- as conversas da outra loja. Quem confirma somos nos, na ativacao, que e
-- servico pago e passa por nos de qualquer jeito.
alter table contas add column if not exists numero_solicitado text;

-- O numero decide de quem e a conversa que chega no WhatsApp. Dois donos para
-- o mesmo numero seria o agente escolhendo no par ou impar qual base usar, e
-- uma loja respondendo com a politica de troca da outra. Indice parcial
-- porque a maioria das contas nunca tem numero.
create unique index if not exists contas_numero_atendimento_idx
  on contas (numero_atendimento) where numero_atendimento is not null;

-- O medidor do Atende Ai.
--
-- Uma linha por conta e por mes, e nao uma linha por mensagem: o que a fatura
-- precisa saber e quantas o agente mandou na competencia, nao quais. Guardar
-- cada mensagem seria guardar conversa de cliente final dentro do Capta sem
-- precisar, e isso e dado pessoal que nao e nosso.
create table if not exists consumo_atendimento (
  conta_id uuid not null references contas(id) on delete cascade,
  competencia date not null,
  enviadas integer not null default 0,
  atualizado_em timestamptz not null default now(),
  primary key (conta_id, competencia)
);

/*
 * Os atendimentos que chegam pelo WhatsApp.
 *
 * O agente roda fora daqui e e ele quem fala com o cliente final. Isto e o
 * espelho dessas conversas no painel, e existe por um motivo so: sem ele o
 * lojista nao sabe quem ja foi atendido, quem ficou pela metade e em quem
 * ele precisa entrar. O numero do cliente fica aqui porque e a chave da
 * conversa, mas ele nunca vai para log.
 */
create table if not exists atendimentos (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references contas(id) on delete cascade,
  cliente text not null,
  nome text,
  estado text not null default 'ia',
  ultima_fala text,
  ultima_em timestamptz not null default now(),
  falas integer not null default 0,
  aberto_em timestamptz not null default now(),
  assumido_em timestamptz
);
create unique index if not exists atendimentos_conta_cliente_idx
  on atendimentos (conta_id, cliente);
create index if not exists atendimentos_conta_ultima_idx
  on atendimentos (conta_id, ultima_em desc);

create table if not exists atendimento_falas (
  id uuid primary key default gen_random_uuid(),
  atendimento_id uuid not null references atendimentos(id) on delete cascade,
  conta_id uuid not null references contas(id) on delete cascade,
  direcao text not null,
  texto text not null,
  criado_em timestamptz not null default now()
);
create index if not exists atendimento_falas_idx
  on atendimento_falas (atendimento_id, criado_em);

/*
 * A cobranca do Atende Ai.
 *
 * A assinatura dele nao entra na tabela assinaturas porque aquela e dos
 * planos do Capta, com cota de leads e de lojas que nao existem aqui. O que
 * define o preco e a faixa que ja esta na conta; o que falta e o ciclo e o
 * id da assinatura no Asaas, para trocar de faixa sem criar duas cobrando
 * junto.
 */
alter table contas add column if not exists ciclo_atendimento text;
alter table contas add column if not exists assinatura_atendimento text;

/*
 * Os dois tipos novos de cobranca: a ativacao, que e unica, e o excedente,
 * que e por mes e so existe quando a loja passou do teto da faixa.
 *
 * A regua de inadimplencia nao muda com isso: ela corta rastreamento, widget
 * e script, que sao coisas do Capta. Quem assina so o Atende Ai e atrasa
 * recebe o aviso no painel e o agente continua respondendo os clientes dele,
 * porque quem ficaria no vacuo seria o consumidor final, que nao tem nada a
 * ver com a fatura.
 */
alter table cobrancas drop constraint if exists cobrancas_tipo_check;
alter table cobrancas add constraint cobrancas_tipo_check
  check (tipo in ('assinatura','implantacao','ativacao','excedente'));

/*
 * Marca que o excedente daquele mes ja virou fatura.
 *
 * Sem isto, a tarefa que fecha o mes criaria uma cobranca nova a cada vez que
 * rodasse, e ela roda de seis em seis horas: o lojista receberia quatro
 * faturas por dia do mesmo excedente.
 */
alter table consumo_atendimento add column if not exists excedente_cobrado boolean not null default false;

/*
 * A fila de saida: o que o lojista escreveu no painel e ainda nao foi enviado.
 *
 * Ela existe porque quem fala com o cliente final e o agente, nao o painel.
 * O painel enfileira e o agente envia. Enquanto nao sair, a mensagem aparece
 * como aguardando: dizer "enviado" antes de o WhatsApp ter recebido faria o
 * lojista achar que respondeu quando nao respondeu.
 */
create table if not exists atendimento_saida (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references contas(id) on delete cascade,
  atendimento_id uuid not null references atendimentos(id) on delete cascade,
  texto text not null,
  criado_em timestamptz not null default now(),
  entregue_em timestamptz
);
create index if not exists atendimento_saida_fila_idx
  on atendimento_saida (conta_id, criado_em) where entregue_em is null;
