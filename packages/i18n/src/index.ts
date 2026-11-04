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
