FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 3000
# O schema e idempotente, entao migrar a cada subida e seguro e garante que
# um deploy nunca roda contra banco com coluna faltando.
CMD ["sh", "-c", "node src/migrar.js && node src/server.js"]
