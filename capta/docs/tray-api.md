# API da Tray: o que o Captapp precisa saber

Resumo conferido contra a documentacao oficial de developers.tray.com.br
(captura de 15/09/2026 enviada pelo Pierre) e contra o plugin oficial da
Tray para agentes de IA (github.com/tray-tecnologia/tray-api-ai-plugin).
Onde os dois divergem, vale a documentacao oficial, e a divergencia esta
anotada. Tudo continua sujeito a homologacao na loja de teste da Tray.

## Regras que valem para toda chamada

- URL base por loja: `https://{api_address}/recurso`. O `api_address` chega no
  callback do OAuth e JA inclui `/web_api` (ex.: `loja.commercesuite.com.br/web_api`).
  Guardar sem o `/web_api` da 404 em tudo.
- `access_token` sempre como query string `?access_token=...`. Header
  `Authorization` nao funciona e volta 401.
- Corpo de POST e PUT envolvido na chave do recurso em PascalCase singular:
  `{"DiscountCoupon": {...}}`, `{"Customer": {...}}`, `{"Script": {...}}`.
- Listagens: `limit` maximo 50 (padrao 30), `page`, total em `paging.total`.
- Datas `YYYY-MM-DD`, horarios `YYYY-MM-DD HH:MM:SS` sem fuso (Brasilia).
- Limite: 180 chamadas por minuto e 10.000 por dia por loja. 429 pede
  espera crescente (1s, 2s, 4s, 8s).

## Autorizacao (OAuth em 3 passos)

1. Redirecionar o lojista para
   `https://{dominio_loja}/auth.php?response_type=code&consumer_key={key}&callback={url}`.
2. A Tray volta na callback com `code`, `adm_user`, `store` e `api_address`.
3. `POST https://{api_address}/auth` com `consumer_key`, `consumer_secret` e
   `code` em form-urlencoded (o exemplo oficial usa `--data-urlencode`).
   Resposta 200 ou 201 com `access_token`, `refresh_token`,
   `date_expiration_access_token`, `date_expiration_refresh_token`,
   `api_host` e `store_id`. Guardar tudo.

Antes disso, o fluxo de instalacao: o lojista instala o app em Meus
Aplicativos, a Tray abre a URL de callback cadastrada (HTTPS, dentro de um
iframe do painel) com `url`, `adm_user` e `store`. Essa pagina mostra o app e
um botao "Instalar agora" que manda para o `auth.php` do passo 1. Depois de
autorizado uma vez, a tela de autorizacao nao aparece de novo.

Renovar: `GET https://{api_address}/auth?refresh_token={refresh_token}`.
Resposta 200 com par novo de tokens e datas.

| Token | Vida |
|---|---|
| access_token | 3 horas |
| refresh_token | 30 dias; vencido, so refazendo o OAuth inteiro |

Erros 401 vem com `error_code`: 1000 token vencido e loja ativa, 1001 loja
bloqueada, 1002 loja inativa, 1003 loja cancelada, 1099 token invalido.

## Cupons: `/discount_coupons`

Endpoint e `/discount_coupons`, chave `DiscountCoupon` (nao `Coupon`).
Criacao aceita `application/x-www-form-urlencoded` com campos no formato
`["DiscountCoupon"]["campo"]` (ou o JSON equivalente).

Obrigatorios na criacao: `code`, `description`, `value`, `type`.

| Campo | Valores |
|---|---|
| `type` | `%` percentual ou `$` valor fixo em reais |
| `value` | decimal, ex. `10.00` |
| `coupon_type` | `loja` (generico), `cliente`, `troca`, `presente` |
| `local_application` | `loja`, `produtos`, `categorias`, `marcas` |
| `freight_application` | `nao_aplicavel`, `desconto`, `frete_gratis` |
| `usage_counter_limit` | limite total de usos |
| `usage_counter_limit_customer` | limite por cliente, tem que ser <= o total |
| `starts_at`, `ends_at` | validade `YYYY-MM-DD` |
| `value_start` | valor minimo do pedido |

Resposta de sucesso: `{"message":"Created","id":"1","code":201}`.

Campos vazios em `value_start`, `value_end`, `usage_counter_limit` e
`usage_counter_limit_customer` significam "sem limite". Os dois limites de
uso precisam estar alinhados: para 1 uso por cliente, mandar 1 nos dois ou
deixar o geral vazio.

Cupom generico sem nenhum relacionamento vale para toda a loja e todos os
clientes. Relacionamentos vao em
`POST /discount_coupons/create_relationship/{id}` (JSON, ate 100 registros
por chamada), e a chave do corpo define o tipo:

| Chave | Efeito |
|---|---|
| `DiscountCouponShipping: [{shipping_id}]` | frete gratis nas formas de envio listadas |
| `DiscountCouponShipping: {value: "10"}` | R$ 10 de desconto no frete, sempre em reais |
| `DiscountCouponCustomer: [{customer_id}]` | restringe a clientes |
| `DiscountCouponProduct`, `Category`, `Brand` | restringe a produtos, categorias ou marcas |

Frete gratis, portanto, e em tres chamadas: `GET /shippings` para pegar os
ids das formas de envio ativas (`status=1`), `POST /discount_coupons` com
`value=0` e `type=$`, e o `create_relationship` com a lista de `shipping_id`.
O plugin sugeria `{value: "0"}` como frete gratis; a documentacao oficial
nao diz isso, entao seguimos a lista de `shipping_id`.

Nao existe campo `active`. Para desligar um cupom, encurtar `ends_at`.

## Scripts na vitrine: `/external_scripts`

Existe API, nao precisa colar tag a mao. Atencao: o plugin descreve
`/scripts` com `Script.url`, mas a documentacao oficial e outra.

- `GET /external_scripts`, `POST /external_scripts`,
  `PUT /external_scripts/:id`, `DELETE /external_scripts/:id`.
- Corpo: `{"ExternalScript": {"source": "https://.../widget.js?k=..."}}`.
  So o campo `source`; nao ha posicao nem flag de ativo.
- Resposta `{"message":"Created","id":"123","code":201}`. Guardar o `id`
  para o DELETE do dia 45 da regua.

## Pedidos: `/orders`

Aqui o plugin errou os nomes; os da documentacao oficial sao estes.

- `GET /orders` com `limit` (max 50), `page`, `sort` e filtros `status`,
  `modified` (`aaaa-mm-dd` ou `inicio,fim`), `date`, `payment_date`,
  `has_payment`, `discount_coupon`, `customer_id`.
- Lista vem em `Orders[].Order`. Campos: `id`, `status` (texto, ex.
  `A ENVIAR`), `date`, `total`, `discount`, `discount_coupon`
  (texto `codigo/valor`, ex. `natal25/8999.75`), `coupon.code`,
  `coupon.discount`, `modified`, `has_payment`, `payment_date`, e
  `OrderStatus.type` (`open`, `closed`, `cancelled`).
- `GET /orders/:id/complete` traz produtos, cliente, pagamento e frete
  (`Payment[].Payment` com `value`, `date` e `status`).
- Para atribuir venda a cupom: filtrar `modified` desde a ultima varredura,
  considerar pago quando `has_payment=1`, ler `coupon.code`.
- Nao existe webhook de pagamento. A confirmacao chega pelo escopo `order`
  em `update`, e ai se consulta o pedido na API.

## Webhooks

- Ativacao por chamado no suporte da Tray, informando a URL. Por padrao so
  o escopo `order` e liberado.
- POST `application/x-www-form-urlencoded` com `seller_id`, `scope_id`,
  `scope_name`, `act` (`insert`, `update`, `delete`), `app_code`,
  `url_notification`. Nao ha assinatura: conferir `seller_id` contra a
  loja conectada e buscar o pedido na API antes de acreditar em algo.
- Qualquer resposta diferente de 200 gera reenvio com intervalo crescente.

## Loja: `GET /info`

Com token devolve `id`, `name`, `cnpj`, `uri`, `secure_uri`, `internal_status`.
Sem token devolve so `id`, `uri` e `secure_uri`. Nao existe `/store`.

## Como a Tray libera um aplicativo

1. Credenciamento como parceiro pelo formulario em tray.com.br/quero-ser-parceiro.
2. Cadastro do aplicativo: nome, descricoes, logo, URL de callback em HTTPS,
   id da loja, video e ate 3 imagens, mais dados do integrador e do
   responsavel tecnico. A Tray analisa e manda consumer_key e
   consumer_secret por e-mail.
3. Nao ha sandbox. A Tray da usuario e senha de uma loja de teste
   compartilhada entre todos os integradores.
4. Homologacao: abrir chamado "Homologacao <nome do app>" com evidencias
   (URL, JSON e retorno) de cada chamada usada. O app precisa consumir ao
   menos 2 POST e 2 PUT em 2 recursos; se usar menos, completar via Postman.
5. App pontual (so para algumas lojas) precisa de chamado pedindo liberacao
   por loja. App para toda a base aparece em Meus Aplicativos.
6. Webhook: chamado no atendimento (TRAY DESENVOLVEDORES > INTEGRACOES API)
   com nome do app e URL de notificacao. So o escopo `order` vem por padrao.

## O que falta para homologar o Captapp

- Passos 1 e 2 acima, com callback `https://captapp.lojadoecommerce.com.br/tray/callback`.
- Rede liberada para o dominio da loja de teste (`*.commercesuite.com.br`).
- Chamado do webhook `order` apontando para `/webhook/loja/<chave>`.
- Para o requisito de 2 PUT: o app so faz PUT no cupom (encurtar `ends_at`)
  e no script. Se a Tray exigir mais, completar via Postman como a doc permite.
