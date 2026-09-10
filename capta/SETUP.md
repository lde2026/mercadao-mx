# Subir o Capta na sua maquina

Node 20 ou mais novo, e Docker para o Postgres.

## 1. Banco

```bash
docker compose up -d banco
```

## 2. Variaveis

```bash
cp .env.example .env
```

Preencha as duas chaves obrigatorias. Sem elas o servidor recusa subir de
proposito, porque a alternativa seria gravar credencial de loja de cliente em
claro:

```bash
node -e "console.log('CHAVE_CREDENCIAIS=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('SEGREDO_SESSAO=' + require('crypto').randomBytes(32).toString('base64url'))"
```

Guarde a `CHAVE_CREDENCIAIS` fora do repositorio e faca backup dela junto do
banco. Sem essa chave, o backup do banco nao serve para nada: as credenciais
das lojas ficam ilegiveis e cada cliente precisa reconectar a loja na mao.

## 3. Schema e dados de exemplo

```bash
npm install
npm run migrar
npm run semear
```

O `semear` cria a conta da MX Kids com o fluxo real de motocross infantil e
tres conexoes, uma de cada modo de instalacao: Nuvemshop automatica, Tray
manual e Loja Integrada bloqueada. Ele imprime o e-mail e a senha de entrada.

## 4. Subir

```bash
npm run dev
```

Painel em http://localhost:3000

## 5. Testar o widget numa pagina qualquer

Pegue a `chave` que o `semear` imprimiu e ponha numa pagina HTML local:

```html
<script async src="http://localhost:3000/rastreador.js?k=SUA_CHAVE"></script>
<script async src="http://localhost:3000/widget.js?k=SUA_CHAVE"></script>
```

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | sobe com recarga automatica |
| `npm test` | roda os testes |
| `npm run migrar` | aplica o schema |
| `npm run semear` | cria a conta e o fluxo da MX Kids |
| `npm run hoje` | quantos leads entraram hoje, em quais lojas, quantos cupons falharam |

## Testes

```bash
createdb capta_teste   # ou docker compose exec banco createdb -U capta capta_teste
DATABASE_URL=postgres://capta:capta@localhost:5432/capta_teste npm test
```

Os testes recriam o schema a cada rodada, entao aponte para um banco separado.
