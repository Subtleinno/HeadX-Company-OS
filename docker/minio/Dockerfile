# MinIO 檔案儲存（company-os 全公司共用的儲存空間）
#
# 來源：https://github.com/minio/minio 與 https://github.com/minio/mc 的官方原始碼，未修改一行。
# 版本固定（必須與 HxDesign 完全相同，不可升級）：
#   minio server  RELEASE.2025-10-15T17-29-55Z
#   mc            RELEASE.2025-08-13T08-35-41Z
#
# 為何不用官方映像：上游已不再發佈 Docker 映像，社群版只提供原始碼，
# 所以只能在本機由固定 tag 原始碼建置。建置結果與 HxDesign 現行容器一致
# （commit-id 9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a）。
#
# 授權：MinIO 是 AGPL-3.0。這是未修改的原始碼建置，私有自架已由擁有者接受。
# 這是社群版最後一個 release，不會再有安全更新，所以端口只綁 127.0.0.1，不對外開放。
#
# 注意：在這個 tag，main package 就在 repo 根目錄（不是 ./cmd/minio）。
# runtime 用 alpine 而不用 MinIO 的 ubi-micro，因為 healthcheck 需要 curl，除錯也需要 shell。

FROM golang:1.24-alpine AS build

ARG MINIO_RELEASE=RELEASE.2025-10-15T17-29-55Z
ARG MC_RELEASE=RELEASE.2025-08-13T08-35-41Z

RUN apk add -U --no-cache ca-certificates git

WORKDIR /src
RUN git clone --depth 1 --branch ${MINIO_RELEASE} https://github.com/minio/minio.git .
RUN CGO_ENABLED=0 go build -tags kqueue -trimpath \
      --ldflags "$(go run buildscripts/gen-ldflags.go $(echo ${MINIO_RELEASE} | sed 's/^RELEASE\.//'))" \
      -o /out/minio .

WORKDIR /mc
RUN git clone --depth 1 --branch ${MC_RELEASE} https://github.com/minio/mc.git .
RUN CGO_ENABLED=0 go build -tags kqueue -trimpath --ldflags "-s -w" -o /out/mc .

FROM alpine:3.21

RUN apk add -U --no-cache ca-certificates curl

COPY --from=build /out/minio /usr/bin/minio
COPY --from=build /out/mc /usr/bin/mc

EXPOSE 9000 9001
VOLUME ["/data"]

ENTRYPOINT ["minio"]
CMD ["server", "/data", "--console-address", ":9001"]
