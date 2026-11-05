# 可信 internal 入口與 session.entry

這份文件講一件事：**平台憑甚麼相信「這個請求是由內網入口轉發過來」**，以及這個答案怎樣一路帶到 session 與權限判斷（issue #87）。

---

## 1. 問題

`apps/web/nginx.conf`（gateway-internal 容器）會把 `X-Company-OS-Entry` 覆寫成 `internal`。可是那只是一條 HTTP 標頭：任何連得到 API 埠的人都可以自己寫一條。

所以「有 entry 標頭」只證明「這條標頭經過某處」，不證明「這個請求真的經過我們的 nginx」。

## 2. 答案：一條只有兩端知道的憑證

```
瀏覽器 ──► gateway-internal (nginx) ──► platform (API)
                 │  覆寫兩個標頭           │  驗證
                 │  X-Company-OS-Entry: internal
                 │  X-Company-OS-Gateway-Token: <INTERNAL_GATEWAY_TOKEN>
                 │                        │  通過 → 建立／讀取 session
```

- 標頭講「我聲稱我係內網」。
- 憑證講「而且我真的是那個轉發器」。
- 兩者**同時**成立，而且入口剛好是 `internal`，才算可信。其餘一律 `403 untrusted_entry`。

平台用 SHA-256 摘要加 `timingSafeEqual` 比較，錯誤訊息不提期望值（連長度都不提）。標頭重複、被逗號合併、或入口寫成 `partner`／`customer`／其他值，一律當作不可信 —— 不「取第一個」。

### 不可以當成信任依據的東西

以下幾樣一條都沒有用：來源 IP（Docker 網段、loopback 一樣來自任何容器）、`Host`、`Origin`、`X-Forwarded-For`、開 `trustProxy`、「看起來像內部」。

## 3. 接線位置

| 位置 | 內容 |
|---|---|
| `apps/web/nginx.conf` | 每個 `proxy_pass` 都覆寫 entry 與 token；不轉發客戶端帶來的同名標頭 |
| `apps/web/docker-entrypoint.d/10-require-gateway-token.sh` | gateway 啟動前驗格式，不合格就不起來（在 envsubst 寫出含秘密的設定之前） |
| `apps/platform/src/auth/gateway-token.ts` | 格式、摘要、定長比較（格式正則的唯一來源） |
| `apps/platform/src/auth/trusted-entry.ts` | 由標頭判斷入口；只接受 `internal` |
| `apps/platform/src/auth/entry-guard.ts` | `onRequest` 鈎子：所有路由都要通過，只有 `/livez`、`/health` 例外 |
| `db/migrations/0009_session_entry.sql` | `auth_session.entry`，值域與「legacy 一定已撤銷」由資料庫限制 |
| `apps/platform/src/server.ts` | 啟動驗憑證、裝守衛、把入口餵給 session 與 policy |

**豁免不會傳遞。** `ENTRY_EXEMPT_ROUTES` 只有 `/livez` 與 `/health`；`/health/storage` 這類診斷仍然要憑證 —— 它本身已經是情報。

## 4. 入口與 session

`auth_session.entry` 記住「這個 session 是經由哪個入口發出的」。讀 session 時，`entry` 是**查詢條件**，不是讀出來之後再比較：

```sql
where s.token_hash = $1
  and s.revoked_at is null
  and s.expires_at > $2
  and s.entry = $3          -- 當次已驗證的入口
```

所有建立或輪替 session 的地方都必須帶入當次入口：`/auth/setup`、`/auth/login`、`/auth/change-password`。老闆重設員工密碼仍然**不**替員工建立 session（#86 的規則不變）。

`entry` 的值域：`internal`、`partner`、`customer`、`legacy`。本張只發 `internal`；partner／customer 的入口未開放。

### 升級：所有人要重新登入一次

Migration `0009` 會把升級前所有 session 標成 `legacy` 並撤銷。那些 session 從來沒有經過入口驗證，把它們升格成 `internal` 等於用一個假設換走一次重新登入。資料庫另外用 check constraint 保證「legacy 一定已撤銷」，所以「把遺留 session 復活」在資料層做不到。

> 升級之後，老闆與員工都會被登出一次。這是預期行為，不是故障。

## 5. 入口與權限（policy）

`packages/policy` 只由服務端 context 取入口，不接受 HTTP body／query 指定 entry、role 或身份。`server.ts` 把守衛放進請求的那一個值餵給 `/app-grants/access/*`：

- `internal` app：只可以由 `internal` 入口進。
- `partner` app：`internal` 或 `partner`。
- `customer` app：只可以由 `customer` 入口進。

所以一個 `internal` session 進 `customer` app 會得到 `entry_not_allowed`（有真 HTTP 測試）。

**可信入口不等於登入，也不等於授權。** 有憑證但沒有 cookie 是 `401`；登入了但越權是 policy 的拒絕理由。

## 6. 設定與輪替

`.env` 只有一條：

```
INTERNAL_GATEWAY_TOKEN=
```

- 至少 32 bytes 的密碼學隨機值，**hex 編碼**（64 個以上 `0-9 a-f` 字元）。純 hex 是因為 nginx 會把值原樣寫進設定檔，引號、`$`、分號都可能變成設定注入。
- 只注入 `gateway-internal` 與 `api` 兩個容器；不注入瀏覽器、app-host、storage。
- 留空 ＝ 兩邊都拒絕啟動。**沒有預設值，沒有空值後備。**
- 產生方法見 `.env.example`。

輪替：同時更新兩邊並重啟。期間請求會直接見到 `403 untrusted_entry`（可見的失敗），不會靜靜降級成「唔驗都放行」。不接受永久雙 token。

這個值屬於**還原所需設定**：還原備份之後要重新提供（只提供變數名稱，值不入備份、不入 repo、不入任何報告）。診斷時不要用 `nginx -T` 之類會把容器內設定檔印出來的指令 —— 那份設定檔含憑證原文。

## 7. 會出現憑證的地方

| 位置 | 說明 |
|---|---|
| 容器內的 `/etc/nginx/conf.d/default.conf` | envsubst 之後含憑證原文。不要用 `nginx -T` 之類的指令把它印出來 |
| 兩個容器的環境變數 | `gateway-internal`、`api` |
| 備份的 `config/env.backup` | 那是完整的 `.env`（明文、0600、manifest 標記 sensitive），所以**憑證連同資料庫與 MinIO 密碼一齊在備份裡**。備份碟要保管好，見 `docs/backup-restore.md` |
| 日誌 | 遮罩：`buildServer` 把 gateway token、cookie、authorization 強制併入 logger 設定，呼叫者關不掉；Fastify 預設請求日誌本身不含標頭，兩層都補 |

不會出現的地方：repo、映像內容、`manifest.json`、回應內容、`audit_log`、診斷輸出。

## 8. 這道防線的邊界

**它防的是「有人能連到 API 埠、但拿不到秘密」。**

它**不**防：

- 已控制主機、Docker daemon 或容器的人（可以讀 env、可以進容器）。
- 已持有 `INTERNAL_GATEWAY_TOKEN` 的人（那就等於 gateway）。
- 主機內部的橫向移動 —— 本張沒有 mTLS，也沒有 service mesh。
- 瀏覽器與 gateway 之間的任何事（本機 http；HTTPS／Cloudflare 是後續 issue）。

換句話說：這是一條**容器之間的來源憑證**，不是端到端加密，也不是使用者身份。

## 9. 驗收

- 整合測試：`apps/platform/test/integration/trusted-entry.integration.test.ts`（真 Postgres + 真 HTTP）。覆蓋合法完整流程、無憑證、錯憑證、錯入口、重複標頭、豁免範圍、可信不等於登入、legacy 失效、所有建立與輪替路徑保留 entry、入口不相符、停用／撤銷、Origin／限流／#84／#86 不退化、憑證不外洩。
- 靜態接線：`apps/web/test/gateway-token-wiring.test.ts`（nginx 模板、Dockerfile、compose、`.env.example`）。
- 格式與比較：`apps/platform/test/auth/gateway-token.test.ts`（並核對 gateway 守門腳本用同一條正則）。
- 遮罩：`apps/platform/test/log-redaction.test.ts`。
- 真 nginx：一次「nginx 容器 + 平台 + Postgres」的實際請求，證明客戶端偽造或重複標頭經 gateway 之後只剩一個 `internal`（見 PR 的驗收矩陣）。
