#!/bin/sh
# Dump diario do banco. Os leads dos clientes estao aqui; sem isso nao ha
# produto. Guarde o arquivo fora do servidor, e guarde a CHAVE_CREDENCIAIS
# junto: sem ela o dump restaura leads mas as credenciais das lojas ficam
# ilegiveis e cada cliente precisa reconectar a loja na mao.
set -eu
: "${DATABASE_URL:?DATABASE_URL ausente}"
pasta="${BACKUP_PASTA:-backups}"
mkdir -p "$pasta"
arquivo="$pasta/capta-$(date +%Y%m%d-%H%M).sql.gz"
pg_dump --no-owner --no-privileges "$DATABASE_URL" | gzip -9 > "$arquivo"
echo "backup: $arquivo ($(du -h "$arquivo" | cut -f1))"
# Mantem os 14 mais recentes localmente; o destino duravel e fora daqui.
ls -1t "$pasta"/capta-*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm -f
