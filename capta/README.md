# Captapp

Chat de captacao de leads para loja virtual. O visitante clica num botao
flutuante, responde as perguntas da loja, deixa contato e recebe um cupom
unico. O lojista ve o lead no painel, com o cupom vinculado, e mede quanto
faturou por causa do chat.

Para subir na sua maquina, veja o [SETUP.md](SETUP.md).

## O desenho

O painel nao e de um produto so. E conta do lojista com modulos ativaveis, e o
chat de captacao e o primeiro. As camadas de conta, conexao e faturamento nao
referenciam "chat" em lugar nenhum, e servem para os proximos modulos.

```
navegador do visitante          nosso servidor              loja do cliente
----------------------          --------------              ---------------
widget.js      -> POST /w/lead/:chave -> fluxo-lead -> grava lead
                                                    -> cria cupom  -> API da loja
rastreador.js  -> POST /e             -> eventos    -> costura pelo anonimo_id
  (o widget carrega o rastreador sozinho quando o plano da conta permite)
                                         pedido pago <- webhook ou varredura
```

## Os arquivos

| Arquivo | Papel |
|---|---|
| `src/adapters/` | as quatro plataformas atras de uma interface unica |
| `src/repositorio.js` | acesso ao banco, sempre filtrado por conta |
| `src/cripto.js` | cifra das credenciais, hash de senha, assinatura de cookie |
| `src/cupom.js` | gerador de codigo unico |
| `src/fluxo-lead.js` | o que acontece quando o lead termina o chat |
| `src/eventos.js` | rastreamento, mascara de IP e costura do anonimo |
| `src/billing/acesso.js` | regua de inadimplencia |
| `src/tarefas.js` | varredura de pedidos, remocao de script no dia 45, avisos de cobranca |
| `src/oauth.js` | conexao de loja por OAuth (Tray e Nuvemshop) |
| `src/avisos.js` | quem recebe e-mail de que: lead novo, cobranca, operador |
| `src/credenciais.js` | credenciais decifradas com token renovado |
| `public/widget.js` | o chat, 7,9kb comprimido, carrega o rastreador quando o plano permite |
| `public/rastreador.js` | rastreamento, 1,7kb comprimido |
| `painel/` | o painel do lojista |

## O que cada plataforma permite

Isso define o produto. Elas nao se comportam igual.

| | Nuvemshop | WooCommerce | Tray | Loja Integrada |
|---|---|---|---|---|
| Conecta por | OAuth ou token | chave REST | OAuth ou token | duas chaves |
| Instala o script | automatico | plugin nosso | automatico (external_scripts) | colar a mao, ou nao instala |
| Cria cupom por API | sim | sim | sim, form-urlencoded | nao, sai de lote |
| Webhook de pedido | sim | sim | sim, ativado por chamado; varredura ate la | nao, varredura de 30 em 30 min |
| Token expira | nao | nao | sim, 3 horas | nao |

A Tray esta descrita em detalhe em [docs/tray-api.md](docs/tray-api.md),
conferido com a documentacao oficial.

Loja que nao tem integracao automatica, ou que tem mas a parceria ainda nao
saiu, entra pela [implantacao manual](docs/implantacao-manual.md): a tag colada
no tema, com o cupom saindo de um lote. O roteiro inclui o prompt pronto para
pedir a insercao a uma IA e a lista de conferencia antes de entregar ao
cliente.

A Loja Integrada e a unica das quatro que nao tem OAuth: as duas chaves sao
coladas a mao no painel, e a de aplicacao a equipe deles emite por formulario.
O adaptador dela e o unico ainda nao conferido contra documentacao oficial,
porque a rede desta maquina nao alcanca `api.awsli.com.br`. Os nomes de campo
em `listarPedidos` valem ate a primeira chamada real.

`instalarScript()` sempre devolve `auto`, `manual` ou `bloqueado`, e a tela de
integracoes mostra o caminho certo sem ninguem da equipe entrar na loja do
cliente.

Duas armadilhas que ja custaram desenho:

A Nuvemshop so carrega script em pagina de produto e no checkout. A home fica
sem o widget e nao ha o que fazer.

A Loja Integrada com o tema padrao novo nao tem o campo Incluir codigo HTML.
Nessas lojas o produto nao instala, e isso e pergunta de qualificacao antes da
venda.

## Cobranca

Implantacao de R$ 699, cobrada uma vez. Dois planos: R$ 59 por mes ate 500
leads e uma loja, e R$ 99 por mes sem teto de leads e ate dez lojas. O anual
tem 20% de desconto sobre doze mensalidades, cobrado de uma vez.

Cota atingida tira o chat do ar na loja ate o dia 1 ou ate o upgrade. O
Financeiro do painel mostra so isso: o que a loja paga pelo Captapp.
Faturamento atribuido ao chat aparece na fila e no perfil do lead, nunca no
Financeiro.

## Decisoes que nao se mexe sem conversa

O cupom e sempre unico por pessoa, gerado pela API ou tirado de um lote.

Ate seis perguntas do lojista, e a de contato vem sempre junto, sem contar no
teto e sem poder ser removida. O teto existe porque cada pergunta a mais
derruba quantos chegam ao fim; o painel avisa isso a partir da quarta, e a
decisao fica com quem conhece o proprio cliente.

O lead e gravado antes de tentar o cupom. Cupom quebrado vira chamado de
suporte e se resolve. Lead perdido e dinheiro.

Atrasar pagamento nao apaga nada. Dia 7 o rastreamento desliga, dia 10 o
widget sai do ar e o painel fica em leitura, dia 45 o script sai da loja. Os
leads continuam guardados e quem paga volta no mesmo minuto.

Rastreamento de navegacao nos dois planos. Ele era a cenoura do plano do
meio; sem plano do meio, segurar ele no de entrada so dava motivo para nao
assinar.

## Seguranca

Toda consulta que toca lead, evento, conexao ou cobranca e filtrada por conta.
Nao existe `buscarLead(id)` no repositorio: id vindo da URL nunca e
autorizacao. `testes/isolamento.test.js` tenta ler, apagar e editar recurso da
conta A logado como conta B e espera 404 em todos.

A coluna `credenciais` guarda token de API de loja de terceiro, cifrada com
AES-256-GCM e chave em variavel de ambiente. O log filtra e-mail, telefone,
nome e token na origem.

Os endpoints publicos `/e` e `/w/lead/:chave` tem teto por chave de loja e por
IP, teto de corpo, e conferem a chave antes de qualquer trabalho.

Webhook so entra com assinatura conferida, e sobre o corpo cru.

## LGPD

O lojista e o controlador, nos somos o operador. O rastreador nao dispara nada
antes do consentimento: acumula em memoria e so envia depois do aceite no
chat. O IP nunca e guardado inteiro, so a rede, /24 no IPv4 e /48 no IPv6. A
exclusao por titular esta em `esquecerLead` e no botao do perfil do lead.

## Testes

```bash
npm test
```

As duas areas obrigatorias sao a regua de inadimplencia, onde erro cobra do
cliente errado ou derruba loja em dia, e a costura do anonimo com o lead, onde
erro vaza navegacao de uma pessoa no perfil de outra.
