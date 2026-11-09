// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import './helpers/rtl';
import { App } from '../src/App';
import { installFakeApi, jsonResponse, resetBrowserState, type RecordedRequest } from './helpers/fake-api';

/**
 * 公司設定頁（issue #119）。
 *
 * 這些測試刻意用真實的 `App` 與真實路由，不直接渲染畫面元件：
 * 「管理區是不是真的到得了、網址對不對」也是驗收的一部分。
 */

const BOSS = { id: 'u1', email: 'boss@example.com', displayName: '陳老闆', role: 'owner' };

function setting(key: string, value: unknown) {
  return { key, value, updatedAt: '2026-11-07T02:00:00.000Z', updatedBy: null };
}

const SETTINGS = [
  setting('acceptance_rule', 'owner'),
  setting('company_locale', 'zh-HK'),
  setting('department_isolation', false),
  setting('edition', 'intl'),
  setting('install_code', 'HK'),
  setting('notification_channels', ['inapp']),
  setting('overdue_grace_hours', 24),
];

function stateHandler() {
  return () =>
    jsonResponse(200, {
      setupRequired: false,
      signedIn: true,
      user: BOSS,
    });
}

function openAdmin(handlers: Parameters<typeof installFakeApi>[0] = {}) {
  window.history.replaceState(null, '', '/#/admin/settings');

  const api = installFakeApi({
    state: stateHandler(),
    settings: () => jsonResponse(200, { settings: SETTINGS }),
    ...handlers,
  });

  render(<App />);

  return api;
}

/**
 * 標題在「載入中」也會出現，所以單靠標題 judge 不到資料已經到了。
 * 一律等到七列都在，才算真的讀完。
 */
async function waitForRows(): Promise<void> {
  await waitFor(() => {
    expect(document.querySelectorAll('[data-setting-key]').length).toBe(7);
  });
}

afterEach(() => {
  cleanup();
  resetBrowserState();
});

describe('讀取公司設定', () => {
  it('列出全部七個設定項，並顯示目前值', async () => {
    openAdmin();

    await screen.findByText('繁體中文（香港）');
    await waitForRows();

    const locale = document.querySelector('[data-setting-key="company_locale"]');
    expect(locale).not.toBeNull();
    expect(within(locale as HTMLElement).getByText('繁體中文（香港）')).toBeTruthy();

    const edition = document.querySelector('[data-setting-key="edition"]');
    expect(within(edition as HTMLElement).getByText('國際版（intl）')).toBeTruthy();

    const grace = document.querySelector('[data-setting-key="overdue_grace_hours"]');
    expect((within(grace as HTMLElement).getByRole('spinbutton') as HTMLInputElement).value).toBe('24');

    // 七個 key 全部都要在畫面上，一個都不可以靜靜消失。
    expect(document.querySelectorAll('[data-setting-key]').length).toBe(7);
  });

  it('頁面明示這是全公司設定，不是某一個品牌', async () => {
    openAdmin();

    await waitForRows();

    expect(screen.getByText('以下每一項都是整間公司的設定，不是某一個品牌。')).toBeTruthy();
    // 公司型外殼顯示固定範圍純文字「公司範圍」，不會出現一個假的品牌下拉。
    expect(screen.queryByRole('button', { name: '工作範圍' })).toBeNull();
    expect(screen.queryByRole('button', { name: '選擇品牌' })).toBeNull();
    expect(screen.getByText('公司範圍')).toBeTruthy();
  });

  it('安裝時決定的兩項唯讀，沒有儲存鍵，並講明原因', async () => {
    openAdmin();

    await waitForRows();

    for (const key of ['edition', 'install_code']) {
      const row = document.querySelector(`[data-setting-key="${key}"]`) as HTMLElement;

      expect(within(row).queryByRole('button', { name: '儲存' })).toBeNull();
      expect(within(row).getByText('安裝時決定，之後不可修改。')).toBeTruthy();
    }
  });

  it('讀取失敗顯示原因與重試，不會假裝成空清單；重試成功後顯示資料', async () => {
    let attempt = 0;

    openAdmin({
      settings: () => {
        attempt += 1;

        if (attempt === 1) {
          return jsonResponse(500, { error: 'boom' });
        }

        return jsonResponse(200, { settings: SETTINGS });
      },
    });

    expect(await screen.findByText('讀不到公司設定。')).toBeTruthy();
    expect(screen.queryByText(/伺服器沒有回傳任何設定項目/)).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: '重試' }));

    expect(await screen.findByRole('heading', { name: '公司設定', level: 1 })).toBeTruthy();
    expect(document.querySelectorAll('[data-setting-key]').length).toBe(7);
  });

  it('伺服器缺少某個已知設定時仍然列出，並講明未設定、不提供修改', async () => {
    openAdmin({
      settings: () =>
        jsonResponse(200, { settings: SETTINGS.filter((item) => item.key !== 'install_code') }),
    });

    await waitForRows();

    const row = document.querySelector('[data-setting-key="install_code"]') as HTMLElement;

    expect(within(row).getByText('未設定')).toBeTruthy();
    expect(within(row).getByText('伺服器沒有這一項（未設定），所以不提供修改。')).toBeTruthy();
    expect(within(row).queryByRole('button', { name: '儲存' })).toBeNull();
  });

  it('真的沒有資料時講真話，不是空白畫面', async () => {
    openAdmin({ settings: () => jsonResponse(200, { settings: [] }) });

    expect(
      await screen.findByText('伺服器沒有回傳任何設定項目。這是真的沒有資料，不是畫面出錯。'),
    ).toBeTruthy();
  });

  it('員工被後端拒絕時顯示無權限，不是空清單', async () => {
    openAdmin({ settings: () => jsonResponse(403, { error: 'forbidden' }) });

    expect(await screen.findByText('只有老闆可以看公司設定。')).toBeTruthy();
    expect(document.querySelectorAll('[data-setting-key]').length).toBe(0);
  });

  it('登入失效（401）時請人重新登入', async () => {
    openAdmin({ settings: () => jsonResponse(401, { error: 'unauthenticated' }) });

    expect(await screen.findByText('登入已經失效，請重新登入。')).toBeTruthy();
  });
});

describe('逐 key 保存', () => {
  it('未改動時儲存鍵停用，按下去也不會發請求', async () => {
    const api = openAdmin();

    await waitForRows();

    const row = document.querySelector('[data-setting-key="department_isolation"]') as HTMLElement;
    const save = within(row).getByRole('button', { name: '儲存' }) as HTMLButtonElement;

    expect(save.disabled).toBe(true);
    expect(within(row).getByText('與伺服器相同，不會提交。')).toBeTruthy();
    expect(api.count('settingSave')).toBe(0);
  });

  it('改一個值就只送那一個 key，並採用伺服器回傳的值', async () => {
    const api = openAdmin({
      settingSave: () =>
        jsonResponse(200, {
          setting: {
            ...setting('company_locale', 'zh-CN'),
            updatedAt: '2026-11-07T03:00:00.000Z',
            updatedBy: BOSS.id,
          },
        }),
    });

    await waitForRows();

    await userEvent.click(screen.getByRole('button', { name: '公司語系' }));
    await userEvent.click(screen.getByRole('option', { name: '简体中文（大陆）' }));

    const row = document.querySelector('[data-setting-key="company_locale"]') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: '儲存' }));

    await waitFor(() => {
      expect(api.count('settingSave')).toBe(1);
    });

    const save = api.calls.find((call) => call.method === 'PUT');
    expect(save?.path).toBe('/api/settings/company_locale');
    expect(save?.body).toBe(JSON.stringify({ value: 'zh-CN' }));

    await waitFor(() => {
      expect(within(row).getByText('已儲存')).toBeTruthy();
    });
    expect(within(row).getByText('简体中文（大陆）')).toBeTruthy();
  });

  it('保存中再按一次不會重送（防重送）', async () => {
    let release: (value: ReturnType<typeof jsonResponse>) => void = () => undefined;
    const pending = new Promise<ReturnType<typeof jsonResponse>>((resolve) => {
      release = resolve;
    });

    const api = openAdmin({
      settingSave: () => pending,
    });

    await waitForRows();

    const row = document.querySelector('[data-setting-key="department_isolation"]') as HTMLElement;
    await userEvent.click(within(row).getByRole('checkbox'));
    const save = within(row).getByRole('button', { name: '儲存' });

    await userEvent.click(save);
    await userEvent.click(save);

    await waitFor(() => {
      expect(within(row).getByRole('button', { name: '儲存中…' })).toBeTruthy();
    });
    expect(api.count('settingSave')).toBe(1);

    release(jsonResponse(200, { setting: setting('department_isolation', true) }));

    await waitFor(() => {
      expect(within(row).getByText('已儲存')).toBeTruthy();
    });
  });

  it('伺服器拒絕時保留輸入、顯示原文理由，並可以重試', async () => {
    let attempt = 0;

    openAdmin({
      settingSave: (request: RecordedRequest) => {
        attempt += 1;

        if (attempt === 1) {
          const value = JSON.parse(request.body ?? '{}').value;

          return jsonResponse(422, {
            error: 'invalid_setting',
            reasons: [`overdue_grace_hours 的值不合法（${JSON.stringify(value)}）：只可以是 0 至 720 的整數`],
          });
        }

        return jsonResponse(200, { setting: setting('overdue_grace_hours', 12) });
      },
    });

    await waitForRows();

    const row = document.querySelector('[data-setting-key="overdue_grace_hours"]') as HTMLElement;
    const input = within(row).getByRole('spinbutton') as HTMLInputElement;

    await userEvent.clear(input);
    await userEvent.type(input, '900');
    await userEvent.click(within(row).getByRole('button', { name: '儲存' }));

    await waitFor(() => {
      expect(within(row).getByText('儲存失敗')).toBeTruthy();
    });

    // 失敗後輸入仍然是 900，不被清空、不被改回舊值。
    expect((within(row).getByRole('spinbutton') as HTMLInputElement).value).toBe('900');
    expect(within(row).getByText(/只可以是 0 至 720 的整數/)).toBeTruthy();

    await userEvent.click(within(row).getByRole('button', { name: '重試' }));

    await waitFor(() => {
      expect(within(row).getByText('已儲存')).toBeTruthy();
    });
    expect((within(row).getByRole('spinbutton') as HTMLInputElement).value).toBe('12');
  });

  it('多項修改不會冒充一次原子保存：一項失敗，另一項仍然成功', async () => {
    openAdmin({
      settingSave: (request: RecordedRequest) => {
        if (request.path.endsWith('/department_isolation')) {
          return jsonResponse(422, { error: 'invalid_setting', reasons: ['部門隔離只可以是 true 或 false'] });
        }

        return jsonResponse(200, { setting: setting('company_locale', 'zh-CN') });
      },
    });

    await waitForRows();

    await userEvent.click(screen.getByRole('button', { name: '公司語系' }));
    await userEvent.click(screen.getByRole('option', { name: '简体中文（大陆）' }));

    const localeRow = document.querySelector('[data-setting-key="company_locale"]') as HTMLElement;
    const isolationRow = document.querySelector('[data-setting-key="department_isolation"]') as HTMLElement;

    await userEvent.click(within(localeRow).getByRole('button', { name: '儲存' }));
    await userEvent.click(within(isolationRow).getByRole('checkbox'));
    await userEvent.click(within(isolationRow).getByRole('button', { name: '儲存' }));

    await waitFor(() => {
      expect(within(localeRow).getByText('已儲存')).toBeTruthy();
    });
    await waitFor(() => {
      expect(within(isolationRow).getByText('儲存失敗')).toBeTruthy();
    });
  });
});

describe('未保存就離開', () => {
  it('有未儲存修改時登出要先問，選擇繼續編輯就留住畫面', async () => {
    const api = openAdmin();

    await waitForRows();

    const row = document.querySelector('[data-setting-key="department_isolation"]') as HTMLElement;
    await userEvent.click(within(row).getByRole('checkbox'));

    expect(within(row).getByRole('button', { name: '儲存' })).toHaveProperty('disabled', false);

    await userEvent.click(screen.getByRole('button', { name: '登出' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('有未儲存的修改')).toBeTruthy();
    // 未儲存數是插值字串，要在畫面上真的填得進去（不是留一個 {count}）。
    expect(within(dialog).getByText('未儲存：1 項')).toBeTruthy();

    await userEvent.click(within(dialog).getByRole('button', { name: '繼續編輯' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.count('logout')).toBe(0);
    expect((within(row).getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
  });

  it('選擇放棄修改才會真的離開', async () => {
    const api = openAdmin({ logout: () => jsonResponse(200, { ok: true }) });

    await waitForRows();

    const row = document.querySelector('[data-setting-key="department_isolation"]') as HTMLElement;
    await userEvent.click(within(row).getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: '登出' }));

    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: '放棄修改' }));

    await waitFor(() => {
      expect(api.count('logout')).toBe(1);
    });
  });

  it('沒有改動時登出不會多問一句', async () => {
    const api = openAdmin({ logout: () => jsonResponse(200, { ok: true }) });

    await waitForRows();

    await userEvent.click(screen.getByRole('button', { name: '登出' }));

    await waitFor(() => {
      expect(api.count('logout')).toBe(1);
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
