FROM node:26.13.0-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
# apps/web/tsconfig.json 繼承根目錄的 base；沒有這個檔，tsc --noEmit 會以 TS5083 失敗。
COPY tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

COPY apps/web apps/web
RUN npm run build --workspace @company-os/web

FROM nginx:alpine

# nginx.conf 是模板：映像啟動時由官方 entrypoint 用 envsubst 換掉 ${API_UPSTREAM}，
# 結果寫到 /etc/nginx/conf.d/default.conf。要指向另一組 api 時只改環境變數。
ENV API_UPSTREAM=api:4420
COPY apps/web/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
