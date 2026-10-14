# Colocar o Captapp no ar

Dois hosts no mesmo dominio:

| Host | O que e |
|---|---|
| `capta.lojadoecommerce.com.br` | Landing page, so venda. Mesmo servico do Railway, escolhido pelo Host. |
| `captapp.lojadoecommerce.com.br` | O app: painel, API, widget e webhooks. E o que este guia sobe. |

O Cloudflare fica na frente do app e segura o `widget.js`, que e baixado por
todo visitante de toda loja cliente.

## 1. Railway

1. Novo projeto, **Deploy from GitHub repo**, repositório `lde2026/mercadao-mx`.
2. Em Settings do servico, **Root Directory** = `capta`. O `railway.json` e o
   `Dockerfile` ficam ai e o Railway os encontra sozinho.
3. Adicione um **PostgreSQL** ao projeto. Ele expõe `DATABASE_URL` para o
   servico automaticamente.
4. Variaveis do servico (Settings, Variables). Para montar o bloco sem errar,
   rode **na sua maquina**:

   ```
   sh scripts/variaveis-railway.sh
   ```

   Ele gera as duas chaves aleatorias, pergunta a senha inicial do operador
   sem ecoar na tela, imprime o bloco pronto para colar e guarda uma copia em
   `~/captapp-segredos.txt`, legivel so por voce. As chaves nao podem ser
   digitadas na mao nem reaproveitadas de outro projeto, e a
   `CHAVE_CREDENCIAIS` precisa sobreviver a perda do Railway.

   As variaveis, uma a uma:

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
   | `TRAY_DOMINIOS` | loja Tray em dominio proprio, uma por virgula |
   | `DATABASE_SSL` | vazio no Postgres do Railway (rede privada). `1` em banco gerenciado de fora, como Supabase, Neon ou RDS. Ver secao 1.1 |
   | `PROXY_SALTOS` | **2** no Railway sem Cloudflare na frente. Confira depois de subir, pela secao 6 |
   | `CONFIAR_CLOUDFLARE` | so com o Cloudflare na frente. Ver secao 9.1 |
   | `NUVEMSHOP_CLIENT_ID`, `NUVEMSHOP_CLIENT_SECRET` | quando o app da Nuvemshop existir; redirecionamento `https://captapp.lojadoecommerce.com.br/nuvemshop/callback` |
   | `OPERADOR_EMAILS` | e-mails de quem administra o Captapp, separados por virgula. So eles veem a tela Admin |
   | `OPERADOR_EMAIL`, `OPERADOR_SENHA_INICIAL` | a conta do operador e criada na primeira subida com esses valores. Troque a senha no painel depois e apague a variavel |

5. Deploy. O container roda `migrar` e depois sobe o servidor; o Railway
   considera saudavel quando `/saude` responder 200, e `/saude` so responde
   200 com o banco alcançavel.

### 1.1 Supabase, Neon ou o Postgres do Railway?

O app fala Postgres puro, pela `pg` e uma string de conexao. Qualquer um dos
tres serve, e nao ha nada no codigo que prenda a um deles.

O Postgres do Railway, no mesmo projeto, e o mais simples: a `DATABASE_URL`
aparece sozinha no servico, o trafego nao sai da rede privada da plataforma,
e nao ha um segundo painel para administrar.

Supabase e Neon ficam do lado de fora. Isso traz duas consequencias:

- **TLS deixa de ser opcional.** A conexao atravessa a internet publica.
  Ponha `DATABASE_SSL=1`. Sem isso, dependendo da string, a conexao pode sair
  em claro e ninguem percebe, porque funciona.
- **A latencia entra em cada consulta.** Escolha a regiao mais perto do app
  (Sao Paulo, no caso do Supabase) ou cada tela do painel paga a ida e volta.

O que faria valer a pena e usar o resto do Supabase: autenticacao, storage,
realtime. O Captapp nao usa nenhum dos tres, tem a propria sessao e o proprio
esquema. Entao a recomendacao e o Postgres do Railway. Se voce ja tem Supabase
e prefere manter tudo num lugar so, tambem funciona, e a unica mudanca e a
`DATABASE_URL` mais o `DATABASE_SSL=1`.

Em qualquer um dos dois, a secao 5 continua valendo: backup e a sua parte.

## 2. Dominio e Cloudflare

As duas entradas de DNS, no painel do Cloudflare, na zona
`lojadoecommerce.com.br`:

| Tipo | Nome | Aponta para | Proxy |
|---|---|---|---|
| CNAME | `captapp` | o alvo que o Railway mostra em Custom Domain | ligado (nuvem laranja) |
| CNAME | `capta` | criado sozinho pelo Cloudflare Pages, secao 3 | ligado |

Nada de registro A: os dois alvos mudam de IP sem avisar.

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

A landing e servida pelo proprio app, escolhida pelo cabecalho Host. Nao ha
segundo servico, segunda conta nem segundo deploy: ela sobe no mesmo commit
que o resto, e o preco escrito na pagina nao envelhece separado do preco
cobrado no produto.

Quem chega por `capta.` ve so a pagina de venda. As rotas de API, widget e
webhook nao sao oferecidas nesse host, e o painel continua em `captapp.`.

Dois passos, uma vez so:

1. **Railway**, no servico do app: Settings, Networking, **Custom Domain**,
   `capta.lojadoecommerce.com.br`. Ele devolve um destino CNAME.
2. **Registro.br**, na zona do dominio: um CNAME `capta` apontando para esse
   destino. Mesma coisa que foi feita para `captapp`.

A variavel `HOST_LANDING` muda quais hosts recebem a landing, separados por
virgula. Sem ela vale `capta.lojadoecommerce.com.br`.

O servidor redireciona http para https sozinho, para os hosts que ele
reconhece. O painel nunca precisou disso porque o Cloudflare esta na frente
dele; a landing foi apontada direto para o Railway, e sem o redirecionamento
o navegador abria em http e carimbava "nao seguro" no endereco, com o
certificado valido e tudo.

Se um dia a landing tambem passar pelo Cloudflare, ligue la **Always Use
HTTPS**: um redirecionamento na borda poupa uma viagem ate o servidor.

O video do topo entra pelo atributo `data-url` do bloco `#video`: cole o
link de incorporacao do YouTube (`https://www.youtube.com/embed/ID`) ou do
Vimeo. Enquanto estiver vazio o bloco sai da pagina, porque um play que nao
toca nada faz o visitante achar que o site esta quebrado.

## 4. Asaas

**O DNS precisa estar propagado antes.** O Asaas testa a URL na hora de salvar
e recusa com "a url informada e invalida" se o dominio ainda nao resolve. Ou
espere a propagacao, ou cadastre primeiro com o endereco `.up.railway.app` e
troque depois.

Cadastre o webhook em `https://captapp.lojadoecommerce.com.br/webhook/asaas`,
com **Tipo de envio: Sequencial**. Nao sequencial entrega fora de ordem, e um
`PAYMENT_RECEIVED` que chega antes do `PAYMENT_CREATED` deixa a cobranca
gravada como aberta: cliente que pagou vira inadimplente para a regua.

Marque so os nove eventos que o codigo trata, nao use "Selecionar Todos":

```
PAYMENT_CREATED     PAYMENT_RECEIVED           PAYMENT_DELETED
PAYMENT_UPDATED     PAYMENT_CONFIRMED          PAYMENT_REFUNDED
PAYMENT_OVERDUE     PAYMENT_RECEIVED_IN_CASH   PAYMENT_CHARGEBACK_REQUESTED
```

As tres variaveis entram juntas, nunca so a chave: sem
`ASAAS_WEBHOOK_TOKEN` o app recusa todo webhook com 401, o Asaas comeca a
penalizar entregas e acaba desativando o webhook sozinho.

Depois, `npm run asaas:teste` na sua maquina confirma que a chave e valida.

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

Depois entre com a sua conta de operador e abra, no navegador,
`https://captapp.lojadoecommerce.com.br/api/admin/rede`. Ele responde de onde
o servidor acha que veio a requisicao:

```json
{"ipVisto":"200.x.x.x","ipDoExpress":"200.x.x.x","saltosConfiaveis":1,
 "confiaCloudflare":true,"cabecalhoCloudflare":"200.x.x.x","protocoloVisto":"https"}
```

`ipVisto` tem que ser o **seu** IP de casa, e `protocoloVisto` tem que ser
`https`.

Como achar o numero certo: `cadeiaEncaminhada` lista os enderecos por onde a
requisicao passou, do visitante para o servidor. Conte quantos sao. No Railway
sem Cloudflare a cadeia tem dois, e `PROXY_SALTOS` e **2**. Com `1`, o servidor
le o endereco do proxio em vez do visitante.

Para saber qual deles e voce, abra meuip.com.br e compare: o seu tem que ser o
**primeiro** da cadeia, e tem que ser o que aparece em `ipVisto` depois do
ajuste.

Enquanto isso estiver errado, todo visitante de toda loja chega ao app com o
mesmo endereco, e todo limite por IP vira um balde so, inclusive o de forca
bruta de senha no painel dos clientes.

Por fim, `npm run hoje` apontando para producao mostra a tabela vazia. A
partir dai, e lojista de verdade.

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

## 8. Paginas juridicas, antes de anunciar

Meta e Google recusam anuncio de pagina sem identificacao da empresa e sem
politica de privacidade acessivel. As tres paginas ja existem em
`landing/`, e sobem junto com o app:

| Endereco | Arquivo |
|---|---|
| `capta.lojadoecommerce.com.br/privacidade` | `landing/privacidade.html` |
| `capta.lojadoecommerce.com.br/termos` | `landing/termos.html` |

### 8.1 Preencher antes de publicar

Os textos tem marcadores em maiusculas. Nenhum deles pode ir ao ar como
esta. Ache todos com `grep -rn PREENCHER_ landing/`:

| Marcador | O que e |
|---|---|
| `PREENCHER_RAZAO_SOCIAL` | Razao social completa, como no cartao CNPJ |
| `PREENCHER_CNPJ` | CNPJ formatado |
| `PREENCHER_ENDERECO_COMPLETO` | Logradouro, numero e CEP |
| `PREENCHER_NOME_ENCARREGADO` | Nome do encarregado de dados (LGPD art. 41) |
| `PREENCHER_PRAZO_EVENTOS` | Por quantos meses guardamos a navegacao registrada |
| `PREENCHER_PRAZO_POS_CANCELAMENTO` | Por quantos dias guardamos os dados apos o cancelamento |

Os dois ultimos sao decisao de negocio, nao de codigo. O que estiver escrito
na politica passa a valer, entao escolha um prazo que a operacao consiga
cumprir de verdade.

### 8.2 O e-mail do encarregado precisa existir

A politica manda o titular escrever para `privacidade@lojadoecommerce.com.br`.
Crie a caixa antes de publicar: pedido de titular tem prazo de resposta de
15 dias na LGPD, e nao adianta ter o endereco na pagina se ninguem le.

### 8.3 Aceite dos termos

O cadastro no painel so cria conta com o aceite marcado, e grava a versao
aceita, a data e a rede mascarada em `contas`. A versao vigente fica em
`src/termos.js`.

**Ao publicar um texto novo**, suba a versao em `src/termos.js` no mesmo
commit do HTML. As contas antigas continuam com a versao que aceitaram, que
e exatamente o que serve de prova depois.

### 8.4 Revisao por advogado

Os textos foram escritos a partir do que o sistema faz de fato, e refletem a
regua de inadimplencia, a cota e a politica de dados que estao no codigo.
Ainda assim, passe os dois pelo seu advogado antes de anunciar: o texto e
seu, a responsabilidade e sua, e uma clausula de limitacao de
responsabilidade mal redigida nao vale nada num processo.

## 9. Seguranca que depende do servidor, nao do codigo

### 9.1 O Cloudflare tem que ser a unica porta de entrada

Com `CONFIAR_CLOUDFLARE=1` o servidor passa a confiar no cabecalho
`CF-Connecting-IP` para saber de onde veio a requisicao. O Cloudflare
sobrescreve esse cabecalho, entao nao da para forjar **por la**. Mas se
alguem alcancar o container direto, sem passar pelo Cloudflare, ele escreve o
cabecalho que quiser e volta a escolher o proprio IP, o que derruba o limite
de forca bruta de senha.

No Railway, isso significa nao divulgar o dominio `*.up.railway.app` e, se a
plataforma permitir, restringir a entrada as faixas do Cloudflare. Sem isso,
deixe `CONFIAR_CLOUDFLARE` vazio e ajuste `PROXY_SALTOS` para o numero real
de saltos.

### 9.2 A area de Admin e so sua

Quem administra o Captapp e definido por uma coisa so: o e-mail estar em
`OPERADOR_EMAILS`. Nao existe coluna no banco nem rota capaz de promover
alguem, de proposito. Quem esta na lista ve o resumo do negocio, a lista de
todas as contas e consegue entrar dentro da conta de um cliente para dar
suporte, e essa entrada fica gravada no log com o seu id.

Tres coisas garantem que so voce alcance isso:

1. **`OPERADOR_EMAILS` com o seu e-mail, e so ele.** Uma linha a mais nessa
   variavel e um administrador a mais, com acesso a base de todos os clientes.
2. **Crie a conta na primeira subida**, com `OPERADOR_EMAIL` e
   `OPERADOR_SENHA_INICIAL`. O container roda isso antes de aceitar a primeira
   requisicao. Troque a senha no painel depois e apague
   `OPERADOR_SENHA_INICIAL` das variaveis.
3. **O cadastro publico recusa e-mail de operador.** Seu e-mail aparece no
   rodape da landing e nas paginas juridicas, entao e publico. Sem essa trava,
   quem se cadastrasse com ele antes de voce levaria o painel de administracao
   junto. A recusa vem com a mesma mensagem de e-mail repetido, para nao
   confirmar a quem tentar que aquele e o endereco do dono.

Enquanto voce estiver **dentro da conta de um cliente**, os poderes de admin
ficam suspensos naquela sessao: para voltar a ver o Captapp inteiro, saia da
conta do cliente. Isso evita agir no negocio inteiro achando que esta agindo
so no cliente.

### 9.3 A CHAVE_CREDENCIAIS e o backup

O `pg_dump` sozinho nao restaura nada de util: as credenciais das lojas estao
cifradas com `CHAVE_CREDENCIAIS`, que nao fica no banco. Guarde a chave em
lugar separado do dump, e com a mesma durabilidade. Perder a chave significa
pedir a cada cliente que reconecte a loja na mao.

O contrario tambem vale: quem tem o dump **e** a chave tem as credenciais de
todas as lojas dos clientes. Os dois nunca no mesmo lugar.
