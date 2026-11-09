// @vitest-environment jsdom
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import './helpers/rtl';
import { App } from '../src/App';
import {
  installFakeApi,
  jsonResponse,
  resetBrowserState,
  type FakeHandlers,
} from './helpers/fake-api';

/**
 * F-03（issue #160）：App selector 與「我的 Apps」接回真資料。
 *
 * 呢份測試只由公開畫面（`<App />`）同假 API 出發，唔 import 任何新模組，
 * 所以「先紅」階段真係跑到斷言先紅，唔係編譯錯誤。守住嘅界線：
 *
 *   1. 兩個畫面共用**同一次** `GET /modules`，selector 唔可以自己再讀。
 *   2. selector 列出後端俾嘅 app，名稱用 `title`；全部未啟用、不可選、
 *      並寫明「未有前端入口」嘅原因，唔做一個按落不知去邊嘅鍵。
 *   3. 只呈現既有 `kind`，唔顯示「公司型・敏感」複合標籤（sensitive 未對齊項）。
 *   4. 失敗、401、403（改密碼／其他）、空清單、查不到，全部如實講。
 *   5. 唔硬編 app id 或標題、唔用 localStorage 記住選擇。
 */

const OWNER = { id: 'u1', email: 'boss@example.com', displayName: '陳老闆', role: 'owner' };
const STAFF = { id: 's1', email: 'staff@example.com', displayName: '林慧', role: 'staff' };

/** manifest 六個 app，只作測試夾具；正式 app 清單唯一來源係 GET /modules。 */
const SIX = [
  { id: 'boss', title: '老闆台', kind: 'console', department: null, order: 0, available: false },
  { id: 'design', title: '設計／內容／網站', kind: 'department', department: 'design', order: 10, available: false },
  { id: 'sales', title: '銷售', kind: 'department', department: 'sales', order: 20, available: false },
  { id: 'ops_finance', title: '營運與財務', kind: 'department', department: 'ops_finance', order: 30, available: false },
  { id: 'hr', title: '人事', kind: 'department', department: 'hr', order: 40, available: false },
  { id: 'support', title: '客服與 CRM', kind: 'department', department: 'support', order: 50, available: false },
];

function openHome(handlers: FakeHandlers = {}, user: typeof OWNER | typeof STAFF = OWNER) {
  window.history.replaceState(null, '', '/#/');

  const api = installFakeApi({
    state: () => jsonResponse(200, { setupRequired: false, signedIn: true, user }),
    settings: () => jsonResponse(200, { settings: [] }),
    me: () => jsonResponse(200, { user }),
    modules: () => jsonResponse(200, { modules: SIX }),
    appAccess: () => jsonResponse(200, { allowed: false, reason: 'app_disabled' }),
    ...handlers,
  });

  render(<App />);

  return api;
}

function card(id: string): HTMLElement {
  return document.querySelector(`[data-app-id="${id}"]`) as HTMLElement;
}

async function waitForCard(id: string): Promise<void> {
  await waitFor(() => {
    expect(document.querySelector(`[data-app-id="${id}"]`)).not.toBeNull();
  });
}

async function openSelector(): Promise<void> {
  await userEvent.setup().click(screen.getByRole('button', { name: '選擇 App' }));
}

afterEach(() => {
  cleanup();
  resetBrowserState();
});

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const webSrc = resolve(repoRoot, 'apps/web/src');

function listFiles(directory: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...listFiles(full));
    } else {
      files.push(full);
    }
  }

  return files;
}

describe('App selector 與我的 Apps：共用同一次讀取', () => {
  it('共用包裝元件 frame/FrameApps.tsx 存在（先紅）', () => {
    expect(existsSync(resolve(webSrc, 'frame/FrameApps.tsx'))).toBe(true);
  });

  it('/modules 整頁只讀一次，selector 與我的 Apps 共用同一份結果', async () => {
    const api = openHome();

    await waitForCard('boss');

    expect(api.count('modules')).toBe(1);

    await openSelector();

    // 展開 selector 唔可以再觸發第二次 /modules。
    expect(api.count('modules')).toBe(1);
    expect(screen.getAllByRole('option')).toHaveLength(6);
  });

  it('老闆見六個 app 全部未啟用、不可選、有狀態標籤與原因', async () => {
    openHome();

    await waitForCard('boss');
    await openSelector();

    const options = screen.getAllByRole('option');

    expect(options).toHaveLength(6);

    for (const option of options) {
      expect(option.getAttribute('aria-disabled')).toBe('true');
      expect(option.textContent).toContain('未啟用');
      expect(option.textContent).toContain('未有前端入口');
    }

    // 名稱用後端 title（manifest 唯一來源），唔係 id、唔係示意值。
    expect(options.map((option) => option.textContent).join(' ')).toContain('老闆台');
    expect(options.map((option) => option.textContent).join(' ')).toContain('客服與 CRM');
  });

  it('selector 名稱用後端 title，不硬編標題', async () => {
    const renamed = SIX.map((module) => ({ ...module, title: `自訂-${module.title}` }));

    openHome({ modules: () => jsonResponse(200, { modules: renamed }) });

    await waitForCard('boss');
    await openSelector();

    const labels = screen.getAllByRole('option').map((option) => option.textContent).join(' ');

    expect(labels).toContain('自訂-老闆台');
    expect(labels).toContain('自訂-設計／內容／網站');
  });

  it('只呈現既有 kind，不顯示「公司型」「敏感」複合標籤（sensitive 未對齊）', async () => {
    openHome();

    await waitForCard('boss');

    expect(document.body.textContent).not.toContain('公司型');
    expect(document.body.textContent).not.toContain('敏感');
    expect(card('boss').textContent).toContain('管理台');
    expect(card('design').textContent).toContain('部門');
  });

  it('載入中如實講', async () => {
    openHome({ modules: () => new Promise(() => undefined) });

    await screen.findByRole('heading', { name: '今日' });

    expect(document.querySelector('[data-myapps-state="loading"]')).not.toBeNull();
  });

  it('空清單如實顯示，不補齊其他 app', async () => {
    openHome({ modules: () => jsonResponse(200, { modules: [] }) });

    await waitFor(() => {
      expect(document.body.textContent).toContain('現在沒有任何 app 可以顯示');
    });

    await openSelector();

    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });

  it('員工只見後端給他嘅 app，無部門就係空清單', async () => {
    openHome({ modules: () => jsonResponse(200, { modules: [] }) }, STAFF);

    await waitFor(() => {
      expect(document.body.textContent).toContain('現在沒有任何 app 可以顯示');
    });

    expect(document.querySelectorAll('[data-app-id]')).toHaveLength(0);
  });

  it('401 講登入失效，唔偽裝成空清單', async () => {
    openHome({ modules: () => jsonResponse(401, { error: 'not_signed_in' }) });

    await waitFor(() => {
      expect(document.body.textContent).toContain('登入已經失效');
    });

    expect(document.body.textContent).not.toContain('現在沒有任何 app 可以顯示');
  });

  it('403 password_change_required 導向個人帳戶，不當成沒有權限', async () => {
    openHome({ modules: () => jsonResponse(403, { error: 'password_change_required' }) });

    await waitFor(() => {
      expect(document.querySelector('[data-myapps-state="password-change-required"]')).not.toBeNull();
    });

    const link = document.querySelector('[data-myapps-account-link]') as HTMLAnchorElement | null;

    expect(link?.getAttribute('href')).toBe('#/account');
    expect(document.body.textContent).not.toContain('你沒有查看 app 清單的權限');
  });

  it('其他 403 維持「沒有權限」，唔會顯示改密碼入口', async () => {
    openHome({ modules: () => jsonResponse(403, { error: 'forbidden' }) });

    await waitFor(() => {
      expect(document.body.textContent).toContain('你沒有查看 app 清單的權限');
    });

    expect(document.querySelector('[data-myapps-account-link]')).toBeNull();
  });

  it('讀取失敗要有原因與重試，不偽裝成空清單', async () => {
    let attempts = 0;

    openHome({
      modules: () => {
        attempts += 1;

        return attempts === 1
          ? jsonResponse(503, { error: 'service_unavailable', message: '資料庫連不上' })
          : jsonResponse(200, { modules: [SIX[0]] });
      },
    });

    await waitFor(() => {
      expect(document.body.textContent).toContain('讀不到 app 清單');
    });

    expect(document.body.textContent).toContain('資料庫連不上');
    expect(document.body.textContent).not.toContain('現在沒有任何 app 可以顯示');

    await userEvent.setup().click(screen.getByRole('button', { name: '重試' }));

    await waitForCard('boss');
  });

  it('查不到存取判斷時顯示查不到，不當成允許（A 級負面測試）', async () => {
    openHome({
      modules: () => jsonResponse(200, { modules: [SIX[1]] }),
      appAccess: () => jsonResponse(500, { error: 'boom' }),
    });

    await waitForCard('design');

    const text = card('design').textContent ?? '';

    expect(text).toContain('查不到');
    expect(text).not.toContain('允許（憑');
    expect(text).not.toContain('不允許');
  });

  it('存取判斷允許、不允許加原因、查不到三者分開', async () => {
    openHome({
      appAccess: (request) => {
        if (request.path.includes('/design')) {
          return jsonResponse(200, { allowed: true, via: 'grant' });
        }

        if (request.path.includes('/sales')) {
          return jsonResponse(200, { allowed: false, reason: 'grant_missing' });
        }

        return jsonResponse(500, { error: 'boom' });
      },
    });

    await waitForCard('boss');

    expect(card('design').textContent).toContain('允許（憑授權）');
    expect(card('sales').textContent).toContain('不允許');
    expect(card('sales').textContent).toContain('grant_missing');
    expect(card('boss').textContent).toContain('查不到');
  });

  it('不用 localStorage／sessionStorage 記住選擇', async () => {
    openHome();

    await waitForCard('boss');
    await openSelector();

    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});

describe('靜態閘門：唔喺前端自建 app 清單', () => {
  it('apps/web/src 內不得出現 manifest app id 字面值', () => {
    const ids = ['boss', 'design', 'sales', 'ops_finance', 'hr', 'support'];
    const offenders: string[] = [];

    const sources = listFiles(webSrc).filter((file) =>
      ['.ts', '.tsx', '.css'].includes(extname(file)),
    );

    for (const file of sources) {
      const text = readFileSync(file, 'utf8');

      for (const id of ids) {
        if (new RegExp(`['"\`]${id}['"\`]`).test(text)) {
          offenders.push(`${relative(repoRoot, file)}:${id}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
