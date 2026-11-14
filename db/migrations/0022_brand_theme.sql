-- 品牌主題（整個 app 的皮膚）。
--
-- 為咩掛在 brand 而唔係 company_setting：一個安裝可以有多個品牌（moonic、
-- hxdesign），而「現在畫面是哪一個品牌的樣」跟著用戶正在做的品牌走，不是
-- 跟著安裝走。放 company_setting 會變成「一間公司只有一個皮膚」，那第二個
-- 品牌就只能靠改公司設定來偷渡。
--
-- 為咩可以係 null：未設主題 = 今日的畫面。預設值寫在程式
-- （contracts 的 DEFAULT_BRAND_THEME），不在這裡填一份 —— 填了就會有一份
-- 永遠沒人更新、卻看起來很像真相的預設。
alter table brand
  add column theme jsonb,
  add constraint brand_theme_object check (theme is null or jsonb_typeof(theme) = 'object');

comment on column brand.theme is
  '品牌主題：色、漸變、字體、圓角。null = 未設定，畫面用內建預設（DEFAULT_BRAND_THEME）。';
