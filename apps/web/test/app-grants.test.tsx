// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import './helpers/rtl';
import { App } from '../src/App';
import { installFakeApi, jsonResponse, resetBrowserState, type FakeHandlers } from './helpers/fake-api';

/**
 * App 授權（issue 122）。
 *
 * 這一張的難處不在畫面，而在「唔好講大話」：
 *
 *   1. 批准 ≠ 生效。六個 app 現在全部 `available: false`，批准之後狀態停在
 *      `approved`，後端回 409 `app_not_enabled`（但交易已提交）。畫面不可以寫「已生效」。
 *   2. 版本衝突只可以講「重新載入」，**不可以**拿新版本自動重送。
 *   3. 冇 `sensitive` 欄位就唔可以自己標「敏感 app」；只有後端 403 的 message 才算數。
 *   4. agent 視角行 `GET /agents/:id/grants`（owner-only，`{ grants, total }`），
 *      同 `/app-grants` 的 `page:{limit,offset,total}` 係兩個形狀。
 *
 * 假 API 一律照真實後端形狀，包括錯誤形狀的兩種寫法（`reasons[]` 與 `message`）。
 */

const BOSS = { id: 'u-boss', email: 'boss@example.com', displayName: '陳老闆', role: 'owner' };
const WAI = { id: 'u-wai', email: 'wai@example.com', displayName: '林慧', role: 'staff' };

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

const MODULES = [
  { id: 'boss', title: '老闆台', kind: 'console', department: null, order: 1, available: false },
  { id: 'sales', title: '銷售', kind: 'department', department: 'sales', order: 2, available: false },
];

const STAFF_ROW = {
  id: WAI.id,
  email: WAI.email,
  displayName: WAI.displayName,
  role: 'staff',
  mustChangePassword: false,
  disabledAt: null,
  createdAt: '2026-11-01T02:00:00.000Z',
};

function page(grants: Grant[], total = grants.length, limit = 20, offset = 0) {
  return jsonResponse(200, { grants, page: { limit, offset, total } });
}

function openGrants(handlers: FakeHandlers = {}, user: typeof BOSS | typeof WAI = BOSS) {
  window.history.replaceState(null, '', '/#/admin/grants');

  const api = installFakeApi({
    state: () => jsonResponse(200, { setupRequired: false, signedIn: true, user }),
    settings: () => jsonResponse(200, { settings: [] }),
    modules: () => jsonResponse(200, { modules: MODULES }),
    // 兩個單位：一個根、一個下級。只有一個單位的話，「all」與「指定單位」的
    // 覆蓋範圍剛好一樣，縮小／擴大的預告就驗不出來。
    orgUnits: () =>
      jsonResponse(200, {
        units: [
          {
            id: 'ck',
            name: '祥記',
            type: 'company',
            isRoot: true,
            country: null,
            currency: null,
            timezone: null,
            createdAt: '2026-11-01T00:00:00.000Z',
            updatedAt: '2026-11-01T00:00:00.000Z',
          },
          {
            id: 'kc',
            name: '祥記食品',
            type: 'division',
            isRoot: false,
            country: null,
            currency: null,
            timezone: null,
            createdAt: '2026-11-01T00:00:00.000Z',
            updatedAt: '2026-11-01T00:00:00.000Z',
          },
        ],
        edges: [{ parentId: 'ck', childId: 'kc', position: 0 }],
      }),
    staff: () => jsonResponse(200, { staff: [STAFF_ROW], total: 1 }),
    agents: () => jsonResponse(200, { agents: [], total: 0 }),
    appGrants: () => page([grant({ id: 'g1' })]),
    ...handlers,
  });

  render(<App />);

  return api;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 選項的無障礙名稱包含 label **與** description（例如員工的電郵），
 * 所以字串一律當前綴比對，不然永遠配不上。
 */
async function pick(label: string, option: string | RegExp): Promise<void> {
  const user = userEvent.setup();
  const name = typeof option === 'string' ? new RegExp(`^${escapeRegExp(option)}`) : option;
  // Frame 外殼頂欄亦有 App selector（選擇 App），同頁面內嘅 selector 撞名；
  // 頁面內嘅選擇器一律喺主要內容區定位，行為不變。
  const main = document.querySelector('[data-frame-main]') as HTMLElement;

  await user.click(within(main).getByRole('button', { name: label }));
  await user.click(within(main).getByRole('option', { name }));
}

function grantRow(id: string): HTMLElement {
  return document.querySelector(`[data-grant-id="${id}"]`) as HTMLElement;
}

async function waitForRow(id: string): Promise<void> {
  await waitFor(() => {
    expect(document.querySelector(`[data-grant-id="${id}"]`)).not.toBeNull();
  });
}

afterEach(() => {
  cleanup();
  resetBrowserState();
});

describe('App 授權：概念分開講', () => {
  it('四種概念各自寫清楚，app 行為模式明講沒有來源', async () => {
    openGrants();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'App 授權' })).toBeDefined();
    });

    const concepts = document.querySelector('[data-concepts]') as HTMLElement;

    expect(concepts.textContent).toContain('現在的工作範圍');
    expect(concepts.textContent).toContain('授權範圍');
    expect(concepts.textContent).toContain('頁內篩選');
    expect(concepts.textContent).toContain('後端未有這個欄位');
  });

  it('未選受益人之前不發查詢，亦不會顯示空清單', async () => {
    const api = openGrants();

    await waitFor(() => {
      expect(document.querySelector('[data-view="subject"]')).not.toBeNull();
    });

    expect(api.count('appGrants')).toBe(0);
    expect(document.body.textContent).toContain('先選一位受益人');
    expect(document.body.textContent).not.toContain('沒有任何授權');
  });
});

describe('App 授權：按受益人', () => {
  it('選了人就用 userId 查詢，並帶分頁', async () => {
    const api = openGrants();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '選擇受益人' })).toBeDefined();
    });

    await pick('選擇受益人', '陳老闆（你自己）');

    await waitFor(() => {
      expect(api.count('appGrants')).toBe(1);
    });

    const call = api.calls.filter((item) => item.path.includes('/app-grants'))[0];

    expect(call?.path).toContain('userId=u-boss');
    expect(call?.path).toContain('limit=20');
    expect(call?.path).toContain('offset=0');
  });

  it('空清單如實講，不是靜靜一片空白', async () => {
    openGrants({ appGrants: () => page([]) });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '選擇受益人' })).toBeDefined();
    });

    await pick('選擇受益人', '陳老闆（你自己）');

    await waitFor(() => {
      expect(document.body.textContent).toContain('這個範圍內沒有任何授權');
    });
  });

  it('讀取失敗要有原因與重試，不偽裝成空清單', async () => {
    let attempts = 0;

    openGrants({
      appGrants: () => {
        attempts += 1;

        return attempts === 1
          ? jsonResponse(503, { error: 'service_unavailable', message: '資料庫連不上' })
          : page([grant({ id: 'g1' })]);
      },
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '選擇受益人' })).toBeDefined();
    });

    await pick('選擇受益人', '陳老闆（你自己）');

    await waitFor(() => {
      expect(document.body.textContent).toContain('讀不到授權清單');
    });

    expect(document.body.textContent).toContain('資料庫連不上');
    expect(document.body.textContent).not.toContain('這個範圍內沒有任何授權');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '重試' }));

    await waitFor(() => {
      expect(document.querySelector('[data-grant-id="g1"]')).not.toBeNull();
    });
  });

  it('401 講 session 失效，不是「無權限」', async () => {
    openGrants({ appGrants: () => jsonResponse(401, { error: 'not_signed_in' }) });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '選擇受益人' })).toBeDefined();
    });

    await pick('選擇受益人', '陳老闆（你自己）');

    await waitFor(() => {
      expect(document.body.textContent).toContain('登入已經失效');
    });
  });

  it('403 講無權限，不是空清單', async () => {
    openGrants({ appGrants: () => jsonResponse(403, { error: 'forbidden' }) });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '選擇受益人' })).toBeDefined();
    });

    await pick('選擇受益人', '陳老闆（你自己）');

    await waitFor(() => {
      expect(document.body.textContent).toContain('你沒有查看這些授權的權限');
    });
  });

  it('分頁：共 45 筆，下一頁送 offset=20', async () => {
    const api = openGrants({ appGrants: () => page([grant({ id: 'g1' })], 45) });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '選擇受益人' })).toBeDefined();
    });

    await pick('選擇受益人', '陳老闆（你自己）');

    await waitFor(() => {
      expect(document.body.textContent).toContain('第 1–20 筆，共 45 筆');
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '下一頁' }));

    await waitFor(() => {
      const last = api.calls.filter((item) => item.path.includes('/app-grants')).at(-1);

      expect(last?.path).toContain('offset=20');
    });
  });

  it('狀態與角色篩選會帶到查詢字串', async () => {
    const api = openGrants();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '選擇受益人' })).toBeDefined();
    });

    await pick('選擇受益人', '陳老闆（你自己）');

    await waitFor(() => {
      expect(api.count('appGrants')).toBe(1);
    });

    await pick('篩選狀態', '申請中');

    await waitFor(() => {
      const last = api.calls.filter((item) => item.path.includes('/app-grants')).at(-1);

      expect(last?.path).toContain('state=requested');
    });

    await pick('篩選角色', 'app_admin');

    await waitFor(() => {
      const last = api.calls.filter((item) => item.path.includes('/app-grants')).at(-1);

      expect(last?.path).toContain('role=app_admin');
    });
  });

  it('受益人名字解不到時顯示 id，並講明不在名單', async () => {
    openGrants({ appGrants: () => page([grant({ id: 'g9', userId: 'u-ghost' })]) });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '選擇受益人' })).toBeDefined();
    });

    await pick('選擇受益人', '陳老闆（你自己）');

    await waitFor(() => {
      expect(document.querySelector('[data-grant-id="g9"]')).not.toBeNull();
    });

    expect(grantRow('g9').textContent).toContain('u-ghost');
    expect(grantRow('g9').textContent).toContain('不在員工名單');
  });
});

describe('App 授權：按 App', () => {
  it('選了 app 就用 appId 查詢，並事先講明這個 app 未啟用', async () => {
    const api = openGrants();

    await waitFor(() => {
      expect(document.querySelector('[data-view="app"]')).not.toBeNull();
    });

    const user = userEvent.setup();
    await user.click(document.querySelector('[data-view="app"]') as HTMLElement);

    await pick('選擇 App', '老闆台');

    await waitFor(() => {
      const call = api.calls.filter((item) => item.path.includes('/app-grants')).at(-1);

      expect(call?.path).toContain('appId=boss');
    });

    expect(document.body.textContent).toContain('這個 app 現在未啟用');
  });
});

describe('App 授權：建立', () => {
  it('非老闆見不到建立表格，只見到原因', async () => {
    openGrants({}, WAI);

    await waitFor(() => {
      expect(document.querySelector('[data-view="subject"]')).not.toBeNull();
    });

    expect(document.querySelector('[data-create-open]')).toBeNull();
    expect(document.body.textContent).toContain('只有老闆可以在這裡建立授權');
  });

  it('未選範圍時提交鍵停用（不勾選不等於全公司）', async () => {
    openGrants();

    await waitFor(() => {
      expect(document.querySelector('[data-create-open]')).not.toBeNull();
    });

    const user = userEvent.setup();
    await user.click(document.querySelector('[data-create-open]') as HTMLElement);

    await pick('授權給誰', '林慧');
    await pick('授權的 App', '銷售');
    await pick('授權角色', /^member/);

    const submit = document.querySelector('[data-create-submit]') as HTMLButtonElement;

    expect(submit.disabled).toBe(true);
    expect(document.body.textContent).toContain('要明寫範圍才可以提交');

    await user.click(document.querySelector('[data-scope-kind="units"]') as HTMLElement);

    expect((document.querySelector('[data-create-submit]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('送到後端的只有 userId、appId、role、scope 四個欄位', async () => {
    const api = openGrants({
      appGrantCreate: () =>
        jsonResponse(201, { grant: grant({ id: 'new1', state: 'requested', version: 1 }), created: true }),
    });

    await waitFor(() => {
      expect(document.querySelector('[data-create-open]')).not.toBeNull();
    });

    const user = userEvent.setup();
    await user.click(document.querySelector('[data-create-open]') as HTMLElement);

    await pick('授權給誰', '林慧');
    await pick('授權的 App', '銷售');
    await pick('授權角色', /^member/);
    await user.click(document.querySelector('[data-scope-kind="all"]') as HTMLElement);

    const submit = document.querySelector('[data-create-submit]') as HTMLButtonElement;

    expect(submit.disabled).toBe(false);
    await user.click(submit);

    await waitFor(() => {
      expect(api.count('appGrantCreate')).toBe(1);
    });

    const call = api.calls.find((item) => item.method === 'POST' && item.path.endsWith('/app-grants'));

    expect(JSON.parse(String(call?.body))).toEqual({
      userId: WAI.id,
      appId: 'sales',
      role: 'member',
      scope: { kind: 'all' },
    });
  });

  it('重送回 200 created:false 時講明沒有重複建立', async () => {
    openGrants({
      appGrantCreate: () =>
        jsonResponse(200, { grant: grant({ id: 'old1', state: 'requested', version: 1 }), created: false }),
    });

    await waitFor(() => {
      expect(document.querySelector('[data-create-open]')).not.toBeNull();
    });

    const user = userEvent.setup();
    await user.click(document.querySelector('[data-create-open]') as HTMLElement);

    await pick('授權給誰', '林慧');
    await pick('授權的 App', '銷售');
    await pick('授權角色', /^member/);
    await user.click(document.querySelector('[data-scope-kind="all"]') as HTMLElement);
    await user.click(document.querySelector('[data-create-submit]') as HTMLElement);

    await waitFor(() => {
      expect(document.body.textContent).toContain('這筆授權已經存在');
    });

    expect(document.body.textContent).toContain('沒有重複建立');
  });
});

describe('App 授權：狀態變更', () => {
  it('批准成功講「已批准並生效」，並重新讀清單', async () => {
    let approved = false;

    const api = openGrants({
      appGrants: () => page([grant({ id: 'g1', state: approved ? 'active' : 'requested', version: 1 })]),
      appGrantApprove: () => {
        approved = true;

        return jsonResponse(200, {
          grant: grant({ id: 'g1', state: 'active', version: 2 }),
          activated: true,
        });
      },
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '選擇受益人' })).toBeDefined();
    });

    await pick('選擇受益人', '陳老闆（你自己）');

    await waitForRow('g1');

    const user = userEvent.setup();
    await user.click(
      within(grantRow('g1')).getByRole('button', { name: '批准' }),
    );

    await waitFor(() => {
      expect(document.body.textContent).toContain('已批准並生效');
    });

    expect(api.count('appGrantApprove')).toBe(1);
    expect(api.count('appGrants')).toBe(2);

    const call = api.calls.find((item) => item.path.includes('/approve'));

    expect(JSON.parse(String(call?.body))).toEqual({ version: 1 });
  });

  it('app 未啟用：講「已批准，但未生效」，狀態如實顯示未生效', async () => {
    let approved = false;

    openGrants({
      appGrants: () => page([grant({ id: 'g1', state: approved ? 'approved' : 'requested', version: 1 })]),
      appGrantApprove: () => {
        approved = true;

        return jsonResponse(409, {
          error: 'app_not_enabled',
          message: 'boss 現在未啟用，批准了但不可以生效',
          grant: grant({ id: 'g1', state: 'approved', version: 2 }),
        });
      },
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '選擇受益人' })).toBeDefined();
    });

    await pick('選擇受益人', '陳老闆（你自己）');

    await waitForRow('g1');

    const user = userEvent.setup();
    await user.click(within(grantRow('g1')).getByRole('button', { name: '批准' }));

    await waitFor(() => {
      expect(document.body.textContent).toContain('已批准，但這個 app 未啟用');
    });

    await waitFor(() => {
      expect(grantRow('g1').textContent).toContain('已批准（未生效）');
    });
  });

  it('版本衝突只提示重新載入，不會自動重送', async () => {
    const api = openGrants({
      appGrants: () => page([grant({ id: 'g1', state: 'requested', version: 1 })]),
      appGrantApprove: () =>
        jsonResponse(409, {
          error: 'stale_version',
          message: '版本已經變了，請重新讀取再試',
          grant: grant({ id: 'g1', state: 'requested', version: 5 }),
        }),
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '選擇受益人' })).toBeDefined();
    });

    await pick('選擇受益人', '陳老闆（你自己）');

    await waitForRow('g1');

    const user = userEvent.setup();
    await user.click(within(grantRow('g1')).getByRole('button', { name: '批准' }));

    await waitFor(() => {
      expect(document.body.textContent).toContain('版本已經變了');
    });

    expect(api.count('appGrantApprove')).toBe(1);
    expect(api.count('appGrants')).toBe(2);
  });

  it('後端 403 的 message 原文照顯示（敏感 app 只有老闆可批）', async () => {
    openGrants({
      appGrants: () => page([grant({ id: 'g1', state: 'requested', version: 1 })]),
      appGrantApprove: () =>
        jsonResponse(403, {
          error: 'sensitive_requires_owner',
          message: 'boss 是敏感 app，只有老闆可以批准',
        }),
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '選擇受益人' })).toBeDefined();
    });

    await pick('選擇受益人', '陳老闆（你自己）');

    await waitForRow('g1');

    const user = userEvent.setup();
    await user.click(within(grantRow('g1')).getByRole('button', { name: '批准' }));

    await waitFor(() => {
      expect(document.body.textContent).toContain('boss 是敏感 app，只有老闆可以批准');
    });
  });

  it('拒絕要填理由，送出時帶 version 與 reason', async () => {
    const api = openGrants({
      appGrants: () => page([grant({ id: 'g1', state: 'requested', version: 3 })]),
      appGrantReject: () => jsonResponse(200, { grant: grant({ id: 'g1', state: 'rejected', version: 4 }) }),
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '選擇受益人' })).toBeDefined();
    });

    await pick('選擇受益人', '陳老闆（你自己）');

    await waitForRow('g1');

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

  it('撤銷的原因可選：沒有填就只送 version', async () => {
    const api = openGrants({
      appGrants: () => page([grant({ id: 'g1', state: 'active', version: 2 })]),
      appGrantRevoke: () => jsonResponse(200, { grant: grant({ id: 'g1', state: 'revoked', version: 3 }) }),
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '選擇受益人' })).toBeDefined();
    });

    await pick('選擇受益人', '陳老闆（你自己）');

    await waitForRow('g1');

    const user = userEvent.setup();
    await user.click(within(grantRow('g1')).getByRole('button', { name: '撤銷' }));
    await user.click(document.querySelector('[data-revoke-submit]') as HTMLElement);

    await waitFor(() => {
      expect(api.count('appGrantRevoke')).toBe(1);
    });

    const call = api.calls.find((item) => item.path.includes('/revoke'));

    expect(JSON.parse(String(call?.body))).toEqual({ version: 2 });
  });

  it('撤銷衝突時顯示後端那一句，不是自己的猜測', async () => {
    openGrants({
      appGrants: () => page([grant({ id: 'g1', state: 'active', version: 2 })]),
      appGrantRevoke: () =>
        jsonResponse(409, {
          error: 'invalid_transition',
          message: '授權已經是 revoked，不可以再撤銷',
        }),
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '選擇受益人' })).toBeDefined();
    });

    await pick('選擇受益人', '陳老闆（你自己）');

    await waitForRow('g1');

    const user = userEvent.setup();
    await user.click(within(grantRow('g1')).getByRole('button', { name: '撤銷' }));
    await user.click(document.querySelector('[data-revoke-submit]') as HTMLElement);

    await waitFor(() => {
      expect(document.body.textContent).toContain('授權已經是 revoked，不可以再撤銷');
    });
  });

  it('已經結束的授權沒有任何動作鍵', async () => {
    openGrants({ appGrants: () => page([grant({ id: 'g1', state: 'revoked', version: 4 })]) });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '選擇受益人' })).toBeDefined();
    });

    await pick('選擇受益人', '陳老闆（你自己）');

    await waitForRow('g1');

    expect(within(grantRow('g1')).queryByRole('button', { name: '批准' })).toBeNull();
    expect(within(grantRow('g1')).queryByRole('button', { name: '撤銷' })).toBeNull();
    expect(within(grantRow('g1')).queryByRole('button', { name: '修改' })).toBeNull();
  });
});

describe('App 授權：修改', () => {
  it('對話框顯示現在與目標，擴範圍講明要重新批准，並照後端結果講', async () => {
    const api = openGrants({
      appGrants: () =>
        page([grant({ id: 'g1', state: 'active', version: 2, scope: { kind: 'units', unitIds: ['ck'] } })]),
      appGrantPatch: () =>
        jsonResponse(201, {
          grant: grant({ id: 'g2', state: 'requested', version: 1, replacesId: 'g1' }),
          replacedId: 'g1',
          requiresApproval: true,
        }),
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '選擇受益人' })).toBeDefined();
    });

    await pick('選擇受益人', '陳老闆（你自己）');

    await waitForRow('g1');

    const user = userEvent.setup();
    await user.click(within(grantRow('g1')).getByRole('button', { name: '修改' }));

    expect(document.body.textContent).toContain('現在：');
    expect(document.body.textContent).toContain('目標：');

    // 由指定單位改成 all = 擴大 → 要重新批准。
    await user.click(document.querySelector('[data-modify-scope-kind="all"]') as HTMLElement);

    expect(document.body.textContent).toContain('會開一個新版本等批准');

    await user.click(document.querySelector('[data-modify-submit]') as HTMLElement);

    await waitFor(() => {
      expect(api.count('appGrantPatch')).toBe(1);
    });

    const call = api.calls.find((item) => item.method === 'PATCH');

    expect(JSON.parse(String(call?.body))).toEqual({ version: 2, scope: { kind: 'all' } });

    await waitFor(() => {
      expect(document.body.textContent).toContain('已提交新版本，要批准之後才生效');
    });
  });

  it('沒有改動時提交鍵停用（後端會回 not_a_change，不要浪費一次請求）', async () => {
    openGrants({ appGrants: () => page([grant({ id: 'g1', state: 'active', version: 2 })]) });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '選擇受益人' })).toBeDefined();
    });

    await pick('選擇受益人', '陳老闆（你自己）');

    await waitForRow('g1');

    const user = userEvent.setup();
    await user.click(within(grantRow('g1')).getByRole('button', { name: '修改' }));

    expect((document.querySelector('[data-modify-submit]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('縮小範圍送出後講「即時生效」，payload 帶 version 與新範圍', async () => {
    const api = openGrants({
      appGrants: () => page([grant({ id: 'g1', state: 'active', version: 2, scope: { kind: 'all' } })]),
      appGrantPatch: () =>
        jsonResponse(200, {
          grant: grant({ id: 'g2', state: 'active', version: 1, replacesId: 'g1', scope: { kind: 'units', unitIds: ['ck'] } }),
          replacedId: 'g1',
          requiresApproval: false,
        }),
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '選擇受益人' })).toBeDefined();
    });

    await pick('選擇受益人', '陳老闆（你自己）');

    await waitForRow('g1');

    const user = userEvent.setup();
    await user.click(within(grantRow('g1')).getByRole('button', { name: '修改' }));
    await user.click(document.querySelector('[data-modify-scope-kind="units"]') as HTMLElement);
    await user.click(document.querySelector('[data-modify-unit="ck"]') as HTMLElement);
    await user.click(document.querySelector('[data-modify-submit]') as HTMLElement);

    await waitFor(() => {
      expect(api.count('appGrantPatch')).toBe(1);
    });

    const call = api.calls.find((item) => item.method === 'PATCH');

    expect(JSON.parse(String(call?.body))).toEqual({
      version: 2,
      scope: { kind: 'units', unitIds: ['ck'] },
    });

    await waitFor(() => {
      expect(document.body.textContent).toContain('已收窄範圍，即時生效');
    });
  });
});

describe('App 授權：agent 視角', () => {
  it('走 agent 專用路由，並講明它沒有 state／role 篩選', async () => {
    const api = openGrants({
      agents: () =>
        jsonResponse(200, {
          agents: [{ id: 'a1', name: '走查助手', createdAt: '2026-11-01T00:00:00.000Z', disabledAt: null }],
          total: 1,
        }),
      agentGrants: () =>
        jsonResponse(200, {
          grants: [grant({ id: 'ag1', userId: null, agentId: 'a1' })],
          total: 1,
        }),
    });

    await waitFor(() => {
      expect(document.querySelector('[data-kind="agent"]')).not.toBeNull();
    });

    const user = userEvent.setup();
    await user.click(document.querySelector('[data-kind="agent"]') as HTMLElement);

    await pick('選擇 Agent', '走查助手');

    await waitFor(() => {
      expect(api.count('agentGrants')).toBe(1);
    });

    expect(document.body.textContent).toContain('agent 授權這條路由沒有狀態與角色篩選');
    expect(screen.queryByRole('button', { name: '篩選狀態' })).toBeNull();
  });

  it('非老闆選 agent 視角：後端只准老闆列 agent 授權，如實講', async () => {
    openGrants(
      {
        agents: () => jsonResponse(403, { error: 'forbidden' }),
        appGrants: () => page([grant({ id: 'g1' })]),
      },
      WAI,
    );

    await waitFor(() => {
      expect(document.querySelector('[data-kind="agent"]')).not.toBeNull();
    });

    const user = userEvent.setup();
    await user.click(document.querySelector('[data-kind="agent"]') as HTMLElement);

    await waitFor(() => {
      expect(document.body.textContent).toContain('後端只准老闆列 agent 授權');
    });
  });
});

describe('App 授權：未保存就離開', () => {
  it('建立表格有輸入時切換視角會被攔下來', async () => {
    openGrants();

    await waitFor(() => {
      expect(document.querySelector('[data-create-open]')).not.toBeNull();
    });

    const user = userEvent.setup();
    await user.click(document.querySelector('[data-create-open]') as HTMLElement);
    await pick('授權給誰', '林慧');

    await user.click(document.querySelector('[data-view="app"]') as HTMLElement);

    expect(screen.getByRole('dialog')).toBeDefined();
    expect(document.body.textContent).toContain('未儲存的修改');

    await user.click(screen.getByRole('button', { name: '繼續編輯' }));

    expect(document.querySelector('[data-view="subject"]')?.getAttribute('aria-selected')).toBe('true');
  });
});
