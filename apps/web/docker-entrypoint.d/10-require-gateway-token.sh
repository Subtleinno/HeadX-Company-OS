#!/bin/sh
#
# gateway 啟動前的入口憑證檢查（issue #87）。
#
# nginx 官方 entrypoint 會按檔名排序執行 /docker-entrypoint.d/*.sh，
# 20-envsubst-on-templates.sh 才會把 ${INTERNAL_GATEWAY_TOKEN} 代入設定檔。
# 這個檔叫 10 開頭，就是「先驗，後寫」：憑證不合格時，含秘密的設定檔
# 連寫都不會寫出來，容器直接不啟動。
#
# 為甚麼要在這裡驗而不是只靠 platform 驗：gateway 是寫入標頭的一方。
# 讓一個憑證空白的 gateway 起動，等於讓它把空憑證寫進每個請求，
# 之後每個請求都會被 platform 以 403 拒絕 —— 整個系統「看似健康但全部不能用」。
# 寧願它起不來。
#
# 格式與平台共用同一條正則（apps/platform/src/auth/gateway-token.ts 的
# GATEWAY_TOKEN_PATTERN_SOURCE）。下面這一串是逐字複製，平台那邊有一條測試
# 讀這個檔核對，兩邊漂移會變紅。
#
# 不寫 `set -eu`：這個檔會被 entrypoint 用「.」source 執行，set 會漏到
# 之後的腳本。用明確判斷已經足夠。

pattern='^[0-9a-fA-F]{64,}$'
token="${INTERNAL_GATEWAY_TOKEN:-}"

if ! printf '%s' "$token" | grep -Eq "$pattern"; then
  echo "INTERNAL_GATEWAY_TOKEN 未設定或格式不正確：需要至少 32 bytes 的 hex（64 個以上 0-9 a-f 字元）。gateway-internal 不會啟動。" >&2
  echo "產生方法見 .env.example；這個值不可以寫進 repo、映像或報告。" >&2
  exit 1
fi
