FROM node:20-alpine

WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# The bot is gateway-only (no web server), so nothing to expose.
# Runtime state lives in ./data (mounted as a volume in docker-compose.yml).

CMD ["npm", "start"]
