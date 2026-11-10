-- 示範資料：品牌（Frame 品牌 selector）同據點（Boss Portal 據點目錄）。
--
-- 可以重複跑：每一句都係 insert / update，最後把三行據點調回同一狀態。
-- 唔會刪真資料，只會刪測試流程開出來的 `SG-SG-*`。
--
-- 指紋用真嘅 SHA-256（64 個十六進位字），畫面自己縮短成 `4D:91…B6`；
-- 唔好把已經截短的字串寫入資料庫，否則會再縮一次變成 `4D:91…1…`。

insert into brand (code, name, sort_order) values
  ('moonic', 'Moonic 滿月堂', 10),
  ('hxdesign', 'HxDesign', 20),
  ('subtle-inn', 'Subtle Inno', 30)
on conflict (code) do nothing;

-- 本機據點：真安裝時係程式補上嘅一行（未有公司名、未有城市），
-- 示範資料補回公司身份。真實系統由老闆自己填，呢度唔會替他作。
--
-- 程式自動補嘅代碼會係 `XX-HQ-01`（拿唔到安裝代碼時用 XX）；
-- 示範統一改成 `HK-HQ-01`，令畫面同設計稿一致。
update site
   set name = case when name = '本機' then '香港（總部）' else name end,
       code = case when code = 'XX-HQ-01' then 'HK-HQ-01' else code end,
       company_label = coalesce(company_label, '滿月堂集團'),
       city = coalesce(city, '香港'),
       fingerprint = coalesce(fingerprint, encode(sha256('demo-local-site-credential'), 'hex')),
       last_credential_at = coalesce(last_credential_at, now() - interval '1 day')
 where is_local;

-- 第二台：深圳，已登記、有入口網址（所以目錄會出「開新分頁」）。
insert into site (
  code, name, company_label, city, is_local, status, fingerprint, entry_url, last_credential_at
) values (
  'CN-SZ-01', '深圳', '滿月堂（深圳）', '深圳', false, 'registered',
  encode(sha256('demo-credential-shenzhen'), 'hex'),
  'https://sz.moonic.example/',
  now() - interval '2 days'
)
on conflict (code) do nothing;

update site
   set status = 'registered',
       fingerprint = coalesce(fingerprint, encode(sha256('demo-credential-shenzhen'), 'hex')),
       entry_url = coalesce(entry_url, 'https://sz.moonic.example/'),
       last_credential_at = coalesce(last_credential_at, now() - interval '2 days'),
       invite_token_hash = null,
       invite_expires_at = null
 where code = 'CN-SZ-01';

-- 第三台：東京，待批准，等對方回傳確認碼（所以目錄會出「批准」）。
insert into site (
  code, name, company_label, city, is_local, status, invite_token_hash, invite_expires_at
) values (
  'JP-TK-01', '東京', 'Moonic JP', '東京', false, 'pending',
  encode(sha256('demo-invite-token-tokyo'), 'hex'),
  now() + interval '48 hours'
)
on conflict (code) do nothing;

update site
   set status = 'pending',
       fingerprint = null,
       last_credential_at = null,
       entry_url = null,
       invite_token_hash = encode(sha256('demo-invite-token-tokyo'), 'hex'),
       invite_expires_at = now() + interval '48 hours'
 where code = 'JP-TK-01';

-- 清走測試流程開出來的據點，令目錄回到設計稿嗰三行。
delete from site where code like 'SG-SG-%';
