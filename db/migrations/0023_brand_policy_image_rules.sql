-- 0023 圖像策略規則：補上 image.r1 與 image.r2。
--
-- 沿用 0016 的 image 全文，只在「寫禁止」與色彩角色關係加上規則 id；
-- 舊版本保持不變，新版本一律 max(version_no) + 1。

insert into brand_policy_version (slot, version_no, content, note)
select 'image', coalesce(max(version_no), 0) + 1, $p$你在定一個表面只用一種視覺語言；三種同時出現會互相貶值。

固定骨架：攝影方向要寫主體、構圖、光線、色調、留白、道具；有插畫或圖示就寫方向；寫與色彩角色的關係 [image.r2]；寫禁止 [image.r1]；已核准範例按用途標註，至少三個；寫授權狀態。

讓品牌不一樣：圖像立場一句；像與不像各至少三張對照；結合品牌色的手法。

缺：冇真實範例就標缺，不用圖庫圖假扮。動態與版面網格另開自定義頁，不塞進這一頁。

不准用一句形容詞代替方向 ——「簡約高級」不是方向；光線從哪裡來、留白留幾多，才是方向。$p$, $n$圖像規則 image.r1／image.r2$n$
  from brand_policy_version where slot = 'image';
