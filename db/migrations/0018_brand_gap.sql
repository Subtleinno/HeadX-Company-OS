-- 品牌缺口與 Need 的連結（issue #58）。
--
-- 為咩缺口唔係「另一張表存住缺什麼」：缺什麼已經在每一頁的文件裡
-- （`brand_page_version.document.gaps`，見 #57）。文件才是缺口的主人，
-- 這裡再存一份就會出現「文件話缺、表話唔缺」。
--
-- 這一張表只記一件事：**這個缺口交咗畀邊個跟。** 所以它按 (page_id, item)
-- 唯一 —— 同一個位置只可以有一個進行中的 Need（#58 第 3 點），重複按
-- 「建立 Need」只會回同一個 Need，不會開第二張工單。
--
-- `what` 與 `type` 一併存：文件之後改了這一句（例如由「缺 SVG」變成
-- 「缺印刷版」），要講得出 Need 是為哪一句開的，不能只靠即時讀文件。
--
-- 缺口關閉唔存一個 closed 欄位：Need 驗收之後就是關閉（沿用 C06 的推導）。
-- 所以關閉狀態由 need.accepted_at 算出來，同 Needs 頁講同一件事。

create table brand_gap (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brand (id),
  page_id uuid not null references brand_page (id),
  -- 頁內位置，例如 `roles.surface`。
  item text not null,
  -- 缺什麼，例如「深色底色」。
  what text not null,
  -- file：外判可交付；judgement：只有老闆可關（#58 第 2 點）。
  type text not null,
  -- 對應的策略規則 id（`color.r1`）。冇規則管就 null，不編一個。
  rule_id text,
  need_id uuid not null references need (id),
  created_by uuid references app_user (id) on delete set null,
  created_at timestamptz not null default now(),

  constraint brand_gap_type_valid check (type in ('file', 'judgement')),
  constraint brand_gap_item_length check (char_length(item) between 1 and 120),
  constraint brand_gap_what_length check (char_length(what) between 1 and 200)
);

-- 同一個頁、同一個位置，只可以有一個 Need。
create unique index brand_gap_page_item_idx on brand_gap (page_id, item);

-- 品牌缺口對話框：一次讀一個品牌全部缺口。
create index brand_gap_brand_idx on brand_gap (brand_id, created_at desc);
