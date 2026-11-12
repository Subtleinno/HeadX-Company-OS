import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { messages, t } from '../src/index.js';

/**
 * #155 F-02I：Frame 文案鍵嘅驗收測試。
 *
 * 只驗證「新增 frame.* 鍵」同「既有鍵零改動」，唔改、唔刪、唔重命名任何
 * 既有鍵或文字。鍵值逐字來自本張施工規格：繁體中文（香港）、零 emoji、
 * 零插值（避免影響既有 i18n.test.ts 嘅插值清單斷言）。
 *
 * 文案來源降級：Ardot variable/text layer 喺本 session 讀唔到，文字以
 * docs/design/frame/*.png 快照可見文字同 FRAME-UIUX-HANDOFF.md 第 2.2–2.4
 * 節為準自撰，標「文案待老闆事後審閱」，唔阻塞施工。
 */

/** 本張交付嘅完整 frame.* 鍵值清單（唯一真相，要同 index.ts diff 逐項一致）。 */
const FRAME_MESSAGES: Record<string, string> = {
  'frame.topbar.sidebarToggle': '顯示或收起側欄',
  'frame.topbar.appSelector': '選擇 App',
  'frame.topbar.brandSelector': '選擇品牌',
  'frame.topbar.search': '搜尋',
  'frame.topbar.commandPalette': '開啟命令面板',
  'frame.topbar.language': '語系',
  'frame.topbar.notifications': '通知',
  'frame.topbar.help': '說明',
  'frame.topbar.account': '帳戶選單',
  'frame.topbar.more': '更多操作',
  'frame.topbar.pageSearch': '搜尋此頁',
  'frame.scope.company': '公司範圍',
  'frame.sidebar.legend': '頁面 PAGES',
  'frame.landmark.topbar': '全域頂欄',
  'frame.landmark.subbar': '模組分頁',
  'frame.landmark.sidebar': '子頁導覽',
  'frame.landmark.breadcrumb': '麵包屑',
  'frame.landmark.content': '主要內容',
  'frame.landmark.footer': '頁尾',
  'frame.empty.title': '呢頁仲未接內容',
  'frame.empty.body': '而家只畫外殼；呢頁會喺 Design app 階段接入真實模組內容。',
  'frame.footer.localCompany': '本機公司',
  'frame.footer.sitesEntry': '據點與機器',
  'frame.footer.headOffice': '總部主機',
  'frame.prototype.badge': '原型示意',
  'frame.menu.today': '今日',
  'frame.menu.account': '帳戶',
  'frame.menu.admin': '管理區',
  'frame.account.nameMissing': '名稱未提供',
  'frame.company.nameMissing': '公司名稱未提供',
  'frame.state.loading': '載入中…',
  'frame.state.readFailed': '讀取失敗，請重試。',
  'frame.state.permissionDenied': '你沒有查看呢頁嘅權限。',
  'frame.state.notProvided': '未提供',
};

/**
 * origin/main（9da2a90）版字串表，過濾 frame. 之後全部條目嘅 SHA-256 凍結快照。
 * 只要任何一個既有鍵嘅鍵名或文字被改動，呢個雜湊就會變，測試即紅。
 *
 * 同步改寫（#161）：#161 起嘅 cat:packages 施工張會新增非 frame. 前綴嘅鍵
 * （policy.* 同管理區頁籤 admin.page.policy）。呢啲鍵唔屬 #155 要守嘅既有鍵，
 * 唔排除嘅話「合法新增鍵」會被誤當成「既有鍵被改」，令 npm test 假紅。
 * 下面只係把呢啲後續鍵明確排除，凍結值 a48ab… 唔變、守衛嘅 489 個既有鍵
 * 唔變，唔係放寬門檻；後續施工張新增鍵要同步加落呢兩個清單。
 */
// 2026-11-11（#28）：凍結值因一條既有文案而更新 —— `staff.create.hint` 由
// 「建立時一律是員工、沒有部門」改為「部門可以即刻揀，亦可以之後再改」。
// 原因：建立員工時真的可以選部門了，舊句變成一句錯的說明。除此之外
// 其餘既有鍵逐字不變（鍵數不變，只是那一條的值改了）。
const FROZEN_NON_FRAME_SHA256 =
  'd870f58308893198313eb458c3af74d4caf745b59191302f4c4bef1330a091da';

// #163 新增 files.* 前綴；同 #161 嘅 policy.* 一樣，唔屬 #155 要守嘅既有鍵。
// issue 168 新增 5 個 grant.detail.* 鍵，同樣唔屬 #155 要守嘅既有鍵；
// 凍結值 a48ab… 同守衛嘅 489 個既有鍵唔變，唔係放寬門檻。
// 2026-11-11（issue #30）：`staff.enable` 同 `staff.enable.*` 係新增鍵（恢復停用
// 帳戶的路），唔屬 #155 要守嘅既有鍵；凍結值不變，只係明確排除新鍵。
const LATER_KEY_PREFIXES = ['brand.page.', 'brand.color.', 'brand.type.', 'brand.logo.', 'brand.tone.', 'brand.custom.', 'brand.home.', 'brand.guide.', 'policy.', 'files.', 'grant.detail.', 'boss.members.', 'staff.enable', 'boss.module.people', 'boss.page.people', 'gate.noDepartment.', 'gate.departmentClosed.', 'gate.signOut',
  // 2026-11-12（issue #34）：品牌頁策略是新增的介面，不屬本檔要守的既有鍵。
  'boss.policy.', 'boss.module.policy', 'boss.page.brandPolicy'];
const LATER_EXACT_KEYS = [
  'design.page.brandPage',
  // 2026-11-12（issue #32）：品牌模組五頁的頁名。舊的 `design.page.brandPage`
  // 與 `design.section.*` 沒有刪，只是不再有人讀 —— 凍結閘本來就不准刪。
  'design.page.brandLogo', 'design.page.brandColor', 'design.page.brandType',
  'design.page.brandTone','admin.page.policy', 'design.brand.ownerOnly'];

function hashNonFrame(msgs: Record<string, string>): string {
  const entries = Object.entries(msgs)
    .filter(
      ([key]) =>
        !key.startsWith('frame.') &&
        !LATER_KEY_PREFIXES.some((prefix) => key.startsWith(prefix)) &&
        !LATER_EXACT_KEYS.includes(key),
    )
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return createHash('sha256').update(JSON.stringify(entries)).digest('hex');
}

describe('#155 Frame 文案鍵（frame.*）', () => {
  it('全部 frame.* 鍵都存在，而且逐字正確（逐鍵斷言，刪一個只紅一個）', () => {
    for (const [key, expected] of Object.entries(FRAME_MESSAGES)) {
      expect((messages as Record<string, string>)[key], key).toBe(expected);
      expect(t(key as never), key).toBe(expected);
    }
  });

  it('交付鍵名全部以 frame. 開頭', () => {
    for (const key of Object.keys(FRAME_MESSAGES)) {
      expect(key.startsWith('frame.'), key).toBe(true);
    }
  });

  it('冇清單以外嘅 frame.* 鍵', () => {
    const extra = Object.keys(messages).filter(
      (key) => key.startsWith('frame.') && !(key in FRAME_MESSAGES),
    );
    expect(extra).toEqual([]);
  });

  it('新增文案零 emoji', () => {
    // 逐個獨立正則，唔好將 ZWJ／VS16 放落字元類別，否則會觸發
    // eslint no-misleading-character-class。\p{Extended_Pictographic}
    // 已覆蓋旗幟區域指示符同膚色修飾符。
    const emojiPatterns: RegExp[] = [
      /\p{Extended_Pictographic}/u,
      /\p{Emoji_Presentation}/u,
      /\uFE0F/u,
      /\u200D/u,
    ];
    for (const [key, value] of Object.entries(FRAME_MESSAGES)) {
      expect(
        emojiPatterns.some((pattern) => pattern.test(value)),
        key,
      ).toBe(false);
    }
  });

  it('新增文案零插值（唔出現任何 { }）', () => {
    for (const [key, value] of Object.entries(FRAME_MESSAGES)) {
      expect(/[{}]/.test(value), key).toBe(false);
    }
  });

  it('既有鍵零改動：非 frame. 條目 SHA-256 同 origin/main 凍結值一致', () => {
    expect(hashNonFrame(messages as Record<string, string>)).toBe(FROZEN_NON_FRAME_SHA256);
  });
});
