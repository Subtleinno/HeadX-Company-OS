# 備份與還原

這份文件假設你是在**系統故障之後**讀它：機器可能只剩一個能開機的磁碟、API 起不來、
或者 MinIO 的資料夾不見了。所以每個步驟都寫成可以直接複製的指令，不需要你先記得任何事。

Company OS 的持久資料只有三樣：

| 資料 | 位置 | 沒有它會怎樣 |
| --- | --- | --- |
| Postgres | Docker named volume `company-os_db_data` | 沒有老闆帳戶、沒有檔案紀錄、沒有審計 |
| MinIO 物件 | `MINIO_DATA_DIR`（這部機是 `C:/company-os-data/minio`） | 檔案紀錄仍然在，但檔案本身打不開 |
| 設定 | `docker-compose.yml`、`.env` | 起得來，但連不上資料，或者密碼不對 |

`C:` 是系統碟。備份一定要寫到另一粒實體碟：**寫在同一粒碟上的備份，在碟壞掉時會與資料一起消失。**

---

## 一次性設定

### 1. 準備另一粒碟

在第二粒碟上建立一個資料夾，例如 `D:\company-os-backups`。**不需要**在裡面先建子資料夾，
工具會自己建 `company-os/<backup-id>/`。但**根目錄必須先存在**：本工具刻意不自動建立，
避免打錯字時靜靜寫到別的地方。

### 2. 設定 `.env`

```dotenv
COMPANY_OS_BACKUP_ROOT=D:/company-os-backups
COMPANY_OS_DATA_ROOT=C:/company-os-data
BACKUP_RETENTION=7
BACKUP_INTERVAL_HOURS=24
BACKUP_QUIESCE_CONTAINERS=company-os-api-1
```

`COMPANY_OS_BACKUP_ROOT` 留空、指向 `C:`、指向 `C:/company-os-data` 之內、不存在、
不可寫入，備份都會**拒絕執行**並講明原因。

### 3. 排程（Windows Task Scheduler）

```powershell
schtasks /create /tn "Company OS Backup" /sc daily /st 03:00 ^
  /tr "cmd /c cd /d C:\company-os && npm run backup:create && npm run backup:prune"
```

想改用「常駐迴圈」也可以（間隔由 `BACKUP_INTERVAL_HOURS` 決定，`0` 表示只跑一次）：

```powershell
cd C:\company-os
npm run backup:schedule
```

排程備份與手動備份走同一段程式，所以失敗時的行為一樣：**失敗不會刪除任何既有備份**。

---

## 日常操作

```powershell
npm run backup:create                     # 建立一份完整備份
npm run backup:list                       # 列出備份（含 verified／TEST-ONLY 標記）
npm run backup:verify -- --backup-id <id> # 驗證指定備份（省略 --backup-id 驗最新一份）
npm run backup:prune                      # 按 BACKUP_RETENTION 清理
npm run backup:prune -- --keep 3          # 這次只保留 3 份
npm run storage:check                     # 儲存空間遺失檢查
```

`backup:create` 成功時會印出 backup ID、目錄、檔案數與大小、一致性策略與自我驗證結果。
失敗時退出碼是 1，錯誤訊息會指出是哪一步（根目錄、容器、pg_dump、MinIO、驗證）。

選項名稱要寫對：`--backup-id`、`--keep`、`--target-db`、`--target-bucket`、
`--create-target-db`、`--purge-bucket`、`--database`、`--bucket`、`--yes`、`--test-only-root`。
打錯的選項會直接報錯並列出可用選項，不會被靜靜忽略（例如把 `--backup-id` 寫成 `--id`）。

如果備份根目錄是那個 TEST-ONLY 的系統碟資料夾，**每一條指令**都要加 `--test-only-root`，
包括 `list`、`verify`、`prune`、`restore`、`storage:check`。例外每一次都要明示，不會被記住。

### 保留策略

- 只有**通過驗證**的備份才會計入保留數量。
- 未驗證的備份不會被自動刪除，留給人判斷。
- 不論 `--keep` 設成多少，**永遠保留至少一份已驗證備份**。
- 刪除前會再驗一次；驗不過就跳過，並印出原因。
- `--keep` 小於 1 會被改成 1 並印出提示（不是靜靜改成 1）。

---

## 備份格式

```
<COMPANY_OS_BACKUP_ROOT>/company-os/<backup-id>/
  manifest.json              # 機器可讀：檔案清單、大小、SHA-256、版本、一致性
  checksums.sha256           # sha256sum 格式，可用系統工具核對
  verified.json              # 這份備份在建立後通過自我驗證
  postgres/dump.pgc           # pg_dump 自訂格式（-Fc）
  minio/index.json            # 物件清單：key、大小、內容雜湊、content-type
  minio/objects/<sha1>.bin    # 每個物件的內容（檔名是 key 的 SHA-1，不是原檔名）
  config/docker-compose.yml
  config/env.backup           # 真正的 .env（含密碼），要求 0600，manifest 標記 sensitive
  config/versions.json        # git commit、Node、Postgres、MinIO 版本、migration 清單
```

- backup ID 格式 `YYYYMMDD-HHMMSS-<6 位十六進位>`（UTC）。
- `manifest.json` **不含任何檔案內容**，也不含 `.env` 的值，只有路徑、大小與雜湊。
- `config/env.backup` 亦包含容器之間的入口憑證 `INTERNAL_GATEWAY_TOKEN`（issue #87）。
  還原之後兩端要用**同一個**值才起得來；文件只寫變數名稱，不在任何報告、issue 或清單
  列出它的值。
- `config/env.backup` 是明文機密，與備份放在同一粒碟上：備份碟本身要保管好，
  不要上傳到雲端、不要放在共用資料夾。

### 一致性策略

Company OS 只有 `api` 容器會寫 Postgres 與 MinIO。備份流程是：

1. 停掉 `BACKUP_QUIESCE_CONTAINERS` 列出的容器（預設 `company-os-api-1`），凍結寫入。
   容器不存在就即刻失敗；容器本來就已經停了，會記在 manifest 的 `quiesce.alreadyStopped`。
2. `pg_dump`（本身是單一交易快照）。
3. 經 S3 協定逐個下載物件。
4. **再列一次物件清單**，比對兩次的 key／大小／ETag 簽章。不同就代表凍結期間仍然有人在寫：
   這份備份會標成 `usable: false` 並回報失敗（檔案會保留，作為證據）。
5. 產生 manifest 與 checksums，自我驗證，最後才把暫存目錄改名成正式目錄。
6. 無論成敗，重新啟動剛才停掉的容器；啟動失敗會以 `unquiesce_failed` 報告。

沒有任何一步是「先寫好再說」：暫存目錄用 `.tmp-` 開頭，`backup:list` 與 `prune` 都會忽略它。

---

## 還原

> 還原是破壞性操作：會覆蓋目標資料庫與 bucket。**沒有 `--yes` 會直接拒絕，不會動任何資料。**

### 先演練（建議每次做完備份都做一次）

```powershell
# 1. 建立拋棄式資料庫（不要用正式庫）
docker compose exec -T db psql -U company_os -d company_os -c "create database co_restore_qa"

# 2. 還原到拋棄式資料庫與獨立 bucket
npm run restore -- --backup-id <id> --yes --target-db co_restore_qa --target-bucket co-restore-qa

# 3. 確認資料在
docker compose exec -T db psql -U company_os -d co_restore_qa -c "select count(*) from app_user"

# 4. 清掉演練環境
docker compose exec -T db psql -U company_os -d company_os -c "drop database co_restore_qa with (force)"
```

還原流程會先做這幾件事，任何一項不過就停手：

1. 備份目錄存在、manifest 可解析、每個檔案的 SHA-256 相符、`checksums.sha256` 相符。
2. Postgres dump 真的是 `pg_dump` 格式，而且 `pg_restore` 讀得到。
3. MinIO 索引可讀、物件檔齊全、數量與 manifest 相符。
4. 這份備份的 `consistency.verified` 是 `true`（否則 `not_usable`）。
5. Postgres 主版本與這一部機相同（不同就 `version_incompatible`）。

還原之後會自己檢查：migration 清單與備份相符、每個物件都在 bucket 內。

### 真正的災難復原

```powershell
# 1. 從備份碟取回 compose 與環境設定
copy D:\company-os-backups\company-os\<id>\config\docker-compose.yml C:\company-os\
copy D:\company-os-backups\company-os\<id>\config\env.backup C:\company-os\.env

# 2. 起 db 與 storage（不要先起 api，它會跑 migration）
docker compose up -d db storage

# 3. 建一個空資料庫再還原（--create-target-db 會代做）
npm run restore -- --backup-id <id> --yes --create-target-db --target-db company_os

# 4. 起 api 與 web，確認健康
docker compose up -d api web
curl.exe -sS --noproxy "*" http://127.0.0.1:4420/health
curl.exe -sS --noproxy "*" http://127.0.0.1:4420/health/storage

# 5. 確認登入與檔案都還在（用瀏覽器開 http://127.0.0.1:4210）
```

MinIO 如果換了資料夾（例如新的碟），先改 `.env` 的 `MINIO_DATA_DIR`，起 storage，
再執行上面的 restore：物件是經 S3 協定寫回去的，不需要手動搬 `xl.meta` 之類的內部檔案。

---

## 儲存空間遺失

```powershell
npm run storage:check
```

同時也會在 `GET /health/storage` 看到（API 只看得到 bucket 與物件，看不到 host 的資料夾）：

| 錯誤碼 | 意思 | 怎麼辦 |
| --- | --- | --- |
| `minio_not_running` | storage 容器沒有在跑 | `docker compose up -d storage`；起不來就看 `docker logs company-os-storage-1` |
| `data_dir_missing` | `MINIO_DATA_DIR` 指到的資料夾不存在 | 接回正確的碟，或改 `.env` 指向真正的資料夾。**不要**改成空資料夾就當修好 |
| `data_dir_empty` | 資料夾存在但是空的 | 通常是路徑指錯（指到一個新資料夾）。先確認路徑，再還原 |
| `permission_denied` | 沒有讀寫權限 | 檢查資料夾 ACL／擁有者 |
| `minio_unreachable` | 連不上 MinIO | 確認容器狀態與 `127.0.0.1:29000` |
| `bucket_missing` | bucket 不見了 | **不要建立空 bucket 當成修好**，直接還原 |
| `object_missing` | bucket 在，但探測物件不見 | 資料被刪或只還原了一半，從備份還原 |
| `object_unreadable` | 讀得到 bucket 但讀不到物件 | 通常是權限或磁碟錯誤，先看 `docker logs` |

`storage:check` 會把結果寫入 `audit_log`（`storage.check`），並在指引裡指出最近一份已驗證的備份。

**API 起不來的時候，用 `storage:check`，不要等 `/health/storage`。** API 啟動時就要連
MinIO，連不上會直接退出（`無法初始化檔案儲存：connect ECONNREFUSED …`），
所以那條路由那時根本不存在。`storage:check` 直接從主機檢查容器、資料夾與 bucket，不需要 API。
它同時看得到 host 上的 `MINIO_DATA_DIR`，這是 API 看不到的一半。

反過來說，`bucket_missing` 在 `/health/storage` 上幾乎不會出現：API 啟動時若 bucket 不見，
`initStorage()` 會**自動建立一個空 bucket** 再繼續。所以「bucket 不見」要靠
`storage:check` 或者「重啟 API 之後發現檔案全部不見了」才發現。重建一個空 bucket
不等於修好 —— 資料要從備份還原。


---

## 備份失敗

| 症狀 | 原因 | 處理 |
| --- | --- | --- |
| `backup_root_unset` | `.env` 沒有 `COMPANY_OS_BACKUP_ROOT` | 設定它 |
| `backup_root_on_system_drive` | 指向 `C:` | 改到另一粒碟 |
| `backup_root_inside_source` | 指向資料目錄之內 | 改到與資料無關的位置 |
| `backup_root_missing` / `_not_writable` | 資料夾不存在／唯讀 | 建好資料夾、檢查碟是否接好 |
| `quiesce_container_missing` | 找不到要暫停的容器 | 確認 `BACKUP_QUIESCE_CONTAINERS` 與 `docker ps` 的名稱一致 |
| `inconsistent_snapshot` | 凍結期間仍然有寫入 | 檢查是否有其他程式在寫；這份備份標記為不可用 |
| `verify_failed` | 備份寫完但驗不過 | 磁碟可能有問題；不要刪掉舊備份，先查碟 |
| `unquiesce_failed` | 備份成功但 API 起不回來 | 立即 `docker compose up -d api`，再看 `docker logs` |

失敗一定會留痕：`<BACKUP_ROOT>/company-os/logs/backup.log`（一行一 JSON）與 `audit_log`
（`backup.create`／`backup.verify`／`backup.restore`／`backup.prune`／`storage.check`）。
資料庫壞掉時，碟上的 log 是唯一還讀得到的紀錄。

---

## 災難復原檢查清單

按順序做，不要跳步。

1. [ ] 確認壞的是什麼：`docker compose ps`、`npm run storage:check`、`docker logs company-os-api-1`。
2. [ ] 確認備份碟接好：`dir D:\company-os-backups\company-os`。
3. [ ] 列出備份，記下要用的 ID：`npm run backup:list`。
4. [ ] 驗證那份備份：`npm run backup:verify -- --backup-id <id>`，要見到 `VERIFY_OK`。
5. [ ] 取回 `config/docker-compose.yml` 與 `config/env.backup`（改名為 `.env`），
       確認 `COMPANY_OS_BACKUP_ROOT` 與 `MINIO_DATA_DIR` 指向正確位置。
6. [ ] 起 db 與 storage：`docker compose up -d db storage`。
7. [ ] 建空資料庫並還原 Postgres：`npm run restore -- --backup-id <id> --yes --create-target-db`。
8. [ ] 起 api 與 web：`docker compose up -d api web`。
9. [ ] `curl.exe -sS --noproxy "*" http://127.0.0.1:4420/health` 要是 `status: ok`。
10. [ ] `/health/storage` 要是 `code: ok`。
11. [ ] 瀏覽器開 `http://127.0.0.1:4210`，登入得到，首頁正常。
12. [ ] 開一個舊檔案（下載得到）與上傳一個新檔案，證明檔案層可用。
13. [ ] 立刻做一份新備份：`npm run backup:create`，並 `npm run backup:verify`。
14. [ ] 把這次事件的處理過程寫進 `audit_log` 之外的營運紀錄（誰在什麼時候做了什麼）。

---

## 密碼唔可以靠還原「找返」

Company OS 冇「忘記密碼」的電郵／簡訊重設，亦冇繞過登入的重設端點（issue #86）。
唯一的重設路徑是：另一位已登入的老闆用 `POST /staff/:id/reset-password` 重設員工。
老闆本人忘記密碼時，**還原備份不是一個免費的補救方法**，因為：

- 還原會把**所有**資料退回到備份那一刻，不只密碼。備份之後才做的單據、檔案、
  授權與審計紀錄都會消失，而 `audit_log` 只准追加，那些紀錄救不回來。
- 還原會令所有 session 失效，所有人要重新登入。
- 你要先知道「哪一份備份的密碼是你記得的」，而這通常正是你不知道的事。

所以請把老闆的密碼當成基礎設施的一部分保管（密碼管理器、密封副本），
而不是當成「到時還原就得」。若真的需要主機本機的緊急復原工具，
應另開一張獨立的安全設計 issue；本專案**不會**暗藏預設後門、通用密碼或免驗證重設。

---

## 已知限制

- **這部機目前只有一粒碟（`C:`）。** 驗收時用 `C:\company-os-test\TEST-ONLY\backups`
  這種明確標記的資料夾，`manifest.json` 會記 `testOnly: true`，`backup:list` 也會標
  `TEST-ONLY`。這種備份**不具備異碟保護**，不可以當成正式備份。
  真正的跨碟備份要等第二粒碟接上之後才有辦法驗證。
- 備份期間 API 會停機（凍結寫入），時間與資料量成正比；單人使用的 Company OS 通常是數秒。
- 備份是明文。`config/env.backup` 是完整的 `.env`，內有資料庫與 MinIO 密碼：
  - Linux／macOS 會設成 0600。
  - **Windows 不支援 POSIX 權限**：Node 傳的 mode 會被忽略，檔案實際上所有人可讀。
    `backup:create` 會因此印出警告（`備份內的 config/env.backup 有密碼…`）。
    備份碟請用 BitLocker 加密，並限制只有授權帳戶能讀取。備份碟的保管責任在操作者。
- 不支援增量備份、雲端備份、異地備援。
- 還原不處理 Postgres 主版本升級：版本不同就拒絕，請先在相同主版本還原。
