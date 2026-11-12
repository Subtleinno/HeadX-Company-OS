import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, messages, t } from '../src/index.js';

/**
 * issue 168（F-07P）：授權單筆詳情文案鍵嘅驗收測試。
 *
 * 只驗證「新增 5 個 grant.detail.* 鍵」同「既有鍵零改動」，唔改、唔刪、
 * 唔重命名任何既有鍵或文字。鍵值逐字按 issue 168 表格五個意思自撰：
 * 繁體中文（香港）、零 emoji、零插值、唔推斷「已生效／已批准」、
 * 唔放示例 id／日期／假資料、唔用錯誤碼或欄位名作主文字、
 * notFound 唔含「權限／已刪除」推斷字眼、noValue 唔含任何示例值、
 * loadFailed 失敗唔顯示成空資料而且可重試。
 *
 * 文案按 Worker prompt 第 4 節 J 自撰並用測試驗證，文案待老闆事後審閱，唔阻塞。
 * 後端契約（GET /app-grants/:id 經 requireUser、非法 UUID／不存在／canSee
 * 唔允許一律 404 grant_not_found、成功回 { grant: toGrantView(row) }、
 * GrantView 多個 string|null 欄位）已對返 apps/platform/src/grants/routes.ts
 * 同 apps/web/src/api.ts 實際程式，停工條件 2 未觸發。
 */

/** 本張交付嘅完整鍵值清單（唯一真相，要同 index.ts diff 逐項一致）。 */
const GRANT_DETAIL_MESSAGES: Record<string, string> = {
  'grant.detail.title': '授權詳情',
  'grant.detail.back': '返回授權列表',
  'grant.detail.notFound': '找不到這筆授權。',
  'grant.detail.loadFailed': '讀不到這筆授權，請重試。',
  'grant.detail.noValue': '未有',
};

/**
 * 重用既有鍵（issue 168 正文列明可重用，本張唔重複新增）。
 * 覆蓋授權列表／操作頁既有文案，詳情頁直接取用，唔另造一份。
 */
const REUSED_KEYS = [
  'grant.title',
  'grant.loading',
  'grant.denied',
  'grant.sessionExpired',
  'grant.reload',
  'grant.column.role',
  'grant.column.scope',
  'grant.column.state',
  'grant.column.version',
  'grant.role.member',
  'grant.role.app_admin',
  'grant.state.requested',
  'grant.state.approved',
  'grant.state.active',
  'grant.state.rejected',
  'grant.state.revoked',
  'grant.scope.all',
  'grant.scope.units',
  'grant.scope.subtree',
  'grant.scope.note',
  'grant.time.requested',
  'grant.time.approved',
  'grant.time.activated',
  'grant.time.revoked',
  'grant.rejectionReason',
  'grant.supersede',
  'grant.beneficiary.idsOnly',
  'common.retry',
  'status.loading',
  'error.network',
  'error.unexpected',
];

/**
 * 字串表只有一個語系（DEFAULT_LOCALE），無 fallback 語言；
 * 日後新增語系要同步喺呢度列出，否則「每個現有語系」呢條斷言會漏。
 */
const LOCALES: readonly string[] = [DEFAULT_LOCALE];

/**
 * origin/main（91f7afc7）版字串表全部 632 個條目嘅 SHA-256 凍結快照。
 * 用 GRANT_DETAIL_MESSAGES 鍵集合排除本張新增 5 鍵後再算同一個雜湊，
 * 任何既有鍵嘅鍵名或文字被改動、或新增清單外鍵，雜湊都會變，測試即紅。
 * 值由 /tmp/company-os-loop-evidence/168/gen-baseline.mjs 以
 * typescript.transpileModule 轉譯 origin/main 版 index.ts 後計出。
 */
// 2026-11-11（#28）：凍結值因一條既有文案而更新 —— `staff.create.hint` 由
// 「建立時一律是員工、沒有部門」改為「部門可以即刻揀，亦可以之後再改」。
// 原因：建立員工時真的可以選部門了，舊句變成一句錯的說明。除此之外
// 其餘既有鍵逐字不變（鍵數不變，只是那一條的值改了）。
const FROZEN_ALL_SHA256 = '4af9f8e145020638a2b141f52026861eed7031250932204b5a38ab583a0ccdb4';

/**
 * 呢張之後嘅施工張所新增嘅鍵前綴（#13／#14 起）。
 *
 * 同 files／policy／frame 三張同一個做法：後續新增鍵唔屬於 #168 要守嘅
 * 既有鍵，唔排除嘅話「合法新增」會被當成「既有鍵被改」，令 npm test 假紅。
 * 凍結值同守衛嘅既有鍵都唔變，唔係放寬門檻。
 */
const LATER_EXACT_KEYS = [
  'design.page.brandPage',
  // 2026-11-12（issue #32）：品牌模組五頁的頁名。舊的 `design.page.brandPage`
  // 與 `design.section.*` 沒有刪，只是不再有人讀 —— 凍結閘本來就不准刪。
  'design.page.brandLogo', 'design.page.brandColor', 'design.page.brandType',
  'design.page.brandTone','design.page.brandImage','design.page.brandExamples','design.brand.ownerOnly'];

const LATER_KEY_PREFIXES = ['brand.page.', 'brand.color.', 'brand.type.', 'brand.logo.', 'brand.image.', 'brand.examples.', 'brand.tone.', 'brand.custom.', 'brand.home.', 'brand.gap.', 'brand.check.', 'brand.platform.', 'brand.guide.', 'brand.suggest.', 'brand.nav.', 'design.group.', 
  'boss.members.',
  // 2026-11-11（issue #30）：恢復停用帳戶新增的鍵，不屬 #168 要守的既有鍵。
  'staff.enable',
  'boss.module.people',
  'boss.page.people',
  // 2026-11-12（issue #34）：品牌頁策略是新增的介面，不屬本檔要守的既有鍵。
  'boss.policy.',
  'boss.module.policy',
  'boss.page.brandPolicy',
  'gate.noDepartment.',
  'gate.departmentClosed.',
  'gate.signOut',
];

function hashExcluding(msgs: Record<string, string>, excluded: ReadonlySet<string>): string {
  const entries = Object.entries(msgs)
    .filter(([key]) => !excluded.has(key))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return createHash('sha256').update(JSON.stringify(entries)).digest('hex');
}

describe('issue 168 授權單筆詳情文案鍵（grant.detail.*）', () => {
  it('全部鍵都存在，而且逐字正確（逐鍵斷言，刪一個只紅一個）', () => {
    for (const [key, expected] of Object.entries(GRANT_DETAIL_MESSAGES)) {
      expect((messages as Record<string, string>)[key], key).toBe(expected);
      expect(t(key as never), key).toBe(expected);
    }
  });

  it('交付鍵名啱啱 5 個，全部以 grant.detail. 開頭', () => {
    expect(Object.keys(GRANT_DETAIL_MESSAGES)).toHaveLength(5);
    for (const key of Object.keys(GRANT_DETAIL_MESSAGES)) {
      expect(key.startsWith('grant.detail.'), key).toBe(true);
    }
  });

  it('冇清單以外嘅 grant.detail.* 鍵', () => {
    const extra = Object.keys(messages).filter(
      (key) => key.startsWith('grant.detail.') && !(key in GRANT_DETAIL_MESSAGES),
    );
    expect(extra).toEqual([]);
  });

  it('5 個鍵喺每個現有語系都 t() 解析成非空字串，唔係回傳鍵名本身', () => {
    expect(LOCALES.length).toBeGreaterThan(0);
    for (const locale of LOCALES) {
      expect(locale.length, locale).toBeGreaterThan(0);
      for (const key of Object.keys(GRANT_DETAIL_MESSAGES)) {
        const rendered = t(key as never);
        expect(rendered.length, `${locale} / ${key}`).toBeGreaterThan(0);
        expect(rendered, `${locale} / ${key}`).not.toBe(key);
      }
    }
  });

  it('重用既有鍵存在而且非空（本張唔重複新增）', () => {
    for (const key of REUSED_KEYS) {
      // 部分重用鍵帶 {變數} 插值，無變數叫 t() 會拋錯；本張只核對字串表
      // 條目存在而且非空，插值行為由既有 i18n.test.ts 守衛。
      const value = (messages as Record<string, string>)[key];
      expect(value, key).toBeDefined();
      expect(value.trim().length, key).toBeGreaterThan(0);
    }
  });

  it('重用既有鍵冇被重複新增成 grant.detail.* 鍵', () => {
    const forbidden = [
      'grant.detail.loading',
      'grant.detail.denied',
      'grant.detail.sessionExpired',
      'grant.detail.reload',
      'grant.detail.retry',
      'grant.detail.column',
      'grant.detail.role',
      'grant.detail.state',
      'grant.detail.scope',
      'grant.detail.time',
      'grant.detail.rejectionReason',
      'grant.detail.supersede',
      'grant.detail.beneficiary',
      'grant.detail.network',
      'grant.detail.unexpected',
      'grant.detail.statusLoading',
    ];
    for (const key of forbidden) {
      expect(key in messages, key).toBe(false);
    }
    expect(Object.keys(messages).filter((key) => forbidden.includes(key))).toEqual([]);
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
    for (const [key, value] of Object.entries(GRANT_DETAIL_MESSAGES)) {
      expect(emojiPatterns.some((pattern) => pattern.test(value)), key).toBe(false);
    }
  });

  it('新增文案零插值（唔出現任何 { }）', () => {
    for (const [key, value] of Object.entries(GRANT_DETAIL_MESSAGES)) {
      expect(/[{}]/.test(value), key).toBe(false);
    }
  });

  it('新增文案無「已生效」「已批准」等超出單筆回應嘅推斷', () => {
    const forbidden = ['已生效', '已批准', '已核准', '已拒絕', '已撤銷', '已通過', '已啟用'];
    for (const [key, value] of Object.entries(GRANT_DETAIL_MESSAGES)) {
      for (const word of forbidden) {
        expect(value.includes(word), `${key} / ${word}`).toBe(false);
      }
    }
  });

  it('新增文案唔放示例 id／日期／假資料', () => {
    for (const [key, value] of Object.entries(GRANT_DETAIL_MESSAGES)) {
      expect(/例如|示意|範例|假資料|示範/.test(value), key).toBe(false);
      expect(/\d{4}-\d{2}-\d{2}/.test(value), key).toBe(false);
      expect(/[0-9a-f]{8}-[0-9a-f]{4}/i.test(value), key).toBe(false);
    }
  });

  it('新增文案唔用錯誤碼或欄位名作主文字', () => {
    const terms =
      /grant_not_found|userId|agentId|appId|replacesId|approvedAt|activatedAt|revokedAt|rejectionReason|unitScope|404/i;
    for (const [key, value] of Object.entries(GRANT_DETAIL_MESSAGES)) {
      expect(terms.test(value), key).toBe(false);
    }
  });

  it('title 係單筆唯讀詳情，唔叫「清單」或「列表」', () => {
    const title = GRANT_DETAIL_MESSAGES['grant.detail.title'];
    expect(title).toContain('詳情');
    expect(title).not.toContain('清單');
    expect(title).not.toContain('列表');
    expect(t('grant.detail.title' as never)).toBe(title);
  });

  it('back 返回授權列表，唔係回首頁', () => {
    const back = GRANT_DETAIL_MESSAGES['grant.detail.back'];
    expect(back).toContain('返回');
    expect(back).toContain('列表');
    expect(back).not.toContain('首頁');
    expect(t('grant.detail.back' as never)).toBe(back);
  });

  it('notFound 係 404 一般搵唔到，唔含「權限」「已刪除」等推斷字眼', () => {
    const notFound = GRANT_DETAIL_MESSAGES['grant.detail.notFound'];
    expect(notFound).toContain('找不到');
    for (const word of ['權限', '已刪除', '越權', '不存在', '已移除', '沒有權限', '已撤銷', '被刪除']) {
      expect(notFound.includes(word), `notFound / ${word}`).toBe(false);
    }
    expect(t('grant.detail.notFound' as never)).toBe(notFound);
  });

  it('loadFailed 失敗唔顯示成空資料，而且可重試', () => {
    const loadFailed = GRANT_DETAIL_MESSAGES['grant.detail.loadFailed'];
    expect(loadFailed).toContain('讀不到');
    expect(loadFailed).toContain('請重試');
    for (const word of ['沒有資料', '沒有任何授權', '空', '空白', '查無']) {
      expect(loadFailed.includes(word), `loadFailed / ${word}`).toBe(false);
    }
    expect(t('grant.detail.loadFailed' as never)).toBe(loadFailed);
  });

  it('noValue 明示「未有」，唔含任何示例值（姓名／app 名／日期／id／數字）', () => {
    const noValue = GRANT_DETAIL_MESSAGES['grant.detail.noValue'];
    expect(noValue).toBe('未有');
    expect(t('grant.detail.noValue' as never)).toBe('未有');
    expect(/\d/.test(noValue)).toBe(false);
    expect(/[A-Za-z]/.test(noValue)).toBe(false);
  });

  it('既有鍵零改動：排除本張交付鍵後 SHA-256 同 origin/main 凍結值一致', () => {
    const excluded = new Set(Object.keys(GRANT_DETAIL_MESSAGES));
    const later = new Set([
      ...LATER_EXACT_KEYS,
      ...Object.keys(messages).filter((key) =>
        LATER_KEY_PREFIXES.some((prefix) => key.startsWith(prefix)),
      ),
    ]);
    expect(hashExcluding(messages as Record<string, string>, new Set([...excluded, ...later]))).toBe(
      FROZEN_ALL_SHA256,
    );
  });
});
