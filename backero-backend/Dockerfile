FROM node:20-slim

# Required for Baileys (canvas/sharp optional deps)
RUN apt-get update && apt-get install -y \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# WhatsApp session lives on persistent volume mounted at /data/wa_session
ENV WA_SESSION_PATH=/data/wa_session
ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "server.js"]
