-- 組織單位與設定繼承（issue #81／決策 C18、不變量 7、8）。
--
-- 公司用通用的組織單位表達品牌、國家分部、法人；類型（type）由老闆自訂，
-- 程式不內建一張「允許的類型」清單 —— 那會迫使用家把公司塞進我們的想像。
--
-- 一個單位可以有多個上級：菱形（分店同時屬於品牌與地區）是正常形狀，不是例外。
-- 設定掛在單位上、沒設定就往上繼承；最上面是整間公司的 company_setting。
--
-- 三張都是 platform 的表（平目錄這一串），不放進任何 app 的 schema。

create table org_unit (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  type text not null check (char_length(type) between 1 and 40),
  -- 根單位：全公司只有一個，由種子建立，不可刪除、不可有上級。
  is_root boolean not null default false,
  -- ISO 3166-1 alpha-2；可以為空（不是每個單位都有國家）。
  country text check (country ~ '^[A-Z]{2}$'),
  -- ISO 4217；可以為空。
  currency text check (currency ~ '^[A-Z]{3}$'),
  -- IANA 時區名稱；格式由程式用 ICU 驗（資料庫沒有時區目錄，抄一份會過期）。
  timezone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 軟刪除（不變量 7）。
  deleted_at timestamptz
);

-- 根單位最多一列。部分唯一索引就是「全公司只有一個根」這句話的機器版本。
create unique index org_unit_single_root_idx on org_unit (is_root) where is_root;

create table org_unit_edge (
  parent_id uuid not null references org_unit (id),
  child_id uuid not null references org_unit (id),
  -- 同一個子單位的多個上級之間排序：數字小的先（繼承時先看它）。
  position integer not null default 0,
  primary key (parent_id, child_id),
  constraint org_unit_edge_no_self check (parent_id <> child_id)
);

-- 由子找上級（繼承時最常走的查詢）。
create index org_unit_edge_child_idx on org_unit_edge (child_id, position);

create table org_unit_setting (
  unit_id uuid not null references org_unit (id),
  key text not null,
  value jsonb not null,
  updated_by uuid references app_user (id),
  updated_at timestamptz not null default now(),
  primary key (unit_id, key)
);

-- 政策的規則也可以掛在某個單位上（空＝整間公司）。既有資料不受影響。
alter table policy_rule add column org_unit_id uuid references org_unit (id);

create index policy_rule_org_unit_idx on policy_rule (org_unit_id) where deleted_at is null;

-- 防成環：**在資料庫這一層擋**，不只靠程式。
-- 兩個人同時加邊時，「先查再寫」之間一定有窗口；只有 trigger 才守得住。
--
-- 做法：由「新上級」開始沿上級一直往上走；如果走到「新下級」，代表下級已經是上級的祖先，
-- 加這條邊就會成環。（自查由 check 約束負責，這裡也會回真，兩層都擋。）
-- 用 union（不是 union all）去重，所以就算資料庫裡已經有人種出環，遞歸也會停。
create function org_unit_edge_reject_cycle() returns trigger
language plpgsql
as $$
declare
  old_parent uuid;
  old_child uuid;
begin
  if tg_op = 'UPDATE' then
    old_parent := old.parent_id;
    old_child := old.child_id;
  end if;

  if exists (
    with recursive upward (unit_id) as (
      select new.parent_id
      union
      select e.parent_id
        from org_unit_edge e
        join upward on e.child_id = upward.unit_id
       -- 更新時不要把「被改的那條舊邊」算進去，否則改邊會誤判成環。
       where old_parent is null
          or not (e.parent_id = old_parent and e.child_id = old_child)
    )
    select 1 from upward where unit_id = new.child_id
  ) then
    raise exception '組織單位不可以成環：% 已經是 % 的下級（或同一個單位）', new.child_id, new.parent_id
      using errcode = '23514', constraint = 'org_unit_edge_no_cycle';
  end if;

  return new;
end;
$$;

create trigger org_unit_edge_no_cycle
  before insert or update of parent_id, child_id on org_unit_edge
  for each row execute function org_unit_edge_reject_cycle();
