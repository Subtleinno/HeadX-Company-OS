-- 0016 品牌策略 v2（#56）：九個槽，全文，只加不改。
--
-- 第一版策略是表格思維：每個槽寫「必須有 A、B、C」，agent 填完就算。v2 改成
-- 先有立場，再用示範、反例、數字與理由支撐，並且把可量化的句子標上規則 id
-- （`apps/platform/src/brand-policy/rules.ts`）。checker 由 #59 逐個接上。
--
-- 槽名不變：`tone` 就是語氣。`brand_policy_version` 有 trigger 擋 UPDATE 與
-- DELETE，改名只會留下一個讀不到的舊槽，或者兩個「現行」。
--
-- 新版本一律 `max(version_no) + 1`：舊版要永遠讀得返（已出街成品可能引用）。

alter table brand_policy_version drop constraint brand_policy_slot_known;

alter table brand_policy_version
  add constraint brand_policy_slot_known
  check (
    slot in (
      'platform', 'color', 'type', 'logo', 'image', 'tone', 'home', 'apply', 'custom'
    )
  );

insert into brand_policy_version (slot, version_no, content, note)
select 'platform', coalesce(max(version_no), 0) + 1, $p$你在定這個品牌替誰解決甚麼，以及一句印在任何物料上都成立的話。

固定骨架：定位陳述要寫齊五樣 —— 對象、品類、利益、與誰不同、為甚麼可信。冇一樣可以用「我們是誰」代替。定位三檢：真實、相關、獨特，每一項要有一句證據，不是一句形容 [platform.r1]。另外要寫目的、三至五個價值（每個附做與不做）、三至五個個性、品牌本質一句、受眾、參照對象。

讓品牌不一樣：給三個立場句候選，每個附一行理由。立場句只准一句、可以獨立成句、可以被違反。候選由 agent 出，老闆或設計師選或改寫。

缺：冇受眾、冇證據的定位標缺。這是判斷型缺口，只有老闆可以關。

不准用「專業、友善、創新、以人為本」代替決定 —— 形容詞不能被違反，所以也不能被判定。寫不出取捨，即係未有立場。

其他每一頁的值，最後要答得出「這服務於哪一句」。答不出，就記成偏好，不記成品牌。$p$, $n$策略 v2 全文（#56）$n$
  from brand_policy_version where slot = 'platform';

insert into brand_policy_version (slot, version_no, content, note)
select 'color', coalesce(max(version_no), 0) + 1, $p$你在定一套有比例的系統，不是幾個好看的色。

固定骨架：每色有角色，分品牌色、閱讀色、功能色，不混用。brand.primary、ink、paper 與深色 surface 必須存在 [color.r1]。內文對底 ≥ 4.5:1 [color.r2]，大字 ≥ 3:1 [color.r3]，焦點環與其他 UI 元素另列達標色。功能色不可用於標誌 [color.r4]。螢幕寫 HEX 與 RGB，印刷寫 CMYK；淺色與深色兩套都要。角色名在這一頁寫死並公開，其他頁不准另造同義新詞。

讓品牌不一樣：用色順序一句話與理由；比例（主導、定調、點題，三個數加起來 100）；若服務色或情境色有系統，寫成角色表；未達標的色要寫替代色與實際比值。

缺：缺角色就標缺，不填「差不多」的色。

不准臨時調深淺去救對比 —— 要線與連結就另設功能拍檔，並寫它在底上的比值。衍生色要寫來源：原本 → 調整後，為甚麼調。冇來源的色不准進這一頁。

這一頁不決定標誌最小尺寸，也不決定字體。$p$, $n$策略 v2 全文（#56）$n$
  from brand_policy_version where slot = 'color';

insert into brand_policy_version (slot, version_no, content, note)
select 'type', coalesce(max(version_no), 0) + 1, $p$你在定尺寸階梯與混排語法，不是挑一個好看的字。

固定骨架：角色要有 display、heading、body、caption、data，每級寫字重、尺寸、行距、最小尺寸 [type.r2]、行長。繁中與拉丁分開指定並寫配對。家族與授權分四種用途寫清楚：網頁嵌入、印刷、App、桌面 [type.r3]。備用字只作後備，不是第二個品牌字。一個品牌最多兩個家族，除非老闆在這一頁加例外 [type.r1]。

讓品牌不一樣：分工宣言一句；句子解剖示範（一句之內的層級）；印刷矩陣至少 A4、A5、名片級；中英混排細節。

缺：冇授權或冇可嵌入檔就標缺。不用系統字充當品牌字。已定稿的字標不重畫，只登記字與授權。

不准假粗體、假斜體、拉寬、壓扁。px 與 pt 是兩套，不准互相換算當答案 —— 同一套系統落在 A4 要重新計。$p$, $n$策略 v2 全文（#56）$n$
  from brand_policy_version where slot = 'type';

insert into brand_policy_version (slot, version_no, content, note)
select 'logo', coalesce(max(version_no), 0) + 1, $p$你在定一個畫面只出一種鎖定，每種鎖定有自己的最小尺度與淨空間。

固定骨架：資產五類要齊 —— Logo、Wordmark、Mark、Monogram、App icon 與 favicon。淨空間用 x 定義，並寫 x 等於幾多 [logo.r1]。分媒介寫最小尺寸：螢幕 px、印刷 mm [logo.r2]。四種顏色模式各自寫前景角色與底色角色，色值只引用色彩角色 [logo.r3]。寫組合與方向、背景規則、錯誤用法附示例。主檔為向量，並登記存放位置與版本。

讓品牌不一樣：建構說明（圓網、比例、字距）；一句話邏輯；組合清單各附何時用；服務標或子標的系統規則。

缺：冇檔案就標缺，這是檔案型缺口。不畫假標誌，不決定字體與語氣。

不准：改字距、重打字標、加陰影、疊漸變、旋轉、重新上色、拉伸。功能色不得用於標誌。$p$, $n$策略 v2 全文（#56）$n$
  from brand_policy_version where slot = 'logo';

insert into brand_policy_version (slot, version_no, content, note)
select 'image', coalesce(max(version_no), 0) + 1, $p$你在定一個表面只用一種視覺語言；三種同時出現會互相貶值。

固定骨架：攝影方向要寫主體、構圖、光線、色調、留白、道具；有插畫或圖示就寫方向；寫與色彩角色的關係；寫禁止；已核准範例按用途標註，至少三個；寫授權狀態。

讓品牌不一樣：圖像立場一句；像與不像各至少三張對照；結合品牌色的手法。

缺：冇真實範例就標缺，不用圖庫圖假扮。動態與版面網格另開自定義頁，不塞進這一頁。

不准用一句形容詞代替方向 ——「簡約高級」不是方向；光線從哪裡來、留白留幾多，才是方向。$p$, $n$策略 v2 全文（#56）$n$
  from brand_policy_version where slot = 'image';

insert into brand_policy_version (slot, version_no, content, note)
select 'tone', coalesce(max(version_no), 0) + 1, $p$你在定聲音與語氣的邊界：聲音穩定，語氣按情境調輕重，不可換成另一個人。

固定骨架：三至五個聲音特質，每個一句做、一句不做，各附一句真實句子。禁用詞逐個寫為甚麼禁 [voice.r1]。中英並用規則。五種情境各寫一段示範：說明、邀請、拒絕、致歉、出問題。樣本庫五句像、五句不像。

讓品牌不一樣：這個品牌最容易說錯的一句，以及正確說法；與立場句呼應的句式規則（若有）。

缺：只有形容詞就標缺。這一頁不決定顏色、字體、標誌。agent 寫任何品牌頁的文字，都要讀這一頁。

不准越過專業判斷：療效、承諾、診斷、價格，品牌語言講到邊界就停，接住的是持牌的人。$p$, $n$策略 v2 全文（#56）$n$
  from brand_policy_version where slot = 'tone';

insert into brand_policy_version (slot, version_no, content, note)
select 'home', coalesce(max(version_no), 0) + 1, $p$你在把這個品牌所有頁的現行版本編成一份主頁，不是另做一套識別。

必讀每一頁的現行版本，包括自定義頁。清單不能寫死。缺頁標缺，不准虛構內容補洞。

必須有：立場句（第一屏）、這個品牌是誰、三至五個關鍵詞、用色順序、標誌預設用法、字體分工、品牌專屬系統、語氣短例、各頁入口（可以在第一屏之後）、缺口、品牌 prompt、版本。

讓品牌不一樣：區塊的次序、重點與理由由這個品牌的立場決定，不使用固定模板。

不另造色值、字體、標誌規則或語氣 —— 要改就改來源頁。任何出現的值都要寫出來源頁與版號。

設計師在主頁上的改動，是下次重編必須保留的指示。加了頁或改了頁，就要提示重編。$p$, $n$策略 v2 全文（#56）$n$
  from brand_policy_version where slot = 'home';

insert into brand_policy_version (slot, version_no, content, note)
select 'apply', coalesce(max(version_no), 0) + 1, $p$你在答一條問題：落在這個表面，用幾多 pt、哪個鎖定、檢查哪三樣。

固定骨架：表面清單由真實用途來（A4 須知、名片、袋、瓶標、招牌、收據、網頁首屏、社交貼），不是憑空列。每個表面寫四樣：尺寸、用哪個鎖定、字級下限、三個檢查點。

讓品牌不一樣：載體示範遵守各頁規則並通過檢查；已核准範例寫格式、用了哪些頁的哪個版本、為甚麼好。成功 prompt 要把成品、prompt、當時的品牌版本三者一起存。

缺：冇真實成品就標缺，不用示意圖假扮已核准。

不准縮放當答案：同一套系統落在不同尺寸要重新計，縮放會令字級下限失效。$p$, $n$策略 v2 全文（#56）$n$
  from brand_policy_version where slot = 'apply';

insert into brand_policy_version (slot, version_no, content, note)
select 'custom', coalesce(max(version_no), 0) + 1, $p$你在定一個不屬於色彩、字體、標誌、語氣、圖像的系統。

先判斷是否其實屬於既有頁。是就不要開新頁，標明應該去哪一頁。專屬系統的判斷是三項皆是：獨有、重複使用、其他頁放不下。

必須有：決定甚麼、不決定甚麼、規則、例子、反例、引用哪些角色、版本。

不發明新色、新字、新標誌 —— 要改就改來源頁。文字遵循語氣槽。品牌主頁必須讀得到這一頁。

只寫這一頁自己的 brief 與規則，不要抄某頁的內容進來當內容。$p$, $n$策略 v2 全文（#56）$n$
  from brand_policy_version where slot = 'custom';
