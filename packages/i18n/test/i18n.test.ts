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
      'brand.page.policyVersionNo',
      'brand.page.manage.created',
      'brand.page.manage.belongsMoved',
      'brand.page.manage.renamed',
      'brand.page.manage.removed',
      'brand.page.manage.briefLine',
      'brand.color.missingLine',
      'brand.color.missingMustHave',
      'brand.color.pairUnknown',
      'brand.color.ratio',
      'brand.color.logoNote',
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
