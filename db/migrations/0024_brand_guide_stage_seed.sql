-- Stage 元資料種子：12 個 stage 的順序、名稱、依賴前 stage。
-- 來自 Perplexity idea Branding stage0–4h（reference 的 schema 前綴見下）。
--
--   stage0  業務基礎（起點，無依賴）
--   stage1  定位與張力（依賴 0）
--   stage2  材質感官（依賴 1）
--   stage3  語言語氣（依賴 1、2）
--   stage4a 核心識別（依賴 0、1、2、3）
--   stage4b 表面系統（依賴 4a）
--   stage4c 動態與影音（依賴 4b）
--   stage4d 3D 與產品（依賴 4c）
--   stage4e UI/UX 與空間（依賴 4d）
--   stage4f 行銷與模板（依賴 4e）
--   stage4g 跨媒體治理（依賴 0–4f 全部）
--   stage4h 風格庫與 AI 契約（依賴 0–4g 全部）

insert into brand_guide_stage (stage, name_zh, sort_order, depends_on) values
  ('stage0',  '業務基礎',          0,  '{}'),
  ('stage1',  '定位與張力',        1,  '{stage0}'),
  ('stage2',  '材質感官',          2,  '{stage0,stage1}'),
  ('stage3',  '語言語氣',          3,  '{stage0,stage1,stage2}'),
  ('stage4a', '核心識別',          4,  '{stage0,stage1,stage2,stage3}'),
  ('stage4b', '表面系統',          5,  '{stage4a}'),
  ('stage4c', '動態與影音',        6,  '{stage4b}'),
  ('stage4d', '3D 與產品',         7,  '{stage4c}'),
  ('stage4e', 'UI/UX 與空間',      8,  '{stage4d}'),
  ('stage4f', '行銷與模板',        9,  '{stage4e}'),
  ('stage4g', '跨媒體治理',        10, '{stage0,stage1,stage2,stage3,stage4a,stage4b,stage4c,stage4d,stage4e,stage4f}'),
  ('stage4h', '風格庫與 AI 契約',  11, '{stage0,stage1,stage2,stage3,stage4a,stage4b,stage4c,stage4d,stage4e,stage4f,stage4g}')
on conflict (stage) do nothing;
