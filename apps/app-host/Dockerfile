FROM node:26.13.0-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
# apps/app-host/tsconfig.json 繼承根目錄的 base；沒有這個檔，tsc 會以 TS5083 失敗。
COPY tsconfig.base.json ./
COPY apps/app-host/package.json apps/app-host/package.json
COPY apps/platform/package.json apps/platform/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/design-tokens/package.json packages/design-tokens/package.json
COPY packages/i18n/package.json packages/i18n/package.json
COPY packages/ui-kit/package.json packages/ui-kit/package.json
COPY packages/app-shell/package.json packages/app-shell/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci

COPY apps/app-host apps/app-host
# manifest 驗證在 packages/contracts（R8）。它的入口是 src/index.ts，
# 而 app-host 的 dist 是 CommonJS：Node 的 require 會直接讀那個 .ts
# （Node 22+ 預設剝離型別，已實測），所以映像要帶住來源，不只是 dist。
COPY packages/contracts packages/contracts
RUN npm run build --workspace @company-os/app-host
RUN npm prune --omit=dev

FROM node:26.13.0-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

# 建置時的 commit（issue #143）。值由 compose 的 build args 傳入，通常來自
# `npm run deploy:build`；沒有傳入時是 unknown。寧願講未知，也不要寫一個
# 看起來合理的假 SHA —— 一個假的 revision 比沒有 revision 更難查。
ARG GIT_REVISION=unknown
LABEL org.opencontainers.image.revision=$GIT_REVISION

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/app-host/package.json ./apps/app-host/package.json
COPY --from=build /app/apps/app-host/dist ./apps/app-host/dist
# node_modules/@company-os/contracts 是符號連結，指回 packages/contracts；
# 沒有這一行，require('@company-os/contracts') 會找不到。
COPY --from=build /app/packages/contracts ./packages/contracts

# 要載入哪些 app 由執行時的 APP_SET 決定（決策 C32），不寫死在映像裡。
# 現在沒有任何真實 app，所以 APPS_DIR 先行建立成空目錄：APP_SET 留空即是
# 一個健康的空殼。第一個真 app 落地時，這裡要逐個 COPY apps/<id>/manifest.json
# 與 apps/<id>/dist（映像不應該帶住 app 的原始碼）。
RUN mkdir -p /app/apps
ENV APPS_DIR=/app/apps
ENV PORT=8080

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8080/livez').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]

USER node

CMD ["node", "apps/app-host/dist/main.js"]
