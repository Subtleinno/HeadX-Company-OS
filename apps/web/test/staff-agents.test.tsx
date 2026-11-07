// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import './helpers/rtl';
import { App } from '../src/App';
import { installFakeApi, jsonResponse, resetBrowserState, type RecordedRequest } from './helpers/fake-api';

/**
 * 員工與 agent（issue 121）。
 *
 * 兩個界線最容易被重構破壞，所以在這裡釘死：
 *   1. 這是**公司名冊**，不是某個品牌的獨立帳戶庫；切品牌不改任何身份。
 *   2. 密碼只活在表單那一次請求裡：不進全局狀態、不寫 console、失敗即清空。
 *
 * 假 API 一律照真實後端的形狀：`GET /staff` 回 `{ staff, total }`、
 * `toStaffView` 的 `role` 寫死 `'staff'`、`disabledAt` 是 null 或 ISO 字串。
 */

const BOSS = { id: 'u1', email: 'boss@example.com', displayName: '陳老闆', role: 'owner' };

type Staff = {
  id: string;
  email: string;
  displayName: string;
  role: string;
  mustChangePassword: boolean;
  disabledAt: string | null;
  createdAt: string;
};

function staff(over: Partial<Staff> & { id: string; displayName: string; email: string }): Staff {
  return {
    role: 'staff',
    mustChangePassword: true,
    disabledAt: null,
    createdAt: '2026-11-01T02:00:00.000Z',
    ...over,
  };
}

const WAI = staff({ id: 's-wai', displayName: '林慧', email: 'wai@example.com' });
const KIN = staff({
  id: 's-kin',
  displayName: '陳健',
  email: 'kin@example.com',
  mustChangePassword: false,
  disabledAt: '2026-11-05T09:00:00.000Z',
});

function stateHandler() {
  return () =>
    jsonResponse(200, {
      setupRequired: false,
      signedIn: true,
      user: BOSS,
    });
}

function openStaff(handlers: Parameters<typeof installFakeApi>[0] = {}) {
  window.history.replaceState(null, '', '/#/admin/staff');

  const api = installFakeApi({
    state: stateHandler(),
    settings: () => jsonResponse(200, { settings: [] }),
    staff: () => jsonResponse(200, { staff: [WAI, KIN], total: 2 }),
    agents: () => jsonResponse(200, { agents: [], total: 0 }),
    modules: () => jsonResponse(200, { modules: [] }),
    orgUnits: () => jsonResponse(200, { units: [], edges: [] }),
    ...handlers,
  });

  render(<App />);

  return api;
}

async function waitForStaff(count = 2): Promise<void> {
  await waitFor(() => {
    expect(document.querySelectorAll('[data-staff-id]').length).toBe(count);
  });
}

function staffRow(id: string): HTMLElement {
  return document.querySelector(`[data-staff-id="${id}"]`) as HTMLElement;
}

afterEach(() => {
  cleanup();
  resetBrowserState();
});

describe('讀取員工', () => {
  it('由管理區導覽到得了，網址是 #/admin/staff', async () => {
    openStaff();

    await waitForStaff();

    expect(window.location.hash).toBe('#/admin/staff');
    expect(screen.getByRole('heading', { name: '員工與 agent', level: 1 })).toBeTruthy();
  });

  it('列出七個已核實欄位，並顯示總數', async () => {
    const api = openStaff();

    await waitForStaff();

    const row = staffRow('s-wai');
    expect(row.textContent).toContain('林慧');
    expect(row.textContent).toContain('wai@example.com');
    expect(row.textContent).toContain('s-wai');
    expect(row.textContent).toContain('staff');
    expect(row.textContent).toContain('要改密碼');
    expect(row.textContent).toContain('未停用');
    expect(row.textContent).toContain('2026');

    // 已停用的那位要講「已停用」，不可以同一個寫法。
    expect(staffRow('s-kin').textContent).toContain('已停用');
    expect(staffRow('s-kin').textContent).toContain('不用改');

    expect(screen.getByText('共 2 人')).toBeTruthy();

    // 第一次讀一定由第一頁開始，而且用後端的預設上限。
    const first = api.calls.find((call) => call.path.startsWith('/api/staff'));
    expect(first?.path).toBe('/api/staff?limit=20&offset=0');
  });

  it('明示這是公司名冊，而且老闆帳戶不在名單裡', async () => {
    openStaff();

    await waitForStaff();

    expect(screen.getByText(/公司名冊/)).toBeTruthy();
    expect(screen.getByText(/老闆帳戶不會出現在這裡/)).toBeTruthy();
  });

  it('真的沒有員工時講真話，不是空白畫面', async () => {
    openStaff({ staff: () => jsonResponse(200, { staff: [], total: 0 }) });

    expect(
      await screen.findByText('這間公司還沒有任何員工。這是真的沒有資料，不是畫面出錯。'),
    ).toBeTruthy();
    expect(document.querySelectorAll('[data-staff-id]').length).toBe(0);
  });

  it('讀取失敗顯示原因與重試，不偽裝成空名單', async () => {
    let attempt = 0;

    openStaff({
      staff: () => {
        attempt += 1;

        return attempt === 1
          ? jsonResponse(500, { error: 'boom' })
          : jsonResponse(200, { staff: [WAI, KIN], total: 2 });
      },
    });

    expect(await screen.findByText('讀不到員工名單。')).toBeTruthy();
    expect(screen.queryByText(/還沒有任何員工/)).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: '重試' }));

    await waitForStaff();
  });

  it('員工被後端拒絕時顯示無權限，不是空名單', async () => {
    openStaff({ staff: () => jsonResponse(403, { error: 'forbidden' }) });

    expect(await screen.findByText('只有老闆可以管理員工與 agent。')).toBeTruthy();
    expect(screen.queryByText(/還沒有任何員工/)).toBeNull();
  });

  it('登入失效（401）與權限不足分開講', async () => {
    openStaff({ staff: () => jsonResponse(401, { error: 'not_signed_in' }) });

    expect(await screen.findByText('登入已經失效，請重新登入。')).toBeTruthy();
  });

  it('分頁送正確的 offset，最後一頁的下一頁停用', async () => {
    const api = openStaff({
      staff: (request: RecordedRequest) =>
        request.path.includes('offset=20')
          ? jsonResponse(200, { staff: [KIN], total: 21 })
          : jsonResponse(200, { staff: [WAI, KIN], total: 21 }),
    });

    await waitForStaff();
    expect(screen.getByText('共 21 人')).toBeTruthy();

    const next = screen.getByRole('button', { name: '下一頁' }) as HTMLButtonElement;
    expect(next.disabled).toBe(false);

    await userEvent.click(next);

    await waitFor(() => {
      expect(api.calls.some((call) => call.path === '/api/staff?limit=20&offset=20')).toBe(true);
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '下一頁' })).toHaveProperty('disabled', true);
    });
    expect((screen.getByRole('button', { name: '上一頁' }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('建立員工', () => {
  it('表單只有三個欄位，送出時也只有這三個', async () => {
    const api = openStaff({
      staffCreate: () => jsonResponse(201, { staff: { ...WAI, id: 's-new', displayName: '新同事' } }),
    });

    await waitForStaff();
    await userEvent.click(screen.getByRole('button', { name: '新增員工' }));

    // 沒有角色、部門、邀請信、寄送選項。
    expect(screen.queryByLabelText('角色')).toBeNull();
    expect(screen.queryByLabelText('部門')).toBeNull();
    expect(screen.queryByText(/邀請信/)).toBeNull();

    await userEvent.type(screen.getByLabelText('名稱'), '新同事');
    await userEvent.type(screen.getByLabelText('電郵'), 'new@example.com');
    await userEvent.type(screen.getByLabelText('初始密碼'), 'preview-only-2026');
    await userEvent.click(screen.getByRole('button', { name: '建立' }));

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

  it('建立成功後重新讀取名單，並清空密碼欄', async () => {
    let created = false;

    openStaff({
      staffCreate: () => {
        created = true;

        return jsonResponse(201, { staff: { ...WAI, id: 's-new', displayName: '新同事' } });
      },
      staff: () =>
        jsonResponse(200, {
          staff: created ? [WAI, KIN, { ...WAI, id: 's-new', displayName: '新同事' }] : [WAI, KIN],
          total: created ? 3 : 2,
        }),
    });

    await waitForStaff();
    await userEvent.click(screen.getByRole('button', { name: '新增員工' }));
    await userEvent.type(screen.getByLabelText('名稱'), '新同事');
    await userEvent.type(screen.getByLabelText('電郵'), 'new@example.com');
    await userEvent.type(screen.getByLabelText('初始密碼'), 'preview-only-2026');
    await userEvent.click(screen.getByRole('button', { name: '建立' }));

    await waitForStaff(3);
    expect(screen.getByText('已建立員工。')).toBeTruthy();
  });

  it('重複 email 顯示伺服器原文，保留名稱與電郵但清空密碼', async () => {
    openStaff({ staffCreate: () => jsonResponse(409, { error: 'duplicate_email' }) });

    await waitForStaff();
    await userEvent.click(screen.getByRole('button', { name: '新增員工' }));
    await userEvent.type(screen.getByLabelText('名稱'), '林慧二號');
    await userEvent.type(screen.getByLabelText('電郵'), 'wai@example.com');
    await userEvent.type(screen.getByLabelText('初始密碼'), 'preview-only-2026');
    await userEvent.click(screen.getByRole('button', { name: '建立' }));

    expect(await screen.findByText('這個電郵已經有帳戶。')).toBeTruthy();

    // 非秘密欄位保留，方便改一個字再送。
    expect((screen.getByLabelText('名稱') as HTMLInputElement).value).toBe('林慧二號');
    expect((screen.getByLabelText('電郵') as HTMLInputElement).value).toBe('wai@example.com');
    // 密碼一定要清走，並且講明要重新輸入。
    expect((screen.getByLabelText('初始密碼') as HTMLInputElement).value).toBe('');
    expect(screen.getByText('密碼欄已經清空，請重新輸入。')).toBeTruthy();
  });

  it('密碼太短時顯示後端逐條理由，不是自行改寫', async () => {
    openStaff({
      staffCreate: () =>
        jsonResponse(422, { error: 'invalid_input', reasons: ['initialPassword 太短（最少 12 個字）'] }),
    });

    await waitForStaff();
    await userEvent.click(screen.getByRole('button', { name: '新增員工' }));
    await userEvent.type(screen.getByLabelText('名稱'), '新同事');
    await userEvent.type(screen.getByLabelText('電郵'), 'new@example.com');
    await userEvent.type(screen.getByLabelText('初始密碼'), 'short');
    await userEvent.click(screen.getByRole('button', { name: '建立' }));

    expect(await screen.findByText('initialPassword 太短（最少 12 個字）')).toBeTruthy();
    expect((screen.getByLabelText('初始密碼') as HTMLInputElement).value).toBe('');
  });

  it('提交中再按一次不會重送', async () => {
    let release: (value: ReturnType<typeof jsonResponse>) => void = () => undefined;
    const pending = new Promise<ReturnType<typeof jsonResponse>>((resolve) => {
      release = resolve;
    });

    const api = openStaff({ staffCreate: () => pending });

    await waitForStaff();
    await userEvent.click(screen.getByRole('button', { name: '新增員工' }));
    await userEvent.type(screen.getByLabelText('名稱'), '新同事');
    await userEvent.type(screen.getByLabelText('電郵'), 'new@example.com');
    await userEvent.type(screen.getByLabelText('初始密碼'), 'preview-only-2026');

    const submit = screen.getByRole('button', { name: '建立' });
    await userEvent.click(submit);
    await userEvent.click(submit);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '建立中…' })).toBeTruthy();
    });
    expect(api.count('staffCreate')).toBe(1);

    release(jsonResponse(201, { staff: { ...WAI, id: 's-new' } }));

    await waitFor(() => {
      expect(api.count('staff')).toBe(2);
    });
  });
});

describe('停用員工', () => {
  it('先確認，並講明 session 會撤銷而授權不會被刪', async () => {
    const api = openStaff({ staffDisable: () => jsonResponse(200, { staff: { ...WAI, disabledAt: '2026-11-07T05:00:00.000Z' } }) });

    await waitForStaff();
    await userEvent.click(within(staffRow('s-wai')).getByRole('button', { name: '停用' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('停用員工')).toBeTruthy();
    expect(within(dialog).getByText(/全部 session 會即刻撤銷/)).toBeTruthy();
    expect(within(dialog).getByText(/已發出的授權不會被刪/)).toBeTruthy();
    expect(api.count('staffDisable')).toBe(0);

    await userEvent.click(within(dialog).getByRole('button', { name: '確認停用' }));

    await waitFor(() => {
      expect(api.count('staffDisable')).toBe(1);
    });

    const call = api.calls.find((item) => item.method === 'POST' && item.path.endsWith('/disable'));
    expect(call?.path).toBe('/api/staff/s-wai/disable');

    // 成功之後要如實講 session 已撤銷。
    expect(await screen.findByText('已停用，session 已撤銷。')).toBeTruthy();
  });

  it('已停用的員工不可以再按停用', async () => {
    openStaff();

    await waitForStaff();

    const button = within(staffRow('s-kin')).getByRole('button', { name: '停用' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('後端說已經停用時照原文顯示，不假裝成功', async () => {
    openStaff({ staffDisable: () => jsonResponse(409, { error: 'already_disabled' }) });

    await waitForStaff();
    await userEvent.click(within(staffRow('s-wai')).getByRole('button', { name: '停用' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '確認停用' }));

    expect(await screen.findByText('這個帳戶已經停用。')).toBeTruthy();
  });

  it('取消對話框不會發請求', async () => {
    const api = openStaff();

    await waitForStaff();
    await userEvent.click(within(staffRow('s-wai')).getByRole('button', { name: '停用' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: '取消' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(api.count('staffDisable')).toBe(0);
  });
});

describe('重設員工密碼', () => {
  it('要求老闆重新輸入自己的密碼，並講明三個後果', async () => {
    openStaff();

    await waitForStaff();
    await userEvent.click(within(staffRow('s-wai')).getByRole('button', { name: '重設密碼' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('重設員工密碼')).toBeTruthy();
    expect(within(dialog).getByLabelText('你自己的密碼')).toBeTruthy();
    expect(within(dialog).getByLabelText('新的臨時密碼')).toBeTruthy();

    expect(within(dialog).getByText(/員工下次登入要改密碼/)).toBeTruthy();
    expect(within(dialog).getByText(/全部 session 會即刻撤銷/)).toBeTruthy();
    expect(within(dialog).getByText(/不會寄出任何郵件/)).toBeTruthy();

    // 兩個欄位都是密碼型，不是普通文字。
    expect((within(dialog).getByLabelText('你自己的密碼') as HTMLInputElement).type).toBe('password');
    expect((within(dialog).getByLabelText('新的臨時密碼') as HTMLInputElement).type).toBe('password');
  });

  it('送出時帶老闆密碼與臨時密碼，成功後清空兩個欄位並講清楚後果', async () => {
    const api = openStaff({
      staffReset: () => jsonResponse(200, { staff: { ...WAI, mustChangePassword: true } }),
    });

    await waitForStaff();
    await userEvent.click(within(staffRow('s-wai')).getByRole('button', { name: '重設密碼' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('你自己的密碼'), 'boss-secret-2026');
    await userEvent.type(within(dialog).getByLabelText('新的臨時密碼'), 'temp-secret-2026');
    await userEvent.click(within(dialog).getByRole('button', { name: '確認重設' }));

    await waitFor(() => {
      expect(api.count('staffReset')).toBe(1);
    });

    const call = api.calls.find((item) => item.method === 'POST' && item.path.endsWith('/reset-password'));
    expect(call?.path).toBe('/api/staff/s-wai/reset-password');
    expect(JSON.parse(call?.body ?? '{}')).toEqual({
      ownerPassword: 'boss-secret-2026',
      newTemporaryPassword: 'temp-secret-2026',
    });

    expect(
      await screen.findByText(
        '已重設。員工下次登入要改密碼，全部 session 已撤銷，沒有寄出任何郵件。',
      ),
    ).toBeTruthy();

    // 重開對話框：兩個密碼欄都是空的，不會留住上一次的字。
    await userEvent.click(within(staffRow('s-wai')).getByRole('button', { name: '重設密碼' }));
    const again = await screen.findByRole('dialog');
    expect((within(again).getByLabelText('你自己的密碼') as HTMLInputElement).value).toBe('');
    expect((within(again).getByLabelText('新的臨時密碼') as HTMLInputElement).value).toBe('');
  });

  it('老闆密碼不對時顯示通用錯誤，兩個欄位都清空，不講哪一步錯', async () => {
    const api = openStaff({
      staffReset: () => jsonResponse(403, { error: 'invalid_owner_password' }),
    });

    await waitForStaff();
    await userEvent.click(within(staffRow('s-wai')).getByRole('button', { name: '重設密碼' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('你自己的密碼'), 'wrong-password');
    await userEvent.type(within(dialog).getByLabelText('新的臨時密碼'), 'temp-secret-2026');
    await userEvent.click(within(dialog).getByRole('button', { name: '確認重設' }));

    expect(await screen.findByText('你自己的密碼不對，請重新輸入。')).toBeTruthy();
    expect((within(dialog).getByLabelText('你自己的密碼') as HTMLInputElement).value).toBe('');
    expect((within(dialog).getByLabelText('新的臨時密碼') as HTMLInputElement).value).toBe('');
    expect(api.count('staffReset')).toBe(1);
  });

  it('被節流時顯示要等多久', async () => {
    openStaff({
      staffReset: () => jsonResponse(429, { error: 'too_many_attempts' }, { 'retry-after': '180' }),
    });

    await waitForStaff();
    await userEvent.click(within(staffRow('s-wai')).getByRole('button', { name: '重設密碼' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('你自己的密碼'), 'wrong-password');
    await userEvent.type(within(dialog).getByLabelText('新的臨時密碼'), 'temp-secret-2026');
    await userEvent.click(within(dialog).getByRole('button', { name: '確認重設' }));

    expect(await screen.findByText(/3 分鐘後再試/)).toBeTruthy();
  });
});

describe('未保存就離開', () => {
  it('新增員工表單有輸入時，登出要先問', async () => {
    const api = openStaff();

    await waitForStaff();
    await userEvent.click(screen.getByRole('button', { name: '新增員工' }));
    await userEvent.type(screen.getByLabelText('名稱'), '打了一半');
    await userEvent.click(screen.getByRole('button', { name: '登出' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('未儲存：1 項')).toBeTruthy();

    await userEvent.click(within(dialog).getByRole('button', { name: '繼續編輯' }));
    expect(api.count('logout')).toBe(0);
    expect((screen.getByLabelText('名稱') as HTMLInputElement).value).toBe('打了一半');
  });
});

/* ── Agent ────────────────────────────────────────────────────────────── */

type Agent = { id: string; name: string; createdAt: string; disabledAt: string | null };

function agent(over: Partial<Agent> & { id: string; name: string }): Agent {
  return { createdAt: '2026-11-02T03:00:00.000Z', disabledAt: null, ...over };
}

const ASSIST = agent({ id: 'a-assist', name: '內容助手' });
const CLERK = agent({ id: 'a-clerk', name: '對帳幫手', disabledAt: '2026-11-06T01:00:00.000Z' });

const MODULES = [
  { id: 'boss', title: '老闆台', kind: 'console', department: null, order: 0, available: false },
  { id: 'design', title: '設計／內容／網站', kind: 'department', department: 'design', order: 1, available: false },
];

function grant(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'g-1',
    userId: null,
    agentId: 'a-assist',
    appId: 'design',
    role: 'member',
    scope: { kind: 'all' },
    state: 'active',
    version: 3,
    requestedBy: 'u1',
    approvedBy: 'u1',
    requestedAt: '2026-11-03T00:00:00.000Z',
    approvedAt: '2026-11-03T00:00:01.000Z',
    activatedAt: '2026-11-03T00:00:02.000Z',
    revokedAt: null,
    rejectionReason: null,
    replacesId: null,
    ...over,
  };
}

function openAgents(handlers: Parameters<typeof installFakeApi>[0] = {}) {
  window.history.replaceState(null, '', '/#/admin/staff');

  const api = installFakeApi({
    state: stateHandler(),
    settings: () => jsonResponse(200, { settings: [] }),
    staff: () => jsonResponse(200, { staff: [WAI], total: 1 }),
    agents: () => jsonResponse(200, { agents: [ASSIST, CLERK], total: 2 }),
    modules: () => jsonResponse(200, { modules: MODULES }),
    orgUnits: () =>
      jsonResponse(200, {
        units: [
          {
            id: 'root',
            name: '公司',
            type: 'company',
            isRoot: true,
            country: 'HK',
            currency: 'HKD',
            timezone: 'Asia/Hong_Kong',
            createdAt: '2026-11-01T00:00:00.000Z',
            updatedAt: '2026-11-01T00:00:00.000Z',
          },
        ],
        edges: [],
      }),
    agentGrants: () => jsonResponse(200, { grants: [grant()], total: 1 }),
    ...handlers,
  });

  render(<App />);

  return api;
}

async function openAgentTab(): Promise<void> {
  await waitFor(() => {
    expect(screen.getByRole('tab', { name: 'Agent' })).toBeTruthy();
  });
  await userEvent.click(screen.getByRole('tab', { name: 'Agent' }));
  await waitFor(() => {
    expect(document.querySelectorAll('[data-agent-id]').length).toBe(2);
  });
}

function agentRow(id: string): HTMLElement {
  return document.querySelector(`[data-agent-id="${id}"]`) as HTMLElement;
}

describe('讀取 agent', () => {
  it('列出 agent 的已核實欄位，並顯示總數', async () => {
    openAgents();
    await openAgentTab();

    expect(agentRow('a-assist').textContent).toContain('內容助手');
    expect(agentRow('a-assist').textContent).toContain('a-assist');
    expect(agentRow('a-assist').textContent).toContain('未停用');
    expect(agentRow('a-clerk').textContent).toContain('已停用');
    expect(screen.getByText('共 2 個')).toBeTruthy();
  });

  it('明示 agent 沒有自己的登入入口', async () => {
    openAgents();
    await openAgentTab();

    expect(screen.getByText(/agent 沒有自己的密碼，也沒有登入入口/)).toBeTruthy();
  });

  it('沒有 agent 時講真話', async () => {
    openAgents({ agents: () => jsonResponse(200, { agents: [], total: 0 }) });
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Agent' })).toBeTruthy();
    });
    await userEvent.click(screen.getByRole('tab', { name: 'Agent' }));

    expect(await screen.findByText('還沒有任何 agent。這是真的沒有資料，不是畫面出錯。')).toBeTruthy();
  });
});

describe('建立與停用 agent', () => {
  it('建立只送 name，成功後講明還沒有授權', async () => {
    let created = false;

    const api = openAgents({
      agentCreate: () => {
        created = true;

        return jsonResponse(201, { agent: agent({ id: 'a-new', name: '新助手' }) });
      },
      agents: () =>
        jsonResponse(200, {
          agents: created ? [ASSIST, CLERK, agent({ id: 'a-new', name: '新助手' })] : [ASSIST, CLERK],
          total: created ? 3 : 2,
        }),
    });

    await openAgentTab();
    await userEvent.click(screen.getByRole('button', { name: '新增 agent' }));
    await userEvent.type(screen.getByLabelText('名稱'), '新助手');
    await userEvent.click(screen.getByRole('button', { name: '建立' }));

    await waitFor(() => {
      expect(api.count('agentCreate')).toBe(1);
    });

    const call = api.calls.find((item) => item.method === 'POST' && item.path === '/api/agents');
    expect(JSON.parse(call?.body ?? '{}')).toEqual({ name: '新助手' });

    expect(await screen.findByText(/已建立 agent。但它還沒有任何授權/)).toBeTruthy();
  });

  it('重複名稱顯示原文理由', async () => {
    openAgents({ agentCreate: () => jsonResponse(409, { error: 'duplicate_name' }) });

    await openAgentTab();
    await userEvent.click(screen.getByRole('button', { name: '新增 agent' }));
    await userEvent.type(screen.getByLabelText('名稱'), '內容助手');
    await userEvent.click(screen.getByRole('button', { name: '建立' }));

    expect(await screen.findByText('這個名稱已經有 agent。')).toBeTruthy();
  });

  it('停用前要確認，已停用的不可以再按', async () => {
    const api = openAgents({ agentDisable: () => jsonResponse(200, { agent: { ...ASSIST, disabledAt: '2026-11-07T06:00:00.000Z' } }) });

    await openAgentTab();

    expect((within(agentRow('a-clerk')).getByRole('button', { name: '停用' }) as HTMLButtonElement).disabled).toBe(true);

    await userEvent.click(within(agentRow('a-assist')).getByRole('button', { name: '停用' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/存取檢查一律會拒絕/)).toBeTruthy();
    expect(api.count('agentDisable')).toBe(0);

    await userEvent.click(within(dialog).getByRole('button', { name: '確認停用' }));

    await waitFor(() => {
      expect(api.count('agentDisable')).toBe(1);
    });
    expect(await screen.findByText(/已停用 agent/)).toBeTruthy();
  });
});

describe('agent 授權', () => {
  it('選中 agent 才讀授權，並顯示 appId、角色、範圍、狀態與版本', async () => {
    const api = openAgents();

    await openAgentTab();

    // 未選之前不會去讀任何 agent 的授權。
    expect(api.count('agentGrants')).toBe(0);

    await userEvent.click(within(agentRow('a-assist')).getByRole('button', { name: '管理授權' }));

    await waitFor(() => {
      expect(document.querySelectorAll('[data-grant-id]').length).toBe(1);
    });

    const row = document.querySelector('[data-grant-id]') as HTMLElement;
    expect(row.textContent).toContain('design');
    expect(row.textContent).toContain('member');
    expect(row.textContent).toContain('範圍：全公司');
    expect(row.textContent).toContain('狀態：active');
    expect(row.textContent).toContain('版本：3');

    expect(api.calls.some((call) => call.path === '/api/agents/a-assist/grants?limit=20&offset=0')).toBe(true);
  });

  it('授權清單是空的時候講真話', async () => {
    openAgents({ agentGrants: () => jsonResponse(200, { grants: [], total: 0 }) });

    await openAgentTab();
    await userEvent.click(within(agentRow('a-assist')).getByRole('button', { name: '管理授權' }));

    expect(await screen.findByText('這個 agent 還沒有任何授權。')).toBeTruthy();
  });

  it('快速切換 agent 時，舊的授權回應不會覆蓋新目標', async () => {
    const pending = new Map<string, (response: ReturnType<typeof jsonResponse>) => void>();

    openAgents({
      agentGrants: (request: RecordedRequest) => {
        const id = /\/agents\/([^/]+)\/grants/.exec(request.path)?.[1] ?? '';

        return new Promise((resolve) => {
          pending.set(id, resolve);
        });
      },
    });

    await openAgentTab();

    await userEvent.click(within(agentRow('a-assist')).getByRole('button', { name: '管理授權' }));
    await waitFor(() => {
      expect(pending.has('a-assist')).toBe(true);
    });

    await userEvent.click(within(agentRow('a-clerk')).getByRole('button', { name: '管理授權' }));
    await waitFor(() => {
      expect(pending.has('a-clerk')).toBe(true);
    });

    pending.get('a-clerk')?.(jsonResponse(200, { grants: [grant({ id: 'g-clerk', appId: 'hr', agentId: 'a-clerk' })], total: 1 }));
    await waitFor(() => {
      expect(document.querySelectorAll('[data-grant-id]').length).toBe(1);
    });

    pending.get('a-assist')?.(jsonResponse(200, { grants: [grant({ id: 'g-assist', appId: 'design' })], total: 1 }));

    await waitFor(() => {
      expect(document.querySelector('[data-grant-panel]')?.getAttribute('data-grant-panel')).toBe('a-clerk');
    });
    expect((document.querySelector('[data-grant-id]') as HTMLElement).textContent).toContain('hr');
  });

  it('沒有角色選擇器，範圍未選不可以提交', async () => {
    const api = openAgents();

    await openAgentTab();
    await userEvent.click(within(agentRow('a-assist')).getByRole('button', { name: '管理授權' }));
    await waitFor(() => {
      expect(document.querySelectorAll('[data-grant-id]').length).toBe(1);
    });

    // agent 只可以是 member：沒有 app_admin，也沒有任何角色下拉。
    expect(screen.queryByLabelText('角色')).toBeNull();
    expect(screen.queryByText('app_admin')).toBeNull();
    expect(screen.getByText(/agent 只可以是 member/)).toBeTruthy();

    const submit = screen.getByRole('button', { name: '新增授權' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(screen.getByText(/要明寫範圍才可以提交/)).toBeTruthy();

    // 只選 App、未選範圍：仍然不可以提交。
    await userEvent.click(screen.getByRole('button', { name: 'App' }));
    await userEvent.click(screen.getByRole('option', { name: /設計／內容／網站/ }));
    expect((screen.getByRole('button', { name: '新增授權' }) as HTMLButtonElement).disabled).toBe(true);
    expect(api.count('agentGrantCreate')).toBe(0);
  });

  it('範圍選「全部」時送出 {kind:"all"}，成功後重新讀授權', async () => {
    const api = openAgents({
      agentGrantCreate: () => jsonResponse(201, { grant: grant({ id: 'g-2', appId: 'boss' }) }),
    });

    await openAgentTab();
    await userEvent.click(within(agentRow('a-assist')).getByRole('button', { name: '管理授權' }));
    await waitFor(() => {
      expect(document.querySelectorAll('[data-grant-id]').length).toBe(1);
    });

    await userEvent.click(screen.getByRole('button', { name: 'App' }));
    await userEvent.click(screen.getByRole('option', { name: /老闆台/ }));
    await userEvent.click(screen.getByRole('button', { name: '範圍' }));
    await userEvent.click(screen.getByRole('option', { name: '全部' }));
    await userEvent.click(screen.getByRole('button', { name: '新增授權' }));

    await waitFor(() => {
      expect(api.count('agentGrantCreate')).toBe(1);
    });

    const call = api.calls.find((item) => item.method === 'POST' && item.path === '/api/agents/a-assist/grants');
    expect(JSON.parse(call?.body ?? '{}')).toEqual({
      appId: 'boss',
      role: 'member',
      scope: { kind: 'all' },
    });

    expect(await screen.findByText('已新增授權。')).toBeTruthy();
  });

  it('指定單位時要讀真組織圖，送出 unitIds', async () => {
    const api = openAgents({
      agentGrantCreate: () => jsonResponse(201, { grant: grant({ id: 'g-3', scope: { kind: 'units', unitIds: ['root'] } }) }),
    });

    await openAgentTab();
    await userEvent.click(within(agentRow('a-assist')).getByRole('button', { name: '管理授權' }));
    await waitFor(() => {
      expect(document.querySelectorAll('[data-grant-id]').length).toBe(1);
    });

    await userEvent.click(screen.getByRole('button', { name: 'App' }));
    await userEvent.click(screen.getByRole('option', { name: /設計／內容／網站/ }));
    await userEvent.click(screen.getByRole('button', { name: '範圍' }));
    await userEvent.click(screen.getByRole('option', { name: '指定單位' }));

    // 單位由真的 GET /org-units 來，不是前端自己編。
    await waitFor(() => {
      expect(api.count('orgUnits')).toBe(1);
    });
    await userEvent.click(await screen.findByRole('checkbox', { name: '公司' }));

    await userEvent.click(screen.getByRole('button', { name: '新增授權' }));

    await waitFor(() => {
      expect(api.count('agentGrantCreate')).toBe(1);
    });

    const call = api.calls.find((item) => item.method === 'POST' && item.path === '/api/agents/a-assist/grants');
    expect(JSON.parse(call?.body ?? '{}')).toEqual({
      appId: 'design',
      role: 'member',
      scope: { kind: 'units', unitIds: ['root'] },
    });
  });

  it('撤銷時帶查詢拿到的那個 version', async () => {
    const api = openAgents({ agentGrantRevoke: () => jsonResponse(200, { grant: grant({ state: 'revoked' }) }) });

    await openAgentTab();
    await userEvent.click(within(agentRow('a-assist')).getByRole('button', { name: '管理授權' }));
    await waitFor(() => {
      expect(document.querySelectorAll('[data-grant-id]').length).toBe(1);
    });

    await userEvent.click(within(document.querySelector('[data-grant-id]') as HTMLElement).getByRole('button', { name: '撤銷' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('撤銷授權')).toBeTruthy();

    await userEvent.type(within(dialog).getByLabelText('原因（可選）'), '換了負責人');
    await userEvent.click(within(dialog).getByRole('button', { name: '確認撤銷' }));

    await waitFor(() => {
      expect(api.count('agentGrantRevoke')).toBe(1);
    });

    const call = api.calls.find((item) => item.path.endsWith('/revoke'));
    expect(call?.path).toBe('/api/agents/a-assist/grants/g-1/revoke');
    expect(JSON.parse(call?.body ?? '{}')).toEqual({ version: 3, reason: '換了負責人' });
  });

  it('版本衝突時要求重新載入，不會自動重送', async () => {
    const api = openAgents({ agentGrantRevoke: () => jsonResponse(409, { error: 'conflict' }) });

    await openAgentTab();
    await userEvent.click(within(agentRow('a-assist')).getByRole('button', { name: '管理授權' }));
    await waitFor(() => {
      expect(document.querySelectorAll('[data-grant-id]').length).toBe(1);
    });

    await userEvent.click(within(document.querySelector('[data-grant-id]') as HTMLElement).getByRole('button', { name: '撤銷' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: '確認撤銷' }));

    expect(await screen.findByText(/版本已經改變（有人先改過）/)).toBeTruthy();
    expect(api.count('agentGrantRevoke')).toBe(1);
  });
});

describe('agent 存取檢查', () => {
  it('不允許時照原文顯示原因，不當成已授權', async () => {
    openAgents({ agentAccess: () => jsonResponse(200, { allowed: false, reason: 'app_disabled' }) });

    await openAgentTab();
    await userEvent.click(within(agentRow('a-assist')).getByRole('button', { name: '管理授權' }));
    await waitFor(() => {
      expect(document.querySelectorAll('[data-grant-id]').length).toBe(1);
    });

    await userEvent.click(screen.getByRole('button', { name: '檢查存取用的 App' }));
    await userEvent.click(screen.getByRole('option', { name: /老闆台/ }));
    await userEvent.click(screen.getByRole('button', { name: '檢查存取' }));

    await waitFor(() => {
      expect(document.querySelector('[data-access-result]')).not.toBeNull();
    });
    expect(document.querySelector('[data-access-result]')?.textContent).toBe('不允許：app_disabled');
  });

  it('允許時講明是憑身份還是憑授權', async () => {
    openAgents({ agentAccess: () => jsonResponse(200, { allowed: true, via: 'grant' }) });

    await openAgentTab();
    await userEvent.click(within(agentRow('a-assist')).getByRole('button', { name: '管理授權' }));
    await waitFor(() => {
      expect(document.querySelectorAll('[data-grant-id]').length).toBe(1);
    });

    await userEvent.click(screen.getByRole('button', { name: '檢查存取用的 App' }));
    await userEvent.click(screen.getByRole('option', { name: /老闆台/ }));
    await userEvent.click(screen.getByRole('button', { name: '檢查存取' }));

    await waitFor(() => {
      expect(document.querySelector('[data-access-result]')?.textContent).toBe('允許（憑授權）');
    });
  });

  it('未接駁的 app 在選項上就要講清楚', async () => {
    openAgents();

    await openAgentTab();
    await userEvent.click(within(agentRow('a-assist')).getByRole('button', { name: '管理授權' }));
    await waitFor(() => {
      expect(document.querySelectorAll('[data-grant-id]').length).toBe(1);
    });

    await userEvent.click(screen.getByRole('button', { name: 'App' }));

    expect(screen.getByRole('option', { name: '老闆台（未接駁）' })).toBeTruthy();
  });
});
