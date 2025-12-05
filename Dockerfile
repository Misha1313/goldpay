# Dockerfile
FROM node:21 AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
# COPY src/config/envs/.env .env
RUN npm run build


FROM node:21

WORKDIR /app

COPY package*.json ./
RUN npm install --only=production

COPY --from=builder /app/dist ./dist
COPY src/config/envs/.docker.env src/config/envs/.env

CMD ["node", "dist/src/main.js"]
