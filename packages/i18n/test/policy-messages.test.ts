import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { messages, t } from '../src/index.js';

/**
 * #161 F-05I：政策規則頁文案鍵嘅驗收測試。
 *
 * 只驗證「新增 policy.* 鍵（管理區頁籤名用 admin.page.policy）」同「既有鍵零改動」，
 * 唔改、唔刪、唔重命名任何既有鍵或文字。鍵值逐字按 #161「必須涵蓋嘅意思」11 類自撰：
 * 繁體中文（香港）、零 emoji、唔講「已生效」、空狀態如實講「沒有規則＝全部需要批准」、
 * 唔放示例規則／示例數字／假資料、唔用開發術語作主文字。
 *
 * 文案按 Worker prompt 第 4 節 J 自撰並用測試驗證，文案待老闆事後審閱，唔阻塞。
 * 後端契約（action 得 allow／require_approval、無命中預設 require_approval、
 * DELETE 軟刪除、PATCH 無版本欄位）已對返 apps/platform/src/settings/ 實際程式。
 */

/** 本張交付嘅完整鍵值清單（唯一真相，要同 index.ts diff 逐項一致）。 */
const POLICY_MESSAGES: Record<string, string> = {
  // 1 頁面：頁籤名、標題、簡介
  'admin.page.policy': '政策規則',
  'policy.title': '政策規則',
  'policy.lead': '規則決定哪些動作可以放行、哪些動作需要批准。沒有任何規則命中時，所有動作一律需要批准。',

  // 2 列表八個欄位名（同啟用／停用狀態值）
  'policy.column.domain': '類別',
  'policy.column.condition': '條件',
  'policy.column.action': '動作',
  'policy.column.priority': '優先次序',
  'policy.column.state': '狀態',
  'policy.column.scope': '適用範圍',
  'policy.column.note': '備註',
  'policy.column.updatedAt': '更新時間',
  'policy.state.enabled': '啟用',
  'policy.state.disabled': '停用',

  // 3 動作值
  'policy.action.allow': '放行',
  'policy.action.require_approval': '需要批准',

  // 4 適用範圍
  'policy.scope.company': '整間公司',
  'policy.scope.unit': '指定單位：{name}',
  'policy.scope.unitNameUnknown': '指定單位（{id}）：單位名稱未能讀取，所以這裡只顯示單位 id。',
  'policy.scope.unitOption': '指定單位',

  // 5 條件摘要句式（帶變數，金額帶貨幣）
  'policy.condition.eq': '{field} 等於 {value}',
  'policy.condition.lte': '{field} 不高於 {currency} {amount}',
  'policy.condition.gte': '{field} 不低於 {currency} {amount}',
  'policy.condition.in': '{field} 屬於其中之一：{values}',

  // 6 空狀態
  'policy.empty': '目前沒有任何規則。沒有規則時，所有動作一律需要批准。這是真的沒有資料，不是畫面出錯。',

  // 7 載入／讀取失敗／無權限／重試（重試重用 admin.retry，登入失效重用 admin.sessionExpired）
  'policy.loading': '正在讀取政策規則…',
  'policy.loadFailed': '讀不到政策規則。',
  'policy.denied': '只有老闆可以管理政策規則。',

  // 8 表單
  'policy.form.createTitle': '新增政策規則',
  'policy.form.editTitle': '編輯政策規則',
  'policy.form.domain': '類別',
  'policy.form.domainHint': '類別要用小寫英文字母開頭，之後只可以用小寫英文字母、數字或底線。',
  'policy.form.condition': '條件',
  'policy.form.action': '動作',
  'policy.form.priority': '優先次序',
  'policy.form.priorityHint': '優先次序要填整數；不填會用 100。',
  'policy.form.enabled': '啟用',
  'policy.form.note': '備註',
  'policy.form.noteHint': '備註最多 500 字。',
  'policy.form.scope': '適用範圍',
  'policy.form.unitSelect': '選擇單位',
  'policy.form.clause': '條件子句',
  'policy.form.clauseField': '要比對的項目',
  'policy.form.clauseOperator': '比較方式',
  'policy.form.clauseValue': '要比對的值',
  'policy.form.clauseCurrency': '貨幣',
  'policy.form.clauseCurrencyHint': '金額比較一定要填貨幣。',
  'policy.form.clauseListHint': '「屬於其中之一」要逐項輸入清單值。',
  'policy.form.valueType': '值的類型',
  'policy.form.valueType.text': '文字',
  'policy.form.valueType.number': '數字',
  'policy.form.valueType.boolean': '是／否',
  'policy.form.clauseAdd': '新增子句',
  'policy.form.clauseRemove': '移除子句',
  'policy.form.clauseRequired': '條件至少要有一個子句。',
  'policy.operator.eq': '等於',
  'policy.operator.lte': '不高於',
  'policy.operator.gte': '不低於',
  'policy.operator.in': '屬於其中之一',

  // 9 操作（新增／停用／啟用／刪除、刪除確認軟刪除、五種成功訊息、失敗訊息）
  'policy.action.create': '新增規則',
  'policy.action.edit': '編輯',
  'policy.action.disable': '停用',
  'policy.action.enable': '啟用',
  'policy.action.delete': '刪除',
  'policy.delete.title': '刪除規則',
  'policy.delete.body': '這是軟刪除：規則會從列表消失，但資料列會保留。',
  'policy.delete.confirm': '確認刪除',
  'policy.success.created': '已建立規則。',
  'policy.success.saved': '已儲存',
  'policy.success.disabled': '已停用',
  'policy.success.enabled': '已啟用',
  'policy.success.deleted': '已刪除',
  'policy.failed': '操作失敗，請稍後再試。',

  // 10 後端錯誤（422 reasons 原樣顯示，不需新鍵；網絡失敗重用 error.network）
  'policy.error.notFound': '這條規則已不存在，請重新載入。',

  // 11 無版本提醒（唔暗示有衝突偵測）
  'policy.noVersion': '儲存後會重新讀取最新資料，以伺服器目前的內容為準。',
};

/** #161 驗收 7：11 類意思逐類列出對應鍵，證明每個意思都有鍵。 */
const MEANING_GROUPS: Record<string, string[]> = {
  '1 頁面：頁籤名、標題、簡介': ['admin.page.policy', 'policy.title', 'policy.lead'],
  '2 列表八個欄位名同狀態值': [
    'policy.column.domain',
    'policy.column.condition',
    'policy.column.action',
    'policy.column.priority',
    'policy.column.state',
    'policy.column.scope',
    'policy.column.note',
    'policy.column.updatedAt',
    'policy.state.enabled',
    'policy.state.disabled',
  ],
  '3 動作值 allow／require_approval': ['policy.action.allow', 'policy.action.require_approval'],
  '4 適用範圍（整間公司／指定單位／名稱讀不到顯示 id）': [
    'policy.scope.company',
    'policy.scope.unit',
    'policy.scope.unitNameUnknown',
    'policy.scope.unitOption',
  ],
  '5 條件摘要句式（等於／不高於／不低於／屬於其中之一，帶變數，金額帶貨幣）': [
    'policy.condition.eq',
    'policy.condition.lte',
    'policy.condition.gte',
    'policy.condition.in',
  ],
  '6 空狀態': ['policy.empty'],
  '7 載入／讀取失敗／無權限／重試': ['policy.loading', 'policy.loadFailed', 'policy.denied'],
  '8 表單（標題、欄位標籤與提示、條件子句、新增／移除子句、至少一個子句）': [
    'policy.form.createTitle',
    'policy.form.editTitle',
    'policy.form.domain',
    'policy.form.domainHint',
    'policy.form.condition',
    'policy.form.action',
    'policy.form.priority',
    'policy.form.priorityHint',
    'policy.form.enabled',
    'policy.form.note',
    'policy.form.noteHint',
    'policy.form.scope',
    'policy.form.unitSelect',
    'policy.form.clause',
    'policy.form.clauseField',
    'policy.form.clauseOperator',
    'policy.form.clauseValue',
    'policy.form.clauseCurrency',
    'policy.form.clauseCurrencyHint',
    'policy.form.clauseListHint',
    'policy.form.valueType',
    'policy.form.valueType.text',
    'policy.form.valueType.number',
    'policy.form.valueType.boolean',
    'policy.form.clauseAdd',
    'policy.form.clauseRemove',
    'policy.form.clauseRequired',
    'policy.operator.eq',
    'policy.operator.lte',
    'policy.operator.gte',
    'policy.operator.in',
  ],
  '9 操作（新增／停用／啟用／刪除、刪除確認、五種成功訊息、失敗訊息）': [
    'policy.action.create',
    'policy.action.edit',
    'policy.action.disable',
    'policy.action.enable',
    'policy.action.delete',
    'policy.delete.title',
    'policy.delete.body',
    'policy.delete.confirm',
    'policy.success.created',
    'policy.success.saved',
    'policy.success.disabled',
    'policy.success.enabled',
    'policy.success.deleted',
    'policy.failed',
  ],
  '10 後端錯誤 404 policy_rule_not_found': ['policy.error.notFound'],
  '11 無版本提醒': ['policy.noVersion'],
};

/** 帶 {變數} 插值嘅鍵：鍵名要同步加進 i18n.test.ts 嘅 withPlaceholders 清單。 */
const INTERPOLATED: Record<string, Record<string, string>> = {
  'policy.scope.unit': { name: '會計部' },
  'policy.scope.unitNameUnknown': { id: '3f2a1c' },
  'policy.condition.eq': { field: '付款方式', value: '轉帳' },
  'policy.condition.lte': { field: '金額', currency: 'HKD', amount: '500' },
  'policy.condition.gte': { field: '金額', currency: 'HKD', amount: '500' },
  'policy.condition.in': { field: '地區', values: '香港、澳門' },
};

/**
 * origin/main（8b91359）版字串表全部 522 個條目嘅 SHA-256 凍結快照。
 * 用 POLICY_MESSAGES 鍵集合排除本張新增鍵後再算同一個雜湊，
 * 任何既有鍵嘅鍵名或文字被改動、或新增清單外鍵，雜湊都會變，測試即紅。
 * 值由 /tmp/company-os-loop-evidence/161/gen-baseline.mjs 以
 * typescript.transpileModule 轉譯 origin/main 版 index.ts 後計出。
 */
// 2026-11-11（#28）：凍結值因一條既有文案而更新 —— `staff.create.hint` 由
// 「建立時一律是員工、沒有部門」改為「部門可以即刻揀，亦可以之後再改」。
// 原因：建立員工時真的可以選部門了，舊句變成一句錯的說明。除此之外
// 其餘既有鍵逐字不變（鍵數不變，只是那一條的值改了）。
const FROZEN_ALL_SHA256 = '5b8a937e18088bbf027671c89802841ca4986834a7eac010291a79cd56d5c3f5';

/**
 * 同步改寫（#163）：#163 起嘅 cat:packages 施工張會新增 files.* 前綴嘅鍵，
 * 呢啲鍵唔屬 #161 要守嘅既有鍵；唔排除嘅話「合法新增鍵」會被誤當成
 * 「既有鍵被改」，令 npm test 假紅（同 #155 frame-messages.test.ts 嘅情況一樣）。
 * 凍結值 f198408e… 唔變、守衛嘅 522 個既有鍵唔變，唔係放寬門檻；
 * #163 嘅完整鍵清單另由 files-messages.test.ts「冇清單以外嘅 files.* 鍵」守衛。
 *
 * issue 168 新增 5 個 grant.detail.* 鍵，同樣唔屬 #161 要守嘅既有鍵，
 * 加落同一排除清單；凍結值同守衛範圍唔變，唔係放寬門檻。
 */
// 2026-11-11（issue #30）：`staff.enable` 同 `staff.enable.*` 係新增鍵，唔屬
// #161 要守嘅既有鍵；凍結值不變，只係明確排除新鍵。
const LATER_KEY_PREFIXES = ['brand.page.', 'brand.color.', 'brand.type.', 'brand.logo.', 'brand.tone.', 'brand.custom.', 'brand.home.', 'brand.gap.', 'brand.check.', 'brand.guide.', 'files.', 'grant.detail.', 'boss.members.', 'staff.enable', 'boss.module.people', 'boss.page.people',
  // 2026-11-12（issue #34）：品牌頁策略是新增的介面，不屬本檔要守的既有鍵。
  'boss.policy.', 'boss.module.policy', 'boss.page.brandPolicy',
  'gate.noDepartment.', 'gate.departmentClosed.', 'gate.signOut'];
/** 精確到單一鍵的排除（issue #19）：唔用 `design.brand.` 前綴，見 files-messages.test.ts。 */
const LATER_EXACT_KEYS = [
  'design.page.brandPage',
  // 2026-11-12（issue #32）：品牌模組五頁的頁名。舊的 `design.page.brandPage`
  // 與 `design.section.*` 沒有刪，只是不再有人讀 —— 凍結閘本來就不准刪。
  'design.page.brandLogo', 'design.page.brandColor', 'design.page.brandType',
  'design.page.brandTone','design.brand.ownerOnly'];

function hashExcluding(msgs: Record<string, string>, excluded: ReadonlySet<string>): string {
  const entries = Object.entries(msgs)
    .filter(
      ([key]) =>
        !excluded.has(key) &&
        !LATER_EXACT_KEYS.includes(key) &&
        !LATER_KEY_PREFIXES.some((prefix) => key.startsWith(prefix)),
    )
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return createHash('sha256').update(JSON.stringify(entries)).digest('hex');
}

describe('#161 政策規則頁文案鍵（policy.*／admin.page.policy）', () => {
  it('11 類意思每個都有對應鍵，而且交付鍵全部歸屬其中一類', () => {
    expect(Object.keys(MEANING_GROUPS).length).toBe(11);
    const grouped = new Set<string>();
    for (const [meaning, keys] of Object.entries(MEANING_GROUPS)) {
      expect(keys.length, meaning).toBeGreaterThan(0);
      for (const key of keys) {
        expect(key in POLICY_MESSAGES, `${meaning} / ${key}`).toBe(true);
        grouped.add(key);
      }
    }
    for (const key of Object.keys(POLICY_MESSAGES)) {
      expect(grouped.has(key), key).toBe(true);
    }
  });

  it('全部鍵都存在，而且逐字正確（逐鍵斷言，刪一個只紅一個）', () => {
    for (const [key, expected] of Object.entries(POLICY_MESSAGES)) {
      expect((messages as Record<string, string>)[key], key).toBe(expected);
      // 帶 {變數} 嘅鍵唔可以唔帶變數叫 t()（t() 一律跑插值，會拋錯）；
      // 佢哋嘅插值由下面「帶 {變數} 嘅鍵用實例變數驗證插值」斷言。
      if (!(key in INTERPOLATED)) {
        expect(t(key as never), key).toBe(expected);
      }
    }
  });

  it('每個鍵 t() 都解析成非空字串（帶變數鍵用實例變數）', () => {
    for (const key of Object.keys(POLICY_MESSAGES)) {
      expect(t(key as never, INTERPOLATED[key] ?? {}).length, key).toBeGreaterThan(0);
    }
  });

  it('帶 {變數} 嘅鍵用實例變數驗證插值', () => {
    for (const [key, vars] of Object.entries(INTERPOLATED)) {
      expect((messages as Record<string, string>)[key], key).toBeDefined();
      const rendered = t(key as never, vars);
      expect(rendered.length, key).toBeGreaterThan(0);
      expect(rendered, key).not.toMatch(/\{[a-zA-Z0-9_]+\}/);
      for (const [name, value] of Object.entries(vars)) {
        expect(rendered, `${key} / ${name}`).toContain(String(value));
      }
    }
  });

  it('帶變數鍵嘅模板確實含 {變數}，金額句式帶貨幣', () => {
    for (const key of Object.keys(INTERPOLATED)) {
      expect(/\{[a-zA-Z0-9_]+\}/.test((messages as Record<string, string>)[key] ?? ''), key).toBe(true);
    }
    expect(POLICY_MESSAGES['policy.condition.lte']).toContain('{currency}');
    expect(POLICY_MESSAGES['policy.condition.gte']).toContain('{currency}');
  });

  it('交付鍵名全部係 policy.* 或 admin.page.policy', () => {
    for (const key of Object.keys(POLICY_MESSAGES)) {
      expect(key.startsWith('policy.') || key === 'admin.page.policy', key).toBe(true);
    }
  });

  it('冇清單以外嘅 policy.* 鍵', () => {
    const extra = Object.keys(messages).filter(
      (key) => (key.startsWith('policy.') || key === 'admin.page.policy') && !(key in POLICY_MESSAGES),
    );
    expect(extra).toEqual([]);
  });

  it('新增文案零 emoji', () => {
    // 逐個獨立正則，唔好將 ZWJ／VS16 放落字元類別，否則會觸發
    // eslint no-misleading-character-class。
    const emojiPatterns: RegExp[] = [
      /\p{Extended_Pictographic}/u,
      /\p{Emoji_Presentation}/u,
      /\uFE0F/u,
      /\u200D/u,
    ];
    for (const [key, value] of Object.entries(POLICY_MESSAGES)) {
      expect(emojiPatterns.some((pattern) => pattern.test(value)), key).toBe(false);
    }
  });

  it('新增文案無「已生效」字眼，唔暗示衝突偵測或空＝全部放行', () => {
    const forbidden = ['已生效', '衝突偵測', '全部放行'];
    for (const [key, value] of Object.entries(POLICY_MESSAGES)) {
      for (const word of forbidden) {
        expect(value.includes(word), `${key} / ${word}`).toBe(false);
      }
    }
  });

  it('新增文案唔放示例規則／示例數字／假資料', () => {
    for (const [key, value] of Object.entries(POLICY_MESSAGES)) {
      expect(/例如|示意|範例|假資料|示範/.test(value), key).toBe(false);
    }
  });

  it('空狀態講清楚「沒有規則」與「需要批准」，唔暗示空＝全部放行', () => {
    const empty = POLICY_MESSAGES['policy.empty'];
    expect(empty).toContain('沒有規則');
    expect(empty).toContain('需要批准');
    expect(empty).toContain('不是畫面出錯');
    expect(t('policy.empty' as never)).toBe(empty);
  });

  it('既有鍵零改動：排除本張交付鍵後 SHA-256 同 origin/main 凍結值一致', () => {
    const excluded = new Set(Object.keys(POLICY_MESSAGES));
    expect(hashExcluding(messages as Record<string, string>, excluded)).toBe(FROZEN_ALL_SHA256);
  });
});
