-- 品牌頁策略（issue #34，決策 C102）。
--
-- 為咩策略只有一份、唔係逐品牌一份：
--   策略講的是「這一類頁要怎樣做」—— 同一類專業標準，唔會因為換了品牌而
--   變成另一套。逐品牌一份，等於同一個標準要改 N 次，改漏一個品牌就會
--   出現兩套做法而冇人知。品牌之間的差異住喺各品牌自己的頁（色彩、字體、
--   語氣…），唔住在策略裡。
--   真有一日要每品牌一套，加一個 nullable 的 brand_id 落 slot 表就可以
--   （null＝公司通用），唔需要推翻這一張。
--
-- 為咩槽（slot）唔係一張 table 一個 column：
--   六個槽的內容會獨立改版 —— 改標誌槽唔應該令色彩槽多一版。所以版號是
--   (slot, version_no) 逐槽計，同品牌頁版本一樣用 max(version_no) 算現行。
--
-- 為咩冇 deleted_at、冇 restore：
--   issue #34 講「只加不改」。刪除與回滾都會令「頁版本記住它當時用的策略
--   版本」出現指向一個已消失的版本的引用。要改就另存一版；舊版永遠讀得返。

create table brand_policy_version (
  id uuid primary key default gen_random_uuid(),
  -- 六個槽。鍵與品牌頁的鍵對得上（custom 是自定義頁通用）。
  slot text not null,
  -- 逐槽由 1 起。號碼不會重用：歷史要對得返。
  version_no integer not null,
  content text not null,
  -- 這一版為咩存在。唔寫就係 null，唔會作假摘要。
  note text,
  created_by uuid references app_user (id) on delete set null,
  created_at timestamptz not null default now(),

  constraint brand_policy_slot_known check (
    slot in ('home', 'logo', 'color', 'type', 'tone', 'custom')
  ),
  constraint brand_policy_version_no_positive check (version_no > 0),
  constraint brand_policy_content_length check (char_length(content) between 1 and 200000),
  constraint brand_policy_note_length check (note is null or char_length(note) between 1 and 200),
  constraint brand_policy_version_unique_no unique (slot, version_no)
);

create index brand_policy_current_idx
  on brand_policy_version (slot, version_no desc);

-- 只加不改：任何 UPDATE 與 DELETE 一律拒絕。
-- 同品牌頁版本唔同：那邊軟刪除是合法操作，這邊連軟刪除都冇 ——
-- 一個已出街成品可能引用某一版策略，那一版要永遠讀得返。
create function brand_policy_version_append_only() returns trigger
language plpgsql
as $$
begin
  raise exception '策略版本只准追加，不准改寫或刪除' using errcode = '42501';
end;
$$;

create trigger brand_policy_version_no_update
  before update on brand_policy_version
  for each row
  execute function brand_policy_version_append_only();

create trigger brand_policy_version_no_delete
  before delete on brand_policy_version
  for each row
  execute function brand_policy_version_append_only();

-- 第一版內容：六個槽的全文。
--
-- `note` 留空：這一版不是任何人揀的，寫「第一版」只是把「第 1 版」講兩次；
-- 更不應該在畫面寫 issue 編號 —— 讀的人不知道 #34 是什麼，那句話只對寫的人
-- 有意義。版本列表要講的是「這一版為咩存在」，而它存在的理由就是：功能上線。
--
-- 為咩寫在 migration 而唔係程式裡的常數：策略正文只有一個住處 —— 資料庫。
-- 程式裡再放一份，兩份總有一份會過時，而畫面上看不出哪一份才是真的。
-- 這一版之後的所有改動都經 Boss Portal 另存新版，不會回頭改這個檔。
insert into brand_policy_version (slot, version_no, content) values
('home', 1, $policy$你在把這個品牌現有的每一頁編成一份主頁，不是在另做一套識別。

必讀每一頁的現行版本，包括自定義頁。清單不能寫死。缺頁標成缺，不准虛構內容補洞。

不另造色值、字體、標誌規則或語氣。要改規則就改來源頁。設計師在主頁上的改動，是下次重編必須保留的指示。加了頁就要重編。

輸出 HTML，需要才加 CSS 和 JavaScript。必須有：這個品牌是誰的一段、標誌的預設用法、色彩角色的可見樣本、字體層級的可見樣本、語氣短例、每一頁的入口、缺頁、版本。$policy$),
('logo', 1, $policy$色值只引用色彩頁角色。品牌單色預設 `brand.primary`。單色正引用 `ink`。反白引用 `paper`。深底引用深色 `surface`。角色名以色彩頁為準；色彩頁未定那個角色，就標成缺，不要在標誌頁補一個色。

不重畫已定稿字標。不決定字體家族和語氣。

這個槽要把規則寫齊，不要寫「維持上一版」—— repo 裡沒有上一版，寫了等於叫下一個人自己發明。至少要有：五類資產（Logo、Wordmark、Mark、Monogram，以及 App icon 與 favicon 合起來一類）、安全範圍 X、分模式最小尺寸、四種顏色模式、錯誤用法並附示例、主檔是向量、缺的標成缺。$policy$),
('color', 1, $policy$每一個色都要有角色。分品牌色、閱讀色、功能色，不准混用。`ink` 與 `paper` 必須存在。功能色不可用於標誌。內文對底至少 4.5:1，大字至少 3:1。螢幕用 HEX 與 RGB，印刷用 CMYK。淺色與深色是兩套對應。不決定標誌的安全範圍和最小尺寸。缺的角色標成缺。

角色名由這一頁定，並且要寫死、公開，因為其他頁只引用名字。至少要有 `brand.primary`、`ink`、`paper`、深色 `surface`。其他頁不准另創一個同義角色（例如把主色叫成「主色」）。某個角色未有值，標成缺，不要填一個「差不多」的色。$policy$),
('type', 1, $policy$你在做字體系統，不是在挑一個好看的字。每個層級都要有角色：display、heading、body、caption。沒有角色的字級不准存在。

不要重畫已定稿的字標。字標是標誌頁的資產。若字標用了某個字，在這一頁登記該字和授權，但不要用它重排字標。

文字顏色只引用 `ink`、`muted` 或色彩頁已核准的角色。不發明色。對比沿用色彩策略。

繁中和拉丁字母必須分開指定，並說明怎樣配對。缺中文或缺英文就標成缺，不准用系統預設字充當品牌字。

必須有：家族與授權、角色、尺寸與行距、准用字重、中英配對、備用字、各文字角色的最小尺寸、內文行長、對齊、錯誤用法、版本。

備用字只作渲染後備，不可以當品牌字用。

授權要寫明涵蓋網頁嵌入、印刷、應用程式，還是只有桌面。沒有授權的字不准用。網頁必須有可嵌入的檔。沒有就標成缺。

一套品牌最多兩個家族，除非老闆在這份策略加例外。不准假粗體、假斜體、拉寬、壓扁，或低於該角色的最小尺寸。標誌的最小尺寸不在這一頁重寫。$policy$),
('tone', 1, $policy$你在做這個品牌怎樣說話。聲音是穩定的。語氣可以按情境調整輕重，不可換成另一個人。

不決定顏色、字體、標誌。不寫渠道尺寸和頁數。

必須有：三到五個聲音特質、每個特質一句做和一句不做並附實際句子、禁用詞、繁中和英文是否並用、情境（說明、邀請、拒絕、致歉、出問題）、版本。

不准只有「專業、友善、創新」這類形容詞。不夠具體就標成缺。agent 寫任何品牌頁的文字，包括品牌主頁，都必須讀這份。$policy$),
('custom', 1, $policy$先判斷這頁是不是其實屬於標誌、色彩、字體或語氣。是的話不要做新頁，標明應該去哪一頁。

不是的話，必須有：這頁決定什麼、不准決定什麼、規則、例子、錯誤例子、它如何引用既有角色、版本。

不准發明新色、新字、新標誌。文字遵循語氣策略。完成後必須能被品牌主頁讀到。不夠具體就標成缺。

這一槽只寫規則，不生成頁。頁的實作見 #41。

這一槽寫的是**所有**自定義頁共用的規則，不是某一頁的內容。某一頁要決定什麼，是那一頁自己的 brief（#32 建立時寫的一句），不屬於策略；不要把 brief 的內容抄進這一槽 —— 抄了之後，之後每一張自定義頁都會被同一份 brief 污染。$policy$);

-- 每一版品牌頁都記住它當時用的策略版本（issue #34）。
--
-- 為咩要記：老闆改了策略，已經做好的頁不可以被靜靜重寫。頁版本記住當時
-- 用的是第幾版策略，之後才講得清「這一頁是照舊標準做的」。
-- 可以為 null：這條問題之前建立的版本（示範資料）沒有這個資訊，
-- 硬填一個號碼就是虛構。讀的時候 null 就講「未記錄」。
alter table brand_page_version
  add column policy_version_id uuid references brand_policy_version (id);

create index brand_page_version_policy_idx on brand_page_version (policy_version_id);
