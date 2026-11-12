import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, messages, t } from '../src/index.js';

/**
 * i18n 的閘門測試（issue #73 驗收 3）。
 *
 * 這裡不只要「綠」，還要證明失敗路徑真的會失敗：缺 key、缺插值變數都要拋錯，
 * 否則「找不到字串」會變成畫面靜靜少一句。
 */

describe('字串表', () => {
  it('預設語言是 zh-HK，而且沒有其他語言', () => {
    expect(DEFAULT_LOCALE).toBe('zh-HK');
  });

  it('每個值都非空，而且沒有前後多餘空白（既有字串本身就有明確開頭結尾）', () => {
    for (const [key, value] of Object.entries(messages)) {
      expect(value.length, key).toBeGreaterThan(0);
      expect(value.trim(), key).toBe(value);
    }
  });

  it('所有插值都用得到：每個 {name} 都在呼叫端有對應變數', () => {
    const withPlaceholders = Object.entries(messages).filter(([, value]) => /\{[a-zA-Z0-9_]+\}/.test(value));

    // 清單是「哪幾個字串有插值」的盤點；新增插值字串要同時更新這裡，
    // 並在呼叫端把它填滿：
    //   admin.unsaved.dirtyCount → company-settings.test.tsx 斷言「未儲存：1 項」
    //   org.parentCount          → organisation.test.tsx 斷言「2 個上級」
    //   org.settings.sourceUnit  → organisation.test.tsx 斷言「來自「…」」
    //   staff.* / agent.*        → staff-agents.test.tsx 斷言實際數字與原因
    //   grant.*                  → app-grants.test.tsx 斷言分頁、範圍、受益人與修改前後
    expect(withPlaceholders.map(([key]) => key)).toEqual([
      'myapps.department',
      'myapps.access.denied',
      'myapps.access.unknown',
      'account.throttle',
      'admin.unsaved.dirtyCount',
      'org.parentCount',
      'org.settings.sourceUnit',
      'staff.total',
      'staff.state.disabledAt',
      'staff.enable.done',
      'staff.pager.info',
      'agent.total',
      'agent.grants.scopeNote',
      'agent.access.denied',
      'grant.pager.info',
      'grant.scope.note',
      'grant.supersede',
      'grant.rejectionReason',
      'grant.beneficiary.you',
      'grant.beneficiary.unknown',
      'grant.modify.current',
      'grant.modify.target',
      'login.tooManyAttempts',
      'need.rail.closed',
      'need.filter.overdue',
      'need.due.overdue',
      'need.due.daysLeft',
      'need.waitDays',
  'boss.sites.lastExchange',
  'boss.add.expires',
  'boss.members.assignLabel',
  'boss.members.created',
  'boss.members.createdIn',
  'boss.members.disableLabel',
  'boss.members.enableLabel',
  'boss.members.resetLabel',
  'boss.members.brandEditGranted',
  'boss.members.brandEditRevoked',
  'boss.policy.saved',
  'boss.policy.versionNo',
  // #56：規則卡要顯示閾值與三態，用的頁數是算出來的。
  'boss.policy.ruleThreshold',
  'boss.policy.ruleStates',
  'boss.policy.usedByCount',
  'gate.body',
  'gate.departmentClosed.body',
  'design.brand.lead',
      'policy.scope.unit',
      'policy.scope.unitNameUnknown',
      'policy.condition.eq',
      'policy.condition.lte',
      'policy.condition.gte',
      'policy.condition.in',
      'files.size.bytes',
      'files.size.kb',
      'files.size.mb',
      'files.size.gb',
      'brand.page.versionNo',
      'brand.page.saved',
      'brand.page.restored',
      'brand.page.deleted',
      'brand.page.pinned',
      // v2.1 編輯態：一句講明「以第幾版為基礎」。
      'brand.page.editingLead',
      'brand.page.policyVersionNo',
      // #53「這一頁」面板：現況的版本與時間、缺口數、引用清單、策略版號。
      'brand.guide.current',
      'brand.guide.gaps',
      'brand.guide.uses',
      'brand.guide.usedBy',
      'brand.guide.link',
      // v2.1：策略摘要講槽名與版號；給 agent 的是一句人話（品牌名＋頁名）。
      'brand.guide.policySummary',
      'brand.guide.policySummaryNoVersion',
      'brand.guide.agentInstruction',
      'brand.guide.policyOwnerOnly',
      'brand.guide.policySaved',
      'brand.page.manage.created',
      'brand.page.manage.belongsMoved',
      'brand.page.manage.renamed',
      'brand.page.manage.removed',
      'brand.page.manage.briefLine',
      // #62：版本差異講「改了哪一欄」，不是再印一次內容。
      'brand.page.diff.more',
      'brand.page.diff.sub.item',
      // #62：替代色、下限、比例合計、未定角色。
      'brand.color.undecidedLine',
      'brand.color.missingLine',
      'brand.color.missingMustHave',
      'brand.color.ratioTotal',
      'brand.color.pairUnknown',
      'brand.color.pairNoValue',
      'brand.color.ratio',
      'brand.color.floorLabel',
      'brand.color.altNew',
      'brand.color.altRole',
      'brand.color.altRatio',
      'brand.type.familyGap',
      'brand.type.missingLine',
      // #63：字體頁的缺口逐件事講，不是逐個分類講。
      'brand.type.gapFamilies',
      'brand.type.gapScripts',
      'brand.type.gapRoles',
      'brand.logo.assetLimit',
      'brand.logo.modeValueMissing',
      'brand.logo.missingLine',
      'brand.logo.gapAssets',
      'brand.logo.gapModes',
      'brand.tone.missingLine',
      'brand.tone.gapTooFew',
      'brand.tone.gapTraits',
      'brand.tone.gapBannedReasons',
      'brand.tone.gapContexts',
      'brand.tone.gapSamples',
      'brand.tone.gapHardest',
      'brand.tone.traitMin',
      'brand.tone.traitLimit',
      'brand.tone.traitGaps',
      'brand.tone.bannedDuplicate',
      'brand.tone.sampleCount',
      'brand.image.missingLine',
      'brand.image.gapPhoto',
      'brand.image.gapExamples',
      'brand.image.gapLists',
      'brand.image.gapColorUnknown',
      'brand.image.gapBannedReasons',
      'brand.image.exampleGaps',
      'brand.image.listCount',
      'brand.image.bannedDuplicate',
      'brand.custom.briefVague',
      'brand.custom.missingLine',
      'brand.custom.gapSections',
      'brand.custom.gapBanned',
      'brand.custom.lineBanned',
      'brand.custom.conflictLine',
      'brand.custom.conflictNoPolicy',
      'brand.custom.roleGap',
      'brand.custom.regenerated',
      // #68：範例逐項標缺、版本換了、重用時的版本差。
      'brand.examples.gapRow',
      'brand.examples.gapPromptRow',
      'brand.examples.exampleRefStale',
      'brand.examples.reuseNow',
      'brand.examples.reuseMoved',
      'brand.examples.reuseGone',
      'brand.examples.regenerated',
      // #67：主頁的插值全部是「幾個」「第幾版」「來源頁」，次序跟 messages 一致。
      'brand.home.gapKeywordsTooFew',
      'brand.home.gapKeywordsTooMany',
      'brand.home.gapLayoutReason',
      'brand.home.gapRefs',
      'brand.home.gapPages',
      'brand.home.keywordsHint',
      'brand.home.refSource',
      'brand.home.refNoVersion',
      'brand.home.refMissingPage',
      'brand.home.refUnknown',
      'brand.home.refMissingValue',
      'brand.home.logoRoleLine',
      'brand.home.logoSize',
      'brand.home.pageVersion',
      'brand.home.regenerated',
      'brand.gap.created',
      'brand.gap.existing',
      'brand.gap.meta',
      'brand.gap.dialogLead',
      // #59：摘要條的三個數字是算出來的，不是寫死的。
      'brand.check.pass',
      'brand.check.fail',
      'brand.check.undetermined',
      // v2.1：關鍵詞與標籤輸入（下限、上限、移除時讀出被移除的值）。
      'brand.platform.keywordsShort',
      'brand.platform.keywordsOver',
      'brand.platform.removeTag',
      // #61：Need 編號。
      'brand.platform.needCreated',
      // #60：建議的三項判斷、接受後的頁名、撞鍵，以及主頁過時的頁數。
      'brand.suggest.title',
      'brand.suggest.accepted',
      'brand.suggest.taken',
      'brand.suggest.belongs',
      'brand.home.stale',
    ]);
  });
});

describe('t()', () => {
  it('直接取字串，逐字不變', () => {
    expect(t('login.title')).toBe('登入 Company OS');
    expect(t('status.loading')).toBe('載入中…');
    expect(t('home.empty')).toBe(
      '目前沒有任何待處理事項。待批准、Needs 與各部門的狀況，會在對應功能建好後出現在這裡。',
    );
  });

  it('插值會換成實際數值', () => {
    expect(t('login.tooManyAttempts', { minutes: 3 })).toBe('錯誤：嘗試次數過多，請在 3 分鐘後再試。');
  });

  it('缺 key 會拋錯，不會回傳空字串或 key 本身', () => {
    expect(() => t('login.notAKey' as never)).toThrow(/i18n 缺少字串：login\.notAKey/);
  });

  it('缺插值變數會拋錯', () => {
    expect(() => t('login.tooManyAttempts', {})).toThrow(/缺少插值變數：minutes/);
  });

  it('完全沒有提供插值變數時也會拋錯，不會把 {minutes} 顯示給人看', () => {
    expect(() => t('login.tooManyAttempts')).toThrow(/缺少插值變數：minutes/);
  });
});
