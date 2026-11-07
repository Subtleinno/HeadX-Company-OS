import { t, type MessageKey } from '@company-os/i18n';

/**
 * 設定項的顯示名稱、可選值與「值怎樣講成人話」。
 *
 * 公司設定頁（issue 119）與單位覆寫（issue 120）都要顯示同一個 key、同一組可選值。
 * 兩邊各寫一份就一定會漂移 —— 例如公司頁寫「繁體中文（香港）」、單位頁寫 `zh-HK`。
 * 所以這裡是唯一來源；兩個畫面都只是呼叫它。
 *
 * 這裡**不**做驗證：驗證在後端 `settings/schema.ts`，前端照抄一份就會有兩套規則。
 */

export const SETTING_LABEL_KEY: Record<string, MessageKey> = {
  edition: 'admin.field.edition',
  install_code: 'admin.field.install_code',
  company_locale: 'admin.field.company_locale',
  acceptance_rule: 'admin.field.acceptance_rule',
  department_isolation: 'admin.field.department_isolation',
  overdue_grace_hours: 'admin.field.overdue_grace_hours',
  notification_channels: 'admin.field.notification_channels',
};

export const SETTING_CHOICES: Record<string, readonly { value: string; labelKey: MessageKey }[]> = {
  edition: [
    { value: 'intl', labelKey: 'admin.choice.edition.intl' },
    { value: 'cn', labelKey: 'admin.choice.edition.cn' },
  ],
  company_locale: [
    { value: 'zh-HK', labelKey: 'admin.choice.locale.zhHK' },
    { value: 'zh-CN', labelKey: 'admin.choice.locale.zhCN' },
  ],
  acceptance_rule: [
    { value: 'owner', labelKey: 'admin.choice.acceptance.owner' },
    { value: 'dept_head', labelKey: 'admin.choice.acceptance.deptHead' },
    { value: 'on_submit', labelKey: 'admin.choice.acceptance.onSubmit' },
  ],
};

/** key 的中文名稱；不是已知 key 就照原樣顯示 key，不要假裝認得它。 */
export function settingLabel(key: string): string {
  const labelKey = SETTING_LABEL_KEY[key];

  return labelKey === undefined ? key : t(labelKey);
}

/**
 * 把一個值講成畫面用的一句話。
 * `null`／空字串／空陣列都講「未設定」—— 那是三種寫法，同一個事實。
 */
export function settingValueLabel(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return t('admin.value.unset');
  }

  if (typeof value === 'boolean') {
    return value ? t('admin.value.yes') : t('admin.value.no');
  }

  if (Array.isArray(value)) {
    return value.length === 0 ? t('admin.value.unset') : value.map(String).join('、');
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  const choices = SETTING_CHOICES[key];
  const matched = choices?.find((choice) => choice.value === String(value));

  return matched === undefined ? String(value) : t(matched.labelKey);
}
