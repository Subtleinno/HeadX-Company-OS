FROM node:26.13.0-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
# apps/web/tsconfig.json 繼承根目錄的 base；沒有這個檔，tsc --noEmit 會以 TS5083 失敗。
COPY tsconfig.base.json ./
COPY apps/platform/package.json apps/platform/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/design-tokens/package.json packages/design-tokens/package.json
COPY packages/i18n/package.json packages/i18n/package.json
COPY packages/ui-kit/package.json packages/ui-kit/package.json
COPY packages/app-shell/package.json packages/app-shell/package.json
RUN npm ci

COPY apps/web apps/web
# 共用 packages 由原始碼編譯（package exports 指向 src）。
COPY packages packages
RUN npm run build --workspace @company-os/web

FROM nginx:alpine

# nginx.conf 是模板：映像啟動時由官方 entrypoint 用 envsubst 換掉 ${API_UPSTREAM}，
# 結果寫到 /etc/nginx/conf.d/default.conf。要指向另一組 api 時只改環境變數。
ENV API_UPSTREAM=api:4420

# 建置時的 commit（issue #143）。值由 compose 的 build args 傳入，通常來自
# `npm run deploy:build`；沒有傳入時是 unknown。寧願講未知，也不要寫一個
# 看起來合理的假 SHA —— 一個假的 revision 比沒有 revision 更難查。
ARG GIT_REVISION=unknown
LABEL org.opencontainers.image.revision=$GIT_REVISION
COPY apps/web/nginx.conf /etc/nginx/templates/default.conf.template

# 啟動守門（issue #87）：憑證未設定或格式不對就不啟動。
# 放在 /docker-entrypoint.d/ 是因為 nginx 官方 entrypoint 按檔名排序執行那裡面的
# *.sh，而且只執行有執行權限的檔 —— 所以要明確 chmod，不能靠 COPY 帶來的權限。
COPY apps/web/docker-entrypoint.d/ /docker-entrypoint.d/
RUN chmod +x /docker-entrypoint.d/10-require-gateway-token.sh
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
