FROM node:26.13.0-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
# apps/platform/tsconfig.json 繼承根目錄的 base；沒有這個檔，tsc 會以 TS5083 失敗。
COPY tsconfig.base.json ./
COPY apps/platform/package.json apps/platform/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/design-tokens/package.json packages/design-tokens/package.json
COPY packages/i18n/package.json packages/i18n/package.json
COPY packages/ui-kit/package.json packages/ui-kit/package.json
COPY packages/app-shell/package.json packages/app-shell/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/edition-profile/package.json packages/edition-profile/package.json
RUN npm ci

COPY apps/platform apps/platform
# manifest 驗證在 packages/contracts（R8）。它的入口是 src/index.ts，
# 而 platform 的 dist 是 CommonJS：Node 的 require 會直接讀那個 .ts
# （Node 22+ 預設剝離型別，已實測），所以映像需要帶住來源，不只是 dist。
COPY packages/contracts packages/contracts
# 版本差異（入口、渠道目錄）的唯一來源；settings 用它驗 notification_channels，
# 理由同上：入口是 src/index.ts，映像要帶住來源。
COPY packages/edition-profile packages/edition-profile
COPY db/migrations db/migrations
# 種子檔（第一次啟動時填入預設值與政策規則）。只複製 profile，不是整個 profiles/ 的歷史。
COPY profiles profiles
RUN npm run build --workspace @company-os/platform
RUN npm prune --omit=dev

FROM node:26.13.0-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/platform/package.json ./apps/platform/package.json
COPY --from=build /app/apps/platform/dist ./apps/platform/dist
# node_modules/@company-os/contracts 是符號連結，指回 packages/contracts；
# 沒有這一行，require('@company-os/contracts') 會找不到。
COPY --from=build /app/packages/contracts ./packages/contracts
COPY --from=build /app/packages/edition-profile ./packages/edition-profile
COPY --from=build /app/db/migrations ./db/migrations
COPY --from=build /app/profiles ./profiles

# app 清單（manifest.json）由 repo 的 apps/<id>/ 直接搬進來（R4／issue #74）。
# 逐個寫出來而不是 COPY apps ./apps：映像不應該帶著各 app 的原始碼。
# Docker 的 COPY 不支援「只複製某個名稱的檔案」，所以新增一個 app 就要在這裡加一行；
# apps/platform/test/modules/dockerfile-manifests.test.ts 會盯着兩邊是否一致，
# 忘記加就會在 CI 紅，而不是等到上線才發現少了一個部門。
COPY apps/boss/manifest.json ./apps/boss/manifest.json
COPY apps/design/manifest.json ./apps/design/manifest.json
COPY apps/sales/manifest.json ./apps/sales/manifest.json
COPY apps/ops_finance/manifest.json ./apps/ops_finance/manifest.json
COPY apps/hr/manifest.json ./apps/hr/manifest.json
COPY apps/support/manifest.json ./apps/support/manifest.json

# app 清單的位置；載入失敗就結束，不會起一個清單壞掉的服務。
ENV MODULES_DIR=/app/apps

# 種子檔的位置（issue #80）。啟動時只做「第一次填入」，不會覆蓋已存在的值。
ENV PROFILE_DIR=/app/profiles/default

EXPOSE 4420

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4420/livez').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]

USER node

CMD ["node", "apps/platform/dist/server.js"]
