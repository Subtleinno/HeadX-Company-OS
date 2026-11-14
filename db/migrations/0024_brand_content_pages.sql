-- 0024 品牌內容頁擴充：吉祥物、長影片、短影片（v2.2）。
--
-- 三件事：
--
-- 1. CHECK 放寬：固定頁鍵加 mascot／video-long／video-short；自訂頁禁用名單同步；
--    策略槽加 mascot／video。
--
-- 2. 策略全文：mascot 與 video 各一版（max(version_no)+1），照 0016 風格。
--
-- 3. Backfill + 資料搬移：
--    a. 每個品牌補齊 mascot／video-long／video-short 三頁（照 0020 模式）。
--    b. 對每個品牌的 image 現行版本，若 payload.mascot 存在，建立 mascot 頁第 1 版
--       （document.payload = 該 mascot 物件），並為 image 插入一個新版本
--       （內容 = 舊 payload 去掉 mascot），note 寫「吉祥物搬至吉祥物頁」。
--       注意 brand_page_version 有 trigger 擋 UPDATE/DELETE —— 這裡是插入新版本，
--       不是改舊版本。

-- ── 1. CHECK 約束 ──────────────────────────────────────────────

alter table brand_page drop constraint brand_page_fixed_key;
alter table brand_page drop constraint brand_page_custom_key;

alter table brand_page
  add constraint brand_page_fixed_key check (
    kind <> 'fixed'
    or key in ('home', 'platform', 'color', 'type', 'logo', 'tone', 'image', 'mascot', 'examples', 'video-long', 'video-short')
  );

alter table brand_page
  add constraint brand_page_custom_key check (
    kind <> 'custom'
    or key not in ('home', 'platform', 'color', 'type', 'logo', 'tone', 'image', 'mascot', 'examples', 'video-long', 'video-short')
  );

alter table brand_policy_version drop constraint brand_policy_slot_known;

alter table brand_policy_version
  add constraint brand_policy_slot_known
  check (
    slot in (
      'platform', 'color', 'type', 'logo', 'image', 'mascot', 'video', 'tone', 'home', 'apply', 'custom'
    )
  );

-- ── 2. 策略全文 ────────────────────────────────────────────────

insert into brand_policy_version (slot, version_no, content, note)
select 'mascot', coalesce(max(version_no), 0) + 1, $p$你在定一個角色的邊界：它可以出醜，但不可以出錯。

固定骨架：修正與作廢要寫明以前講錯了甚麼、為甚麼改，否則外判會照舊版做。核心一句講這個吉祥物代表品牌的哪一句話，不是外形描述。邊界逐條寫可以出醜與不可以出錯的界線，每一條要可以被違反才算邊界。未決列出還未定的問題，留空不等於沒有問題。角色資產每個角色一筆，帶圖檔與角色定位。

讓品牌不一樣：角色之間的關係與分工；核心一句與品牌立場句的呼應。

缺：冇角色圖檔就標缺，這是檔案型缺口。不畫假角色，不為冇圖的角色編外形描述。

不准越過專業判斷：吉祥物不可以做診斷、承諾療效、代替持牌人士發言。它可以笨、可以撞板、可以出醜 —— 那是性格；它不可以講錯專業的事 —— 那是事故。$p$, $n$吉祥物策略全文（v2.2）$n$
  from brand_policy_version where slot = 'mascot';

insert into brand_policy_version (slot, version_no, content, note)
select 'video', coalesce(max(version_no), 0) + 1, $p$你在定一支片的規格、結構與邊界，不是「拍一條片」。

固定骨架：影片立場一句。規格寫時長、畫幅（直屏／橫屏）、節奏。結構三段：開頭鉤子、中段、結尾行動，三段都要寫。聲音、字幕、封面三樣都要寫明。已核准範例按格式標註，至少一支真片。要與不要各列具體動作。

長片偏敘事與教育，短片偏前三秒鉤子與直屏 —— 兩者共用同一套欄位，差異在提示與重點。

讓品牌不一樣：鉤子的做法、字幕的風格、封面的構圖規則。

缺：冇真片就標缺，不用示意圖假扮已核准。冇時長或畫幅就剪不出對的片。

不准縮放當答案：同一套系統落在直屏與橫屏要重新構圖，縮放會令字級下限與安全區失效。音樂與素材要寫授權狀態，冇授權的音樂不可以出街。$p$, $n$影片策略全文（v2.2）$n$
  from brand_policy_version where slot = 'video';

-- ── 3a. Backfill：補齊三個固定頁 ────────────────────────────────

insert into brand_page (brand_id, kind, key, name, sort_order)
select b.id, 'fixed', f.key, f.name, f.sort_order
  from brand b
 cross join (values
   ('mascot',      '吉祥物',   72),
   ('video-long',  '長影片',   92),
   ('video-short', '短影片',   94)
 ) as f(key, name, sort_order)
on conflict (brand_id, key) where deleted_at is null
do update set sort_order = excluded.sort_order;

-- ── 3b. 資料搬移：image 的 mascot 搬到 mascot 頁 ─────────────────
--
-- 對每個品牌的 image 現行版本，若 document->'payload'->'mascot' 存在且不是 null：
--   1. 為該品牌的 mascot 頁插入第 1 版（document.payload = 該 mascot 物件）。
--   2. 為 image 插入一個新版本（payload 去掉 mascot），note = 「吉祥物搬至吉祥物頁」，
--      policy_version_id 沿用舊版那一版。
--
-- 注意：brand_page_version 有 trigger 擋 UPDATE/DELETE，所以這裡只做 INSERT。

do $$
declare
  img_page   record;
  mascot_doc jsonb;
  img_doc    jsonb;
  new_img_doc jsonb;
  mascot_page_id uuid;
  next_ver   integer;
begin
  for img_page in
    select pv.id as old_version_id,
           pv.page_id,
           pv.document,
           pv.content,
           pv.policy_version_id,
           p.brand_id
      from brand_page_version pv
      join brand_page p on p.id = pv.page_id
     where p.key = 'image'
       and p.kind = 'fixed'
       and p.deleted_at is null
       and pv.deleted_at is null
       and pv.version_no = (
         select max(v2.version_no)
           from brand_page_version v2
          where v2.page_id = pv.page_id and v2.deleted_at is null
       )
       and pv.document is not null
       and pv.document->'payload'->'mascot' is not null
       and jsonb_typeof(pv.document->'payload'->'mascot') = 'object'
  loop
    mascot_doc := img_page.document->'payload'->'mascot';

    -- 為 mascot 頁插入第 1 版
    select id into mascot_page_id
      from brand_page
     where brand_id = img_page.brand_id
       and key = 'mascot'
       and kind = 'fixed'
       and deleted_at is null;

    if mascot_page_id is not null then
      -- 只在 mascot 頁還沒有任何版本時插入第 1 版（冪等）
      select coalesce(max(version_no), 0) + 1 into next_ver
        from brand_page_version
       where page_id = mascot_page_id and deleted_at is null;

      if next_ver = 1 then
        insert into brand_page_version (page_id, version_no, content, document, note, policy_version_id)
        values (
          mascot_page_id,
          1,
          jsonb_build_object(
            'schema', 2,
            'stance', null,
            'payload', mascot_doc,
            'layout', jsonb_build_object('blocks', jsonb_build_array(
              jsonb_build_object('kind', 'section', 'source', 'characters', 'reason', '角色資產是這一頁的主體。')
            )),
            'rationale', '{}'::jsonb,
            'gaps', '[]'::jsonb,
            'refs', '[]'::jsonb
          )::text,
          jsonb_build_object(
            'schema', 2,
            'stance', null,
            'payload', mascot_doc,
            'layout', jsonb_build_object('blocks', jsonb_build_array(
              jsonb_build_object('kind', 'section', 'source', 'characters', 'reason', '角色資產是這一頁的主體。')
            )),
            'rationale', '{}'::jsonb,
            'gaps', '[]'::jsonb,
            'refs', '[]'::jsonb
          ),
          '由圖像頁搬出',
          img_page.policy_version_id
        );
      end if;
    end if;

    -- 為 image 插入新版本（payload 去掉 mascot）
    img_doc := img_page.document;
    new_img_doc := jsonb_set(
      img_doc,
      '{payload}',
      (img_doc->'payload') - 'mascot'
    );

    select coalesce(max(version_no), 0) + 1 into next_ver
      from brand_page_version
     where page_id = img_page.page_id and deleted_at is null;

    insert into brand_page_version (page_id, version_no, content, document, note, policy_version_id)
    values (
      img_page.page_id,
      next_ver,
      new_img_doc::text,
      new_img_doc,
      '吉祥物搬至吉祥物頁',
      img_page.policy_version_id
    );
  end loop;
end;
$$;
