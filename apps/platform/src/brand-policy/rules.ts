import type { PolicySlot } from './store';

/**
 * 策略規則 id 表（#56）—— 「策略文本」與「檢查器」之間唯一的契約。
 *
 * 每一條可量化的策略句，句尾帶一個 id（例：`[color.r2]`）。策略文本住在
 * `brand_policy_version`，這張表住在程式；兩邊靠 id 對上。#59 只實作這張表
 * 列出的 checker，並用雙向測試保證「表裡每個 id 都有 checker，每個 checker
 * 都對得上一個 id」。
 *
 * **三態不是禮貌，是誠實。** 大部分檢查器把「不知道」當成「通過」，於是缺了
 * 色彩角色的一頁會靜靜顯示全綠。這一張表逐條寫明「不知道」長甚麼樣，讓
 * checker 沒有藉口回一個空的成功。
 *
 * **四條規則刻意不存在**：圖像、品牌主頁、應用、自定義頁沒有一條規則可以
 * 機械驗證（「這張照片對不對」不是條件判斷）。不為它們發明 id —— 一個永遠
 * 通過的 checker 比沒有 checker 更貴，因為它會令人以為檢查過了。
 */

export type PolicyRule = {
  id: string;
  slot: Exclude<PolicySlot, 'custom'>;
  /** 一句定義：這條規則在管甚麼。 */
  summary: string;
  /** 閾值：可以量到的數字或條件。冇數字的規則不應該有 id。 */
  threshold: string;
  /** 通過的條件。 */
  pass: string;
  /** 不通過的條件，同時是「怎樣改」的起點。 */
  fail: string;
  /** 無法判斷的條件：缺資料，不是缺德。 */
  undetermined: string;
};

export const POLICY_RULES: readonly PolicyRule[] = [
  {
    id: 'platform.r1',
    slot: 'platform',
    summary: '定位三檢各有證據',
    threshold: '真實、相關、獨特三項，每項至少一句證據（不是形容詞）',
    pass: '三項都有 evidence 文字，且不是「專業／創新／以人為本」一類的價值形容詞',
    fail: '任何一項的 evidence 是空的，或者只是換一個形容詞',
    undetermined: '平台頁未有定位陳述，或者根本未有版本',
  },
  {
    id: 'color.r1',
    slot: 'color',
    summary: '四個必要角色存在',
    threshold: 'brand.primary、ink、paper、深色 surface 四個角色都要有值',
    pass: '四個角色都有 hex（或 CMYK）',
    fail: '角色存在但值為空，或者同一角色出現兩次不同值',
    undetermined: '色彩頁未有版本，或者 payload 解析不到',
  },
  {
    id: 'color.r2',
    slot: 'color',
    summary: '內文對比下限',
    threshold: '內文色對底色 ≥ 4.5:1（WCAG AA 正文）',
    pass: '每一組「內文色／底色」的實測比值 ≥ 4.5',
    fail: '任何一組實測比值 < 4.5，且未列替代色',
    undetermined: '缺少其中一方的 hex，計不出比值',
  },
  {
    id: 'color.r3',
    slot: 'color',
    summary: '大字對比下限',
    threshold: '大字（≥ 24px 或 ≥ 19px 粗體）對底色 ≥ 3:1',
    pass: '每一組大字用色的實測比值 ≥ 3',
    fail: '任何一組大字用色實測比值 < 3',
    undetermined: '未指定哪個角色用於大字，或缺 hex',
  },
  {
    id: 'color.r4',
    slot: 'color',
    summary: '功能色不得用於標誌',
    threshold: '標誌的顏色模式只可以引用品牌色與閱讀色角色',
    pass: '所有標誌模式引用的角色，group 都不是 function',
    fail: '任何一個標誌模式引用到功能色（例如 success／danger）',
    undetermined: '標誌頁未有版本，或者色彩頁未標角色的 group',
  },
  {
    id: 'type.r1',
    slot: 'type',
    summary: '最多兩個家族',
    threshold: 'families.length ≤ 2，除非策略有明確例外',
    pass: '一個或兩個家族',
    fail: '三個或以上家族而沒有例外說明',
    undetermined: '字體頁未有版本',
  },
  {
    id: 'type.r2',
    slot: 'type',
    summary: '每級都有最小尺寸',
    threshold: '每個角色都有 min（px），而且 > 0',
    pass: '所有角色的 min 都是正數',
    fail: '任何角色缺 min，或 min 是 0／負數',
    undetermined: '字體頁未有版本，或者角色清單是空的',
  },
  {
    id: 'type.r3',
    slot: 'type',
    summary: '每個家族都有授權',
    threshold: '每個家族至少寫明網頁嵌入與印刷兩種授權狀態',
    pass: '兩個欄位都有值（可以是「不允許」）',
    fail: '任何一個家族缺授權欄位',
    undetermined: '字體頁未有版本，或者家族清單是空的',
  },
  {
    id: 'logo.r1',
    slot: 'logo',
    summary: '淨空間以 x 定義',
    threshold: 'clear_space_x 要有倍數與 x 等於幾多的說明',
    pass: '有倍數（例：2x）並寫明 x 指甚麼（例：字標高度）',
    fail: '只寫「留足夠空間」，或者有倍數但沒有定義 x',
    undetermined: '標誌頁未有版本',
  },
  {
    id: 'logo.r2',
    slot: 'logo',
    summary: '分媒介最小尺寸',
    threshold: '螢幕 px 與印刷 mm 兩個下限都要有',
    pass: 'min_size.screen_px 與 min_size.print_mm 都是正數',
    fail: '缺任何一個，或者兩個數字相同（把 px 當 mm）',
    undetermined: '標誌頁未有版本',
  },
  {
    id: 'logo.r3',
    slot: 'logo',
    summary: '四種顏色模式齊全',
    threshold: '四個模式，每個都引用一個存在的色彩角色',
    pass: '四個模式都存在，且引用的角色在色彩頁找得到',
    fail: '少於四個模式，或者引用了一個不存在的角色',
    undetermined: '標誌頁未有版本，或者色彩頁未有版本（無從核對角色）',
  },
  {
    // 槽名是 `tone`（歷史，不可改），規則 id 用 `voice`：id 是給人與 agent
    // 引用的名字，跟品牌書上的「語氣」對得上比跟欄位名對得上重要。
    id: 'voice.r1',
    slot: 'tone',
    summary: '禁用詞逐個有原因',
    threshold: 'banned 每一項都要寫為甚麼禁，不是只有一個詞',
    pass: '每一項都有原因文字',
    fail: '有任何一項只有詞、沒有原因',
    undetermined: '語氣頁未有版本，或者禁用詞清單是空的（空白不等於合格）',
  },
];

export function rulesForSlot(slot: string): PolicyRule[] {
  return POLICY_RULES.filter((rule) => rule.slot === slot);
}

export const POLICY_RULE_IDS: readonly string[] = POLICY_RULES.map((rule) => rule.id);
