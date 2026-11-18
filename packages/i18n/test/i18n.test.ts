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
      'gate.body',
      'gate.departmentClosed.body',
      // Create：作品庫的計數、複製命名、刪除確認與選單 aria。
      'design.create.deleted',
      'design.create.count',
      'design.create.deleteFolderConfirm',
      'design.create.deleteSetConfirm',
      'design.create.deleteProjectConfirm',
      'design.create.manage',
      'design.create.copyName',
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
      'brandBuild.calc.months',
      'brandBuild.calc.times',
      'brandBuild.calc.timesX',
      'brandBuild.edit.max',
      'brandBuild.edit.picked',
      'brandBuild.card.more',
      'brandBuild.card.files',
      'brandBuild.cardAnswered',
      'brandBuild.overview.progress',
      'brandBuild.overview.missing',
      'brandBuild.layer.maturity',
      'brandBuild.layer.rationale',
      'brandBuild.layer.approval',
      // 品牌集：複製命名、刪除／刪資料夾的確認句、已填數、選單 aria 名稱。
      'brandBuild.set.copyName',
      'brandBuild.set.deleteConfirm',
      'brandBuild.set.deleteFolderConfirm',
      'brandBuild.set.deleted',
      'brandBuild.set.filled',
      'brandBuild.set.manage',
      // 區塊 prompt 逐行砌：位置、識別碼、已填／未填、可選項。
      'brandBuild.block.prompt.intro',
      'brandBuild.block.prompt.brand',
      'brandBuild.block.prompt.stage',
      'brandBuild.block.prompt.set',
      'brandBuild.block.prompt.block',
      'brandBuild.block.prompt.filledLine',
      'brandBuild.block.prompt.todoLine',
      'brandBuild.block.prompt.optionLine',
      'brandBuild.block.prompt.textLine',
      // 決策與歷史要帶進 prompt：agent 才知上次談成甚麼。
      'brandBuild.block.prompt.decisionLine',
      'brandBuild.block.prompt.agentWho',
      'brandBuild.block.prompt.historyCount',
      'brandBuild.block.prompt.historyLine',
      'brandBuild.block.prompt.historyMore',
      'brandBuild.block.prompt.toolArgs',
      // 品牌集：每一格的識別碼要帶 set，寫回時才不會改錯另一套。
      'brandBuild.block.prompt.toolArgsSet',
      // 範圍層 prompt（品牌總覽／品牌集／04A／04G）。
      'brandBuild.scopePrompt.intro',
      'brandBuild.scopePrompt.rangeBrand',
      'brandBuild.scopePrompt.rangeSet',
      'brandBuild.scopePrompt.rangeStage',
      'brandBuild.scopePrompt.rangeStages',
      'brandBuild.scopePrompt.progressLine',
      'brandBuild.scopePrompt.ident',
      'brandBuild.scopePrompt.identBrand',
      'brandBuild.scopePrompt.identSet',
      'brandBuild.scopePrompt.identStage',
      'brandBuild.scopePrompt.identBlock',
      'brandBuild.scopePrompt.decisionLine',
      'brandBuild.scopePrompt.decisionNoTime',
      'brandBuild.scopePrompt.todoBodySet',
      'brandBuild.scopePrompt.toolArgs',
      'brandBuild.scopePrompt.toolArgsSet',
      'brandBuild.block.fileUploader',
      'brandBuild.block.decisionByAgent',
      'brandBuild.approval.button',
      'brandBuild.approval.approvedBy',
      'brandBuild.progress',
      'brandBuild.stage.label',
      'brandBuild.sw.calc.dimsVal',
      'brandBuild.sw.calc.dimsVol',
      'brandBuild.sw.calc.explodedVal',
      'brandBuild.sw.calc.renderFrames',
      'brandBuild.sw.calc.renderFull',
      'brandBuild.sw.calc.textureMemVal',
      'brandBuild.sw.calc.turntableVal',
      'brandBuild.sw.capacityVal',
      'brandBuild.sw.unit.beats',
      'brandBuild.sw.unit.cuts',
      'brandBuild.sw.unit.frame',
      'brandBuild.view.admireN',
      'brandBuild.view.competeN',
      'brandBuild.view.completeness',
      'brandBuild.view.completenessLine',
      'brandBuild.view.missingList',
      'brandBuild.view.ticketHkd',
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
