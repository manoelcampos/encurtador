# Versão fixa do Node (LTS), que satisfaz o campo engines do package.json.
ARG NODE_IMAGE=node:26.13.0-slim

FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM ${NODE_IMAGE}
ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/data/encurtador.db
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# O diretório é criado antes do VOLUME para o volume novo herdar o dono (node), e não root.
RUN mkdir /data && chown node:node /data
VOLUME /data
USER node
EXPOSE 3000
# A imagem slim não tem curl; o fetch do Node faz a checagem.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["node", "-e", "fetch(`http://localhost:${process.env.PORT}/api/health`).then(res => process.exit(res.ok ? 0 : 1), () => process.exit(1))"]
# Node direto (sem npm start) para o SIGTERM do docker stop chegar ao processo e o banco ser fechado.
CMD ["node", "dist/backend/main.js"]
