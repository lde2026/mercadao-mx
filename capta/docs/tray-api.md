# API da Tray: o que o Captapp precisa saber

Resumo tirado do plugin oficial da Tray para agentes de IA
(github.com/tray-tecnologia/tray-api-ai-plugin, licenca MIT), que espelha
developers.tray.com.br. Vale como referencia enquanto o site nao e alcancavel
daqui. Tudo que esta marcado como "a confirmar" precisa de uma loja de
homologacao para virar certeza.

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
3. `POST https://{api_address}/auth` com JSON `{consumer_key, consumer_secret, code}`.
   Resposta 201 com `access_token`, `refresh_token`,
   `date_expiration_access_token`, `date_expiration_refresh_token`, `store_id`.

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

Frete gratis e em dois passos: criar o cupom com
`freight_application=frete_gratis` (e `value=0`, `type=$`) e depois
`POST /discount_coupons/create_relationship/{id}` com JSON
`{"DiscountCouponShipping": {"value": "0"}}`. Sem `shipping_id` vale para os
metodos elegiveis da loja. Marcado como "nao verificado em sandbox" no
proprio plugin, entao e o primeiro item da homologacao.

Nao existe campo `active`. Para desligar um cupom, encurtar `ends_at`.

## Scripts na vitrine: `/scripts`

Existe API, nao precisa colar tag a mao.

- `GET /scripts`, `POST /scripts`, `PUT /scripts/:id`, `DELETE /scripts/:id`.
- Corpo: `{"Script": {"url": "https://...", "location": "footer", "active": 1}}`.
- `location` aceita `head`, `body` ou `footer`. HTTPS obrigatorio.

## Pedidos: `/orders`

- `GET /orders` com `limit`, `page` e filtros `status`, `created_at`,
  `updated_at`, `customer_id`. `GET /orders/:id/full` traz produtos, cliente,
  pagamento e frete.
- Campos do pedido: `id`, `status_id`, `client_id`, `total_amount`,
  `coupon_code`, `discount`, `created_at`, `updated_at`. Os exemplos do
  plugin usam `Orders[].Order`.
- Nao existe webhook de pagamento. A confirmacao chega pelo escopo `order`
  em `update`, e o pedido tem `status_id` apontando para o catalogo de
  `GET /orders/statuses` (`type` = `open`, `closed` ou `cancelled`).

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

## O que falta para homologar

- Um aplicativo criado no painel de parceiros da Tray (consumer_key e
  consumer_secret) e uma loja de teste que autorize esse aplicativo.
- Rede liberada para o dominio da loja de teste (`*.commercesuite.com.br`
  ou o dominio proprio dela).
- Chamado no suporte da Tray pedindo o webhook `order` para a URL do app.
