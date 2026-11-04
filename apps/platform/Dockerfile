FROM node:26.13.0-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
# apps/platform/tsconfig.json 繼承根目錄的 base；沒有這個檔，tsc 會以 TS5083 失敗。
COPY tsconfig.base.json ./
COPY apps/platform/package.json apps/platform/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

COPY apps/platform apps/platform
COPY db/migrations db/migrations
RUN npm run build --workspace @company-os/platform
RUN npm prune --omit=dev

FROM node:26.13.0-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/platform/package.json ./apps/platform/package.json
COPY --from=build /app/apps/platform/dist ./apps/platform/dist
COPY --from=build /app/db/migrations ./db/migrations
COPY modules ./modules

# 模組清單的位置；載入失敗就結束，不會起一個清單壞掉的服務。
ENV MODULES_DIR=/app/modules

EXPOSE 4420

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4420/livez').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]

USER node

CMD ["node", "apps/platform/dist/server.js"]
