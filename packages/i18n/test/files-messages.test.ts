import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { messages, t } from '../src/index.js';

/**
 * #163 F-06I：檔案頁文案鍵嘅驗收測試。
 *
 * 只驗證「新增 files.* 鍵」同「既有鍵零改動」，唔改、唔刪、唔重命名任何
 * 既有鍵或文字。鍵值逐字按 #163「必須涵蓋嘅意思」8 類自撰：繁體中文（香港）、
 * 零 emoji、唔講「已永久刪除」「已掃描」「已審核」「安全」、刪除確認如實講明
 * 軟刪除同內容仍保留喺儲存空間、上傳中唔顯示進度百分比、唔放示例檔名／
 * 示例大小／假資料、唔用開發術語（錯誤碼、標頭名）作主文字。
 *
 * 文案按 Worker prompt 第 4 節 J 自撰並用測試驗證，文案待老闆事後審閱，唔阻塞。
 * 後端契約（400 invalid_content_type／invalid_file_name、422 checksum_mismatch、
 * 413 bodyLimit、204 軟刪除、無上傳者欄位、inline／attachment 由伺服器決定）
 * 已對返 apps/platform/src/files/ 實際程式。
 */

/** 本張交付嘅完整鍵值清單（唯一真相，要同 index.ts diff 逐項一致）。 */
const FILES_MESSAGES: Record<string, string> = {
  // 1 導覽與頁面：主選單「檔案」標籤、標題、員工／老闆兩版簡介
  'files.menu.label': '檔案',
  'files.title': '檔案',
  'files.lead.staff': '這裡只會顯示你自己上傳的檔案。',
  'files.lead.owner': '這裡會顯示全公司所有未刪除的檔案，但畫面不會顯示上傳者是誰。',

  // 2 列表五個欄位名
  'files.column.name': '檔名',
  'files.column.type': '類型',
  'files.column.size': '大小',
  'files.column.uploadedAt': '上傳時間',
  'files.column.checksum': '校驗碼（SHA-256）',

  // 3 大小單位（帶 {count} 插值）
  'files.size.bytes': '{count} 位元組',
  'files.size.kb': '{count} KB',
  'files.size.mb': '{count} MB',
  'files.size.gb': '{count} GB',

  // 4 上傳：選擇檔案、上傳動作、上傳中、成功、四種本頁失敗原因
  'files.upload.select': '選擇檔案',
  'files.upload.action': '上傳',
  'files.upload.uploading': '上傳中…',
  'files.upload.success': '檔案已上傳。',
  'files.upload.error.invalidType': '無法辨識這個檔案的類型，請確認後再試。',
  'files.upload.error.invalidName': '檔名無效，請用 1 至 255 個字元。',
  'files.upload.error.checksum': '檔案內容與提供的校驗碼不符，請重新上傳。',
  'files.upload.error.tooLarge': '檔案超過伺服器允許的上限，請選一個較小的檔案再試。',

  // 5 下載：動作與如實說明
  'files.download.action': '下載',
  'files.download.note': '部分類型會直接在瀏覽器開啟，其餘會下載，實際由伺服器決定。',

  // 6 刪除：動作、刪除中、確認標題／說明／確認鍵、成功、404
  'files.delete.action': '刪除',
  'files.delete.deleting': '刪除中…',
  'files.delete.confirm.title': '刪除檔案',
  'files.delete.confirm.body':
    '這是軟刪除：檔案會從列表消失，但檔案內容仍保留在儲存空間，不會被清除。',
  'files.delete.confirm.action': '確認刪除',
  'files.delete.success': '檔案已從列表移除。',
  'files.delete.notFound': '找不到這個檔案，可能已刪除，或不是你上傳的。',

  // 7 列表狀態：空清單兩版、讀取失敗加重試、載入更多、已到最後（載入中重用 status.loading）
  'files.empty.staff': '你還沒有上傳任何檔案；這是真的沒有資料，不是畫面出錯。',
  'files.empty.owner': '公司還沒有任何檔案；這是真的沒有資料，不是畫面出錯。',
  'files.loadFailed': '讀不到檔案清單，請重試。',
  'files.loadMore': '載入更多',
  'files.endOfList': '已到最後，沒有更多檔案。',

  // 8 校驗碼說明
  'files.checksum.note': '校驗碼是檔案內容的 SHA-256 值，用來核對檔案完整性。',
};

/**
 * #163 驗收 7：8 類意思逐類列出對應鍵清單，證明每個意思都有鍵。
 * 重用既有鍵（載入中、重試、取消、登入失效、網絡失敗、未預期錯誤）直接列入
 * 所屬意思組，本張唔重複新增，詳見 REUSED_KEYS。
 */
const MEANING_GROUPS: Record<string, string[]> = {
  '1 導覽與頁面（主選單標籤、標題、員工／老闆兩版簡介）': [
    'files.menu.label',
    'files.title',
    'files.lead.staff',
    'files.lead.owner',
  ],
  '2 列表五個欄位名（檔名、類型、大小、上傳時間、校驗碼）': [
    'files.column.name',
    'files.column.type',
    'files.column.size',
    'files.column.uploadedAt',
    'files.column.checksum',
  ],
  '3 大小單位（位元組／KB／MB／GB，帶 {變數}）': [
    'files.size.bytes',
    'files.size.kb',
    'files.size.mb',
    'files.size.gb',
  ],
  '4 上傳（選擇檔案、上傳中、成功、七種失敗原因分開）': [
    'files.upload.select',
    'files.upload.action',
    'files.upload.uploading',
    'files.upload.success',
    'files.upload.error.invalidType',
    'files.upload.error.invalidName',
    'files.upload.error.checksum',
    'files.upload.error.tooLarge',
    'admin.sessionExpired',
    'error.network',
    'error.unexpected',
  ],
  '5 下載（動作、由伺服器決定嘅說明）': ['files.download.action', 'files.download.note'],
  '6 刪除（動作、刪除中、確認標題／說明／確認鍵、成功、404）': [
    'files.delete.action',
    'files.delete.deleting',
    'files.delete.confirm.title',
    'files.delete.confirm.body',
    'files.delete.confirm.action',
    'files.delete.success',
    'files.delete.notFound',
  ],
  '7 列表狀態（載入中、空清單兩版、讀取失敗加重試、載入更多、已到最後）': [
    'status.loading',
    'files.empty.staff',
    'files.empty.owner',
    'files.loadFailed',
    'admin.retry',
    'common.retry',
    'files.loadMore',
    'files.endOfList',
  ],
  '8 校驗碼說明（SHA-256 核對完整性）': ['files.checksum.note'],
};

/** 重用既有鍵（本張唔重複新增，全部要存在而且非空）。 */
const REUSED_KEYS = [
  'status.loading',
  'admin.retry',
  'common.retry',
  'admin.cancel',
  'admin.sessionExpired',
  'error.network',
  'error.unexpected',
];

/** 帶 {變數} 插值嘅鍵：鍵名要同步加進 i18n.test.ts 嘅 withPlaceholders 清單。 */
const INTERPOLATED: Record<string, Record<string, string | number>> = {
  'files.size.bytes': { count: 512 },
  'files.size.kb': { count: 12 },
  'files.size.mb': { count: 3 },
  'files.size.gb': { count: 2 },
};

/**
 * origin/main（2e9bd10）版字串表全部 596 個條目嘅 SHA-256 凍結快照。
 * 用 FILES_MESSAGES 鍵集合排除本張新增鍵後再算同一個雜湊，
 * 任何既有鍵嘅鍵名或文字被改動、或新增清單外鍵，雜湊都會變，測試即紅。
 * 值由 /tmp/company-os-loop-evidence/163/gen-baseline.mjs 以
 * typescript.transpileModule 轉譯 origin/main 版 index.ts 後計出。
 */
// 2026-11-11（#28）：凍結值因一條既有文案而更新 —— `staff.create.hint` 由
// 「建立時一律是員工、沒有部門」改為「部門可以即刻揀，亦可以之後再改」。
// 原因：建立員工時真的可以選部門了，舊句變成一句錯的說明。除此之外
// 其餘既有鍵逐字不變（鍵數不變，只是那一條的值改了）。
const FROZEN_ALL_SHA256 = 'fb6c35cf665b8ceeff9f842d1a05b25b77697ad4e1e7679f5bbf495a5e3577ac';

/**
 * 同步改寫（issue 168）：issue 168 新增 5 個 grant.detail.* 鍵，唔屬 #163
 * 要守嘅既有鍵；唔排除嘅話「合法新增鍵」會被誤當成「既有鍵被改」，令
 * npm test 假紅（同 #155／#161 嘅情況一樣）。凍結值 da869a7e… 唔變、
 * 守衛嘅 596 個既有鍵唔變，唔係放寬門檻；issue 168 嘅完整鍵清單另由
 * grant-detail-messages.test.ts「冇清單以外嘅 grant.detail.* 鍵」守衛。
 */
// 2026-11-11（issue #30）：`staff.enable` 同 `staff.enable.*` 係新增鍵（恢復停用
// 帳戶的路），唔屬 #163 要守嘅既有鍵；凍結值不變，只係明確排除新鍵。
const LATER_KEY_PREFIXES = ['brand.page.', 'brand.color.', 'brand.type.', 'grant.detail.', 'boss.members.', 'staff.enable', 'boss.module.people', 'boss.page.people',
  // 2026-11-12（issue #34）：品牌頁策略是新增的介面，不屬本檔要守的既有鍵。
  'boss.policy.', 'boss.module.policy', 'boss.page.brandPolicy',
  'gate.noDepartment.', 'gate.departmentClosed.', 'gate.signOut'];
/**
 * 精確到單一鍵的排除（issue #19）：`design.brand.` 前綴會連 #153 已交付的
 * `design.brand.*` 一齊放走，所以唔可以用前綴。
 */
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

describe('#163 檔案頁文案鍵（files.*）', () => {
  it('8 類意思每個都有對應鍵，而且交付鍵全部歸屬其中一類', () => {
    expect(Object.keys(MEANING_GROUPS).length).toBe(8);
    const known = new Set([...Object.keys(FILES_MESSAGES), ...REUSED_KEYS]);
    const grouped = new Set<string>();
    for (const [meaning, keys] of Object.entries(MEANING_GROUPS)) {
      expect(keys.length, meaning).toBeGreaterThan(0);
      for (const key of keys) {
        expect(known.has(key), `${meaning} / ${key}`).toBe(true);
        grouped.add(key);
      }
    }
    for (const key of Object.keys(FILES_MESSAGES)) {
      expect(grouped.has(key), key).toBe(true);
    }
  });

  it('全部鍵都存在，而且逐字正確（逐鍵斷言，刪一個只紅一個）', () => {
    for (const [key, expected] of Object.entries(FILES_MESSAGES)) {
      expect((messages as Record<string, string>)[key], key).toBe(expected);
      // 帶 {變數} 嘅鍵唔可以唔帶變數叫 t()（t() 一律跑插值，會拋錯）；
      // 佢哋嘅插值由下面「帶 {變數} 嘅鍵用實例變數驗證插值」斷言。
      if (!(key in INTERPOLATED)) {
        expect(t(key as never), key).toBe(expected);
      }
    }
  });

  it('每個鍵 t() 都解析成非空字串（帶變數鍵用實例變數）', () => {
    for (const key of Object.keys(FILES_MESSAGES)) {
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

  it('帶變數鍵嘅模板確實含 {變數}', () => {
    for (const key of Object.keys(INTERPOLATED)) {
      expect(/\{[a-zA-Z0-9_]+\}/.test((messages as Record<string, string>)[key] ?? ''), key).toBe(
        true,
      );
    }
  });

  it('交付鍵名全部以 files. 開頭', () => {
    for (const key of Object.keys(FILES_MESSAGES)) {
      expect(key.startsWith('files.'), key).toBe(true);
    }
  });

  it('冇清單以外嘅 files.* 鍵', () => {
    const extra = Object.keys(messages).filter(
      (key) => key.startsWith('files.') && !(key in FILES_MESSAGES),
    );
    expect(extra).toEqual([]);
  });

  it('主選單「檔案」標籤鍵存在而且係「檔案」', () => {
    expect(FILES_MESSAGES['files.menu.label']).toBe('檔案');
    expect(t('files.menu.label' as never)).toBe('檔案');
  });

  it('重用既有鍵存在而且非空（本張唔重複新增）', () => {
    for (const key of REUSED_KEYS) {
      expect((messages as Record<string, string>)[key], key).toBeDefined();
      expect(t(key as never).length, key).toBeGreaterThan(0);
    }
  });

  it('重用既有鍵冇被重複新增成 files.* 鍵', () => {
    const forbidden = [
      'files.loading',
      'files.retry',
      'files.cancel',
      'files.sessionExpired',
      'files.network',
      'files.unexpected',
    ];
    for (const key of forbidden) {
      expect(key in FILES_MESSAGES, key).toBe(false);
    }
    expect(Object.keys(messages).filter((key) => forbidden.includes(key))).toEqual([]);
  });

  it('七種上傳失敗原因分開：七個鍵、七種唔同文字', () => {
    const failures = [
      'files.upload.error.invalidType',
      'files.upload.error.invalidName',
      'files.upload.error.checksum',
      'files.upload.error.tooLarge',
      'admin.sessionExpired',
      'error.network',
      'error.unexpected',
    ];
    expect(new Set(failures).size).toBe(7);
    const texts = failures.map((key) => (messages as Record<string, string>)[key]);
    expect(new Set(texts).size).toBe(7);
    for (const key of failures) {
      expect(((messages as Record<string, string>)[key] ?? '').length, key).toBeGreaterThan(0);
    }
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
    for (const [key, value] of Object.entries(FILES_MESSAGES)) {
      expect(
        emojiPatterns.some((pattern) => pattern.test(value)),
        key,
      ).toBe(false);
    }
  });

  it('新增文案無禁用字眼（已永久刪除／已掃描／已審核／安全／永久）', () => {
    const forbidden = ['已永久刪除', '已掃描', '已審核', '安全', '永久'];
    for (const [key, value] of Object.entries(FILES_MESSAGES)) {
      for (const word of forbidden) {
        expect(value.includes(word), `${key} / ${word}`).toBe(false);
      }
    }
  });

  it('新增文案唔放示例檔名／示例大小／假資料', () => {
    for (const [key, value] of Object.entries(FILES_MESSAGES)) {
      expect(/例如|示意|範例|假資料|示範/.test(value), key).toBe(false);
    }
  });

  it('新增文案唔用開發術語（錯誤碼、標頭名）作主文字', () => {
    const terms =
      /invalid_content_type|invalid_file_name|checksum_mismatch|invalid_limit|invalid_cursor|x-file-name|x-content-sha256|content-disposition|content-type/i;
    for (const [key, value] of Object.entries(FILES_MESSAGES)) {
      expect(terms.test(value), key).toBe(false);
    }
  });

  it('上傳中唔顯示進度百分比（全表無百分號／百分比）', () => {
    expect(FILES_MESSAGES['files.upload.uploading']).toBe('上傳中…');
    for (const [key, value] of Object.entries(FILES_MESSAGES)) {
      expect(/[%％]|百分比/.test(value), key).toBe(false);
    }
  });

  it('上傳失敗原因如實：類型、1 至 255 字、校驗請重新上傳、超限唔寫死數字', () => {
    expect(FILES_MESSAGES['files.upload.error.invalidType']).toContain('無法辨識');
    expect(FILES_MESSAGES['files.upload.error.invalidName']).toContain('1 至 255');
    expect(FILES_MESSAGES['files.upload.error.checksum']).toContain('請重新上傳');
    expect(FILES_MESSAGES['files.upload.error.tooLarge']).toContain('伺服器允許的上限');
    expect(FILES_MESSAGES['files.upload.error.tooLarge']).not.toMatch(/\d/);
  });

  it('刪除確認如實講明軟刪除同內容仍保留喺儲存空間', () => {
    const body = FILES_MESSAGES['files.delete.confirm.body'];
    expect(body).toContain('軟刪除');
    expect(body).toContain('從列表消失');
    expect(body).toContain('仍保留');
    expect(body).toContain('儲存空間');
    expect(body).not.toContain('永久');
    expect(body).not.toContain('已掃描');
    expect(body).not.toContain('已審核');
    expect(t('files.delete.confirm.body' as never)).toBe(body);
  });

  it('404 訊息如實：可能已刪除，或不是你上傳嘅', () => {
    const notFound = FILES_MESSAGES['files.delete.notFound'];
    expect(notFound).toContain('找不到這個檔案');
    expect(notFound).toContain('可能已刪除');
    expect(notFound).toContain('不是你上傳的');
  });

  it('空清單有員工同老闆兩版，都講明真係冇資料', () => {
    const staff = FILES_MESSAGES['files.empty.staff'];
    const owner = FILES_MESSAGES['files.empty.owner'];
    expect(staff).toContain('你還沒有上傳任何檔案');
    expect(owner).toContain('公司還沒有任何檔案');
    expect(staff).not.toBe(owner);
    for (const value of [staff, owner]) {
      expect(value).toContain('真的沒有資料');
      expect(value).toContain('不是畫面出錯');
    }
  });

  it('老闆版簡介講明畫面不顯示上傳者；員工版講明只見自己上傳', () => {
    expect(FILES_MESSAGES['files.lead.owner']).toContain('不會顯示上傳者');
    expect(FILES_MESSAGES['files.lead.staff']).toContain('你自己上傳');
  });

  it('下載說明講明部分類型喺瀏覽器開啟、其餘下載、由伺服器決定', () => {
    const note = FILES_MESSAGES['files.download.note'];
    expect(note).toContain('瀏覽器');
    expect(note).toContain('下載');
    expect(note).toContain('伺服器決定');
  });

  it('校驗碼說明只講 SHA-256 核對完整性，唔暗示掃毒或審核', () => {
    const note = FILES_MESSAGES['files.checksum.note'];
    expect(note).toContain('SHA-256');
    expect(note).toContain('核對');
    expect(note).toContain('完整性');
    expect(note).not.toMatch(/病毒|掃描|審核|安全/);
  });

  it('既有鍵零改動：排除本張交付鍵後 SHA-256 同 origin/main 凍結值一致', () => {
    const excluded = new Set(Object.keys(FILES_MESSAGES));
    expect(hashExcluding(messages as Record<string, string>, excluded)).toBe(FROZEN_ALL_SHA256);
  });
});
