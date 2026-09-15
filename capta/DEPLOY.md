# Colocar o Captapp no ar

Dois hosts no mesmo dominio:

| Host | O que e |
|---|---|
| `capta.lojadoecommerce.com.br` | Landing page, so venda. Nao passa pelo Railway. |
| `captapp.lojadoecommerce.com.br` | O app: painel, API, widget e webhooks. E o que este guia sobe. |

O Cloudflare fica na frente do app e segura o `widget.js`, que e baixado por
todo visitante de toda loja cliente.

## 1. Railway

1. Novo projeto, **Deploy from GitHub repo**, repositório `lde2026/mercadao-mx`.
2. Em Settings do servico, **Root Directory** = `capta`. O `railway.json` e o
   `Dockerfile` ficam ai e o Railway os encontra sozinho.
3. Adicione um **PostgreSQL** ao projeto. Ele expõe `DATABASE_URL` para o
   servico automaticamente.
4. Variaveis do servico (Settings, Variables):

   | Variavel | Valor |
   |---|---|
   | `NODE_ENV` | `production` (liga o cookie Secure e o HSTS) |
   | `PORTA` | `3000` |
   | `URL_PUBLICA` | `https://captapp.lojadoecommerce.com.br` |
   | `CHAVE_CREDENCIAIS` | 32 bytes em hex, gerada uma vez e guardada fora do Railway tambem |
   | `SEGREDO_SESSAO` | segredo longo, gerado uma vez |
   | `ASAAS_API_KEY` | chave do Asaas |
   | `ASAAS_WEBHOOK_TOKEN` | token cadastrado no webhook do Asaas |
   | `ASAAS_BASE` | `https://api.asaas.com/v3` |
   | `EMAIL_PROVEDOR`, `EMAIL_CHAVE`, `EMAIL_REMETENTE` | quando o e-mail estiver ligado |
   | `TRAY_CONSUMER_KEY`, `TRAY_CONSUMER_SECRET` | quando a Tray liberar o aplicativo; callback `https://captapp.lojadoecommerce.com.br/tray/callback` |
   | `NUVEMSHOP_CLIENT_ID`, `NUVEMSHOP_CLIENT_SECRET` | quando o app da Nuvemshop existir; redirecionamento `https://captapp.lojadoecommerce.com.br/nuvemshop/callback` |
   | `OPERADOR_EMAILS` | e-mails de quem administra o Captapp, separados por virgula. So eles veem a tela Admin |
   | `OPERADOR_EMAIL`, `OPERADOR_SENHA_INICIAL` | a conta do operador e criada na primeira subida com esses valores. Troque a senha no painel depois e apague a variavel |

5. Deploy. O container roda `migrar` e depois sobe o servidor; o Railway
   considera saudavel quando `/saude` responder 200, e `/saude` so responde
   200 com o banco alcançavel.

## 2. Dominio e Cloudflare

1. No Railway, Settings, **Custom Domain**: `captapp.lojadoecommerce.com.br`.
   Ele mostra um alvo de CNAME.
2. No Cloudflare, DNS de `lojadoecommerce.com.br`: registro **CNAME**
   `captapp` apontando para o alvo do Railway, com **proxy ligado** (nuvem
   laranja).
3. Em SSL/TLS, modo **Full (strict)**. Em Full simples o Cloudflare aceita
   certificado invalido do lado do Railway.
4. Em Caching, **Cache Rules**, uma regra: se o caminho e `/widget.js` ou
   `/rastreador.js`, **Eligible for cache** respeitando o Cache-Control da
   origem. A origem manda `max-age=3600, stale-while-revalidate=86400`. Para
   forcar uma versao nova antes da hora, **Purge** dessas duas URLs.
5. Tudo que nao e esses dois arquivos passa direto: `/api`, `/w`, `/e` e
   `/webhook` nunca podem ser cacheados. A regra acima ja garante isso por
   nao os incluir, mas confira que nao existe "Cache Everything" no dominio.

## 3. Landing page em capta.lojadoecommerce.com.br

E um arquivo so, `landing/index.html`, sem servidor. O caminho mais simples
e o Cloudflare Pages: novo projeto, conectar o repositorio, **Root
directory** `capta/landing`, sem comando de build, e o dominio customizado
`capta.lojadoecommerce.com.br`. O Pages cria o DNS sozinho.

O video do topo entra pelo atributo `data-url` do bloco `#video`: cole o
link de incorporacao do YouTube (`https://www.youtube.com/embed/ID`) ou do
Vimeo. Vazio, o quadro fica como convite.

## 4. Asaas

Com o dominio no ar, cadastre o webhook em `https://captapp.lojadoecommerce.com.br/webhook/asaas`
como descrito no `SETUP.md`, e rode `npm run asaas:teste` na sua maquina
com a chave de producao para confirmar que ela e valida.

## 5. Backup

Os leads dos clientes estao no banco. Sem backup nao ha produto.

- O Postgres do Railway tem backup proprio nos planos pagos; ligue e confira
  a retencao.
- Alem dele, `npm run backup` gera um dump comprimido com `pg_dump`. Rode
  de uma maquina sua, todo dia, com `DATABASE_URL` apontando para o banco
  de producao (a URL publica esta em Variables do Postgres no Railway), e
  guarde o arquivo fora do Railway. Precisa do `pg_dump` instalado.
- Guarde a `CHAVE_CREDENCIAIS` junto do backup, em outro lugar. Sem ela o
  dump restaura os leads, mas as credenciais das lojas ficam ilegiveis e
  cada cliente precisa reconectar a loja na mao.

## 6. Conferencia depois do primeiro deploy

```
curl https://captapp.lojadoecommerce.com.br/saude
curl -I https://captapp.lojadoecommerce.com.br/widget.js?k=x | grep -i "cache-control\|cf-cache-status"
```

A primeira tem que responder `{"ok":true,"banco":true}`. Na segunda,
`cf-cache-status: HIT` na segunda chamada confirma o Cloudflare segurando o
widget.

Entre no painel, crie a primeira conta, e rode `npm run hoje` apontando
para producao para ver a tabela vazia. A partir dai, e lojista de verdade.

## 7. O que ainda depende de gente, nao de codigo

| Item | Onde |
|---|---|
| Programa de parceiros da Tray: cadastro do app com callback `https://captapp.lojadoecommerce.com.br/tray/callback`, chaves por e-mail, loja de teste e homologacao por chamado | `docs/tray-api.md` |
| App na Nuvemshop com redirecionamento `https://captapp.lojadoecommerce.com.br/nuvemshop/callback` | painel de parceiros da Nuvemshop |
| Webhook `order` da Tray por chamado no suporte, apontando para `/webhook/loja/<chave>` | `docs/tray-api.md` |
| Provedor de e-mail (Resend ou Postmark) para lead novo, cobranca, operador e recuperacao de senha | `EMAIL_*` no ambiente |
| Webhook do Asaas e `npm run asaas:teste` | secao 4 |
| Video da landing (`data-url` em `landing/index.html`) | secao 3 |

Sem essas chaves o produto funciona: conexao manual por token, e-mail vira
linha de log e a cobranca fica manual.
