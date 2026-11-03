FROM node:26.13.0-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

COPY apps/api apps/api
COPY db/migrations db/migrations
RUN npm run build --workspace @company-os/api
RUN npm prune --omit=dev

FROM node:26.13.0-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/db/migrations ./db/migrations

EXPOSE 4420

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4420/livez').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]

USER node

CMD ["node", "apps/api/dist/server.js"]
