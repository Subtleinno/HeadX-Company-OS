import { describe, expect, it } from 'vitest';
import {
  SETTING_KEYS,
  isImmutableSetting,
  isSettingKey,
  validateSettingValue,
} from '../../src/settings/schema';

/**
 * 設定項的型別與範圍（issue #80）。
 *
 * 為甚麼每一個 key 都要有合法與不合法兩組：設定是「寫進資料庫就長期生效」的東西，
 * 寫錯不會在 request 當下爆，而是幾天後在某個流程用一個奇怪的值做決定。
 * 所以驗證要在寫入之前，而且錯誤訊息要講得出是哪一個 key、為甚麼不行。
 *
 * notification_channels 額外要對版本：大陸版的 edition-profile 只有 inapp、wecom、feishu，
 * 寫 whatsapp 進去等於承諾一個根本不會送出的渠道。
 */

const intl = { edition: 'intl' as const };
const cn = { edition: 'cn' as const };

function accepts(key: Parameters<typeof validateSettingValue>[0], value: unknown, options = intl) {
  return validateSettingValue(key, value, options);
}

describe('設定 key 清單', () => {
  it('七個 key，次序固定', () => {
    expect([...SETTING_KEYS]).toEqual([
      'edition',
      'install_code',
      'company_locale',
      'acceptance_rule',
      'department_isolation',
      'overdue_grace_hours',
      'notification_channels',
    ]);
  });

  it('只有 edition 與 install_code 不可經 API 修改', () => {
    const immutable = SETTING_KEYS.filter((key) => isImmutableSetting(key));

    expect(immutable).toEqual(['edition', 'install_code']);
  });

  it('不認識的 key 不算設定 key', () => {
    expect(isSettingKey('edition')).toBe(true);
    expect(isSettingKey('payment_threshold')).toBe(false);
    expect(isSettingKey('')).toBe(false);
  });
});

describe('edition 與 install_code：安裝時決定，不可改', () => {
  it('edition 只收 intl 與 cn', () => {
    expect(accepts('edition', 'intl').ok).toBe(true);
    expect(accepts('edition', 'cn').ok).toBe(true);

    for (const bad of ['INTL', 'hk', '', null, 1, ['intl']]) {
      expect(accepts('edition', bad).ok, JSON.stringify(bad)).toBe(false);
    }
  });

  it('install_code 是 1 至 8 個大寫英數字', () => {
    for (const good of ['A', 'HK', 'CN01', 'ABCD1234']) {
      expect(accepts('install_code', good).ok, good).toBe(true);
    }

    for (const bad of ['', 'hk', 'HK-01', 'ABCD12345', 'HK 01', null, 123]) {
      expect(accepts('install_code', bad).ok, JSON.stringify(bad)).toBe(false);
    }
  });
});

describe('可修改的五個 key', () => {
  it('company_locale 只收 zh-HK 與 zh-CN', () => {
    expect(accepts('company_locale', 'zh-HK').ok).toBe(true);
    expect(accepts('company_locale', 'zh-CN').ok).toBe(true);

    for (const bad of ['zh-TW', 'en', 'ZH-HK', '']) {
      expect(accepts('company_locale', bad).ok, bad).toBe(false);
    }
  });

  it('acceptance_rule 只收 owner、dept_head、on_submit', () => {
    for (const good of ['owner', 'dept_head', 'on_submit']) {
      expect(accepts('acceptance_rule', good).ok, good).toBe(true);
    }

    for (const bad of ['all', 'OWNER', 'owner ', '']) {
      expect(accepts('acceptance_rule', bad).ok, bad).toBe(false);
    }
  });

  it('department_isolation 只收 true 與 false，不收字串', () => {
    expect(accepts('department_isolation', true).ok).toBe(true);
    expect(accepts('department_isolation', false).ok).toBe(true);

    for (const bad of ['true', 1, 0, null]) {
      expect(accepts('department_isolation', bad).ok, JSON.stringify(bad)).toBe(false);
    }
  });

  it('overdue_grace_hours 是 0 至 720 的整數', () => {
    for (const good of [0, 1, 24, 720]) {
      expect(accepts('overdue_grace_hours', good).ok, String(good)).toBe(true);
    }

    for (const bad of [-1, 721, 1.5, '5', null, 10 ** 6]) {
      expect(accepts('overdue_grace_hours', bad).ok, JSON.stringify(bad)).toBe(false);
    }
  });

  it('notification_channels 是字串陣列，空陣列也可以', () => {
    expect(accepts('notification_channels', ['inapp']).ok).toBe(true);
    expect(accepts('notification_channels', ['inapp', 'email', 'slack']).ok).toBe(true);
    expect(accepts('notification_channels', []).ok).toBe(true);

    for (const bad of ['inapp', ['inapp', 1], [''], null, {}]) {
      expect(accepts('notification_channels', bad).ok, JSON.stringify(bad)).toBe(false);
    }
  });

  it('notification_channels 必須在該版本的 edition-profile 之內', () => {
    // 國際版有 whatsapp，大陸版沒有 —— 同一個值在兩個版本一個通過一個被拒。
    expect(accepts('notification_channels', ['inapp', 'whatsapp'], intl).ok).toBe(true);

    const rejected = accepts('notification_channels', ['inapp', 'whatsapp'], cn);
    expect(rejected.ok).toBe(false);
    expect(rejected.ok === false ? rejected.reason : '').toContain('whatsapp');
  });

  it('大陸版只准 inapp、wecom、feishu 三個代碼', () => {
    for (const allowed of ['inapp', 'wecom', 'feishu']) {
      expect(accepts('notification_channels', [allowed], cn).ok, allowed).toBe(true);
    }

    for (const notAllowed of ['email', 'slack', 'telegram', 'webhook']) {
      expect(accepts('notification_channels', [notAllowed], cn).ok, notAllowed).toBe(false);
    }
  });
});

describe('回傳值可以直接寫進資料庫', () => {
  it('合格時 value 就是原值（不偷偷轉換）', () => {
    const result = accepts('overdue_grace_hours', 24);

    expect(result.ok).toBe(true);
    expect(result.ok === true ? result.value : null).toBe(24);
  });

  it('不合格時說明原因，訊息帶 key 名', () => {
    const result = accepts('acceptance_rule', 'everyone');

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.reason).toContain('acceptance_rule');
      expect(result.reason.length).toBeGreaterThan(10);
    }
  });
});
