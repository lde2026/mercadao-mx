# Por onde começar, na manhã do dia 13

O que mudou na noite de 12 para 13 de novembro, o que já funciona e o que
ainda depende de você.

## O caminho do cliente novo, ponta a ponta

1. Ele entra em `atendeai.lojadoecommerce.com.br` e clica em **Criar a minha
   conta**.
2. Preenche nome, WhatsApp, e-mail e senha.
3. Cai direto na tela **Começar**, não no Resumo.
4. **Passo 1: conectar o WhatsApp.** O número do cadastro já vem preenchido.
   Ele confere, clica em Conectar, a barra enche e para no estado real:
   "Recebemos o número, estamos verificando com a Meta". O passo 2 abre na
   hora, sem esperar a verificação.
5. **Passo 2: o assistente pergunta.** Ele abre falando: "qual é o nome da
   loja, o que ela vende, e qual é o link do site?". O lojista responde
   escrevendo. O assistente conduz, junta tudo e no fim propõe a base
   inteira de uma vez, com os campos lado a lado, de agora para o novo.
6. Ele confirma, os dois passos ficam verdes, aparece "Pronto, a sua loja
   está ativada" e o item **Começar** some do menu.

Isso está testado de ponta a ponta no navegador: 22 verificações, da landing
até a conta ativada.

## O que você precisa fazer

### 1. Confirmar o número da Mx Kids

Entre como `contato@lojadoecommerce.com.br`, vá em **Admin**, ache a linha da
Mx Kids. O número que ela informou está no campo, com um botão **Confirmar**
do lado. É o clique nesse botão que faz a conversa chegar nessa conta.

### 2. Ligar o agente

O agente que fala com o cliente no WhatsApp roda fora deste projeto. O
contrato dele está em `docs/agente-whatsapp.md`: quatro rotas, todas com
`Authorization: Bearer <CHAVE_SERVICO>`.

Resumo do ciclo, por mensagem que chega:

1. `POST /interno/atendimentos/<conta_id>` com a fala do cliente.
2. Se a resposta trouxer `responder: false`, parar. Quer dizer que você
   assumiu a conversa no painel, ou que a loja está pausada.
3. `GET /interno/numero/<numero>` para a base da loja.
4. Gerar a resposta e enviar.
5. `POST /interno/atendimentos/<conta_id>` com a resposta.
6. `POST /interno/base/<conta_id>/consumo` com `enviadas: 1`.

E, de 10 em 10 segundos, `GET /interno/saida/<conta_id>` para pegar o que
você escreveu no painel, enviar, e confirmar com
`POST /interno/saida/<conta_id>/<id>/entregue`.

### 3. Se quiser ligar a cobrança

Falta só a chave. No Railway:

- `ASAAS_API_KEY`
- `ASAAS_WEBHOOK_TOKEN` (uma senha que você inventa)

E no Asaas, cadastrar o webhook apontando para
`https://atendeai.lojadoecommerce.com.br/webhook/asaas` com esse mesmo token.

Antes da chave de produção, rode `npm run asaas:teste` com a chave de
sandbox. Ela cria cliente, assinatura e cancela, provando o caminho inteiro
sem gerar cobrança de verdade. Isso nunca foi feito.

Com a chave no lugar, o Admin ganha o cartão **Abrir cobrança do Atende Aí**:
você escolhe a conta, a faixa, o ciclo e a ativação, vê o valor e confirma.

## O que ficou pronto nesta noite

- **Tela Começar**, com os dois passos.
- **Assistente em modo ativação**: com a base vazia ele conduz as perguntas
  e propõe tudo de uma vez, em vez de esperar um pedido de alteração que o
  lojista novo não sabe que precisa fazer.
- **Atendimentos no painel**: cada conversa do WhatsApp vira um card, com a
  última fala, quantas mensagens e o estado. Clicou, abre a conversa inteira.
- **Assumir uma conversa**: cala o agente naquele cliente, e só nele.
- **Responder pelo painel**: você escreve, o agente envia. Até ele confirmar
  a entrega, a mensagem aparece como "aguardando envio".
- **Resumo** mostra quantos atendimentos hoje e quantos esperam por você.
- **Cobrança do Atende Aí no Asaas**: assinatura por faixa, ativação como
  cobrança única, excedente fechando o mês anterior uma vez só.
- **Admin** mostra a receita do Atende Aí separada da do Capta.
- O chat do assistente é branco nos dois temas e cabe na tela.

## Decisões que eu tomei no seu lugar

Você disse para decidir, então decidi. Qualquer uma destas se desfaz rápido.

1. **Quem não paga o Atende Aí não fica sem agente.** A régua de hoje corta
   rastreamento, widget e script, que são coisas do Capta. Não mexi nela. Um
   cliente do Atende Aí em atraso recebe o aviso no painel e o agente continua
   respondendo, porque quem ficaria no vácuo é o consumidor final, que não tem
   nada a ver com a fatura.
2. **A receita do Atende Aí aparece separada do MRR do Capta**, e não somada.
   Nenhuma conta do Atende Aí passa pelo Asaas ainda: somar daria um total com
   cara de faturado.
3. **A barra do passo 1 não vai até "conectado".** Ela para em "recebemos o
   número, estamos verificando". Conectado quem decide é a verificação com a
   Meta, do seu lado.
4. **O formulário de base continua existindo**, na tela Atende Aí, para
   corrigir um campo solto. Ele só deixou de ser a porta de entrada.

## O que não deu para fazer

- **Testar contra a produção.** Este ambiente não alcança
  `atendeai.lojadoecommerce.com.br`. Tudo foi validado rodando o app aqui,
  com banco de verdade e navegador de verdade. O deploy sai sozinho no
  Railway a cada push.
- **Ligar o Asaas de fato.** Depende da chave, que só você tem. O código está
  pronto e testado contra um Asaas de mentira.

---

# Ligar o WhatsApp da Mx Kids

O agente passou a viver dentro do projeto. Não existe mais nada para montar
fora: a Meta entrega a mensagem aqui, a base vira resposta e a resposta volta
pela Meta.

## 1. Duas variáveis no Railway

- `META_APP_SECRET`: o App Secret do seu app na Meta, em Configurações básicas.
  É com ele que a assinatura de cada entrega é conferida. Sem ele, o webhook
  recusa tudo, de propósito.
- `META_VERIFY_TOKEN`: uma senha que você inventa agora. Ela só serve para a
  Meta confirmar que este endereço é seu, no momento do cadastro.

Nenhuma das duas passa por mim. Você cola direto no Railway.

## 2. Cadastrar o webhook na Meta

No app da Meta, em WhatsApp, Configuração:

- URL de callback: `https://atendeai.lojadoecommerce.com.br/webhook/whatsapp`
- Token de verificação: o mesmo `META_VERIFY_TOKEN`
- Assinar o campo **messages**

Se a verificação falhar, é quase sempre o token diferente dos dois lados, ou o
deploy ainda não ter subido a variável.

## 3. Conectar o número da loja

No **Admin**, cartão **Conectar o WhatsApp de uma conta**:

- a conta (Mx Kids)
- o **phone number id**, que está no painel da Meta junto do número
- o WhatsApp da loja com DDD
- o **token** da Meta

O token é cifrado na hora e nunca mais aparece na tela. Deixar o campo em
branco numa edição mantém o que já está guardado.

## 4. Mandar uma mensagem de teste

Mande qualquer coisa para o número da loja, de outro celular. Em segundos a
resposta chega, a conversa aparece em **Atendimentos** e o contador de
mensagens do mês sobe em um.

Se não acontecer, abra o Admin e use **Por que um número não está atendendo**.
Ele diz exatamente onde parou.

## O que o agente faz e não faz

- Responde só com o que está na base. O que não estiver, ele diz que vai
  confirmar com a equipe, em vez de inventar prazo ou desconto.
- Não repete resposta quando a Meta reenvia o mesmo evento.
- Fica calado na conversa que você assumiu, e só nela.
- Com a loja pausada, manda o recado no máximo uma vez por hora por cliente.
- Áudio e figurinha ainda não são lidos: ele avisa a pessoa e registra a
  conversa, para você ver que alguém chamou.
- Tem um teto de 3.000 respostas por dia por conta. Não é regra de plano,
  passar da faixa vira excedente na fatura. É freio de incêndio, para um laço
  de mensagem não virar conta de milhares de reais numa madrugada.
