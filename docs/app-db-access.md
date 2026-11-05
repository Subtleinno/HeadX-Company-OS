# app 的資料庫帳號與隔離

每個 app 有自己的 schema 與自己的 LOGIN 角色。app-host 用那個角色連線，
只能操作自己的 schema；讀 platform 或其他 app 的資料，一律經服務介面。

**`search_path` 不是安全邊界。** 它只決定未限定名稱怎樣解析；真正擋住
`public.platform_secret` 的是 Postgres 的 ACL。所以下面的授權是必要的，
不是「加多一層」。

## 命名

| 東西 | 規則 | 例子 |
|---|---|---|
| schema | 等於 manifest 的 `id` | `sales` |
| runtime 角色 | `co_app_<id>` | `co_app_sales` |
| app-host 變數 | `APP_DB_<ID>_USER`／`APP_DB_<ID>_PASSWORD`（大寫） | `APP_DB_SALES_USER` |

角色名超過 63 bytes 會**拒絕**，不會截斷 —— 截斷等於兩個 app 共用一個帳號。
env 名碰撞亦一樣（例如 `ops_finance` 與 `ops-finance` 都會變成 `OPS_FINANCE`）。

## 角色與權限矩陣

| 項目 | runtime 角色 | 說明 |
|---|---|---|
| LOGIN | 有 | app-host 用它連線 |
| SUPERUSER／CREATEDB／CREATEROLE／REPLICATION／BYPASSRLS | 一律無 | `assertRuntimeRole` 在 app-host 啟動時再核對一次 |
| 加入其他角色（`pg_auth_members`） | 0 個 | 有成員資格就當「證明唔到屬於此安裝」 |
| 擁有 schema／表／sequence | 無 | 物件由 migration 身份擁有 |
| 自己 schema 的 USAGE | 有 | |
| 自己 schema 的表 | SELECT、INSERT、UPDATE | **沒有 DELETE、TRUNCATE**（刪除用 `deleted_at`） |
| 自己 schema 的 sequence | USAGE | |
| 其他 app 的 schema | 無 | |
| `public`（platform 的表） | 無 | |
| 函數（`public`） | 無 EXECUTE | 包括 `SECURITY DEFINER` 的 |

`ALTER DEFAULT PRIVILEGES` 按**物件建立者**記錄：工具用目前連線的 migration
身份去設，所以之後 migration 建的表與 sequence 一樣有授權。設在錯的角色上
不會報錯，只會在下一次 migration 之後發現 app 讀唔到新表。

## 用法

```bash
# 1. 看會做甚麼（唯讀，可以安全地在正式庫跑）
npm run db:app-access -- plan --apps sales,support --database company_os

# 2. 套用（要明確目標與確認旗標）
APP_DB_SALES_PASSWORD=... APP_DB_SUPPORT_PASSWORD=... \
  npm run db:app-access -- apply --apps sales,support --database company_os --confirm

# 3. 核對（唯讀；有問題回非 0，可以放進部署腳本）
npm run db:app-access -- verify --apps sales,support --database company_os
```

密碼只由環境變數或 `--secrets-file <path>`（`KEY=VALUE` 一行一個）提供，
**不接受命令列參數** —— 命令列會留在 shell 歷史與程序清單。工具不會印出密碼，
`plan` 亦不需要密碼。

`--apps` 的 id 必須存在於 `apps/` 的 manifest；工具不會自己猜一份 app 清單。

### 三個子命令的分工

| 子命令 | 會寫入嗎 | 用途 |
|---|---|---|
| `plan` | 不會 | 顯示 role、schema、ACL 的差異，以及 `public` 的現況 |
| `apply` | 會（一個交易） | 建角色、建 schema、設 default ACL、授權、收斂 `public` |
| `verify` | 不會 | 等於「現在再 plan 一次，還有沒有事要做」 |

`plan` 與 `apply` 用同一份計畫物件：`apply` 會在 advisory lock 之後**自己再算一次**，
所以 `plan` 之後有人加了表或改了權限，也不會照著舊計畫做。

## PUBLIC 與預設權限

新資料庫的 `public` schema 對 PUBLIC 有 CREATE，函數預設對 PUBLIC 有 EXECUTE。
「只 REVOKE FROM app_role」不會令隔離生效 —— 任何新帳號都會自動繼承同一份權限。
所以 `apply` 會在指定資料庫之內：

- `REVOKE CREATE ON SCHEMA public FROM PUBLIC`
- `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC`（sequence 同樣）
- `REVOKE EXECUTE ON FUNCTION … FROM PUBLIC`（**只限非擴充套件擁有的函數**）

擴充套件擁有的函數不動：那些物件不屬於本安裝的 migration，撤了可能令擴充套件失效。
它們會出現在 `plan` 的 `notes`；如果同時是 `SECURITY DEFINER`，`plan` 會**阻擋**並
要求人手確認，不會靜靜放過。

資料庫層的 PUBLIC 權限（`CONNECT`、`TEMP`）只報告、不修改：那會影響同一個
cluster 的其他資料庫使用者，不在這張的授權範圍。

## 配置次序

角色是 cluster 級物件，schema 與物件是資料庫級，而 default ACL 要 schema 存在才設得。
所以次序是固定的：

1. `plan`（可選，但建議先看）
2. `apply` —— 建角色、建 schema、設 default ACL、授權既有物件
3. 跑 migration（`npm run migrate` 或 platform 啟動時的執行器）
4. `apply` **再一次**（或 `verify`）—— 把 migration 剛剛建立、但 default ACL 未覆蓋到的物件補齊
5. 起 app-host

第 4 步不可以省：default ACL 只有在「設定之後才建立的物件」生效。第一次
`apply` 之後 schema 可能還是空的，migration 建出來的表要靠第 4 步覆蓋。

## app-host 的啟動檢查

app-host 收到 `APP_DB_<ID>_USER` 之後會連一次線，核對：

- `current_user` 就是設定的那個角色
- 它不是 SUPERUSER／CREATEDB／CREATEROLE／REPLICATION／BYPASSRLS
- 它沒有加入其他角色

任何一項不符就拒絕啟動。這是「設錯成管理員帳號」唯一會響的地方 —— 系統照樣跑得動，
直到有一日某個 app 讀到別人的表。

## 隔離的限制（不要把這些當成保證）

- 兩個 app 共用同一個 app-host 程序時，同一份程式碼接觸得到該程序載入的其他憑證。
  本工具保證的是**每個資料庫角色的 ACL**，不是程序級或容器級的秘密隔離。
- 系統目錄（`pg_class` 等）仍然看得到物件名稱。schema 的存在性不是秘密。
- ACL 隔離不是人類 app 授權。誰可以登入、可以進哪個 app，仍然由 `app_user`、
  `app_grant` 與 `packages/policy` 決定。
- 這個工具不處理 platform 自己的 runtime／migration 身份分離：platform 目前仍然用
  同一個高權限連線做 migration 與查詢。

## 備份與還原

資料庫備份（`pg_dump`）**不包含** cluster 級的角色與密碼。兩者是不同的恢復項目：

1. 受保護的憑證（`APP_DB_*_PASSWORD`、`POSTGRES_*`）—— 由備份的 `config/env.backup` 取回
2. 角色與 schema 配置 —— 還原資料之後跑 `npm run db:app-access -- apply … --confirm`
3. 資料還原
4. ACL 核對 —— `npm run db:app-access -- verify …`，非 0 就唔好起 app-host
5. 起 app-host

只還原資料庫而沒有重建角色，app-host 會因為連線失敗而起唔到（這是預期行為：
寧願起唔到，不要用管理員帳號頂上）。

角色配置操作本身不會寫入 `audit_log`（它發生在資料庫之外，而且需要人手原因），
但 `plan`／`apply` 的輸出不含任何密碼，可以直接貼進維運紀錄。
