FROM node:20-slim

# Required for Baileys (canvas/sharp optional deps)
RUN apt-get update && apt-get install -y \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# WhatsApp (Baileys) session persists in MongoDB (see src/services/whatsappMongoAuth.js),
# not local disk — no persistent volume needed for it.
ENV NODE_ENV=production
ENV PORT=8080

# node:20-slim already ships a non-root "node" user (uid/gid 1000) — reuse it
# rather than creating a new one.
RUN chown -R node:node /app
USER node

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "require('http').get('http://localhost:8080/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
