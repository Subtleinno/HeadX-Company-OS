-- 品牌（brand）同據點（site）：Frame 上面兩個 selector 同 Boss Portal 的目錄。
--
-- 為咩品牌要一張表，而唔係一個設定值：
-- 品牌 selector 選完之後，全站每一個畫面（Marketing 的素材、Sales 的報價）
-- 都要跟住轉。呢個係「範圍」而唔係「設定」——設定只有一個值，範圍會有幾個
-- 並存，而且會增加（開新品牌）。用設定值存，加第二個品牌就要改 schema。
--
-- 為咩據點冇「在線」欄：設計稿（frame-06）明講「目錄唔顯示即時在線狀態」。
-- 一旦存一個 is_online，就要有人去維護它，而它一定會有一日過時，
-- 結果係畫面講「在線」但實際上連唔到——比唔講更差。所以只存「最後憑證交換
-- 時間」，由讀的人自己判斷新舊。
--
-- 為咩 invite 只存 hash：一次性邀請憑證（72 小時、單次）等於半條密碼。
-- 資料庫被讀走時，存明文等於送出入權。所以寫入時只留 sha256，
-- 明文只在建立那一刻回傳一次，之後任何人都攞唔返。

create table brand (
  id uuid primary key default gen_random_uuid(),
  -- 對人同對外都用得著的短代碼（moonic、hxdesign）。app 的資料會引用它。
  code text not null unique,
  name text not null,
  -- 顯示次序由老闆決定，唔用建立時間：新開的品牌唔應該自動排最前。
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint brand_code_format check (code ~ '^[a-z0-9][a-z0-9-]{1,15}$'),
  constraint brand_name_length check (char_length(name) between 1 and 60)
);

create index brand_order_idx on brand (sort_order, name);

create table site (
  id uuid primary key default gen_random_uuid(),
  -- 例如 HK-HQ-01、CN-SZ-01。同 Need 的 code 一樣，人講呢個比講 uuid 快。
  code text not null unique,
  name text not null,
  -- 呢個據點屬於邊間公司（滿月堂集團、Moonic JP）。據點唔一定同公司同名。
  -- nullptr = 未設定：公司名本來就係老闆入嘅資料，我哋唔應該替他作一個。
  company_label text,
  city text,
  -- 本機 = 你而家正在用嘅這一台。全公司只可以有一台。
  is_local boolean not null default false,
  -- pending：已登記但對方未回傳確認碼；registered：憑證交換完成；
  -- revoked：撤銷。冇 'online'，理由見檔頭。
  status text not null default 'pending',
  -- 憑證指紋（SHA-256 的十六進位）。畫面只顯示頭尾幾位。
  fingerprint text,
  -- 對方機器的入口網址。冇填就冇得「開新分頁」——寧願唔顯示，
  -- 都好過開一個連唔到的分頁。本機唔需要（你已經喺上面）。
  entry_url text,
  last_credential_at timestamptz,
  -- 一次性邀請憑證：只存 hash 同到期時間；used_at 有值就代表用過。
  invite_token_hash text,
  invite_expires_at timestamptz,
  invite_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_code_format check (code ~ '^[A-Z0-9]{1,8}-[A-Z0-9]{1,8}-[A-Z0-9]{1,4}$'),
  constraint site_status_valid check (status in ('pending', 'registered', 'revoked')),
  constraint site_name_length check (char_length(name) between 1 and 80),
  constraint site_company_length check (company_label is null or char_length(company_label) between 1 and 80),
  constraint site_city_length check (city is null or char_length(city) between 1 and 40),
  -- 本機一定係已登記：如果本機都只係「待批准」，即係冇一個地方可以批准它。
  constraint site_local_registered check (not is_local or status = 'registered'),
  -- 有到期時間就要有 hash，反之亦然。半套憑證等於一個永遠對唔到的邀請。
  constraint site_invite_pair check ((invite_token_hash is null) = (invite_expires_at is null))
);

-- 全公司只可以有一台本機。部分唯一索引比「程式記得檢查」可靠。
create unique index site_single_local on site (is_local) where is_local;

create index site_order_idx on site (is_local desc, status, code);

create function site_touch_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger site_touch
  before update on site
  for each row
  execute function site_touch_updated_at();
