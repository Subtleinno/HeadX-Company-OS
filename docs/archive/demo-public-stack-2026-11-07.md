# Demo Public Stack 部署契約

狀態：契約已定，**未部署**（issue #145）
日期：2026-11-07
上位文件：`docs/testing/DEMO-PUBLIC-TESTING.md`（測試方法）、決策 C52（修訂 C26）

這份文件講「怎樣起一個隔離的 Demo 環境」。測試方法、報告格式、UI／UX 檢查清單不在這裡，看測試方法文件。

## 這是甚麼

一個獨立、可公開、用完可以整份刪掉的 Company OS。老闆、ZCode、Comet 等 browser-use AI 用它做 UI／UX 測試，不需要接觸正式資料。

**它和正式 stack 的關係只有一個：同一份原始碼、同一批映像定義。** 資料、網絡、帳戶、secret、volume 全部獨立。

## 不是甚麼

- 不是正式 stack 的另一個入口。正式 stack 仍然只經內網 `gateway-internal`。
- 不是「另一個環境的正式資料」。Demo 寫入的資料永遠不會回到正式。
- 不是註冊入口。沒有公開註冊，帳戶只由老闆建立。
- 不是「先關掉權限方便測試」。session、入口憑證、App 授權、審計在 Demo 一樣生效。

## 隔離契約（硬規則）

| 項目 | 正式 stack | Demo Public Stack | 由誰保證 |
|---|---|---|---|
| Compose project | `company-os` | `company-os-demo`（寫死在檔內，不靠 `-p`） | `demo:check` |
| Postgres 資料庫 | `company_os` | `company_os_demo` | `demo:check` |
| Postgres volume | `company-os_db_data` | `company-os-demo_db_data` | `demo:check` |
| Storage | bind mount 到主機資料夾 | named volume `company-os-demo_storage_data` | `demo:check` |
| Storage bucket | `company-os` | `company-os-demo` | `demo:check` |
| 主機端口 | 4210／4420／25432／29000／29001 | **一個都不開** | `demo:check` |
| 對外入口 | 內網 `gateway-internal` | 只經 `cloudflared` | `demo:check` |
| 入口憑證 | 正式 token | `DEMO_INTERNAL_GATEWAY_TOKEN` | `demo:check`（值不同由人輸入） |
| 帳戶 | 正式老闆／員工 | Demo 老闆／Demo 員工（`@demo.invalid`） | 見〈Demo 帳戶〉一節 |
| 環境變數 | `.env` | `.env.demo` | 檔案分開 |

三條不可退讓的：

1. **零主機端口。** Demo 的 `docker-compose.demo.yml` 沒有任何 `ports:`。任何人加回去，`npm run demo:check` 即紅。
2. **零 bind mount。** Demo 只用 named volume。bind mount 可以把任何主機路徑（包括正式資料夾）掛進來，所以一律不准。
3. **零外部資料來源。** `api` 的 `PGHOST` 必須是 compose 服務名 `db`，`MINIO_ENDPOINT` 必須是 `http://storage:9000`。指向任何主機名或外部 URL 即紅。

## 檔案

| 檔案 | 用途 |
|---|---|
| `docker-compose.demo.yml` | Demo stack 本體；公開 Demo 只用這一份 |
| `docker-compose.demo.local.yml` | 可選；本機除錯用的端口 override，**公開 Demo 不用** |
| `.env.demo.example` | 變數範本；所有 secret 留空 |
| `scripts/demo-stack.mjs` | 隔離檢查的純函數（驗 project／volume／bucket／端口） |
| `scripts/demo-stack-check.mjs` | 執行 `docker compose config` 並跑上面那組檢查 |
| `scripts/demo-stack.test.ts` | 靜態一致性與「檢查真的咬得住」的突變測試 |

## 首次部署

全部指令在 repo 根目錄執行。以下步驟會建立容器與資料，屬**部署**；未經批准不要跑。

### 1. 準備 env

```bash
cp .env.demo.example .env.demo
```

填三個值（其餘可留預設）：

```bash
# 資料庫與 storage 密碼
node -e "console.log(require('node:crypto').randomBytes(24).toString('base64url'))"

# 入口憑證（hex，至少 64 個字元）
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"

# 登入失敗審計 key
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

`.env.demo` 不進 git（`.gitignore` 已忽略 `.env.*`，只放行兩個 `.example`）。不要把正式 `.env` 的值抄過來。

### 2. 驗證設定（不起容器）

```bash
npm run demo:check          # 公開組合：必須零主機端口
npm run demo:check -- --local   # 本機除錯組合：端口只准綁 127.0.0.1 且不撞正式端口
```

兩條都要 exit 0。紅了就照它列出的那一項修，不要改檢查。

### 3. 起 stack

```bash
docker compose -f docker-compose.demo.yml --env-file .env.demo up -d
```

`name: company-os-demo` 寫在檔內，所以漏了 `-p` 也只會落在 Demo project。**不要**在 repo 根目錄跑 `docker compose up -d`（那會起正式 stack）。

### 4. 健康檢查

Demo 沒有主機端口，所以從容器內驗，不是從瀏覽器驗：

```bash
# 五個服務的狀態（db／storage／api／gateway-internal 應為 healthy，cloudflared 為 running）
docker compose -f docker-compose.demo.yml --env-file .env.demo ps

# gateway 的靜態健康檢查（nginx 直接回 ok）
docker compose -f docker-compose.demo.yml --env-file .env.demo \
  exec -T gateway-internal wget -qO- http://127.0.0.1/healthz

# API 的實質健康檢查（db 與 storage 都要 ok）
docker compose -f docker-compose.demo.yml --env-file .env.demo \
  exec -T api node -e "fetch('http://127.0.0.1:4420/health').then(async r=>console.log(r.status, await r.text()))"
```

第二、三條指令**未實測**（本張不啟動容器）。文件寫的是它們應該回答的內容，第一次部署時要當場核對，對不上就照實記錄，不要當成通過。

### 5. 對外

見下一節。Tunnel 未接通前，Demo 只有主機內部可達，等於未上線。

## Cloudflare Tunnel

規則：**一條只屬於 Demo 的 tunnel，ingress 只可以指去 Demo gateway。**

```text
Cloudflare（demo.<你的網域>）
        │
        ▼
cloudflared（Demo project 內）
        │  ingress: http://gateway-internal:80
        ▼
gateway-internal（Demo）
```

設定要點：

1. 在 Cloudflare 建立一條**新的** named tunnel，不要重用正式那條。
2. Public hostname 用 Demo 專屬子網域（例：`demo.<你的網域>`），實際值待老闆提供。
3. Service 只可以是 `http://gateway-internal:80` —— 這是 compose 網絡內的服務名，只有 Demo project 解析得到。
4. 不可以填 `127.0.0.1:4210`（正式 gateway）、`127.0.0.1:4420`（正式 API）、`25432`（正式 DB）、`29000`（正式 storage）。填了就不會通，只會令人以為「Demo 壞了」。
5. tunnel token 只放 `.env.demo` 或密碼管理工具，不進 repo、不進 issue、不進截圖。
6. Cloudflare Access、WAF、限流、Turnstile 目前**未啟用**，屬後續決定（見〈未決〉）。在這之前，Demo 的保護就是 Company OS 自己的登入、session、入口憑證與 App 授權。

Tunnel 建立與 DNS 步驟未在本 repo 自動化，也未實測（沒有 tunnel token，本張不部署）。

## Demo 帳戶

原則：**密碼只由老闆在瀏覽器輸入，不經 agent、不寫入 repo。**

### Demo 老闆

1. Demo stack 第一次啟動後，資料庫是空的，登入頁會變成「建立老闆帳戶」（只可以建立一次）。
2. 由老闆自己開 Demo 網址，填公司名、電郵（用 `@demo.invalid` 之類明顯非真實的網域）、密碼。
3. 這一步沒有 CLI、沒有種子帳戶、沒有預設密碼。這是刻意的：任何「預設帳密」都會變成公開 Demo 的後門。
4. 如果設定畫面已經用過而你還需要重設，**不要改資料庫**。整份重來：`down -v`（見〈清除測試資料〉）。改資料庫等於繞過一次審計與一次流程，之後的測試結果就不代表真實流程。

### Demo 員工

1. 用 Demo 老闆登入 → 管理區 → 員工與 Agent → 新增員工。
2. 初始密碼由老闆當場輸入。這個密碼是「一次性」的：該員工第一次登入會被要求改密碼，未改之前 `GET /api/modules` 回 `403 password_change_required`。
3. 要測「未改密碼」情境，就保留一個未登入過的員工帳戶；要測正常員工，就照流程改一次密碼。兩種狀態都要有人。
4. 不要用正式員工的姓名、電郵或任何真實個人資料。Demo 是公開環境。

### 給 agent 用的帳戶

ZCode／Comet 等 browser-use AI 需要帳密才能測。規則：

- 由老闆把帳密交給 agent，不寫進 repo、issue、PR 或文件。
- 每個測試輪次用完即換：改密碼或重建帳戶。
- **同一個帳戶不要同時給多個 agent。** 登入失敗 5 次會鎖 15 分鐘（同一 email），一個 agent 亂試會鎖死其他所有人。
- Demo 帳戶與正式帳戶完全分開；正式帳戶在任何情況下都不得用於 Demo。

## 更新到最新 main

Demo 的映像由 Demo project 自己建（`company-os-demo-api` 等），與正式 stack 的映像分開。所以更新要重建 Demo 的映像，不是重建正式的。

```bash
git pull --ff-only origin main

# 只重建，不動資料
docker compose -f docker-compose.demo.yml --env-file .env.demo build
docker compose -f docker-compose.demo.yml --env-file .env.demo up -d

# 確認沒有把端口帶回來
npm run demo:check
```

`up -d` 本身不會重建映像 —— 這與正式 stack 同一個陷阱（issue #143）。只有改了 `docker-compose.demo.yml` 才需要 `build` 之外的動作。

schema 變更會在 API 啟動時自動套 migration，與正式 stack 一樣。Demo 的 migration 只套在 `company_os_demo`。

## 清除測試資料

三個層級，按需要選最小的一個。

| 層級 | 做法 | 影響 | 幾時用 |
|---|---|---|---|
| 1. 換帳戶 | 新建一個 Demo 員工，舊的留著或停用 | 只影響該員工的測試資料 | 每輪 UI 測試之間 |
| 2. 重設整份 | `docker compose -f docker-compose.demo.yml --env-file .env.demo down -v` | 刪 Demo 的 DB 與 storage，**不碰正式**；下次啟動要重新建立老闆帳戶 | 測試資料亂了、要示範「首次設定」 |
| 3. 重建映像 | 上一節的 `build` + `up -d` | 只換程式，資料保留 | 更新程式碼 |

`down -v` 只會刪 `company-os-demo_*` 的 volume。執行前用這一條確認名稱：

```bash
docker volume ls --filter name=company-os-demo_
```

清完之後正式 stack 應該完全沒有變化 —— 〈隔離驗收〉一節有驗收方法。

**不要**用 `docker system prune -a --volumes` 之類的指令「順手清乾淨」。它會刪到正式 stack 的資料。

## 隔離驗收

每次改動 `docker-compose.demo.yml`、`.env.demo.example` 或相關腳本，跑這三條：

```bash
npm run demo:check                  # 公開組合：零端口
npm run demo:check -- --local       # 本機組合：只綁 127.0.0.1、不撞正式端口
npm test -- scripts/demo-stack.test.ts
```

第一次部署後，另外做一次**人手對照**（這些是設定檢查看不到的）：

```bash
# 1. 兩邊的容器名不重疊
docker ps --format '{{.Names}}' | grep '^company-os' | sort

# 2. 兩邊的 volume 不重疊
docker volume ls --format '{{.Name}}' | grep '^company-os' | sort

# 3. Demo 的資料庫只有 Demo 使用者（正常應該只有你剛建立的 Demo 老闆）
docker compose -f docker-compose.demo.yml --env-file .env.demo \
  exec -T db psql -U company_os_demo -d company_os_demo -c 'select email, role from app_user;'

# 4. 正式 stack 的資料沒有被動過（記下前後兩次，數字要一樣）
docker exec company-os-db-1 sh -c 'PGPASSWORD=$POSTGRES_PASSWORD psql -U $POSTGRES_USER -d $POSTGRES_DB \
  -tAc "select (select count(*) from app_user), (select count(*) from audit_log);"'
```

第 3、4 條**未實測**（本張不啟動容器）。第 4 條的容器名只在正式 project 叫這個名；換了 project 名就要相應調整。

## 安全邊界

Demo 是公開的，但要清楚「公開」到甚麼程度：

- 任何拿到網址的人都到得了登入頁。這是預期。
- 沒有登入就沒有資料。session、入口憑證、App 授權、審計照樣生效。
- 同一 email 15 分鐘內失敗 5 次會鎖 —— 這是保護，也是測試時會踩到的坑。
- 沒有 Cloudflare Access／WAF／Turnstile。所以目前沒有任何「擋 bot」或「限流」的網絡層保護，只有應用層的登入限流。
- 沒有公開註冊。帳戶只由老闆建立。
- 六個 app 全部 `available: false`。Demo 測的是底座，不是部門 app。
- Demo 不跑備份。備份腳本預設暫停的是**正式** API 容器；要對 Demo 跑備份必須先改 `BACKUP_QUIESCE_CONTAINERS` 與 `COMPANY_OS_BACKUP_ROOT`，否則會停到正式 API、把 Demo 資料寫進正式備份目錄。

## 常見陷阱

1. **`COOKIE_SECURE=true` 加 http 測試 = 登入「看似失敗」。** 瀏覽器不會為非 HTTPS 存 Secure cookie。用本機 override 除錯時要把 `DEMO_COOKIE_SECURE` 設 false。
2. **漏了 `--env-file .env.demo`。** compose 會改讀 repo 的 `.env`。變數名不同（`DEMO_*`）所以會即時失敗，不會靜靜用正式值 —— 但錯誤訊息看起來像「少了密碼」，容易誤判。
3. **以為 `docker compose up -d` 會更新程式。** 不會。要 `build`（issue #143）。
4. **以為 Demo 有 `apps` 容器。** 沒有。全部 app 都是 `available: false`，起一個空 app-host 只會令人以為「有 app 可用」。啟用 app 時才加。
5. **在 Demo 跑備份。** 見上一節。
6. **用正式帳戶測 Demo。** 任何情況下都不可以。

## 未決（要老闆決定）

1. Demo 子網域用哪一個。
2. 是否啟用 Cloudflare Access（若啟用，Comet／ZCode 這類自動化工具能不能過 Access）。
3. WAF、限流、Turnstile 要不要開。
4. Demo 資料保留幾久、幾時清。
5. Demo stack 是否長期運行（長期運行就要有人定期重設）。
6. 第一批啟用哪些 app（現階段全部不啟用）。

## 未核實

本張只做契約與文件，以下都沒有實測，不要在報告裡當成已驗證：

1. `up -d` 後四個服務是否真的 healthy、cloudflared 是否真的接上（未啟動容器）。
2. 健康檢查指令的實際輸出（〈首次部署〉第 4 步第二、三條）。
3. 經 Cloudflare Tunnel 以 HTTPS 登入的完整流程（沒有 tunnel token、沒有子網域）。
4. `COOKIE_SECURE=true` 經隧道時 session cookie 的實際屬性。
5. Demo 與正式 stack 同時運行時的資源佔用（記憶體、磁碟）。
6. Comet／ZCode 能否真的用 Demo 帳戶登入並操作。
7. `cloudflare/cloudflared:2026.10.0` 這個 tag 在長期是否仍然拉得到（已核實今日存在，未核實長期）。
