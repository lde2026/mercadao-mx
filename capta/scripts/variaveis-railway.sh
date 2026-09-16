#!/bin/sh
# Monta o bloco de variaveis do Captapp para colar no Railway.
#
# Rode NA SUA MAQUINA, nunca num servidor compartilhado:
#   sh scripts/variaveis-railway.sh
#
# Ele gera as duas chaves, pergunta a senha inicial do operador sem ecoar na
# tela, imprime o bloco pronto e guarda uma copia num arquivo so seu.
#
# Por que existe: as duas chaves precisam ser aleatorias de verdade e ficar
# guardadas em outro lugar alem do Railway. Perder a CHAVE_CREDENCIAIS
# significa pedir a cada cliente que reconecte a loja na mao. Digitar na mao
# ou reaproveitar de outro projeto e como isso comeca a dar errado.

set -e

if ! command -v node >/dev/null 2>&1; then
  echo "precisa do node instalado para gerar as chaves" >&2
  exit 1
fi

DOMINIO="${1:-captapp.lojadoecommerce.com.br}"
OPERADOR="${2:-contato@lojadoecommerce.com.br}"

CHAVE=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
SEGREDO=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")

# A senha entra pela pergunta, nunca por argumento: argumento aparece no
# historico do shell e na lista de processos da maquina.
printf 'Senha inicial do operador (nao aparece enquanto voce digita): '
stty -echo 2>/dev/null || true
read SENHA
stty echo 2>/dev/null || true
echo
if [ ${#SENHA} -lt 8 ]; then
  echo "senha de no minimo 8 caracteres" >&2
  exit 1
fi

BLOCO=$(cat <<FIM
NODE_ENV=production
PORTA=3000
DATABASE_URL=\${{Postgres.DATABASE_URL}}
URL_PUBLICA=https://$DOMINIO
CHAVE_CREDENCIAIS=$CHAVE
SEGREDO_SESSAO=$SEGREDO
OPERADOR_EMAILS=$OPERADOR
OPERADOR_EMAIL=$OPERADOR
OPERADOR_SENHA_INICIAL=$SENHA
OPERADOR_NOME=Loja do E-commerce
FIM
)

DESTINO="${CAPTA_SEGREDOS:-$HOME/captapp-segredos.txt}"
umask 077
printf '%s\n' "$BLOCO" > "$DESTINO"

echo
echo "Cole este bloco no editor de variaveis do servico no Railway:"
echo "------------------------------------------------------------"
printf '%s\n' "$BLOCO"
echo "------------------------------------------------------------"
echo
echo "Copia guardada em $DESTINO (so voce le)."
echo
echo "Depois do primeiro login no painel:"
echo "  1. troque a senha do operador"
echo "  2. apague OPERADOR_SENHA_INICIAL das variaveis do Railway"
echo
echo "A CHAVE_CREDENCIAIS tem que sobreviver a perda do Railway, e ficar"
echo "SEPARADA do backup do banco: quem tem os dois tem a credencial de"
echo "todas as lojas dos seus clientes."
