// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import './helpers/rtl';
import { App } from '../src/App';
import {
  installFakeApi,
  jsonResponse,
  resetBrowserState,
  type FakeApi,
  type FakeHandlers,
  type RecordedRequest,
} from './helpers/fake-api';

/**
 * 底座既有功能接駁驗收（issue 165／F-04）。
 *
 * 本張只新增回歸測試，唔改任何產品程式、既有測試、packages 或 platform。
 * 目的唔係重做外殼搬遷，而係證明身份、公司設定、組織、員工／Agent、
 * App 授權五組既有功能喺新 Frame 外殼下仍然真正可用，並釘住幾條最容易
 * 喺重構時失效嘅狀態規則：批准唔等於生效、版本衝突唔自動重送、
 * 逐 key 保存唔冒充整頁原子保存、Agent 唔取得 app_admin、
 * 一般組織單位唔冒充品牌身份、前端唔存第二份業務真相。
 *
 * 一律用真 App 同真 hash 路由，配合隔離嘅 fake API（拋棄式資料），
 * 唔連正式後端、唔用正式帳戶、唔用正式資料做操作測試。
 * 所有負面情境（未登入 401、無權限 403、讀取失敗、網絡失敗）都如實
 * 顯示原因，唔摺成空清單，亦唔改寫成成功。
 *
 * light-only 降級：只驗證淺色外殼現況，深色相關走查、偏好持久化、
 * 切換鍵一律 DEFERRED (dark UI)，唔喺本檔寫 PASS／FAIL。
 */

type User = {
  id: string;
  email: string;
  displayName: string;
  role: 'owner' | 'staff';
  mustChangePassword?: boolean;
};

const BOSS: User = {
  id: 'u-boss',
  email: 'boss@example.com',
  displayName: '陳老闆',
  role: 'owner',
  mustChangePassword: false,
};
const WAI: User = {
  id: 'u-wai',
  email: 'wai@example.com',
  displayName: '林慧',
  role: 'staff',
  mustChangePassword: false,
};

/** 有效性證明用：暫時改壞呢個值，對應「喺新 Frame 外殼下」嘅斷言會變紅。 */
const ACCEPTANCE_FRAME_THEME = 'light';

// ── 公司設定嘅拋棄式資料 ────────────────────────────────────────────────
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

// ── 組織嘅拋棄式資料 ────────────────────────────────────────────────────
type Unit = {
  id: string;
  name: string;
  type: string;
  isRoot: boolean;
  country: string | null;
  currency: string | null;
  timezone: string | null;
  createdAt: string;
  updatedAt: string;
};

function unit(over: Partial<Unit> & { id: string; name: string; type: string }): Unit {
  return {
    isRoot: false,
    country: 'HK',
    currency: 'HKD',
    timezone: 'Asia/Hong_Kong',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...over,
  };
}

const ORG_ROOT = unit({ id: 'root', name: '滿月堂集團', type: 'company', isRoot: true });
const ORG_MOONIC = unit({ id: 'moonic', name: 'Moonic 滿月堂', type: 'clinic' });
/** type 字面就係 brand，但一般組織單位唔可以因此被當成已接合品牌身份。 */
const ORG_BRANDISH = unit({ id: 'brandish', name: '未定身份單位', type: 'brand' });

const GRAPH = {
  units: [ORG_ROOT, ORG_MOONIC, ORG_BRANDISH],
  edges: [
    { parentId: 'root', childId: 'moonic', position: 0 },
    { parentId: 'root', childId: 'brandish', position: 1 },
  ],
};

function unitSettingsFor(unitId: string) {
  return {
    unitId,
    settings: [
      { key: 'acceptance_rule', value: 'owner', source: { kind: 'company' } },
      { key: 'department_isolation', value: false, source: { kind: 'unit', unitId: 'root' } },
      { key: 'overdue_grace_hours', value: 24, source: { kind: 'unit', unitId: 'root' } },
      { key: 'notification_channels', value: ['inapp'], source: { kind: 'unit', unitId } },
    ],
    overrides: [setting('notification_channels', ['inapp'])],
  };
}

// ── 員工／Agent 嘅拋棄式資料 ─────────────────────────────────────────────
const STAFF_ROW = {
  id: 's-wai',
  email: 'wai@example.com',
  displayName: '林慧',
  role: 'staff',
  mustChangePassword: true,
  disabledAt: null,
  createdAt: '2026-11-01T02:00:00.000Z',
};

const AGENT = {
  id: 'a-assist',
  name: '內容助手',
  createdAt: '2026-11-02T03:00:00.000Z',
  disabledAt: null,
};

// ── App 授權嘅拋棄式資料 ────────────────────────────────────────────────
type Grant = {
  id: string;
  userId: string | null;
  agentId: string | null;
  appId: string;
  role: string;
  scope: { kind: string; unitIds?: string[] };
  state: string;
  version: number;
  requestedBy: string;
  approvedBy: string | null;
  requestedAt: string;
  approvedAt: string | null;
  activatedAt: string | null;
  revokedAt: string | null;
  rejectionReason: string | null;
  replacesId: string | null;
};

function grant(over: Partial<Grant> & { id: string }): Grant {
  return {
    userId: WAI.id,
    agentId: null,
    appId: 'sales',
    role: 'member',
    scope: { kind: 'all' },
    state: 'active',
    version: 2,
    requestedBy: BOSS.id,
    approvedBy: BOSS.id,
    requestedAt: '2026-11-06T02:00:00.000Z',
    approvedAt: '2026-11-06T02:05:00.000Z',
    activatedAt: '2026-11-06T02:05:00.000Z',
    revokedAt: null,
    rejectionReason: null,
    replacesId: null,
    ...over,
  };
}

function grantPage(grants: Grant[], total = grants.length) {
  return jsonResponse(200, { grants, page: { limit: 20, offset: 0, total } });
}

/** 六個 manifest app 全部維持 available:false，唔用假資料冒充 active 流程。 */
const MODULES_SIX = [
  { id: 'boss', title: '老闆台', kind: 'console', department: null, order: 1, available: false },
  { id: 'design', title: '設計／內容／網站', kind: 'department', department: 'design', order: 2, available: false },
  { id: 'sales', title: '銷售', kind: 'department', department: 'sales', order: 3, available: false },
  { id: 'ops_finance', title: '營運財務', kind: 'department', department: 'ops_finance', order: 4, available: false },
  { id: 'hr', title: '人事', kind: 'department', department: 'hr', order: 5, available: false },
  { id: 'support', title: '客服', kind: 'department', department: 'support', order: 6, available: false },
];

// ── 共用嘅隔離 fake API ──────────────────────────────────────────────────
function baseHandlers(user: User = BOSS): FakeHandlers {
  return {
    state: () => jsonResponse(200, { setupRequired: false, signedIn: true, user }),
    me: () => jsonResponse(200, { user }),
    login: () => jsonResponse(200, { user }),
    logout: () => jsonResponse(204, null),
    changePassword: () =>
      jsonResponse(200, { user: { ...user, mustChangePassword: false } }),
    settings: () => jsonResponse(200, { settings: SETTINGS }),
    settingSave: () => jsonResponse(200, { setting: setting('company_locale', 'zh-CN') }),
    modules: () => jsonResponse(200, { modules: MODULES_SIX }),
    orgUnits: () => jsonResponse(200, GRAPH),
    orgUnitCreate: () =>
      jsonResponse(201, { unit: unit({ id: 'new', name: '新部門', type: 'dept' }), parents: [] }),
    orgUnitPatch: () => jsonResponse(200, { unit: ORG_MOONIC }),
    orgUnitDelete: () => jsonResponse(204, null),
    orgParentAdd: () => jsonResponse(200, { edge: { parentId: 'root', childId: 'moonic', position: 0 } }),
    orgParentRemove: () => jsonResponse(204, null),
    unitSettings: (request: RecordedRequest) => {
      const id = /\/org-units\/([^/]+)\/settings$/.exec(request.path)?.[1] ?? 'root';
      return jsonResponse(200, unitSettingsFor(id));
    },
    unitSettingSave: () => jsonResponse(200, { setting: setting('department_isolation', true) }),
    unitSettingRemove: () => jsonResponse(204, null),
    staff: () => jsonResponse(200, { staff: [STAFF_ROW], total: 1 }),
    staffCreate: () => jsonResponse(201, { staff: { ...STAFF_ROW, id: 's-new', displayName: '新同事' } }),
    staffDisable: () => jsonResponse(200, { staff: { ...STAFF_ROW, disabledAt: '2026-11-07T05:00:00.000Z' } }),
    staffReset: () => jsonResponse(200, { staff: { ...STAFF_ROW, mustChangePassword: true } }),
    agents: () => jsonResponse(200, { agents: [AGENT], total: 1 }),
    agentCreate: () => jsonResponse(201, { agent: { ...AGENT, id: 'a-new', name: '新助手' } }),
    agentDisable: () => jsonResponse(200, { agent: { ...AGENT, disabledAt: '2026-11-07T06:00:00.000Z' } }),
    agentGrants: () => jsonResponse(200, { grants: [grant({ id: 'ag1', agentId: 'a-assist' })], total: 1 }),
    agentGrantCreate: () => jsonResponse(201, { grant: grant({ id: 'ag2', agentId: 'a-assist', state: 'requested' }) }),
    agentGrantRevoke: () => jsonResponse(200, { grant: grant({ id: 'ag1', state: 'revoked' }) }),
    agentAccess: () => jsonResponse(200, { allowed: false, reason: 'grant_missing' }),
    appGrants: () => grantPage([]),
    appGrantCreate: () => jsonResponse(201, { grant: grant({ id: 'g-new', state: 'requested', version: 1 }), created: true }),
    appGrantApprove: () => jsonResponse(200, { grant: grant({ id: 'g1', state: 'active', version: 2 }), activated: true }),
    appGrantActivate: () => jsonResponse(200, { grant: grant({ id: 'g1', state: 'active', version: 2 }) }),
    appGrantReject: () => jsonResponse(200, { grant: grant({ id: 'g1', state: 'rejected' }) }),
    appGrantRevoke: () => jsonResponse(200, { grant: grant({ id: 'g1', state: 'revoked' }) }),
    appGrantPatch: () => jsonResponse(200, { grant: grant({ id: 'g2', state: 'active' }), replacedId: 'g1', requiresApproval: false }),
    appAccess: () => jsonResponse(200, { allowed: false, reason: 'app_not_enabled' }),
  };
}

function mount(hash: string, handlers: FakeHandlers = {}, user: User = BOSS): FakeApi {
  window.history.replaceState(null, '', hash);

  const api = installFakeApi({ ...baseHandlers(user), ...handlers });
  render(<App />);

  return api;
}

async function waitForFrame(): Promise<void> {
  await waitFor(() => {
    expect(document.querySelector('[data-frame-main]')).not.toBeNull();
  });
}

/** 五組共用：頁內內容一定要喺同一個 Frame 外殼入面，而且前端唔存副本。 */
function expectFrameShell(): void {
  const shell = document.querySelector('[data-frame-theme]');
  expect(shell).not.toBeNull();
  expect(shell?.getAttribute('data-frame-theme')).toBe(ACCEPTANCE_FRAME_THEME);
  expect(document.querySelector('[data-frame-main]')).not.toBeNull();
  // 一個事實一個來源：前端唔保存第二份業務真相。
  expect(window.localStorage.length).toBe(0);
  expect(window.sessionStorage.length).toBe(0);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 頁面內嘅下拉一律喺主要內容區定位，避開頂欄同名嘅 App selector。 */
async function pick(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  option: string | RegExp,
): Promise<void> {
  // 等外殼掛好先定位：負面情境（403／網絡失敗）啱啱 mount 時 main 可能仍未出現。
  await waitForFrame();
  const name = typeof option === 'string' ? new RegExp(`^${escapeRegExp(option)}`) : option;
  const main = document.querySelector('[data-frame-main]') as HTMLElement;

  await user.click(within(main).getByRole('button', { name: label }));
  await user.click(within(main).getByRole('option', { name }));
}

async function waitForSettingsRows(count = 7): Promise<void> {
  await waitFor(() => {
    expect(document.querySelectorAll('[data-setting-key]').length).toBe(count);
  });
}

async function waitForOrgTree(count = 3): Promise<void> {
  await waitFor(() => {
    expect(document.querySelectorAll('[data-org-unit]').length).toBe(count);
  });
}

async function waitForStaffRows(count = 1): Promise<void> {
  await waitFor(() => {
    expect(document.querySelectorAll('[data-staff-id]').length).toBe(count);
  });
}

async function waitForGrantRow(id: string): Promise<void> {
  await waitFor(() => {
    expect(document.querySelector(`[data-grant-id="${id}"]`)).not.toBeNull();
  });
}

function grantRow(id: string): HTMLElement {
  return document.querySelector(`[data-grant-id="${id}"]`) as HTMLElement;
}

afterEach(() => {
  cleanup();
  resetBrowserState();
  vi.restoreAllMocks();
});

// ── 0. 五組喺新 Frame 外殼下仍然可達 ─────────────────────────────────────
describe('新 Frame 外殼下五組既有功能仍然可達', () => {
  it('公司設定頁喺同一個 Frame 外殼內正常讀取七個設定項', async () => {
    mount('/#/admin/settings');

    await waitForSettingsRows();
    expectFrameShell();
    expect(await screen.findByText('繁體中文（香港）')).toBeTruthy();
    expect(document.querySelectorAll('[data-setting-key]').length).toBe(7);
  });

  it('組織頁喺同一個 Frame 外殼內正常讀取組織圖', async () => {
    mount('/#/admin/organisation');

    await waitForOrgTree();
    expectFrameShell();
    expect(window.location.hash).toBe('#/admin/organisation');
  });

  it('員工／Agent 頁喺同一個 Frame 外殼內正常讀取公司名冊', async () => {
    mount('/#/admin/staff');

    await waitForStaffRows();
    expectFrameShell();
    expect(screen.getByRole('heading', { name: '員工與 agent', level: 1 })).toBeTruthy();
  });

  it('App 授權頁喺同一個 Frame 外殼內正常到達', async () => {
    mount('/#/admin/grants');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'App 授權' })).toBeTruthy();
    });
    expectFrameShell();
    expect(document.querySelector('[data-view="subject"]')).not.toBeNull();
  });

  it('個人帳戶頁喺同一個 Frame 外殼內正常讀取個人資料', async () => {
    mount('/#/account');

    await waitFor(() => {
      expect(document.querySelector('[data-account-name]')?.textContent).toBe('陳老闆');
    });
    expectFrameShell();
    expect(screen.getByRole('heading', { name: '個人帳戶與安全' })).toBeTruthy();
  });

  it('五組深連結 hash 不會被外殼覆寫成首頁', async () => {
    const hashes = [
      '/#/admin/settings',
      '/#/admin/organisation',
      '/#/admin/staff',
      '/#/admin/grants',
      '/#/account',
    ];

    for (const hash of hashes) {
      mount(hash);
      await waitForFrame();
      expect(window.location.hash).toBe(hash.replace('/', ''));
      cleanup();
      resetBrowserState();
    }
  });
});

// ── 1. 身份 ──────────────────────────────────────────────────────────────
describe('身份：登入、首次強制改密碼、個人資料、改密碼、登出', () => {
  it('登入失敗 401 只講「電郵或密碼不正確」，唔區分邊一個、唔洩漏秘密', async () => {
    mount('/#/login', {
      state: () => jsonResponse(200, { setupRequired: false, signedIn: false }),
      login: () => jsonResponse(401, { error: 'invalid_credentials' }),
    });

    await screen.findByRole('heading', { name: '登入 Company OS' });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('電郵'), 'boss@example.com');
    await user.type(screen.getByLabelText('密碼'), 'wrong-password-1');
    await user.click(screen.getByRole('button', { name: '登入' }));

    expect(await screen.findByText('錯誤：電郵或密碼不正確。')).toBeTruthy();
    expect(screen.queryByText(/電郵不存在/)).toBeNull();
    expect(screen.queryByText(/密碼錯誤/)).toBeNull();
    expect(document.body.textContent).not.toContain('wrong-password-1');
  });

  it('登入節流 429 用 Retry-After 換算分鐘，如實顯示', async () => {
    mount('/#/login', {
      state: () => jsonResponse(200, { setupRequired: false, signedIn: false }),
      login: () => jsonResponse(429, { error: 'too_many_attempts' }, { 'retry-after': '600' }),
    });

    await screen.findByRole('heading', { name: '登入 Company OS' });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('電郵'), 'boss@example.com');
    await user.type(screen.getByLabelText('密碼'), 'correct-horse-9');
    await user.click(screen.getByRole('button', { name: '登入' }));

    expect(await screen.findByText('錯誤：嘗試次數過多，請在 10 分鐘後再試。')).toBeTruthy();
  });

  it('登入網絡失敗唔係空白畫面', async () => {
    mount('/#/login', {
      state: () => jsonResponse(200, { setupRequired: false, signedIn: false }),
      login: () => {
        throw new TypeError('Failed to fetch');
      },
    });

    await screen.findByRole('heading', { name: '登入 Company OS' });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('電郵'), 'boss@example.com');
    await user.type(screen.getByLabelText('密碼'), 'correct-horse-9');
    await user.click(screen.getByRole('button', { name: '登入' }));

    expect(await screen.findByText('錯誤：無法連線到伺服器，請稍後再試。')).toBeTruthy();
  });

  it('首次強制改密碼導向改密碼頁，唔讀 app 清單、唔當成無權限', async () => {
    const api = mount('/#/', {
      state: () =>
        jsonResponse(200, {
          setupRequired: false,
          signedIn: true,
          user: { ...WAI, mustChangePassword: true },
        }),
      me: () => jsonResponse(200, { user: { ...WAI, mustChangePassword: true } }),
    }, { ...WAI, mustChangePassword: true });

    expect(await screen.findByText('你要先改密碼，才可以用其他功能。')).toBeTruthy();
    expect(window.location.hash).toBe('#/account');
    expect(api.count('modules')).toBe(0);
  });

  it('個人資料以 GET /me 為唯一來源，唔跟外殼快照', async () => {
    mount('/#/account', {
      state: () =>
        jsonResponse(200, {
          setupRequired: false,
          signedIn: true,
          user: { ...WAI, displayName: '舊名' },
        }),
      me: () => jsonResponse(200, { user: { ...WAI, displayName: '新名' } }),
    }, WAI);

    await waitFor(() => {
      expect(document.querySelector('[data-account-name]')?.textContent).toBe('新名');
    });
    expect(document.body.textContent).not.toContain('舊名');
  });

  it('entry_untrusted 保留具體原因，唔摺成權限問題', async () => {
    mount('/#/account', {
      me: () => jsonResponse(403, { error: 'entry_untrusted' }),
    }, WAI);

    expect(
      await screen.findByText('這個請求不是經由可信的內部入口轉發過來，一律拒絕。'),
    ).toBeTruthy();
  });

  it('個人資料頁唔顯示密碼雜湊、session token 或未核實欄位', async () => {
    mount('/#/account', {
      me: () =>
        jsonResponse(200, {
          user: { ...WAI, password_hash: 'scrypt$1$abc', session_token: 'tok-123', department: 'design' },
        }),
    }, WAI);

    await waitFor(() => {
      expect(document.querySelector('[data-account-name]')?.textContent).toBe('林慧');
    });
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('scrypt');
    expect(text).not.toContain('tok-123');
    expect(text).not.toContain('password_hash');
    expect(text).not.toContain('design');
  });

  it('改密碼成功只送 currentPassword 與 newPassword 兩個欄位', async () => {
    const api = mount('/#/account', {}, WAI);

    await waitFor(() => {
      expect(document.querySelector('[data-account-name]')?.textContent).toBe('林慧');
    });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('現在的密碼'), 'old-password-1');
    await user.type(screen.getByLabelText('新密碼'), 'new-password-22');
    await user.click(screen.getByRole('button', { name: '改密碼' }));

    expect(await screen.findByText('密碼已改好，你現在用的是新密碼。')).toBeTruthy();
    const call = api.calls.find((entry) => entry.path.endsWith('/auth/change-password'));
    expect(JSON.parse(call?.body ?? '{}')).toEqual({
      currentPassword: 'old-password-1',
      newPassword: 'new-password-22',
    });
  });

  it('改密碼失敗（舊密碼錯 403）清空兩個欄位，唔講成 session 失效', async () => {
    mount('/#/account', {
      changePassword: () => jsonResponse(403, { error: 'invalid_current_password' }),
    }, WAI);

    await waitFor(() => {
      expect(document.querySelector('[data-account-name]')?.textContent).toBe('林慧');
    });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('現在的密碼'), 'wrong-password');
    await user.type(screen.getByLabelText('新密碼'), 'new-password-22');
    await user.click(screen.getByRole('button', { name: '改密碼' }));

    expect(await screen.findByText('現在的密碼不正確。')).toBeTruthy();
    expect(document.body.textContent).not.toContain('登入已經失效');
    expect((screen.getByLabelText('現在的密碼') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('新密碼') as HTMLInputElement).value).toBe('');
  });

  it('登出成功返到登入畫面，網址係 /#/login', async () => {
    mount('/#/');

    await screen.findByRole('heading', { name: '今日' });
    await userEvent.setup().click(screen.getByRole('button', { name: '登出' }));

    expect(await screen.findByRole('heading', { name: '登入 Company OS' })).toBeTruthy();
    expect(window.location.hash).toBe('#/login');
  });

  it('登出失敗留喺首頁並顯示錯誤，唔假裝已登出', async () => {
    mount('/#/', { logout: () => jsonResponse(500, { error: 'internal' }) });

    await screen.findByRole('heading', { name: '今日' });
    await userEvent.setup().click(screen.getByRole('button', { name: '登出' }));

    expect(await screen.findByText('錯誤：發生未預期的錯誤，請稍後再試。')).toBeTruthy();
    expect(screen.getByRole('heading', { name: '今日' })).toBeTruthy();
  });

  it('有未提交密碼輸入時回首頁要先問，取消就留住輸入（取消情境）', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    mount('/#/account', {}, WAI);

    await waitFor(() => {
      expect(document.querySelector('[data-account-name]')?.textContent).toBe('林慧');
    });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('現在的密碼'), 'old-password-1');
    await user.click(screen.getByRole('button', { name: '回首頁' }));

    expect(confirm).toHaveBeenCalledWith('你有未提交的密碼輸入，離開會清空。要繼續嗎？');
    expect((screen.getByLabelText('現在的密碼') as HTMLInputElement).value).toBe('old-password-1');
  });
});

// ── 2. 公司設定 ──────────────────────────────────────────────────────────
describe('公司設定：逐 key 保存、不可改項、非法值、保存失敗、未保存離開', () => {
  it('改一個值只送嗰一個 key，採用伺服器回傳值（正常情境）', async () => {
    const api = mount('/#/admin/settings');

    await waitForSettingsRows();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '公司語系' }));
    await user.click(screen.getByRole('option', { name: '简体中文（大陆）' }));
    const row = document.querySelector('[data-setting-key="company_locale"]') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: '儲存' }));

    await waitFor(() => {
      expect(api.count('settingSave')).toBe(1);
    });
    const call = api.calls.find((item) => item.method === 'PUT');
    expect(call?.path).toBe('/api/settings/company_locale');
    expect(call?.body).toBe(JSON.stringify({ value: 'zh-CN' }));
  });

  it('安裝時決定嘅兩項唯讀，冇儲存鍵並講明原因（唔好冒充可改）', async () => {
    mount('/#/admin/settings');

    await waitForSettingsRows();
    for (const key of ['edition', 'install_code']) {
      const row = document.querySelector(`[data-setting-key="${key}"]`) as HTMLElement;
      expect(within(row).queryByRole('button', { name: '儲存' })).toBeNull();
      expect(within(row).getByText('安裝時決定，之後不可修改。')).toBeTruthy();
    }
  });

  it('未改動時儲存鍵停用，唔發請求（取消情境）', async () => {
    const api = mount('/#/admin/settings');

    await waitForSettingsRows();
    const row = document.querySelector('[data-setting-key="department_isolation"]') as HTMLElement;
    const save = within(row).getByRole('button', { name: '儲存' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(api.count('settingSave')).toBe(0);
  });

  it('非法值 422 保留輸入、原樣顯示理由，並可以重試（失敗情境）', async () => {
    let attempt = 0;
    mount('/#/admin/settings', {
      settingSave: () => {
        attempt += 1;
        return attempt === 1
          ? jsonResponse(422, { error: 'invalid_setting', reasons: ['只可以是 0 至 720 的整數'] })
          : jsonResponse(200, { setting: setting('overdue_grace_hours', 12) });
      },
    });

    await waitForSettingsRows();
    const row = document.querySelector('[data-setting-key="overdue_grace_hours"]') as HTMLElement;
    const input = within(row).getByRole('spinbutton') as HTMLInputElement;
    const user = userEvent.setup();
    await user.clear(input);
    await user.type(input, '900');
    await user.click(within(row).getByRole('button', { name: '儲存' }));

    expect(await screen.findByText('儲存失敗')).toBeTruthy();
    expect((within(row).getByRole('spinbutton') as HTMLInputElement).value).toBe('900');
    expect(within(row).getByText(/只可以是 0 至 720 的整數/)).toBeTruthy();

    await user.click(within(row).getByRole('button', { name: '重試' }));
    await waitFor(() => {
      expect(within(row).getByText('已儲存')).toBeTruthy();
    });
  });

  it('多項修改唔冒充整頁原子保存：一項成功、一項失敗各自顯示', async () => {
    mount('/#/admin/settings', {
      settingSave: (request: RecordedRequest) =>
        request.path.endsWith('/department_isolation')
          ? jsonResponse(422, { error: 'invalid_setting', reasons: ['部門隔離只可以是 true 或 false'] })
          : jsonResponse(200, { setting: setting('company_locale', 'zh-CN') }),
    });

    await waitForSettingsRows();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '公司語系' }));
    await user.click(screen.getByRole('option', { name: '简体中文（大陆）' }));

    const localeRow = document.querySelector('[data-setting-key="company_locale"]') as HTMLElement;
    const isolationRow = document.querySelector('[data-setting-key="department_isolation"]') as HTMLElement;

    await user.click(within(localeRow).getByRole('button', { name: '儲存' }));
    await user.click(within(isolationRow).getByRole('checkbox'));
    await user.click(within(isolationRow).getByRole('button', { name: '儲存' }));

    await waitFor(() => {
      expect(within(localeRow).getByText('已儲存')).toBeTruthy();
    });
    await waitFor(() => {
      expect(within(isolationRow).getByText('儲存失敗')).toBeTruthy();
    });
  });

  it('有未保存修改時登出要攔低，繼續編輯就留住畫面', async () => {
    const api = mount('/#/admin/settings');

    await waitForSettingsRows();
    const row = document.querySelector('[data-setting-key="department_isolation"]') as HTMLElement;
    const user = userEvent.setup();
    await user.click(within(row).getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: '登出' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('有未儲存的修改')).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: '繼續編輯' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.count('logout')).toBe(0);
    expect((within(row).getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
  });

  it('無權限 403 顯示具體原因，唔係空清單', async () => {
    mount('/#/admin/settings', { settings: () => jsonResponse(403, { error: 'forbidden' }) });

    expect(await screen.findByText('只有老闆可以看公司設定。')).toBeTruthy();
    expect(document.querySelectorAll('[data-setting-key]').length).toBe(0);
  });

  it('未登入 401 請人重新登入，唔係空清單', async () => {
    mount('/#/admin/settings', { settings: () => jsonResponse(401, { error: 'unauthenticated' }) });

    expect(await screen.findByText('登入已經失效，請重新登入。')).toBeTruthy();
  });

  it('網絡失敗唔係空清單，顯示原因同重試', async () => {
    mount('/#/admin/settings', {
      settings: () => {
        throw new Error('offline');
      },
    });

    await waitFor(() => {
      expect(document.body.textContent).toContain('讀不到公司設定。');
    });
    expect(screen.queryByText(/伺服器沒有回傳任何設定項目/)).toBeNull();
    expect(screen.getByRole('button', { name: '重試' })).toBeTruthy();
  });
});

// ── 3. 組織 ──────────────────────────────────────────────────────────────
describe('組織：一般單位、上級關係、繼承與覆寫', () => {
  it('type 字面係 brand 嘅一般單位唔冒充已接合品牌身份', async () => {
    mount('/#/admin/organisation');

    await waitForOrgTree();
    const user = userEvent.setup();
    await user.click(document.querySelector('[data-org-unit="brandish"]') as HTMLElement);

    expect((document.querySelector('[data-org-unit="brandish"]') as HTMLElement).textContent).toContain('brand');
    expect(document.querySelector('[data-brand]')).toBeNull();
    expect(document.querySelector('[data-brand-id]')).toBeNull();
    const detail = document.querySelector('.org__detail') as HTMLElement;
    expect(within(detail).getByText('一般單位')).toBeTruthy();
    // 選中一般單位唔暗改全局工作範圍。
    const scope = document.querySelector('[data-frame-slot="scope"]') as HTMLElement;
    expect(scope.querySelector('[data-frame-scope="company"]')).not.toBeNull();
  });

  it('有效值同來源由後端算，畫面照顯示，唔出現 [object Object]', async () => {
    mount('/#/admin/organisation');

    await waitForOrgTree();
    const user = userEvent.setup();
    await user.click(document.querySelector('[data-org-unit="moonic"]') as HTMLElement);

    await waitFor(() => {
      expect(document.querySelectorAll('[data-unit-setting]').length).toBe(4);
    });
    const row = document.querySelector('[data-unit-setting="acceptance_rule"]') as HTMLElement;
    expect(within(row).getByText('來源：公司預設')).toBeTruthy();
    expect(within(row).getByText('繼承')).toBeTruthy();
    expect(document.querySelector('.admin-list')?.textContent).not.toContain('[object Object]');
  });

  it('恢復繼承係移除覆寫（DELETE），唔係抄上級值（PUT）', async () => {
    const api = mount('/#/admin/organisation');

    await waitForOrgTree();
    const user = userEvent.setup();
    await user.click(document.querySelector('[data-org-unit="moonic"]') as HTMLElement);
    await waitFor(() => {
      expect(document.querySelectorAll('[data-unit-setting]').length).toBe(4);
    });
    const row = document.querySelector('[data-unit-setting="notification_channels"]') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: '恢復繼承' }));

    await waitFor(() => {
      expect(api.count('unitSettingRemove')).toBe(1);
    });
    expect(api.count('unitSettingSave')).toBe(0);
    const call = api.calls.find((item) => item.method === 'DELETE');
    expect(call?.path).toBe('/api/org-units/moonic/settings/notification_channels');
  });

  it('新增單位送出明確上級（正常情境）', async () => {
    const api = mount('/#/admin/organisation');

    await waitForOrgTree();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '新增單位' }));
    await user.type(screen.getByLabelText('名稱'), '新部門');
    await user.type(screen.getByLabelText('類型（自由文字）'), 'dept');
    await user.click(screen.getByRole('checkbox', { name: '滿月堂集團' }));
    await user.click(screen.getByRole('button', { name: '建立' }));

    await waitFor(() => {
      expect(api.count('orgUnitCreate')).toBe(1);
    });
    const call = api.calls.find((item) => item.method === 'POST' && item.path === '/api/org-units');
    expect(JSON.parse(call?.body ?? '{}')).toMatchObject({
      name: '新部門',
      type: 'dept',
      parentIds: ['root'],
    });
  });

  it('成環 409 用後端原文理由，唔假裝成功（失敗情境）', async () => {
    mount('/#/admin/organisation', {
      orgParentAdd: () =>
        jsonResponse(409, { error: 'cycle', reason: '加這條邊會令組織圖成環：上級不可以是這個單位的下級' }),
    });

    await waitForOrgTree();
    const user = userEvent.setup();
    await user.click(document.querySelector('[data-org-unit="moonic"]') as HTMLElement);
    await user.click(screen.getByRole('button', { name: '選擇上級' }));
    await user.click(screen.getByRole('option', { name: '未定身份單位' }));
    await user.click(screen.getByRole('button', { name: '加上級' }));

    expect(await screen.findByText(/會令組織圖成環/)).toBeTruthy();
    expect(screen.queryByText('cycle')).toBeNull();
  });

  it('刪除對話框按 Escape 取消，唔發請求（取消情境）', async () => {
    const api = mount('/#/admin/organisation');

    await waitForOrgTree();
    const user = userEvent.setup();
    await user.click(document.querySelector('[data-org-unit="moonic"]') as HTMLElement);
    await user.click(screen.getByRole('button', { name: '刪除這個單位' }));
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(api.count('orgUnitDelete')).toBe(0);
  });

  it('無權限 403 同未登入 401 都唔係空組織', async () => {
    mount('/#/admin/organisation', { orgUnits: () => jsonResponse(403, { error: 'forbidden' }) });
    expect(await screen.findByText('只有老闆可以管理組織。')).toBeTruthy();
    expect(document.querySelectorAll('[data-org-unit]').length).toBe(0);

    cleanup();
    resetBrowserState();
    mount('/#/admin/organisation', { orgUnits: () => jsonResponse(401, { error: 'unauthenticated' }) });
    expect(await screen.findByText('登入已經失效，請重新登入。')).toBeTruthy();
  });

  it('網絡失敗唔係空清單，顯示原因同重試', async () => {
    mount('/#/admin/organisation', {
      orgUnits: () => {
        throw new Error('offline');
      },
    });

    await waitFor(() => {
      expect(document.body.textContent).toContain('讀不到組織資料。');
    });
    expect(screen.queryByText(/組織圖是空的/)).toBeNull();
    expect(screen.getByRole('button', { name: '重試' })).toBeTruthy();
  });
});

// ── 4. 員工／Agent ───────────────────────────────────────────────────────
describe('員工／Agent：建立、停用、密碼重設、Agent 授權與撤銷', () => {
  it('建立員工只送三個已核實欄位（正常情境）', async () => {
    const api = mount('/#/admin/staff');

    await waitForStaffRows();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '新增員工' }));
    expect(screen.queryByLabelText('角色')).toBeNull();
    expect(screen.queryByLabelText('部門')).toBeNull();
    await user.type(screen.getByLabelText('名稱'), '新同事');
    await user.type(screen.getByLabelText('電郵'), 'new@example.com');
    await user.type(screen.getByLabelText('初始密碼'), 'preview-only-2026');
    await user.click(screen.getByRole('button', { name: '建立' }));

    await waitFor(() => {
      expect(api.count('staffCreate')).toBe(1);
    });
    const call = api.calls.find((item) => item.method === 'POST' && item.path === '/api/staff');
    expect(JSON.parse(call?.body ?? '{}')).toEqual({
      displayName: '新同事',
      email: 'new@example.com',
      initialPassword: 'preview-only-2026',
    });
  });

  it('停用員工先確認，取消就唔發請求（取消情境）', async () => {
    const api = mount('/#/admin/staff');

    await waitForStaffRows();
    const row = document.querySelector('[data-staff-id="s-wai"]') as HTMLElement;
    const user = userEvent.setup();
    await user.click(within(row).getByRole('button', { name: '停用' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/全部 session 會即刻撤銷/)).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: '取消' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(api.count('staffDisable')).toBe(0);
  });

  it('重設密碼要求老闆重新驗證，兩個密碼欄遮罩，並講明唔寄信', async () => {
    mount('/#/admin/staff');

    await waitForStaffRows();
    const row = document.querySelector('[data-staff-id="s-wai"]') as HTMLElement;
    const user = userEvent.setup();
    await user.click(within(row).getByRole('button', { name: '重設密碼' }));
    const dialog = await screen.findByRole('dialog');
    expect((within(dialog).getByLabelText('你自己的密碼') as HTMLInputElement).type).toBe('password');
    expect((within(dialog).getByLabelText('新的臨時密碼') as HTMLInputElement).type).toBe('password');
    expect(within(dialog).getByText(/不會寄出任何郵件/)).toBeTruthy();
  });

  it('Agent 唔取得 app_admin，亦唔繼承人嘅權限（無角色選擇器）', async () => {
    mount('/#/admin/staff');

    const user = userEvent.setup();
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Agent' })).toBeTruthy();
    });
    await user.click(screen.getByRole('tab', { name: 'Agent' }));
    await waitFor(() => {
      expect(document.querySelectorAll('[data-agent-id]').length).toBe(1);
    });
    await user.click(
      within(document.querySelector('[data-agent-id="a-assist"]') as HTMLElement).getByRole('button', { name: '管理授權' }),
    );

    expect(screen.queryByLabelText('角色')).toBeNull();
    expect(screen.queryByText('app_admin')).toBeNull();
    expect(screen.getByText(/agent 只可以是 member/)).toBeTruthy();
  });

  it('Agent 授權固定 role=member 同明確範圍，唔自動變全公司', async () => {
    const api = mount('/#/admin/staff');

    const user = userEvent.setup();
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Agent' })).toBeTruthy();
    });
    await user.click(screen.getByRole('tab', { name: 'Agent' }));
    await waitFor(() => {
      expect(document.querySelectorAll('[data-agent-id]').length).toBe(1);
    });
    await user.click(
      within(document.querySelector('[data-agent-id="a-assist"]') as HTMLElement).getByRole('button', { name: '管理授權' }),
    );
    await waitFor(() => {
      expect(document.querySelectorAll('[data-grant-id]').length).toBe(1);
    });

    const submit = screen.getByRole('button', { name: '新增授權' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(screen.getByText(/要明寫範圍才可以提交/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'App' }));
    await user.click(screen.getByRole('option', { name: /老闆台/ }));
    await user.click(screen.getByRole('button', { name: '範圍' }));
    await user.click(screen.getByRole('option', { name: '全部' }));
    await user.click(screen.getByRole('button', { name: '新增授權' }));

    await waitFor(() => {
      expect(api.count('agentGrantCreate')).toBe(1);
    });
    const call = api.calls.find((item) => item.method === 'POST' && item.path === '/api/agents/a-assist/grants');
    expect(JSON.parse(call?.body ?? '{}')).toEqual({
      appId: 'boss',
      role: 'member',
      scope: { kind: 'all' },
    });
  });

  it('Agent 撤銷帶查詢返嚟嘅 version', async () => {
    const api = mount('/#/admin/staff');

    const user = userEvent.setup();
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Agent' })).toBeTruthy();
    });
    await user.click(screen.getByRole('tab', { name: 'Agent' }));
    await waitFor(() => {
      expect(document.querySelectorAll('[data-agent-id]').length).toBe(1);
    });
    await user.click(
      within(document.querySelector('[data-agent-id="a-assist"]') as HTMLElement).getByRole('button', { name: '管理授權' }),
    );
    await waitFor(() => {
      expect(document.querySelectorAll('[data-grant-id]').length).toBe(1);
    });
    await user.click(
      within(document.querySelector('[data-grant-id]') as HTMLElement).getByRole('button', { name: '撤銷' }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: '確認撤銷' }));

    await waitFor(() => {
      expect(api.count('agentGrantRevoke')).toBe(1);
    });
    const call = api.calls.find((item) => item.path.endsWith('/revoke'));
    expect(JSON.parse(call?.body ?? '{}')).toEqual({ version: 2 });
  });

  it('Agent 存取檢查保留 grant_missing 原因，唔冒充已授權', async () => {
    mount('/#/admin/staff');

    const user = userEvent.setup();
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Agent' })).toBeTruthy();
    });
    await user.click(screen.getByRole('tab', { name: 'Agent' }));
    await waitFor(() => {
      expect(document.querySelectorAll('[data-agent-id]').length).toBe(1);
    });
    await user.click(
      within(document.querySelector('[data-agent-id="a-assist"]') as HTMLElement).getByRole('button', { name: '管理授權' }),
    );
    await waitFor(() => {
      expect(document.querySelectorAll('[data-grant-id]').length).toBe(1);
    });
    await user.click(screen.getByRole('button', { name: '檢查存取用的 App' }));
    await user.click(screen.getByRole('option', { name: /老闆台/ }));
    await user.click(screen.getByRole('button', { name: '檢查存取' }));

    await waitFor(() => {
      expect(document.querySelector('[data-access-result]')).not.toBeNull();
    });
    expect(document.querySelector('[data-access-result]')?.textContent).toBe('不允許：grant_missing');
  });

  it('無權限 403 同未登入 401 都唔係空名單', async () => {
    mount('/#/admin/staff', { staff: () => jsonResponse(403, { error: 'forbidden' }) });
    expect(await screen.findByText('只有老闆可以管理員工與 agent。')).toBeTruthy();

    cleanup();
    resetBrowserState();
    mount('/#/admin/staff', { staff: () => jsonResponse(401, { error: 'not_signed_in' }) });
    expect(await screen.findByText('登入已經失效，請重新登入。')).toBeTruthy();
  });

  it('網絡失敗唔係空名單，顯示原因同重試', async () => {
    mount('/#/admin/staff', {
      staff: () => {
        throw new Error('offline');
      },
    });

    expect(await screen.findByText('讀不到員工名單。')).toBeTruthy();
    expect(screen.queryByText(/還沒有任何員工/)).toBeNull();
    expect(screen.getByRole('button', { name: '重試' })).toBeTruthy();
  });
});

// ── 5. App 授權 ──────────────────────────────────────────────────────────
describe('App 授權：申請、批准、生效、拒絕、撤銷、修改', () => {
  async function openSubject(handlers: FakeHandlers = {}): Promise<FakeApi> {
    const api = mount('/#/admin/grants', handlers);
    await screen.findByRole('button', { name: '選擇受益人' });
    await pick(userEvent.setup(), '選擇受益人', '陳老闆（你自己）');
    return api;
  }

  it('申請只送 userId、appId、role、scope 四個欄位（正常情境）', async () => {
    const api = mount('/#/admin/grants');

    await waitFor(() => {
      expect(document.querySelector('[data-create-open]')).not.toBeNull();
    });
    const user = userEvent.setup();
    await user.click(document.querySelector('[data-create-open]') as HTMLElement);
    await pick(user, '授權給誰', '林慧');
    await pick(user, '授權的 App', '銷售');
    await pick(user, '授權角色', /^member/);
    await user.click(document.querySelector('[data-scope-kind="all"]') as HTMLElement);
    await user.click(document.querySelector('[data-create-submit]') as HTMLElement);

    await waitFor(() => {
      expect(api.count('appGrantCreate')).toBe(1);
    });
    const call = api.calls.find((item) => item.method === 'POST' && item.path.endsWith('/app-grants'));
    expect(JSON.parse(String(call?.body))).toEqual({
      // 受益人係申請表由員工名冊揀出嚟嘅拋棄式資料，唔係登入身份 WAI。
      userId: STAFF_ROW.id,
      appId: 'sales',
      role: 'member',
      scope: { kind: 'all' },
    });
  });

  it('重送同一筆回 created:false 時講明冇重複建立', async () => {
    mount('/#/admin/grants', {
      appGrantCreate: () =>
        jsonResponse(200, { grant: grant({ id: 'g-old', state: 'requested', version: 1 }), created: false }),
    });

    await waitFor(() => {
      expect(document.querySelector('[data-create-open]')).not.toBeNull();
    });
    const user = userEvent.setup();
    await user.click(document.querySelector('[data-create-open]') as HTMLElement);
    await pick(user, '授權給誰', '林慧');
    await pick(user, '授權的 App', '銷售');
    await pick(user, '授權角色', /^member/);
    await user.click(document.querySelector('[data-scope-kind="all"]') as HTMLElement);
    await user.click(document.querySelector('[data-create-submit]') as HTMLElement);

    expect(await screen.findByText(/這筆授權已經存在/)).toBeTruthy();
    expect(document.body.textContent).toContain('沒有重複建立');
  });

  it('批准唔等於生效：app 未啟用時停喺 approved，唔講「已生效」', async () => {
    let approved = false;
    await openSubject({
      appGrants: () => grantPage([grant({ id: 'g1', state: approved ? 'approved' : 'requested', version: 1 })]),
      appGrantApprove: () => {
        approved = true;
        return jsonResponse(409, {
          error: 'app_not_enabled',
          message: 'sales 現在未啟用，批准了但不可以生效',
          grant: grant({ id: 'g1', state: 'approved', version: 2 }),
        });
      },
    });

    await waitForGrantRow('g1');
    const user = userEvent.setup();
    await user.click(within(grantRow('g1')).getByRole('button', { name: '批准' }));

    expect(await screen.findByText(/已批准，但這個 app 未啟用/)).toBeTruthy();
    await waitFor(() => {
      expect(grantRow('g1').textContent).toContain('已批准（未生效）');
    });
    expect(document.body.textContent).not.toContain('已生效');
  });

  it('生效動作如實被 app_not_enabled 拒絕，唔用假資料冒充 active 完成', async () => {
    await openSubject({
      appGrants: () => grantPage([grant({ id: 'g1', state: 'approved', version: 1 })]),
      appGrantActivate: () =>
        jsonResponse(409, { error: 'app_not_enabled', message: 'sales 現在未啟用，不可以生效' }),
    });

    await waitForGrantRow('g1');
    const user = userEvent.setup();
    await user.click(within(grantRow('g1')).getByRole('button', { name: '生效' }));

    expect(await screen.findByText('sales 現在未啟用，不可以生效')).toBeTruthy();
    expect(document.body.textContent).not.toContain('已生效。');
  });

  it('stale_version 只提示重新載入，唔自動重送', async () => {
    const api = await openSubject({
      appGrants: () => grantPage([grant({ id: 'g1', state: 'requested', version: 1 })]),
      appGrantApprove: () =>
        jsonResponse(409, {
          error: 'stale_version',
          message: '版本已經變了，請重新讀取再試',
          grant: grant({ id: 'g1', state: 'requested', version: 5 }),
        }),
    });

    await waitForGrantRow('g1');
    const user = userEvent.setup();
    await user.click(within(grantRow('g1')).getByRole('button', { name: '批准' }));

    expect(await screen.findByText(/版本已經變了/)).toBeTruthy();
    expect(api.count('appGrantApprove')).toBe(1);
    expect(api.count('appGrants')).toBe(2);
  });

  it('敏感 app 規則保留：後端 403 message 原樣顯示', async () => {
    await openSubject({
      appGrants: () => grantPage([grant({ id: 'g1', state: 'requested', version: 1 })]),
      appGrantApprove: () =>
        jsonResponse(403, { error: 'sensitive_requires_owner', message: 'boss 是敏感 app，只有老闆可以批准' }),
    });

    await waitForGrantRow('g1');
    const user = userEvent.setup();
    await user.click(within(grantRow('g1')).getByRole('button', { name: '批准' }));

    expect(await screen.findByText('boss 是敏感 app，只有老闆可以批准')).toBeTruthy();
  });

  it('拒絕要填理由，送出帶 version 與 reason', async () => {
    const api = await openSubject({
      appGrants: () => grantPage([grant({ id: 'g1', state: 'requested', version: 3 })]),
    });

    await waitForGrantRow('g1');
    const user = userEvent.setup();
    await user.click(within(grantRow('g1')).getByRole('button', { name: '拒絕' }));
    const submit = document.querySelector('[data-reject-submit]') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    await user.type(screen.getByLabelText('理由（必填）'), '這個範圍太大');
    await user.click(document.querySelector('[data-reject-submit]') as HTMLElement);

    await waitFor(() => {
      expect(api.count('appGrantReject')).toBe(1);
    });
    const call = api.calls.find((item) => item.path.includes('/reject'));
    expect(JSON.parse(String(call?.body))).toEqual({ version: 3, reason: '這個範圍太大' });
  });

  it('撤銷原因可選：冇填就只送 version', async () => {
    const api = await openSubject({
      appGrants: () => grantPage([grant({ id: 'g1', state: 'active', version: 2 })]),
    });

    await waitForGrantRow('g1');
    const user = userEvent.setup();
    await user.click(within(grantRow('g1')).getByRole('button', { name: '撤銷' }));
    await user.click(document.querySelector('[data-revoke-submit]') as HTMLElement);

    await waitFor(() => {
      expect(api.count('appGrantRevoke')).toBe(1);
    });
    const call = api.calls.find((item) => item.path.includes('/revoke'));
    expect(JSON.parse(String(call?.body))).toEqual({ version: 2 });
  });

  it('修改擴範圍要開新版本等批准，唔原地擴權', async () => {
    const api = await openSubject({
      appGrants: () => grantPage([grant({ id: 'g1', state: 'active', version: 2, scope: { kind: 'units', unitIds: ['root'] } })]),
      appGrantPatch: () =>
        jsonResponse(201, {
          grant: grant({ id: 'g2', state: 'requested', version: 1, replacesId: 'g1' }),
          replacedId: 'g1',
          requiresApproval: true,
        }),
    });

    await waitForGrantRow('g1');
    const user = userEvent.setup();
    await user.click(within(grantRow('g1')).getByRole('button', { name: '修改' }));
    expect(document.body.textContent).toContain('現在：');
    expect(document.body.textContent).toContain('目標：');
    await user.click(document.querySelector('[data-modify-scope-kind="all"]') as HTMLElement);
    expect(document.body.textContent).toContain('會開一個新版本等批准');
    await user.click(document.querySelector('[data-modify-submit]') as HTMLElement);

    await waitFor(() => {
      expect(api.count('appGrantPatch')).toBe(1);
    });
    const call = api.calls.find((item) => item.method === 'PATCH');
    expect(JSON.parse(String(call?.body))).toEqual({ version: 2, scope: { kind: 'all' } });
    expect(await screen.findByText(/已提交新版本，要批准之後才生效/)).toBeTruthy();
  });

  it('六個 app 全部未啟用時如實顯示，唔冒充任何 active 流程完成', async () => {
    mount('/#/admin/grants', { modules: () => jsonResponse(200, { modules: MODULES_SIX }) });

    await waitFor(() => {
      expect(document.querySelector('[data-view="app"]')).not.toBeNull();
    });
    const user = userEvent.setup();
    await user.click(document.querySelector('[data-view="app"]') as HTMLElement);
    await pick(user, '選擇 App', '老闆台');

    expect(await screen.findByText(/這個 app 現在未啟用/)).toBeTruthy();
    expect(MODULES_SIX.every((module) => module.available === false)).toBe(true);
    expect(document.body.textContent).not.toContain('已生效');
  });

  it('無權限 403 唔係空清單；未登入 401 另講 session 失效', async () => {
    const api403 = mount('/#/admin/grants', { appGrants: () => jsonResponse(403, { error: 'forbidden' }) });
    await pick(userEvent.setup(), '選擇受益人', '陳老闆（你自己）');
    expect(await screen.findByText(/你沒有查看這些授權的權限/)).toBeTruthy();
    expect(api403.count('appGrants')).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain('這個範圍內沒有任何授權');

    cleanup();
    resetBrowserState();
    mount('/#/admin/grants', { appGrants: () => jsonResponse(401, { error: 'not_signed_in' }) });
    await pick(userEvent.setup(), '選擇受益人', '陳老闆（你自己）');
    expect(await screen.findByText(/登入已經失效/)).toBeTruthy();
  });

  it('網絡失敗唔係空清單，顯示原因同重試', async () => {
    mount('/#/admin/grants', {
      appGrants: () => {
        throw new Error('offline');
      },
    });

    await pick(userEvent.setup(), '選擇受益人', '陳老闆（你自己）');
    expect(await screen.findByText(/讀不到授權清單/)).toBeTruthy();
    expect(document.body.textContent).not.toContain('這個範圍內沒有任何授權');
    expect(screen.getByRole('button', { name: '重試' })).toBeTruthy();
  });
});
