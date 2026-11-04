-- 檔案層：一個檔案就是一列，物件在本機 MinIO。
-- 「已刪除」由 deleted_at 推導，沒有 status 欄位（不變量 5：狀態盡量用算的）。
-- 軟刪除不釋放空間，物件仍然留在 MinIO；永久清除不在這張的範圍。

create table stored_file (
  id uuid primary key default gen_random_uuid(),
  -- 由伺服器產生：files/<yyyy>/<uuid>。用戶提供的檔名永遠不參與路徑。
  storage_key text not null unique,
  -- 用戶提供的檔名，只是資料。輸出到 Content-Disposition 之前一定重新編碼。
  original_name text not null check (char_length(original_name) between 1 and 255),
  content_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references app_user (id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index stored_file_created_by_idx on stored_file (created_by);

-- 列表以 (created_at, id) 倒序，游標分頁直接走這個索引，id 用來打破同一個時間點的平手。
create index stored_file_created_at_idx on stored_file (created_at, id);
