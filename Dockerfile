# Gründarium Portal – Build für den eigenen Server (Coolify)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# Netzwerk am Server bricht ab und zu ab (ECONNRESET): mehrere Versuche, notfalls ein zweiter Durchlauf
RUN npm ci --no-audit --no-fund --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000 || (sleep 15 && npm ci --no-audit --no-fund --fetch-retries=5)
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
# Chromium für die PDF-Lebensläufe (Schriften sind eingebettet, deshalb keine Systemschriften nötig)
RUN apk add --no-cache chromium
ENV CHROMIUM_PATH=/usr/bin/chromium
ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data
COPY --from=build --chown=node:node /app ./
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
EXPOSE 3000
# Beim Start fehlende Datenbank-Migrationen einspielen, dann die App starten
CMD ["sh", "-c", "node scripts/migrate.mjs && npm start"]
