-- 品牌標誌同公司標誌（頂欄左上角，品牌 selector）。
--
-- 為咩要存喺 brand 而唔係 company_setting：標誌係「品牌」呢個範圍的資產，
-- 同 name 一樣跟住品牌走 —— 用設定值存，加第二個品牌又要改 schema。
--
-- 公司標誌為咩存喺 site：本機據點列已經係公司識別的家（company_label、city
-- 都喺呢度，`GET /company` 直接讀佢）。公司標誌同 company_label 一樣係
-- 「呢間公司係邊個」的資料，同埋一個——唔係每台機一個。
--
-- 兩欄都可空：未上載就顯示 fallback（品牌名文字／公司首字母），唔阻住開台。
-- 引用 stored_file；來源檔案被刪時 set null（標誌跟住消失，唔留死引用）。

alter table brand add column logo_file_id uuid references stored_file (id) on delete set null;

alter table site add column logo_file_id uuid references stored_file (id) on delete set null;
