# Como colocar o Mercadão MX no ar

## 1. Criar o projeto Supabase (backend)

1. Acesse https://supabase.com e crie uma conta gratuita
2. Clique em **New Project** e preencha:
   - Name: `mercadao-mx`
   - Database Password: (guarde bem)
   - Region: `South America (São Paulo)` → `sa-east-1`
3. Aguarde o projeto ser criado (~2 min)

## 2. Executar o schema do banco

1. No painel do Supabase, vá em **SQL Editor** → **New query**
2. Cole o conteúdo do arquivo `supabase/schema.sql`
3. Clique em **Run** (▶)

## 3. Configurar autenticação Google (opcional)

1. Vá em **Authentication → Providers → Google**
2. Habilite e preencha com seu Google OAuth Client ID e Secret
   (crie em https://console.cloud.google.com)
3. Em **Authentication → URL Configuration**, adicione à lista de **Redirect URLs**:
   ```
   https://SEU_DOMINIO.vercel.app/auth/callback
   http://localhost:3000/auth/callback
   ```

## 4. Pegar as credenciais do Supabase

1. Vá em **Settings → API**
2. Copie:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 5. Criar arquivo .env.local (desenvolvimento local)

```bash
cp .env.local.example .env.local
```

Preencha o `.env.local` com os valores copiados acima.

## 6. Deploy no Vercel

### Pré-requisito: código no GitHub

```bash
git init
git add .
git commit -m "Initial commit — Mercadão MX"
git remote add origin https://github.com/SEU_USUARIO/mercadao-mx.git
git push -u origin main
```

### Deploy

1. Acesse https://vercel.com e faça login
2. Clique em **Add New → Project**
3. Importe o repositório `mercadao-mx` do GitHub
4. Em **Environment Variables**, adicione:

   | Nome | Valor |
   |------|-------|
   | `NEXT_PUBLIC_SUPABASE_URL` | URL do seu projeto Supabase |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave anon do Supabase |
   | `ANTHROPIC_API_KEY` | Sua chave da API Anthropic |

5. Clique em **Deploy**

Pronto! A URL ficará no formato `https://mercadao-mx-xxx.vercel.app`.

## Comportamento sem Supabase

Se as variáveis `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` não estiverem configuradas, o site funciona em **modo demo** com dados mock e localStorage — útil para desenvolvimento local sem precisar configurar o banco.
