# O contrato do agente de WhatsApp

O Atende Aí tem duas metades. O painel é este projeto. **O agente que fala
com o cliente final roda fora daqui** e conversa com o painel por três rotas
internas, todas autenticadas pela mesma chave.

Este documento é o contrato entre as duas metades. Quem monta o agente (Make,
n8n, um worker próprio) só precisa disto.

## Autenticação

Todas as rotas `/interno/*` exigem o cabeçalho:

```
Authorization: Bearer <CHAVE_SERVICO>
```

`CHAVE_SERVICO` é uma variável de ambiente do servidor. Sem ela configurada, as
rotas recusam tudo: chave vazia nunca vale como permissão. A comparação é em
tempo constante.

Cookie de lojista não serve aqui, e a chave não serve no painel. São dois
mundos separados de propósito.

## 1. Ler a base da loja, pelo número que recebeu a mensagem

```
GET /interno/numero/5541997524486
```

Resposta:

```json
{
  "conta": { "id": "uuid", "nome": "Mx Kids" },
  "base": { "nomeLoja": "Mx Kids", "segmento": "...", "prazosEntrega": [], "...": "..." },
  "atualizadoEm": "2026-11-13T03:00:00.000Z",
  "pausado": false,
  "recado": null
}
```

- `404` quer dizer que o número não está conectado a nenhuma conta, ou que a
  conta está sem o módulo. O agente não responde nada nesse caso.
- `pausado: true` é o freio de mão do lojista. O agente **não responde
  ninguém** enquanto estiver assim. Se houver `recado`, é o texto que o
  lojista escolheu mandar no lugar da resposta.
- `base` é o que vira o prompt do agente. Campo vazio é campo que o lojista
  não preencheu: o agente **não inventa**, ele diz que vai confirmar.

O número na URL pode ir com ou sem o 55: o servidor canoniza.

## 2. Espelhar cada fala da conversa

```
POST /interno/atendimentos/<conta_id>
{ "cliente": "41988887777", "nome": "Joana", "direcao": "cliente", "texto": "..." }
```

`direcao` é `cliente`, `agente` ou `humano`.

Resposta:

```json
{ "id": "uuid", "estado": "ia", "responder": true }
```

- **`responder` é a resposta mais importante desta rota.** Quando vier
  `false`, o agente fica calado nessa conversa: ou o lojista assumiu o
  atendimento no painel, ou a loja está pausada. Mandar a fala do cliente
  primeiro e só responder se vier `true` é o jeito certo de usar.
- Uma conversa por `(conta, cliente)`. Mandar a segunda mensagem do mesmo
  cliente não cria um card novo, atualiza o que existe.
- Mensagem nova **não** devolve para a IA uma conversa que o lojista assumiu.
- O agente deve chamar esta rota para as falas que ele mesmo envia também
  (`direcao: "agente"`), senão o painel mostra só metade da conversa.

## 3. Contar as mensagens enviadas

```
POST /interno/base/<conta_id>/consumo
{ "enviadas": 1 }
```

É o que alimenta o medidor do plano e o excedente da fatura. Conta **mensagem
que o agente enviou**, que é o que a Meta cobra. De 1 a 500 por chamada.

## Ordem sugerida por mensagem recebida

1. `POST /interno/atendimentos/<conta_id>` com a fala do cliente.
2. Se `responder` for `false`, parar aqui.
3. `GET /interno/numero/<numero>` para a base (dá para guardar em cache por
   alguns minutos, o campo `atualizadoEm` diz quando mudou).
4. Gerar a resposta e enviar pelo WhatsApp.
5. `POST /interno/atendimentos/<conta_id>` com a resposta, `direcao: "agente"`.
6. `POST /interno/base/<conta_id>/consumo` com `enviadas: 1`.

O passo 1 antes do 4 não é detalhe: é ele que garante que o lojista vê a
conversa mesmo se a geração da resposta falhar.

## O que o agente nunca faz

- Não escreve na base. Quem muda a base é o lojista, pelo assistente do
  painel, confirmando campo por campo.
- Não liga nem desliga a pausa. Ele lê, não escreve.
- Não decide sozinho que deve responder: isso vem de `responder`.
