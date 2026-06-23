# Servidor WhatsApp (Baileys) para a VPS. Expõe a API compatível-WAHA na porta 3001.
FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY baileys-server.mjs ./

# Na VPS tem de escutar em todas as interfaces e exigir API key (ver docker-compose / env).
ENV BIND_HOST=0.0.0.0
EXPOSE 3001

# A sessão (auth/) e a config do cron (cron.json) são fornecidas por volume em runtime.
CMD ["node", "baileys-server.mjs"]
