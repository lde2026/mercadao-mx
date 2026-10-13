# Implantação manual: colar a tag no tema da loja

Para quando a plataforma do cliente não tem integração automática, ou tem mas
a parceria ainda não saiu. Vale para Tray sem o aplicativo aprovado, Shopify,
VTEX, Wix, site próprio e qualquer loja conectada como **Outra plataforma**.

O resultado é idêntico para o visitante: mesmo chat, mesma captação, mesmo
rastreamento. O que muda é a instalação (você cola, em vez de ser automática),
o cupom (sai de um lote, não da API) e o faturamento atribuído (não aparece).

## A ordem, e por que ela importa

1. Conectar a loja no painel
2. **Cadastrar o lote de cupons**
3. Montar e publicar o chat
4. Colar a tag no tema
5. Conferir na loja

O passo 2 vem antes do 3 de propósito. Chat publicado sem lote faz o visitante
responder tudo, ouvir a promessa do desconto e não receber código nenhum. A
reclamação vai direto para o lojista, e a culpa é da implantação.

---

## 1. Conectar a loja

Integrações → **Outra plataforma**. Pede só nome e endereço da loja. Não pede
senha nem token: não há API envolvida.

Ao conectar, o painel já mostra a tag com botão de copiar. **Use o botão.**
Selecionar com o mouse erra um caractere no meio da chave e instala algo que
não funciona, sem nenhum erro visível na loja.

## 2. Cadastrar o lote de cupons

No painel **da plataforma do cliente**, crie os cupons: uso único cada, com o
desconto que o chat promete. Trinta é um começo razoável.

De volta ao Captapp: Integrações → o cartão da loja → **Repor o lote de
cupons** → cole os códigos, um por linha.

Códigos repetidos são ignorados, então dá para colar a lista inteira de novo
sem duplicar. O painel avisa quando sobram 10.

## 3. Montar o chat

Aba **Chat** → escolha a loja no seletor do topo.

Três perguntas no máximo antes do contato. Nome, WhatsApp e e-mail já são a
quarta, fixa: não gaste pergunta com isso.

O que faz uma pergunta boa:

- **Qualifica a compra, não a pessoa.** "O que você procura" vale mais que
  "como nos conheceu".
- **Toda resposta tem saída.** Inclua sempre uma opção como "ainda estou
  olhando" ou "quero ver opções". Sem ela, quem não se encaixa escolhe
  qualquer uma e o sinal vira ruído.
- **Faixa de preço com os números do catálogo do cliente.** Faixa errada faz
  todo mundo marcar a última, e você perde a informação.
- **Urgência fecha venda.** "Para quando você precisa" costuma converter
  melhor que detalhe técnico, que o vendedor pergunta no WhatsApp de qualquer
  jeito.

**Publicar no widget** quando terminar. Vale na hora, sem mexer no tema de
novo: convite, cor, formato do botão, posição e perguntas mudam pelo painel.

## 4. Colar a tag no tema

Pegue a tag em Integrações → **Chave e código da loja**, botão de copiar.

O painel também mostra ali, logo abaixo, o **prompt pronto** para pedir a
inserção a uma IA, já com a tag daquela loja dentro. É o mesmo texto da seção
abaixo, montado automaticamente.

### Prompt para a IA

Troque apenas a linha da tag pela da loja.

```
Você vai inserir uma tag de script no HTML do tema de uma loja virtual na
plataforma PLATAFORMA. Eu vou colar o conteúdo do arquivo do tema na próxima
mensagem.

A TAG, exatamente como está abaixo, sem alterar um caractere:

<script async src="https://captapp.lojadoecommerce.com.br/widget.js?k=CHAVE_DA_LOJA"></script>

ONDE COLOCAR

1. Procure o fechamento </body> no arquivo. Cole a tag na linha imediatamente
   antes dele.
2. Se o arquivo não tiver </body>, é um arquivo parcial do tema. Nesse caso
   NÃO insira nada: me avise e peça o arquivo que contém </body>, que
   costuma ser o layout principal ou o rodapé que aparece em todas as páginas.
3. A tag precisa carregar em todas as páginas da loja, não só na inicial.

O QUE NÃO FAZER

- Não altere nenhuma outra linha. Nada de reformatar, reindentar, trocar
  aspas, reorganizar atributos ou "limpar" o código.
- Não mexa nas tags próprias da plataforma (as que usam {% %}, {{ }} ou
  element=). Se não entender alguma, deixe exatamente como está.
- Não remova comentários existentes.
- Não mude a codificação do arquivo nem quebre linhas que já estavam juntas.
- Mantenha o atributo async na tag.

SE JÁ EXISTIR ALGO PARECIDO

- Se encontrar outra tag apontando para widget.js, substitua a antiga pela
  nova em vez de somar as duas. Duas tags fazem o chat aparecer duplicado.
- Depois de inserir, confira que a palavra widget.js aparece UMA vez só no
  arquivo inteiro.

O QUE ME DEVOLVER

1. O arquivo completo, do começo ao fim, pronto para eu colar de volta no
   editor de tema. Não resuma, não use "resto do arquivo igual", não corte
   nada.
2. Em qual número de linha a tag ficou.
3. Quantas vezes a palavra widget.js aparece no arquivo final.

Vou colar o HTML do tema na próxima mensagem.
```

### Onde fica o arquivo, por plataforma

| Plataforma | Caminho no painel dela |
|---|---|
| Tray | Configurações, Layout ou Tema, Editar HTML. O nome muda por versão |
| Loja Integrada | Visual, Incluir código HTML. Não existe no tema padrão novo |
| Shopify | Loja virtual, Temas, Editar código, `theme.liquid` |
| VTEX | Storefront, ou pelo CMS do tema |
| WooCommerce | Aparência, Editor de temas, ou um plugin de cabeçalho e rodapé |
| Site próprio | O arquivo de layout que serve todas as páginas |

Em todas, **salvar não é publicar**. Procure o botão de publicar depois de
salvar.

## 5. Conferir antes de entregar

| | O quê | Onde |
|---|---|---|
| 1 | O botão aparece no canto certo | loja do cliente, aba anônima |
| 2 | Aparece também numa página de produto | se só aparece na home, a tag entrou no arquivo errado |
| 3 | Responder o chat inteiro, como visitante | loja do cliente |
| 4 | O lead aparece com as respostas | Captapp, aba Leads |
| 5 | O cupom entregue é um dos códigos do lote | compare com a lista que você colou |
| 6 | O cupom funciona no carrinho | loja do cliente |
| 7 | Nenhum erro no console | F12 na loja |

O passo 6 é o que mais escapa: cupom criado na plataforma com regra errada
(valor mínimo, categoria restrita, data de validade) é aceito no painel e
recusado no carrinho.

## O que dizer ao cliente

Duas coisas, antes de entregar:

- **O faturamento atribuído vai ficar zerado.** Sem API de pedidos não há como
  saber que a venda veio do cupom. O painel mostra os leads, não quanto
  renderam.
- **O lote de cupons acaba.** O painel avisa quando sobram 10, mas quem repõe
  é gente, não o sistema.

## Quando migrar para a integração automática

Assim que a parceria da plataforma sair, reconecte a loja pelo caminho
automático. O chat, as perguntas e os leads já captados continuam; o que muda
é que o cupom passa a sair por API e o faturamento volta a aparecer.

A tag colada no tema pode ficar: ela aponta para a mesma chave da loja.
