-- 0025 吉祥物資料搬移（content 格式修正）。
--
-- 0024 的資料搬移只睇 `document->'payload'->'mascot'`。但 web 儲版本時只交
-- `content`（editor JSON，mascot 是頂層鍵），`document` 欄是 null —— 真實
-- 資料（包括 moonic）一條都搬唔到，image 頁仍然帶著吉祥物、吉祥物頁係空。
--
-- 這裡補做，只處理 content 格式（document 格式已由 0024 處理）：
--   對每個品牌的 image 現行版本，若 `content::jsonb->'mascot'` 是物件：
--     1. 吉祥物頁沒有任何版本時，插入第 1 版（content = 該 mascot 物件，
--        與 web 的 serializeMascotDoc 同一形狀：correction／spine／
--        boundaries／open／characters 五個頂層鍵）。
--     2. 為 image 插入新版本（content 去掉 mascot），note「吉祥物搬至吉祥物頁」。
--
-- 兩條安全規：
--   冪等 —— 吉祥物頁已有版本就跳過整個品牌（唔會淨係刪 image 的資料）。
--   只 INSERT —— brand_page_version 有 trigger 擋 UPDATE/DELETE。
--
-- content 可能是舊式人話（不是 JSON），cast 會炸 —— 逐行 try/catch 跳過。

do $$
declare
  img record;
  img_json jsonb;
  mascot_json jsonb;
  mascot_page_id uuid;
  mascot_count integer;
  next_ver integer;
begin
  for img in
    select pv.page_id,
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
  loop
    begin
      img_json := img.content::jsonb;
    exception when invalid_text_representation then
      continue; -- 舊式人話 content：不是搬移對象
    end;

    mascot_json := img_json->'mascot';
    continue when jsonb_typeof(mascot_json) is distinct from 'object';

    select id into mascot_page_id
      from brand_page
     where brand_id = img.brand_id
       and key = 'mascot'
       and kind = 'fixed'
       and deleted_at is null;
    continue when mascot_page_id is null;

    select count(*) into mascot_count
      from brand_page_version
     where page_id = mascot_page_id and deleted_at is null;
    continue when mascot_count > 0; -- 已經搬過（0024）或有人手建版：唔再動

    insert into brand_page_version
      (page_id, version_no, content, document, note, policy_version_id)
    values
      (mascot_page_id, 1, mascot_json::text, null, '由圖像頁搬出', img.policy_version_id);

    select coalesce(max(version_no), 0) + 1 into next_ver
      from brand_page_version
     where page_id = img.page_id and deleted_at is null;

    insert into brand_page_version
      (page_id, version_no, content, document, note, policy_version_id)
    values
      (img.page_id, next_ver, (img_json - 'mascot')::text, null, '吉祥物搬至吉祥物頁', img.policy_version_id);
  end loop;
end;
$$;
