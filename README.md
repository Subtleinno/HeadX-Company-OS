# Company OS

給任何一間公司的 AI 原生公司軟件（company starter）：一部機器一間公司，全部自架在 Docker，裝完是空的，由老闆建立帳戶後再設定公司。

## 這是什麼

- 公司由一個 **Boss portal**（老闆的入口）和多個部門 app 組成。程式碼按 app 模組化，容器按版本打包；Postgres 與 MinIO 是所有容器共用的底座。
- 單一入口、單一登入頁；登入後只看到被授權給自己的 app。
- AI 盡力做事；AI 做不到的才變成 Need 派給員工，員工交成果，老闆驗收。
- 本 repo 不執行 AI 模型。AI 是外部客戶端，只經 MCP 的六個動詞（browse、read、write、find、render、help）連入，MCP 永遠沒有 approve 工具。
- 對外訊息一律先進發件箱，由規則決定放行或交老闆批准。
- 香港與大陸各裝一份，是兩間獨立公司，帳戶分開。主機是公司自己的電腦。
- 安裝時選版本：國際版有完整的對外入口（夥伴、客戶、Cloudflare）；大陸版第一階段只做內網，通知以站內為主，選配企業微信與飛書。安裝將由 UI 精靈協助。

## 現在到哪裡（2026-11-04）

已完成（全是地基）：CI、端口只綁本機與 ports:check、MinIO 檔案儲存、migration 執行器與只准追加的審計表、首次開機與老闆登入、登入失敗審計去識別化、模組註冊、檔案層、網站外殼（一）、備份與還原程式、scrypt 參數調高至 N=2^17（舊雜湊登入時自動升級）。

進行中或等待：跨碟備份還原驗收（#64，等第二粒實體碟）、ports:check 顯示佔用者（#45）。

還沒有：多容器架構（gateway、platform、app-host、各部門 app）、員工與授權、Need、MCP、發件箱與批准、Boss portal「今日」、部門 app、背景隊列、LAN 存取、安裝精靈、國際版與大陸版 profile。老闆目前能看到的只有：建立老闆帳戶、登入、一個誠實的空「今日」頁。

**注意：** 目前的程式仍是單一 api 加單一 web，目錄結構是整理前的狀態。目標結構見 `docs/architecture/CODE-MAP.md`，搬遷切片是 R1 至 R6；下面的開發與運行說明描述的是現況，在這些切片合併前有效。

## 文件入口

| 文件 | 內容 |
| --- | --- |
| `docs/INDEX.md` | 唯一入口與一個真相表 |
| `AGENTS.md` | 給 AI agent 的開工規則與不變量 |
| `docs/product/MASTER-PLAN.md` | 全盤計劃（source of truth）：架構、資料模型、93 張 issue 清單（含國際版）、里程碑 |
| `docs/product/DECISIONS.md` | 決策日誌 |
| `docs/architecture/CODE-MAP.md` | 目錄、模組、分層、邊界規則、搬遷切片 |
| `docs/architecture/REPO-MAP.md` | 現況對照、入口、容器與端口表 |
| `docs/backup-restore.md` | 備份與還原 |

以下是開發與運行說明（現況）。

## 需求

- Node.js 26.13.0（見 `.nvmrc`）
- Docker Desktop（目標是長期開機的 Windows 機）

## 首次啟動

在 repo 根目錄執行：

```powershell
copy .env.example .env
npm ci
npm run ports:check
docker compose up -d --build
```

**首次啟動前必須在 `.env` 內的 `POSTGRES_PASSWORD`、`MINIO_ROOT_PASSWORD` 與 `LOGIN_FAILURE_HASH_KEY` 填入自己的值** —— 範本刻意留空，沒有可用的預設值；留空時 `docker compose` 會即時失敗，不會起一個弱密碼的服務。

前端：<http://localhost:4210>；API：<http://localhost:4420/livez>。所有端口現在只綁 `127.0.0.1`，區網內其他機器連不到；讓同事連線的 LAN 設定屬於 S2-02，尚未完成。

`npm run ports:check` 會檢查 `.env` 內的端口能否綁定，再探測有沒有人正在回應（容器發佈的端口「綁得上」但其實已被佔用，所以兩樣都要查）；有衝突或無法確認會列出原因，並以 exit 1 結束。它現在讀 `packages/edition-profile` 的版本設定：版本由 `EDITION` 決定（預設 `intl`，另一個是 `cn`），未知的值會即時報錯，不會默默當成國際版。

## 端口（現況）

| 服務 | `.env` 變數 | 預設 |
| --- | --- | --- |
| gateway-internal（原本叫 web） | `GATEWAY_INTERNAL_PORT` | 4210 |
| api | `API_PORT` | 4420 |
| apps（只屬大陸版，profile `apps`） | `APPS_PORT` | 4431 |
| db | `DB_PORT` | 25432 |
| storage（S3 API） | `PORT_MINIO_API` | 29000 |
| storage（console） | `PORT_MINIO_CONSOLE` | 29001 |

`WEB_PORT` 已改名為 `GATEWAY_INTERNAL_PORT`（S1-02）：只有舊名的 `.env` **不用改也可以照樣啟動**（compose 寫成 `${GATEWAY_INTERNAL_PORT:-${WEB_PORT:-4210}}`），`npm run ports:check` 會提示改名但不會因此失敗。

內網入口（`gateway-internal`）在每一個轉發去後端的請求上寫入 `X-Company-OS-Entry: internal`，並**先覆寫**客戶端自帶的同名標頭，所以後端可以信任這個值；回應一律帶 `X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`Referrer-Policy: same-origin`（連 404 與 5xx 都有，全部 `always`）。夥伴與客戶兩個入口屬 S8-01，現時未存在。

**目標端口表與版本差異以 `packages/edition-profile` 為準**：哪個版本有哪個容器、每個容器的端口與預設值都只寫在那裡，`docs/architecture/REPO-MAP.md` 的端口表與 `.env.example` 由 `npm test` 的一致性測試釘住，不會各說各話。上表是現況（真的存在的五個容器）；`gateway-partner`、`gateway-customer`、`cloudflared` 與兩個 portal 仍是 `planned`，未有容器。

## 檔案儲存

MinIO，版本固定：server `RELEASE.2025-10-15T17-29-55Z`、mc `RELEASE.2025-08-13T08-35-41Z`。上游不再發佈 Docker 映像，所以由 `docker/minio/Dockerfile` 在本機用官方原始碼的固定 tag 編譯（首次建置要數分鐘，需要連 github.com 與 Docker Hub）。授權是 AGPL-3.0，未修改原始碼，私有自架。大陸版將提供預先建置的映像或離線安裝包（S2-06）。

資料放在 Windows 資料夾（bind mount），不是 Docker volume。這是刻意的：檔案是唯一無法重新生成的資料，`docker compose down -v` 不可以刪得到它。

```
# .env
MINIO_DATA_DIR=D:/company-os-data/minio
```

Windows 路徑用正斜線。換硬碟只是改這一行；備份工具直接指向這個資料夾即可。留空時用 repo 內的 `./.data/minio`（已在 `.gitignore`），只適合試用。

**不要自己在這個資料夾放檔案。** MinIO 每個物件都是一個資料夾（內含 `xl.meta` 等檔案），手動放進去的檔案不會出現在 bucket 裡，也不會被讀到。

證明資料真的留在資料夾：

```powershell
npm run storage:smoke -- write
docker compose down -v
docker compose up -d
npm run storage:smoke -- verify
```

`write` 寫入 `_smoke/persist-check.txt`，`verify` 確認它仍然存在。console：<http://127.0.0.1:29001>（只綁本機）。

### 檔案層

登入的人可以上傳、下載、刪除檔案。一個檔案就是一個檔案，未關聯任何業務物件。

- `POST /files`：原始 bytes 作 body，`content-type` 是檔案類型，檔名放 `x-file-name`（URL 編碼的 UTF-8）。單檔上限由 `MAX_UPLOAD_BYTES` 決定（預設 200 MiB），超過回 413。
- `GET /files/:id`：下載，支援單一 `Range`（影片可以拖動，回 206）。`GET /files` 列出自己看得到的檔案，游標分頁。
- `DELETE /files/:id`：軟刪除，只寫 `deleted_at`。物件仍留在 MinIO，**不會釋放空間**；永久清除尚未實作。

員工只看得到自己上傳的檔案，老闆看得到全部未刪除的。上傳與刪除會寫入 `audit_log`（`file.upload`、`file.delete`），detail 不含檔名。

## 登入

- 密碼用 scrypt 雜湊；session 是隨機 token，資料庫只存它的 SHA-256。
- **目前參數**：`N=131072`（2^17）、`r=8`、`p=1`、`keylen=64`、`maxmem=138412032`（132 MiB），
  只在 `apps/platform/src/auth/password.ts` 的 `SCRYPT_PARAMS` 定義一次，其他地方不得 hardcode。
  - `maxmem` 是 132 MiB 而不是 128 MiB：`128 × N × r` 只是資料本身的大小，OpenSSL 另外要
    `128 × r × (N + p + 2)`，比 128 MiB 多 3 KiB。用 128 MiB 會在第一個密碼就拋
    `ERR_CRYPTO_INVALID_SCRYPT_PARAMS`，即整個密碼功能起不來。
  - 實測（Node 26.13.0）：`N=16384` 平均 78ms、`N=131072` 平均 453–493ms（最大 610ms）。
    每次登入會多約 0.4 秒，峰值記憶體約 184 MiB RSS。
- **雜湊字串自帶參數**（`scrypt$N$r$p$salt$hash`），所以調高參數不會令舊密碼失效：
  驗證時用該筆自己記錄的 `N`／`r`／`p`。
- **登入時自動升級**：舊參數的密碼驗證成功後，會用新參數與**新 salt** 重新雜湊並寫回，
  所以一個舊帳戶只會多付一次升級成本。已經是新參數的不會重新雜湊；比目標更強的不會降級。
  - 升級失敗**不會**阻止本次登入：會寫一列 `auth.password_upgrade_failed` 審計
    （只記原因與 SQLSTATE），下次登入再試。
  - 寫回是條件更新（`where id = ? and password_hash = ?`），期間有人改了密碼就不會覆蓋。
- **驗證一定用固定 64 bytes 派生長度**，不是用字串裡 hash 的長度。scrypt 的輸出是前綴穩定的，
  用後者會令「被剪短的雜湊」反而驗得過。長度不符、參數非法（`N` 不是 2 的次方、
  超過記憶體上限）、格式錯誤一律回 `false`，登入回 401 而不是 500。
- 同一個 email 15 分鐘內失敗 5 次就鎖，鎖定期間連正確密碼都回 429（附 `Retry-After`）。
  不存在的 email 與錯密碼的回應完全相同，回應時間也拉平。
- **登入失敗不會把 email 寫進審計表。** `audit_log` 只准追加，任何人打一次字就永遠留在裡面，
  所以失敗紀錄的 `target` 是 `email_hmac:<64 hex>`：用 `LOGIN_FAILURE_HASH_KEY` 對正規化後的
  email 做 HMAC-SHA256。同一個 email 穩定對應同一個碼（限流靠這一點），但由碼還原不出 email。
  成功登入的 `auth.login` 仍然寫明文 email —— 那是已存在的帳戶，`app_user` 本來就有。
- 沒有 `LOGIN_FAILURE_HASH_KEY` 時 API 會拒絕啟動並講明原因；少於 32 bytes 會在啟動時出警告。
- **換 key 的後果**：舊的失敗紀錄是用舊 key 算的，與新 key 算出來的識別碼不再對應，
  所以換 key 的那一刻，窗口內正在生效的限流計數會失效（等於把鎖全部解開一次）。
  這是刻意的取捨：寧願短暫失去計數，也不要為了連續性而保留舊 key。
  換 key 請在沒有人正在暴力嘗試的時候做，並把它當成一次憑證輪換記錄下來。

## 資料庫

Migration 是純 SQL，API 啟動時自動套用；套不上就結束，不會起一個 schema 不完整的服務。有兩種位置，可以同時存在：

| 位置 | 屬於 | 編號 | ledger 內的名字 |
|---|---|---|---|
| `db/migrations/NNNN_說明.sql` | platform 自己的串（平目錄） | 由 `0001` 起連續 | `0001_audit_log.sql`（原樣，不加前綴） |
| `db/migrations/<schema>/NNNN_說明.sql` | 一個 app 一串 | **每一串各自**由 `0001` 起連續 | `<schema>/0001_xxx.sql` |

- 套用次序固定：**平目錄先，再按 schema 名稱字母順序**。不支援跨串依賴 —— 一個 app 的 migration 不可以假設另一個 app 的表已經存在。
- 串的資料夾名就是 schema 名：小寫字母開頭，只用小寫英數與底線，最多 41 個字元；`public`、`information_schema`、`pg_` 開頭一律拒絕。資料夾裡有不合名的檔案（例如 `notes.txt`）也拒絕啟動。
- 只往前加：已套用的檔案永不修改（內容一變就拒絕啟動），同一串內新檔編號接續，不可以跳號。
- 加一個 app migration：新增 `db/migrations/<schema>/0001_xxx.sql`，重啟 api 就會套用。**不要**在 `db/migrations/` 下為任何 app 開資料夾，除非那個 app 真的要開始寫自己的表。
- 串的檔案在同一個交易內先 `create schema if not exists`、再 `set local search_path`：schema 與表一齊成功或一齊消失，`SET LOCAL` 亦不會漏到下一串。所以未限定名稱的新表會落在該 schema，**不會**回退去 public 找表。
- **`search_path` 不是權限隔離。** 它只控制未限定名稱怎樣解析；同一條有權限的連線仍然可以用 `public.表名` 讀寫任何表。app 之間的 runtime 權限隔離由真正的 Postgres ACL（`#88`）負責。
- Migration 是**經審查、隨程式發佈的可信 SQL**，不是使用者可提交的任意 SQL；沒有公開的 migration 執行入口。正式 app migration 不得依賴其他 app 或 platform 的私有表 —— 這是審查契約，不由資料庫強制。
- 檔案發現與各串 ledger 一致性**全部驗證完**才開始套用：發現不合法檔案時，不會先套用其他新 migration。執行 SQL 才失敗的話，先前已提交的檔案保留，之後的檔案不執行。
- `audit_log` 只准追加：UPDATE／DELETE／TRUNCATE 由 trigger 擋掉（SQLSTATE `42501`）。
- 整合測試用臨時資料庫 `co_test_<隨機>`，不寫入正式資料庫。

## 模組

「有哪些部門軟件」只有一個來源：`apps/<id>/manifest.json`。加資料夾就是安裝，刪資料夾就是卸載，重啟 api 生效（沒有熱重載）。

`apps/` 底下同時住兩種東西，載入器靠檔案分辨：有 `manifest.json` 的是 app（模組）；只有 `package.json` 的是服務（`apps/platform`、`apps/web`），不是模組，忽略；兩者都沒有就是孤立資料夾，啟動失敗。

- 九個欄位：`id`（等於資料夾名）、`title`、`kind`（`console` 或 `department`）、`department`（部門模組必填，老闆台是 `null`）、`order`、`available`、`route`、`exposure`、`sensitive`。
- `route`：這個 app 掛在哪條路徑，必須以 `/` 開頭，而且所有 manifest 之間不可重複（兩條一樣的路徑，等於有一條永遠到不了）。
- `exposure`：`internal`、`partner`、`customer` 其中之一，省略時當作 `internal`。
- `sensitive`：`true` 或 `false`，**沒有預設值** —— 未講不可以當成不敏感。
- 現時六個 manifest 的 `route`、`exposure`、`sensitive` 都是**暫定值，等 app 設計討論後確認**：（見下表）
- `available: false` 代表那個軟件尚未建立，網站會照實說，不會給一個按了沒反應的入口。
- 載入時驗證：JSON 合法、欄位齊全、無未知欄位、id 等於資料夾名且格式正確、id／department／route 不重複、只有一個 console、`apps/` 下沒有孤立檔案或孤立資料夾。任何一項不合格就印出哪個檔、哪個欄位，並以 exit 1 結束。
- `GET /modules`：未登入 401；老闆見全部並依 `order` 排序；員工只見到自己部門那一個。回應仍然只有六個欄位（`id`、`title`、`kind`、`department`、`order`、`available`），`route`、`exposure`、`sensitive` 不對外輸出。

| id | `route` | `exposure` | `sensitive` |
|---|---|---|---|
| `boss` | `/boss` | `internal` | `true` |
| `design` | `/design` | `internal` | `false` |
| `sales` | `/sales` | `internal` | `false` |
| `ops_finance` | `/ops-finance` | `internal` | `true` |
| `hr` | `/hr` | `internal` | `true` |
| `support` | `/support` | `internal` | `false` |

新增一個 app 時：在 `apps/<id>/` 放 `manifest.json`，並在 `apps/platform/Dockerfile` 加一行 `COPY apps/<id>/manifest.json ./apps/<id>/manifest.json`（Docker 的 COPY 不支援只複製某個名稱的檔案）。忘記加的話 `apps/platform/test/modules/dockerfile-manifests.test.ts` 會紅。

## app-host

`apps/app-host` 是**同一個映像載入多個 app** 的執行器（決策 C32）。與 platform 的分工：platform 提供「有哪些 app」的清單與登入；app-host 真正把 app 的 API 與網頁跑起來。

- **`APP_SET`**：逗號分隔的 app id，決定這個容器載入哪些 app。**留空或未設定＝不載入任何 app，容器照樣健康** —— 這是預設值，repo 內沒有任何預設清單。
- **`APPS_DIR`**：app 的位置，映像內預設 `/app/apps`。每個 id 要有 `<APPS_DIR>/<id>/manifest.json`（驗證規則與 platform 完全一樣，同一份 `packages/contracts`），以及建置好的 `<id>/dist/index.js`；有 `<id>/dist/web` 就順便在 `route` 前綴下當靜態網頁提供。
- **`exposure` 必須一致**：同一個容器只可以載入同一種 `exposure` 的 app，否則啟動失敗並指出是哪兩個（`apps/sales 與 apps/partner_desk 的 exposure 不同…`）。
- **資料庫**：app 自己宣告 `needsDatabase: true` 就一定要有 `APP_DB_<ID 大寫>_USER` 與 `APP_DB_<ID 大寫>_PASSWORD`（連同共用的 `PGHOST`／`PGPORT`／`PGDATABASE`）。連線的 `search_path` 只有該 app 的 schema；**沒有帳號就拒絕啟動，不會回退用共用帳號**。帳號本身由 `#88` 建立，本張只消費環境提供的帳號。
- `/livez` 只講「進程還在」；`/health` 列出已載入的 app 與各自狀態。任何 app 載入失敗，或者 route 掛不上，程序以非 0 退出並印出 app id 與原因，不會假裝健康。

`apps` 服務在 compose 的 **`apps` profile** 之下：預設 `docker compose up -d` 不會啟動它。

```powershell
docker compose --profile apps up -d apps   # 只啟動 app-host
curl --noproxy "*" http://127.0.0.1:4431/health
```

現時**沒有任何真實 app**：`APP_SET` 留空，`/health` 顯示已載入 0 個 app。第一個 app 落地時，除了 `apps/app-host/Dockerfile` 要加 `COPY apps/<id>/…`（與 platform 一樣的道理），`APP_SET` 亦要同時更新。

## 測試

```powershell
npm test                 # 單元測試（CI 跑這一個）
npm run test:integration # 整合測試，需要 storage 在跑
npm run lint
npm run build
```
