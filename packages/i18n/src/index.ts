/**
 * 介面字串表（zh-HK）。
 *
 * R3 只做「把既有字串搬進來」，所以這裡的每一個值都必須同改動前逐字相同：
 * 標點、空白、省略號（…）、Company OS 前後的空格都不可以順手改。
 *
 * 不新增語言：預設就是 zh-HK，沒有 locale 參數，也沒有 fallback 語言 ——
 * 找不到 key 就大聲失敗，不會靜默顯示空字串（那會變成「畫面少了半句」的假正常）。
 */

export const DEFAULT_LOCALE = 'zh-HK';

export const messages = {
  'app.name': 'Company OS',

  'common.retry': '重試',
  'common.show': '顯示',
  'common.hide': '隱藏',
  'common.email': '電郵',
  'common.password': '密碼',

  'status.loading': '載入中…',

  'error.unreachable.title': '無法連線到伺服器',
  'error.unreachable.body': '請確認 Company OS 正在運行，然後重試。',
  'error.network': '錯誤：無法連線到伺服器，請稍後再試。',
  'error.unexpected': '錯誤：發生未預期的錯誤，請稍後再試。',

  'home.title': '今日',
  'home.empty':
    '目前沒有任何待處理事項。待批准、Needs 與各部門的狀況，會在對應功能建好後出現在這裡。',
  'home.signOut': '登出',
  // 首頁通往新外殼原型的一條路。名稱與說明都要講清楚「這是示範」，
  // 否則點進去見到 App A／B／C 就會以為公司真的裝了三個 app。
  'home.protoEntry': 'Base UI 原型外殼',
  'home.protoNote': '示範 app 與工作範圍切換，未接駁業務內容。',
  'home.adminEntry': '管理區 · 公司設定',
  'home.adminNote': '改公司語系、驗收規則、部門隔離、逾期寬限與通知渠道。',

  // 共用外殼（#118）。名稱可以改，但這裡每一句都是畫面上見得到的文字，
  // 所以不可以在元件內另寫一份字面值。
  'shell.skipToContent': '跳去主要內容',
  'shell.rail.toggle': '顯示或收起工作欄',
  'shell.rail': '工作索引',
  'shell.rail.empty': '這個頁面沒有工作索引。',
  'shell.appSwitcher': '選擇 app',
  'shell.appSwitcher.empty': '未有可用的 app。',
  'shell.scope': '工作範圍',
  'shell.scope.company': '公司',
  'shell.scope.brand': '品牌',
  'shell.scope.selectBrand': '請選擇品牌',
  'shell.scope.required': '這個 app 要先選品牌，才開始工作。',
  'shell.scope.none': '未有可進入的品牌。',
  'shell.mainNav': 'app 主選單',
  'shell.subnav': '頁面子選單',
  'shell.tools': '全局工具',
  'shell.account': '帳戶',
  'shell.theme.toDark': '切換到深色模式',
  'shell.theme.toLight': '切換到淺色模式',
  'shell.app.missing': '找不到這個 app。',
  'shell.prototype.badge': '原型',
  'shell.prototype': '示範用 app 與品牌，未安裝、未授權。',

  // 原型外殼（#118 切片 C）。同樣唔可以喺元件內另寫字面值。
  'proto.chooseScope': '選擇品牌',
  // 第二步選範圍只有一個離開動作。老闆 2026-11-07 決定：這一步從未離開原 app，
  // 「返回」與「取消」是同一個結果，所以不並列兩個按鈕（見 C51）。
  'proto.back': '返回',
  // 未保存確認是另一個情境：這裡的「取消」是取消離開，不是返回上一步。
  'proto.cancel': '取消',
  'proto.discard': '放棄並切換',
  'proto.unsaved.title': '尚有未保存的輸入',
  'proto.unsaved.body': '切換之後目前的輸入會消失。',
  'proto.loading': '讀取中…',
  'proto.failed': '讀取失敗',
  'proto.retry': '重試',
  'proto.note': '原型備註',
  'proto.note.hint': '輸入任何文字，再切換 app 或範圍，就會出現未保存確認。',
  'proto.zone': '原型測試',
  'proto.logLabel': '載入結果',
  'proto.pageSub': '這個畫面只示範外殼切換，未接駁業務內容。',
  'proto.mode.company': '公司型 app',
  'proto.mode.brand': '品牌型 app',
  'proto.mode.mixed': '混合型 app',
  'proto.invalidTitle': '網址無法辨識',
  'proto.invalidBody': '這個網址不屬於任何可用的 app、工作範圍或頁面。請由 app 入口重新進入。',
  'proto.entry': '回到 app 入口',

  // 原型 fixture 的顯示文字。刻意放在字串表而不是寫死在 fixtures.ts：
  // i18n 守門規定 apps/web/src 之內不可以有寫死的中文介面文字。
  'proto.account': '原型使用者',
  'proto.brand.jia': '品牌甲',
  'proto.brand.yi': '品牌乙',
  'proto.menu.a': '總覽',
  'proto.menu.b': '品牌主頁',
  'proto.menu.c': '工作台',
  'proto.page.overview': '品牌總覽',
  'proto.rail.brand': '品牌工作',

  // ── 管理區：公司設定（issue #119） ──────────────────────────────────
  'admin.area': '管理',
  'admin.nav': '管理區',
  'admin.page.settings': '公司設定',
  'admin.settings.title': '公司設定',
  'admin.settings.lead': '以下每一項都是整間公司的設定，不是某一個品牌。',
  'admin.settings.loading': '正在讀取公司設定…',
  'admin.settings.loadFailed': '讀不到公司設定。',
  'admin.settings.empty': '伺服器沒有回傳任何設定項目。這是真的沒有資料，不是畫面出錯。',
  'admin.settings.denied': '只有老闆可以看公司設定。',
  // 401 是「session 沒了」，不是「你不夠權限」。管理區每一頁都用同一句，
  // 免得同一個事實寫兩個版本（issue 119 起，issue 120 沿用）。
  'admin.sessionExpired': '登入已經失效，請重新登入。',
  'admin.settings.retry': '重試',
  'admin.settings.currentValue': '目前值',
  'admin.settings.missing': '伺服器沒有這一項（未設定），所以不提供修改。',
  'admin.value.unset': '未設定',
  'admin.settings.unknownKey': '未定義的設定',
  'admin.group.install': '這台安裝',
  'admin.group.company': '公司運作',
  'admin.group.notify': '通知',
  'admin.field.edition': '版本',
  'admin.field.install_code': '安裝代碼',
  'admin.field.company_locale': '公司語系',
  'admin.field.acceptance_rule': '驗收規則',
  'admin.field.department_isolation': '部門隔離',
  'admin.field.overdue_grace_hours': '逾期寬限（小時）',
  'admin.field.notification_channels': '通知渠道',
  'admin.purpose.edition': '決定可用的入口與通知渠道目錄。',
  'admin.purpose.install_code': '這台安裝的識別碼，出現在匯出檔名。',
  'admin.purpose.company_locale': '介面與文件的預設語言。',
  'admin.purpose.acceptance_rule': '誰可以按下驗收。',
  'admin.purpose.department_isolation': '部門之間是否互相看不到。',
  'admin.purpose.overdue_grace_hours': '超過期限多久之後，才顯示為逾期。',
  'admin.purpose.notification_channels': '公司對外通知會用哪幾個渠道。',
  'admin.impact.company': '影響：全公司。',
  'admin.impact.overridable': '影響：全公司預設值；個別組織單位可以有自己的覆寫（B-03）。',
  'admin.impact.edition': '影響：全公司；也決定通知渠道可選哪幾個。',
  'admin.immutable': '安裝時決定，之後不可修改。',
  'admin.readOnlyNote': '這一項只能唯讀。',
  'admin.save': '儲存',
  'admin.saving': '儲存中…',
  'admin.saved': '已儲存',
  'admin.saveFailed': '儲存失敗',
  'admin.retry': '重試',
  'admin.unchanged': '與伺服器相同，不會提交。',
  'admin.value.yes': '是',
  'admin.value.no': '否',
  'admin.value.off': '（空）',
  'admin.choice.edition.intl': '國際版（intl）',
  'admin.choice.edition.cn': '大陸版（cn）',
  'admin.choice.locale.zhHK': '繁體中文（香港）',
  'admin.choice.locale.zhCN': '简体中文（大陆）',
  'admin.choice.acceptance.owner': '只有老闆可以驗收',
  'admin.choice.acceptance.deptHead': '部門主管可以驗收',
  'admin.choice.acceptance.onSubmit': '提交即通過',
  'admin.channels.hint': '渠道目錄由版本決定；清單以外的代碼伺服器會拒絕。',
  'admin.unsaved.title': '有未儲存的修改',
  'admin.unsaved.body': '離開這一頁會丟失未儲存的修改。',
  'admin.unsaved.leave': '放棄修改',
  'admin.unsaved.stay': '繼續編輯',
  'admin.unsaved.dirtyCount': '未儲存：{count} 項',

  // ── 管理區：品牌與組織（issue 120） ────────────────────────────────
  'admin.page.organisation': '品牌與組織',
  'org.title': '品牌與組織',
  'org.lead': '這裡管理公司組織結構。選中一個單位只是這一頁的編輯目標，不是切換到該品牌的 Workspace。',
  'org.boundary':
    '「品牌」目前未有穩定的後端身份契約：單位只有自由文字的 type，畫面不會由 type 推斷你是不是品牌。跨資源安全刪除屬 B-09。',
  'org.loading': '正在讀取組織…',
  'org.loadFailed': '讀不到組織資料。',
  'org.retry': '重試',
  'org.denied': '只有老闆可以管理組織。',
  'org.tree': '組織',
  'org.empty': '組織圖是空的，連根單位都沒有。這是真的沒有資料。',
  'org.select': '在左邊選一個單位，開始編輯。',
  'org.detail': '選中單位的詳細資料',
  'org.root': '公司（根單位）',
  'org.rootNote': '根單位代表整間公司，不是品牌 Workspace。',
  'org.unit': '一般單位',
  'org.parentCount': '{count} 個上級',
  'org.field.name': '名稱',
  'org.field.type': '類型（自由文字）',
  'org.field.country': '國家（ISO 3166-1，兩個大寫字母）',
  'org.field.currency': '貨幣（ISO 4217，三個大寫字母）',
  'org.field.timezone': '時區（IANA，例如 Asia/Hong_Kong）',
  'org.field.empty': '（未設定）',
  'org.save': '儲存',
  'org.saving': '儲存中…',
  'org.saved': '已儲存',
  'org.saveFailed': '儲存失敗',
  'org.unchanged': '與伺服器相同，不會提交。',
  'org.parents': '上級',
  'org.parents.none': '沒有上級（根單位）。',
  'org.parents.add': '加上級',
  'org.parents.select': '選擇上級',
  'org.parents.remove': '移除',
  'org.parents.last': '只剩一個上級，要接上另一個才可以移除。',
  'org.parents.added': '已加上級。',
  'org.parents.removed': '已移除上級。',
  'org.parents.failed': '上級關係沒有改成功。',
  'org.create': '新增單位',
  'org.create.hint': '新單位至少要有一個上級。',
  'org.create.submit': '建立',
  'org.create.cancel': '取消',
  'org.create.done': '已建立單位。',
  'org.delete': '刪除這個單位',
  'org.delete.title': '刪除單位',
  'org.delete.body': '這是軟刪除：資料列會保留，只是不再出現在組織圖。根單位與有下級的單位不可以刪。',
  'org.delete.brandGap':
    '注意：這一頁不知道單位是否承載品牌身份。跨資源安全刪除（含品牌資料與授權）屬 B-09，未完成前不要用它來「清理品牌」。',
  'org.delete.confirm': '確認刪除',
  'org.delete.cancel': '保留',
  'org.delete.done': '已刪除單位。',
  'org.delete.failed': '刪除失敗。',
  'org.settings': '單位設定（覆寫）',
  'org.settings.lead': '有效值與來源由後端解析，前端不另算一套。「恢復繼承」是移除本單位覆寫，不是複製上級目前的值。',
  'org.settings.key': '設定',
  'org.settings.effective': '有效值',
  'org.settings.source': '來源',
  'org.settings.overridden': '本單位覆寫',
  'org.settings.inherited': '繼承',
  'org.settings.sourceCompany': '公司預設',
  'org.settings.sourceNone': '公司和上級都沒有這一項',
  'org.settings.sourceUnit': '來自「{name}」',
  'org.settings.set': '改成',
  'org.settings.revert': '恢復繼承',
  'org.settings.loading': '正在讀取這個單位的設定…',
  'org.settings.failed': '讀不到這個單位的設定。',
  'org.settings.saved': '已寫入本單位的覆寫。',
  'org.settings.reverted': '已移除覆寫，恢復繼承。',
  'org.settings.failedSave': '沒有寫入成功。',
  'org.noVersion': '公司版本讀不到，通知渠道因此不能改。',

  'login.title': '登入 Company OS',
  'login.submit': '登入',
  'login.submitting': '登入中…',
  'login.invalidCredentials': '錯誤：電郵或密碼不正確。',
  'login.tooManyAttempts': '錯誤：嘗試次數過多，請在 {minutes} 分鐘後再試。',
  'login.emailInvalid': '請輸入有效的電郵。',
  'login.noticeAlreadySetUp': '已經有老闆帳戶，請登入。',

  'setup.title': '建立老闆帳戶',
  'setup.description': '這個帳戶是整個 Company OS 的老闆，只可以建立一次。',
  'setup.displayName': '顯示名稱',
  'setup.confirmPassword': '再輸入一次密碼',
  'setup.submit': '建立老闆帳戶',
  'setup.submitting': '建立中…',
  'setup.error.displayNameRequired': '顯示名稱不可空白。',
  'setup.error.emailInvalid': '請輸入有效的電郵。',
  'setup.error.passwordTooShort': '密碼至少需要 12 個字元。',
  'setup.error.passwordMismatch': '兩次輸入的密碼不一致。',
} as const;

export type MessageKey = keyof typeof messages;

export type MessageVars = Record<string, string | number>;

/**
 * 取字串。缺 key 或缺插值變數一律拋錯。
 *
 * 拋錯而不是回傳 key 或空字串：畫面少一句話，比整個畫面壞掉更難發現。
 */
export function t(key: MessageKey, vars?: MessageVars): string {
  const template = (messages as Record<string, string>)[key];

  if (template === undefined) {
    throw new Error(`i18n 缺少字串：${key}`);
  }

  // 即使沒有提供 vars 也照樣跑插值：帶 {minutes} 的模板若漏了變數，要在這裡就爆，
  // 而不是把 "{minutes}" 原字顯示給老闆看。
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, name: string) => {
    const value = vars?.[name];

    if (value === undefined) {
      throw new Error(`i18n 字串 ${key} 缺少插值變數：${name}`);
    }

    return String(value);
  });
}
