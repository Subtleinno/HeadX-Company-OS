import {
  DEFAULT_EDITION,
  editionProfile,
  isEditionCode,
  type EditionCode,
} from '@company-os/edition-profile';

/**
 * 設定項的型別與範圍（issue #80／決策 C02、C22）。
 *
 * 門檻與政策寫在資料裡，不寫死在程式（不變量 9）；這個檔負責的是「寫進去的值有沒有意義」。
 * 一個 key 一個驗證，未知的 key 一律拒絕 —— 沒定義過的設定就算寫進資料庫也沒有人會讀，
 * 它只會讓下一個人以為「設了就會生效」。
 *
 * 這一支是純函數，不碰資料庫：寫入前的驗證與種子檔的驗證用的是同一份規則，
 * 不會出現「種子填得進去、API 卻拒絕」這種兩套標準。
 */

export type SettingKey =
  | 'edition'
  | 'install_code'
  | 'company_locale'
  | 'acceptance_rule'
  | 'department_isolation'
  | 'overdue_grace_hours'
  | 'notification_channels';

/** 次序就是文件與 API 回應的次序。 */
export const SETTING_KEYS: readonly SettingKey[] = [
  'edition',
  'install_code',
  'company_locale',
  'acceptance_rule',
  'department_isolation',
  'overdue_grace_hours',
  'notification_channels',
];

/** 安裝時決定、之後不可經 API 修改。 */
const IMMUTABLE_KEYS: readonly SettingKey[] = ['edition', 'install_code'];

/**
 * 可以由組織單位覆寫的 key（issue #81）。其餘三個講的是「這一台安裝」本身：
 * 版本、安裝代碼、部門隔離是整間公司的事，寫在分部上會變成兩個互相矛盾的事實。
 *
 * 次序就是文件與 API 回應的次序。
 */
export const OVERRIDABLE_KEYS: readonly SettingKey[] = [
  'company_locale',
  'notification_channels',
  'overdue_grace_hours',
  'acceptance_rule',
];

export function isOverridableKey(key: SettingKey): boolean {
  return OVERRIDABLE_KEYS.includes(key);
}

export const COMPANY_LOCALES: readonly string[] = ['zh-HK', 'zh-CN'];
export const ACCEPTANCE_RULES: readonly string[] = ['owner', 'dept_head', 'on_submit'];
export const OVERDUE_GRACE_HOURS_MIN = 0;
export const OVERDUE_GRACE_HOURS_MAX = 720;

/** 安裝代碼：1 至 8 個大寫英數字（例如 HK、CN01）。 */
const INSTALL_CODE = /^[A-Z0-9]{1,8}$/;

export function isSettingKey(value: string): value is SettingKey {
  return (SETTING_KEYS as readonly string[]).includes(value);
}

export function isImmutableSetting(key: SettingKey): boolean {
  return IMMUTABLE_KEYS.includes(key);
}

export type SettingValidation =
  | { ok: true; value: unknown }
  | { ok: false; reason: string };

export type SettingContext = {
  /** 哪一個版本；notification_channels 的可選代碼由它決定。 */
  edition: EditionCode;
};

function reject(key: SettingKey, expected: string, value: unknown): SettingValidation {
  return {
    ok: false,
    reason: `${key} 的值不合法（${JSON.stringify(value)}）：${expected}`,
  };
}

/**
 * 驗一個值。合格時回傳原值 —— 不做悄悄轉換（`"24"` 不會變成 `24`），
 * 否則資料庫存的值與呼叫者寫的值就是兩回事。
 */
export function validateSettingValue(
  key: SettingKey,
  value: unknown,
  context: SettingContext = { edition: DEFAULT_EDITION },
): SettingValidation {
  switch (key) {
    case 'edition': {
      if (typeof value !== 'string' || !isEditionCode(value)) {
        return reject(key, '只可以是 intl 或 cn', value);
      }
      return { ok: true, value };
    }

    case 'install_code': {
      if (typeof value !== 'string' || !INSTALL_CODE.test(value)) {
        return reject(key, '只可以是 1 至 8 個大寫英文字母或數字（例如 HK、CN01）', value);
      }
      return { ok: true, value };
    }

    case 'company_locale': {
      if (typeof value !== 'string' || !COMPANY_LOCALES.includes(value)) {
        return reject(key, `只可以是 ${COMPANY_LOCALES.join(' 或 ')}`, value);
      }
      return { ok: true, value };
    }

    case 'acceptance_rule': {
      if (typeof value !== 'string' || !ACCEPTANCE_RULES.includes(value)) {
        return reject(key, `只可以是 ${ACCEPTANCE_RULES.join('、')}`, value);
      }
      return { ok: true, value };
    }

    case 'department_isolation': {
      if (typeof value !== 'boolean') {
        return reject(key, '只可以是 true 或 false', value);
      }
      return { ok: true, value };
    }

    case 'overdue_grace_hours': {
      if (
        typeof value !== 'number' ||
        !Number.isInteger(value) ||
        value < OVERDUE_GRACE_HOURS_MIN ||
        value > OVERDUE_GRACE_HOURS_MAX
      ) {
        return reject(
          key,
          `只可以是 ${OVERDUE_GRACE_HOURS_MIN} 至 ${OVERDUE_GRACE_HOURS_MAX} 的整數`,
          value,
        );
      }
      return { ok: true, value };
    }

    case 'notification_channels': {
      if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
        return reject(key, '只可以是渠道代碼的字串陣列', value);
      }

      // 渠道目錄的唯一來源是 edition-profile；這裡只是拿它來對。
      const allowed: readonly string[] = editionProfile(context.edition).channels;
      const unknown = value.filter((item) => !allowed.includes(item));

      if (unknown.length > 0) {
        return reject(
          key,
          `${unknown.map((item) => JSON.stringify(item)).join('、')} 不在 ${context.edition} 版的渠道目錄之內（可用：${allowed.join('、')}）`,
          value,
        );
      }

      return { ok: true, value };
    }

    default: {
      // 型別上到不了這裡；真的到了就是有人加了 key 卻忘記加驗證。
      const exhaustive: never = key;
      throw new Error(`設定 key ${String(exhaustive)} 沒有驗證規則`);
    }
  }
}

/** 給錯誤訊息與文件用的一句話說明。 */
export const SETTING_DESCRIPTIONS: Record<SettingKey, string> = {
  edition: '版本（intl 或 cn），安裝時決定',
  install_code: '安裝代碼（1 至 8 個大寫英數字），安裝時決定',
  company_locale: '公司語系（zh-HK 或 zh-CN）',
  acceptance_rule: '驗收規則（owner、dept_head、on_submit）',
  department_isolation: '部門隔離（true／false）',
  overdue_grace_hours: `逾期寬限小時（${OVERDUE_GRACE_HOURS_MIN} 至 ${OVERDUE_GRACE_HOURS_MAX}）`,
  notification_channels: '通知渠道代碼陣列，必須在該版本 edition-profile 之內',
};
