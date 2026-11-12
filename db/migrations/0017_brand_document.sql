-- 品牌模組 v2：文件外殼、八個固定頁、品牌版本（issue #57，決策 C112／C113）。
--
-- 三件事：
--
-- 1. `brand_page_version.document`：內容由「一段字串」變成「一份帶型別的文件」
--    （payload ＋ layout ＋ rationale ＋ gaps ＋ refs）。`content` 仍然保留並
--    同步寫入 JSON 字串 —— 版本預覽、搜尋與舊版讀取都靠它，而且它是 NOT NULL
--    的既有欄，改它等於同時改三條查詢。
--
-- 2. 固定頁由五個變八個：加 platform、image、examples（C112 的九頁減去
--    自定義頁）。這一條 check 約束是「固定頁的鍵只可以是這幾個」的唯一來源，
--    所以要放寬兩條：固定頁可以用新鍵，自定義頁不可以佔用它們。
--
-- 3. `brand_release`：品牌版本。為什麼要有這一張表，而不是用「最後修改時間」
--    或「主頁版號」冒充：成品要釘住「當時的整組頁版本」（#57 第 8 點），
--    而主頁自己也會改。每一次儲存任何一頁，就在同一個交易內追加一列，記下
--    當時每一頁的版號。這樣「品牌 v12」是一個查得返的組成，不是畫面上的一個
--    好看數字。
--
-- 為咩 release 唔加 unique（brand_id, release_no）：兩個儲存同時提交時，號碼
-- 由 `max + 1` 在同一個品牌鎖之內計，重複號碼會令其中一個失敗 —— 而失敗的
-- 那一下是「使用者按了儲存」。號碼容許跳號（沒有 13 也可以有 14），不可以
-- 容許兩個 13 指不同的組成。

alter table brand_page_version add column document jsonb;

alter table brand_page drop constraint brand_page_fixed_key;
alter table brand_page drop constraint brand_page_custom_key;

alter table brand_page
  add constraint brand_page_fixed_key check (
    kind <> 'fixed'
    or key in ('home', 'platform', 'color', 'type', 'logo', 'tone', 'image', 'examples')
  );

alter table brand_page
  add constraint brand_page_custom_key check (
    kind <> 'custom'
    or key not in ('home', 'platform', 'color', 'type', 'logo', 'tone', 'image', 'examples')
  );

create table brand_release (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brand (id),
  release_no integer not null,
  -- 當時每一頁的版號：`[{"key":"color","versionNo":7}, …]`。
  -- 不是外鍵：release 是一張快照，頁版本之後被軟刪除仍然要讀得返。
  pages jsonb not null,
  -- 邊個按的儲存。成品釘住版本時，要講得出這一版是誰做的。
  created_by uuid references app_user (id) on delete set null,
  created_at timestamptz not null default now(),

  constraint brand_release_no_positive check (release_no > 0),
  constraint brand_release_pages_is_array check (jsonb_typeof(pages) = 'array')
);

create index brand_release_brand_idx on brand_release (brand_id, release_no desc);
