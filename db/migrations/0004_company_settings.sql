-- 公司設定與政策規則（issue #80／決策 C02、C04、C22）。
-- 門檻與政策寫在資料裡，不寫死在程式（不變量 9）；profiles/default 的種子檔只負責
-- 第一次啟動時填入，之後永遠不覆蓋。
--
-- 這兩張是 platform 的表：放在平目錄這一串，不放進任何 app 的 schema。
-- app 要讀政策只能經 platform 的介面（不變量 12），不是自己查這兩張表。

create table company_setting (
  -- 設定項的名字。合法的一組 key 寫在程式（apps/platform/src/settings/schema.ts），
  -- 這裡不另抄一份；未知 key 在寫入之前就會被拒。
  key text primary key,
  value jsonb not null,
  -- 種子填入時沒有操作者，所以是 null。
  updated_by uuid references app_user (id),
  updated_at timestamptz not null default now()
);

create table policy_rule (
  id uuid primary key default gen_random_uuid(),
  -- 這一條規則屬於哪一種對外動作（例如 payment、outbound）。
  domain text not null,
  -- 格式由程式驗證：{ "all": [ { "field": … , "op": … , "value": … } ] }。
  condition jsonb not null,
  action text not null check (action in ('allow', 'require_approval')),
  -- 數字小的先算；第一條命中者勝。
  priority integer not null default 100,
  enabled boolean not null default true,
  note text,
  created_by uuid references app_user (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 軟刪除（不變量 7）：刪除的規則仍然留在表上，只靠這個欄位表示「不再採用」。
  deleted_at timestamptz
);

-- decide 每次都由 priority 最小的開始掃同一個 domain 的規則；
-- 部分索引就是這個查詢的形狀（已刪除的不在索引內）。
create index policy_rule_decide_idx
  on policy_rule (domain, priority)
  where deleted_at is null;
