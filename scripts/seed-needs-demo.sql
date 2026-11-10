-- 本機／Demo 用的 Needs 示意資料（issue 184）。
--
-- 呢個檔**唔係** migration：migration 只可以往前走、唔可以重跑，而示意資料
-- 應該隨時可以刪。用法（喺 worktree 根目錄）：
--
--   docker compose -p company-os-needs exec -T db \
--     psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < scripts/seed-needs-demo.sql
--
-- 重跑安全：先按 code 刪走同一批示意資料，再插入。唔會碰其他 Needs。
--
-- 資料刻意做成「有逾期、有未認領、有交付、有決定」，因為空的畫面
-- 睇唔出排序、計數同顏色是否正確。
--
-- 認領人一律用老闆：need 表有 check 約束要求 assignee_id 與 claimed_at
-- 一齊有或一齊無，所以已認領的列一定要有人。

delete from need where code like 'COS-HK-9%';

insert into need
  (code, title, detail, kind, assignee_id, due_at,
   claimed_at, uploaded_at, absorbed_at, accepted_at, created_at)
values
  (
    'COS-HK-901',
    '拍攝新包裝實物照（正面、側面、成分標籤）',
    E'秋季包裝已經定稿，需要三張實物照：正面、側面、成分標籤。\n光線用自然光，白底。相片上載後 agent 會自動去背，加入素材庫。',
    'deliverable',
    null,
    now() - interval '2 days',
    null, null, null, null,
    now() - interval '4 days'
  ),
  (
    'COS-HK-902',
    '秋季活動主視覺：從兩個方向選一個',
    E'agent 已經做好兩個版本的構圖，但品牌語氣要你判斷，agent 唔應該代你揀。\n方向 A：以藥材質感為主；方向 B：以人像為主。兩版素材都齊，選好就可以直接排。',
    'decision',
    null,
    now() - interval '5 days',
    null, null, null, null,
    now() - interval '6 days'
  ),
  (
    'COS-HK-903',
    '補產品成分說明，供設計排版使用',
    '現有文案缺少成分表。需要你提供正式成分名稱與百分比，agent 負責排入版面。',
    'deliverable',
    (select id from app_user where role = 'owner'),
    now() + interval '1 day',
    now() - interval '1 day', null, null, null,
    now() - interval '3 days'
  ),
  (
    'COS-HK-904',
    '整理 2026 秋季渠道報價',
    '三間代理的報價已經收到，需要你確認哪一間可以列入正式比較。',
    'deliverable',
    (select id from app_user where role = 'owner'),
    now() + interval '3 days',
    now() - interval '2 days', now() - interval '1 day', null, null,
    now() - interval '5 days'
  ),
  (
    'COS-HK-905',
    '確認新店招牌尺寸',
    '裝修圖則有兩個版本，招牌尺寸未定。確認後 agent 可以直接出新店物料。',
    'decision',
    (select id from app_user where role = 'owner'),
    now() + interval '5 days',
    now() - interval '1 day', now() - interval '1 day', now() - interval '1 day', null,
    now() - interval '2 days'
  ),
  (
    'COS-HK-906',
    '上月供應商對帳單簽回',
    '對帳單已經核對完成，需要你簽回。',
    'deliverable',
    (select id from app_user where role = 'owner'),
    now() - interval '20 days',
    now() - interval '20 days', now() - interval '19 days',
    now() - interval '19 days', now() - interval '18 days',
    now() - interval '21 days'
  );
