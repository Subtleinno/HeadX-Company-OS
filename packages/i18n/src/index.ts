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
