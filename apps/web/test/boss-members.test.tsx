// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import './helpers/rtl';
import { App } from '../src/App';
import { installFakeApi, jsonResponse, resetBrowserState, type FakeHandlers } from './helpers/fake-api';

/**
 * Boss Portal／人員與部門（issue #13）。
 *
 * 這一頁要證明四件事，每一件都是「老闆做完之後，真實世界改變了什麼」：
 *
 *   1. 名單只有一個來源：`GET /staff`。冇部門就寫「未指派」，唔會留空。
 *   2. 部門選項只有一個來源：`GET /modules` 的 `department`；未開放的部門
 *      照樣列出（可以預先指派），但要寫明「未開放」。
 *   3. 改部門＝即刻送 `PATCH /staff/:id/department`，送的就是選的那個值；
 *      失敗要如實講，而且畫面要回到真正的事實（不是留在用戶選的那個）。
 *   4. 建立員工後，帳戶是「未指派」—— 因為後端建立時 department 一定是 null。
 *      頁面要引導下一步，而不是假裝一步做完。
 */

const BOSS = {
  id: 'u-boss',
  email: 'boss@example.com',
  displayName: '陳老闆',
  role: 'owner',
  department: null,
  mustChangePassword: false,
};

const WAI = {
  id: 's-wai',
  email: 'wai@example.com',
  displayName: '林慧',
  role: 'staff',
  department: null as string | null,
  mustChangePassword: true,
  disabledAt: null as string | null,
  createdAt: '2026-11-01T09:30:00.000Z',
};

const DESIGN = {
  id: 'design',
  title: 'Design',
  kind: 'department',
  department: 'design',
  order: 10,
  available: true,
  route: '/design',
};

const SALES = {
  id: 'sales',
  title: '銷售',
  kind: 'department',
  department: 'sales',
  order: 20,
  available: false,
  route: '/sales',
};

function openMembers(handlers: FakeHandlers = {}) {
  window.history.replaceState(null, '', '/#/boss/people/members');

  const api = installFakeApi({
    state: () => jsonResponse(200, { setupRequired: false, signedIn: true, user: BOSS }),
    modules: () => jsonResponse(200, { modules: [DESIGN, SALES] }),
    staff: () => jsonResponse(200, { staff: [WAI], total: 1 }),
    ...handlers,
  });

  render(<App />);

  return api;
}

async function row(): Promise<HTMLElement> {
  await waitFor(() => {
    expect(document.querySelector('[data-member-row]')).not.toBeNull();
  });

  return document.querySelector('[data-member-row]') as HTMLElement;
}

function departmentSelect(): HTMLSelectElement {
  return screen.getByLabelText('指派 林慧 嘅部門') as HTMLSelectElement;
}

afterEach(() => {
  cleanup();
  resetBrowserState();
});

describe('人員名單', () => {
  it('列出員工、電郵、部門與狀態；冇部門就寫「未指派」', async () => {
    openMembers();

    const item = await row();

    expect(item.textContent).toContain('林慧');
    expect(item.textContent).toContain('wai@example.com');
    expect(item.textContent).toContain('未指派');
    expect(departmentSelect().value).toBe('');
  });

  it('空名單如實講，不是靜靜一片空白', async () => {
    openMembers({ staff: () => jsonResponse(200, { staff: [], total: 0 }) });

    await waitFor(() => {
      expect(document.body.textContent).toContain('呢間公司仲未有任何員工');
    });
  });

  it('部門選項來自 /modules，未開放的照樣列出並寫明「未開放」', async () => {
    openMembers();

    await row();

    const options = Array.from(departmentSelect().options).map((option) => option.textContent);

    expect(options).toEqual(['未指派', 'Design', '銷售（未開放）']);
  });

  it('讀不到員工名單：如實講讀取失敗，不假裝成空名單', async () => {
    openMembers({ staff: () => jsonResponse(503, { error: 'service_unavailable' }) });

    await waitFor(() => {
      expect(document.body.textContent).toContain('讀不到員工名單');
    });

    expect(document.body.textContent).not.toContain('呢間公司仲未有任何員工');
  });
});

describe('指派部門', () => {
  it('選一個部門就即刻送 PATCH，送的就是選的那個值', async () => {
    const api = openMembers({
      staffDepartment: () => jsonResponse(200, { staff: { ...WAI, department: 'design' } }),
    });

    await row();
    await userEvent.selectOptions(departmentSelect(), 'design');

    await waitFor(() => {
      expect(api.count('staffDepartment')).toBe(1);
    });

    const call = api.calls.find((item) => item.method === 'PATCH' && item.path.endsWith('/department'));

    expect(call?.path).toBe('/api/staff/s-wai/department');
    expect(JSON.parse(call?.body ?? '{}')).toEqual({ department: 'design' });

    await waitFor(() => {
      expect(departmentSelect().value).toBe('design');
    });
  });

  it('選「未指派」送的是 department: null，不是省略欄位', async () => {
    const api = openMembers({
      staff: () => jsonResponse(200, { staff: [{ ...WAI, department: 'design' }], total: 1 }),
      staffDepartment: () => jsonResponse(200, { staff: WAI }),
    });

    await row();
    await userEvent.selectOptions(departmentSelect(), '');

    await waitFor(() => {
      expect(api.count('staffDepartment')).toBe(1);
    });

    const call = api.calls.find((item) => item.method === 'PATCH' && item.path.endsWith('/department'));

    expect(JSON.parse(call?.body ?? '{}')).toEqual({ department: null });
  });

  it('失敗時如實講，並且畫面仍然係真正的事實（未指派）', async () => {
    openMembers({
      staffDepartment: () =>
        jsonResponse(400, { error: 'unknown_department', department: 'design' }),
    });

    await row();
    await userEvent.selectOptions(departmentSelect(), 'design');

    await waitFor(() => {
      expect(document.querySelector('[data-member-error]')).not.toBeNull();
    });

    expect(document.querySelector('[data-member-error]')?.textContent).toContain('呢個部門唔存在');
    expect(departmentSelect().value).toBe('');
  });

  it('已停用的帳戶唔可以再改部門：下拉鎖住，亦冇任何動作可做', async () => {
    openMembers({
      staff: () =>
        jsonResponse(200, {
          staff: [{ ...WAI, disabledAt: '2026-11-05T10:00:00.000Z' }],
          total: 1,
        }),
    });

    await row();

    expect(departmentSelect().disabled).toBe(true);
    expect(document.body.textContent).toContain('已停用');

    // 已停用的人登入不到：重設密碼只會改一串用不到的密碼，畫面卻應承
    // 「下次登入要改」。與其畫一個做到一半的動作，不如不畫。
    expect(document.querySelectorAll('[data-member-row] button').length).toBe(0);
  });
});

describe('停用登入（issue #24）', () => {
  it('先講清楚後果，確認之後才送 POST /staff/:id/disable', async () => {
    const api = openMembers({
      staffDisable: () =>
        jsonResponse(200, { staff: { ...WAI, disabledAt: '2026-11-11T10:00:00.000Z' } }),
    });

    await row();
    await userEvent.click(screen.getByRole('button', { name: '停用 林慧 嘅登入' }));

    // 未確認之前一定不可以已經送出去。
    expect(api.count('staffDisable')).toBe(0);
    expect(document.body.textContent).toContain('全部 session 會即刻撤銷');

    await userEvent.click(screen.getByRole('button', { name: '確認停用' }));

    await waitFor(() => {
      expect(api.count('staffDisable')).toBe(1);
    });

    const call = api.calls.find((item) => item.method === 'POST' && item.path.endsWith('/disable'));

    expect(call?.path).toBe('/api/staff/s-wai/disable');

    // 成功之後，畫面講的是真正發生的事：已停用、部門下拉鎖住。
    await waitFor(() => {
      expect(document.body.textContent).toContain('已停用');
    });

    expect(departmentSelect().disabled).toBe(true);
    expect(screen.queryByRole('button', { name: '停用 林慧 嘅登入' })).toBeNull();
  });

  it('取消就等於冇發生過：不送請求，按鈕回來', async () => {
    const api = openMembers();

    await row();
    await userEvent.click(screen.getByRole('button', { name: '停用 林慧 嘅登入' }));
    await userEvent.click(screen.getByRole('button', { name: '取消' }));

    expect(api.count('staffDisable')).toBe(0);
    expect(screen.getByRole('button', { name: '停用 林慧 嘅登入' })).toBeTruthy();
  });

  it('後端說已經停用：照它的原因講，不假裝成功', async () => {
    openMembers({ staffDisable: () => jsonResponse(409, { error: 'already_disabled' }) });

    await row();
    await userEvent.click(screen.getByRole('button', { name: '停用 林慧 嘅登入' }));
    await userEvent.click(screen.getByRole('button', { name: '確認停用' }));

    await waitFor(() => {
      expect(document.querySelector('[data-member-error]')?.textContent).toContain('已經停用');
    });
  });
});

describe('重設密碼（issue #24）', () => {
  function openReset(): void {
    void userEvent.click(screen.getByRole('button', { name: '重設 林慧 嘅密碼' }));
  }

  it('兩格都要填：老闆自己的密碼與臨時密碼，送出的就是這兩串', async () => {
    const api = openMembers({
      staffReset: () =>
        jsonResponse(200, { staff: { ...WAI, mustChangePassword: true } }),
    });

    await row();
    openReset();

    await userEvent.type(await screen.findByLabelText('你自己的密碼'), 'boss-secret');
    await userEvent.type(screen.getByLabelText('新的臨時密碼'), 'temp-secret-2026');
    await userEvent.click(screen.getByRole('button', { name: '確認重設' }));

    await waitFor(() => {
      expect(api.count('staffReset')).toBe(1);
    });

    const call = api.calls.find((item) => item.path.endsWith('/reset-password'));

    expect(call?.path).toBe('/api/staff/s-wai/reset-password');
    expect(JSON.parse(call?.body ?? '{}')).toEqual({
      ownerPassword: 'boss-secret',
      newTemporaryPassword: 'temp-secret-2026',
    });

    // 成功後講清楚：要改密碼、session 撤銷、冇寄出任何郵件。
    await waitFor(() => {
      expect(document.body.textContent).toContain('沒有寄出任何郵件');
    });

    // 密碼不留在畫面上。
    expect(screen.queryByLabelText('你自己的密碼')).toBeNull();
  });

  it('老闆自己的密碼不對：照後端的原因講，不是「網絡問題」', async () => {
    const api = openMembers({
      staffReset: () => jsonResponse(403, { error: 'invalid_owner_password' }),
    });

    await row();
    openReset();

    await userEvent.type(await screen.findByLabelText('你自己的密碼'), 'wrong-one');
    await userEvent.type(screen.getByLabelText('新的臨時密碼'), 'temp-secret-2026');
    await userEvent.click(screen.getByRole('button', { name: '確認重設' }));

    await waitFor(() => {
      expect(document.querySelector('[data-member-error]')?.textContent).toContain('你自己的密碼不對');
    });

    expect(api.count('staffReset')).toBe(1);
  });

  it('未填齊：不送請求，直接講清楚', async () => {
    const api = openMembers();

    await row();
    openReset();
    await userEvent.click(await screen.findByRole('button', { name: '確認重設' }));

    expect(api.count('staffReset')).toBe(0);
    expect(document.body.textContent).toContain('兩格都要填');
  });

  it('取消之後，密碼欄不會留在記憶體畫面裡', async () => {
    openMembers();

    await row();
    openReset();
    await userEvent.type(await screen.findByLabelText('你自己的密碼'), 'boss-secret');
    await userEvent.click(screen.getByRole('button', { name: '取消' }));

    expect(screen.queryByLabelText('你自己的密碼')).toBeNull();
  });
});

describe('建立員工', () => {
  it('填三格之後送出 POST /staff，成功後清空密碼欄並講下一步', async () => {
    const api = openMembers({
      staffCreate: () =>
        jsonResponse(201, {
          staff: { ...WAI, id: 's-new', displayName: '黃小明', email: 'ming@example.com' },
        }),
    });

    await row();
    await userEvent.click(screen.getByRole('button', { name: '新增員工' }));

    await userEvent.type(screen.getByLabelText('名稱'), '黃小明');
    await userEvent.type(screen.getByLabelText('電郵'), 'ming@example.com');
    await userEvent.type(screen.getByLabelText('初始密碼'), 'temp-secret-2026');
    await userEvent.click(screen.getByRole('button', { name: '建立' }));

    await waitFor(() => {
      expect(api.count('staffCreate')).toBe(1);
    });

    const call = api.calls.find((item) => item.method === 'POST' && item.path.endsWith('/staff'));

    expect(JSON.parse(call?.body ?? '{}')).toEqual({
      displayName: '黃小明',
      email: 'ming@example.com',
      initialPassword: 'temp-secret-2026',
    });

    // 密碼只活在表單那一次請求裡：成功後欄位要清空。
    await waitFor(() => {
      expect((screen.getByLabelText('初始密碼') as HTMLInputElement).value).toBe('');
    });

    expect(document.body.textContent).toContain('已建立「黃小明」');
    expect(document.body.textContent).toContain('下一步：喺下面指派部門');
  });

  it('三格未填齊：不送出請求，直接講清楚', async () => {
    const api = openMembers();

    await row();
    await userEvent.click(screen.getByRole('button', { name: '新增員工' }));
    await userEvent.click(screen.getByRole('button', { name: '建立' }));

    expect(api.count('staffCreate')).toBe(0);
    expect(document.body.textContent).toContain('三格都要填');
  });

  it('電郵重複：照後端的原因講，不會說「已建立」', async () => {
    openMembers({ staffCreate: () => jsonResponse(409, { error: 'duplicate_email' }) });

    await row();
    await userEvent.click(screen.getByRole('button', { name: '新增員工' }));
    await userEvent.type(screen.getByLabelText('名稱'), '林慧');
    await userEvent.type(screen.getByLabelText('電郵'), 'wai@example.com');
    await userEvent.type(screen.getByLabelText('初始密碼'), 'temp-secret-2026');
    await userEvent.click(screen.getByRole('button', { name: '建立' }));

    await waitFor(() => {
      expect(document.body.textContent).toContain('這個電郵已經有帳戶');
    });

    expect(document.body.textContent).not.toContain('已建立');
    // 失敗時密碼欄不清空：叫人重新輸入一次係多餘的懲罰。
    expect((screen.getByLabelText('初始密碼') as HTMLInputElement).value).toBe('temp-secret-2026');
  });
});
