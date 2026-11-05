-- session 綁定入口（issue #87）。
--
-- 為甚麼要有這一欄：cookie 本身只證明「有人拿著這一串 token」，不證明「這一串
-- token 是經由哪個入口發出的」。沒有這個綁定，一個由夥伴入口取得的 session
-- 只要被搬到內網入口使用，就會被當成內網員工。入口是「你從哪裡來」，
-- 這條欄位把「從哪裡來」寫進 session，之後每次讀 session 都比對。
--
-- 升級處理：舊列全部撤銷並標成 legacy。
-- 不把歷史 session 靜默當成 internal —— 那些 session 從來沒有經過入口驗證，
-- 把它們升格就等於用一個假設換走一次重新登入。代價是所有使用者升級後要重新登入
-- 一次，文件（docs/trusted-entry.md）有寫。

alter table auth_session add column entry text;

-- 1. 舊列：先標 legacy，再撤銷（同一個交易，不會有「標了但未撤銷」的中間狀態）。
update auth_session set entry = 'legacy' where entry is null;
update auth_session set revoked_at = coalesce(revoked_at, now()) where entry = 'legacy';

-- 2. 之後每一列都一定要有入口。
alter table auth_session alter column entry set not null;

-- 3. 允許的值由資料庫限制，不是靠程式記得。
alter table auth_session
  add constraint auth_session_entry_known
  check (entry in ('internal', 'partner', 'customer', 'legacy'));

-- 4. legacy 永遠不可以用：legacy 一定係已撤銷。
--    這一條令「把遺留 session 復活」在資料庫層面做不到 —— 任何人企圖把
--    legacy 的 revoked_at 改回 null，或者插入一列未撤銷的 legacy，都會被拒。
alter table auth_session
  add constraint auth_session_legacy_is_revoked
  check (entry <> 'legacy' or revoked_at is not null);

create index auth_session_entry_idx on auth_session (entry);
