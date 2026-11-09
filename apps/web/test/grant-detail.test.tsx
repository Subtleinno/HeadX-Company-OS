// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import './helpers/rtl';
import { App } from '../src/App';
import {
  installFakeApi,
  jsonResponse,
  resetBrowserState,
  type FakeApi,
  type FakeHandlers,
  type FakeResponse,
  type RecordedRequest,
} from './helpers/fake-api';

/**
 * 授權單筆詳情（issue 166／F-07）。
 *
 * 一律用真 `App` 同真路由 `/#/admin/grants`，唔直接渲染畫面元件：
 * 「列表每筆係咪真係撳到詳情」都係驗收一部分。
 *
 * 幾條界線：
 *   1. 詳情一定要重新 `GET /api/app-grants/<id>`，唔可以用列表快照。
 *   2. 狀態要分開：載入、成功、401、password_change_required、其他 403、
 *      404、網絡／5xx。404 只可以講一般搵唔到，唔推斷記錄存在或越權。
 *   3. 競態：A→B 舊回應唔可以覆蓋 B；關閉之後嘅慢回應唔可以重新開詳情；
 *      失敗唔可以保留上一筆資料冒充本筆。
 *   4. 詳情唯讀，唔發任何寫入請求，亦唔推斷可以批准或修改。
 *   5. 只重用既有 i18n 鍵，詳情專用 5 鍵由 issue 168 提供。
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
  requestedBy: string | null;
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
    activatedAt: '2026-11-06T02:06:00.000Z',
    revokedAt: null,
    rejectionReason: null,
    replacesId: null,
    ...over,
  };
}

const MODULES = [
  { id: 'boss', title: '老闆台', kind: 'console', department: null, order: 1, available: false },
  { id: 'sales', title: '銷售', kind: 'department', department: 'sales', order: 2, available: false },
  { id: 'hr', title: '人事', kind: 'department', department: 'hr', order: 3, available: false },
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

const UNITS = [
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
];

function page(grants: Grant[], total = grants.length, limit = 20, offset = 0) {
  return jsonResponse(200, { grants, page: { limit, offset, total } });
}

function detail(value: Grant): FakeResponse {
  return jsonResponse(200, { grant: value });
}

function openList(handlers: FakeHandlers = {}): FakeApi {
  window.history.replaceState(null, '', '/#/admin/grants');

  const api = installFakeApi({
    state: () => jsonResponse(200, { setupRequired: false, signedIn: true, user: BOSS }),
    settings: () => jsonResponse(200, { settings: [] }),
    modules: () => jsonResponse(200, { modules: MODULES }),
    orgUnits: () => jsonResponse(200, { units: UNITS, edges: [] }),
    staff: () => jsonResponse(200, { staff: [STAFF_ROW], total: 1 }),
    agents: () => jsonResponse(200, { agents: [], total: 0 }),
    appGrants: () => page([grant({ id: 'g1' })]),
    appGrantDetail: () => detail(grant({ id: 'g1' })),
    ...handlers,
  });

  render(<App />);

  return api;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function pick(label: string, option: string | RegExp): Promise<void> {
  const user = userEvent.setup();
  const name = typeof option === 'string' ? new RegExp(`^${escapeRegExp(option)}`) : option;
  const main = document.querySelector('[data-frame-main]') as HTMLElement;

  await user.click(within(main).getByRole('button', { name: label }));
  await user.click(within(main).getByRole('option', { name }));
}

async function selectSubject(): Promise<void> {
  await waitFor(() => {
    expect(screen.getByRole('button', { name: '選擇受益人' })).toBeDefined();
  });

  await pick('選擇受益人', '陳老闆（你自己）');
}

function grantRow(id: string): HTMLElement {
  return document.querySelector(`[data-grant-id="${id}"]`) as HTMLElement;
}

function detailSection(): HTMLElement {
  return document.querySelector('[data-grant-detail]') as HTMLElement;
}

function field(name: string): string {
  return (document.querySelector(`[data-field="${name}"]`) as HTMLElement | null)?.textContent ?? '';
}

async function openDetail(id = 'g1'): Promise<void> {
  await waitFor(() => {
    expect(document.querySelector(`[data-grant-id="${id}"]`)).not.toBeNull();
  });

  await userEvent.click(within(grantRow(id)).getByRole('button', { name: '授權詳情' }));
  await waitFor(() => {
    expect(document.querySelector('[data-grant-detail]')).not.toBeNull();
  });
}

function deferred<T>() {
  let resolveIt: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolvePending) => {
    resolveIt = resolvePending;
  });

  return { promise, resolveIt };
}

function tick(ms = 40): Promise<void> {
  return new Promise((resolvePending) => {
    setTimeout(resolvePending, ms);
  });
}

afterEach(() => {
  cleanup();
  resetBrowserState();
});

describe('詳情入口同請求', () => {
  it('列表每筆都有可鍵盤操作嘅詳情入口，Enter 可開啟詳情', async () => {
    openList({ appGrants: () => page([grant({ id: 'g1' }), grant({ id: 'g2' })]) });
    await selectSubject();

    await waitFor(() => {
      expect(document.querySelectorAll('[data-grant-id]').length).toBe(2);
    });

    const buttons = screen.getAllByRole('button', { name: '授權詳情' });
    expect(buttons.length).toBe(2);

    const first = buttons[0] as HTMLElement;
    first.focus();
    expect(document.activeElement).toBe(first);
    await userEvent.keyboard('{Enter}');

    await waitFor(() => {
      expect(document.querySelector('[data-grant-detail]')).not.toBeNull();
    });
  });

  it('詳情請求用 encodeURIComponent(id)，路徑係 /api/app-grants/<id>', async () => {
    const id = 'a b/c';
    let seen: string | null = null;

    openList({
      appGrants: () => page([grant({ id })]),
      appGrantDetail: (request: RecordedRequest) => {
        seen = request.path;

        return detail(grant({ id }));
      },
    });

    await selectSubject();
    await openDetail(id);

    await waitFor(() => {
      expect(seen).toBe('/api/app-grants/a%20b%2Fc');
    });
  });

  it('詳情係頁內區，唔新增路由、唔新增 modal', async () => {
    openList();
    await selectSubject();
    const hashBefore = window.location.hash;

    await openDetail('g1');

    expect(window.location.hash).toBe(hashBefore);
    expect(detailSection().tagName.toLowerCase()).toBe('section');
    expect(within(detailSection()).queryByRole('dialog')).toBeNull();
    expect(document.querySelector('[data-grant-list]')).not.toBeNull();
  });

  it('詳情以單筆回應為唯一資料，唔用列表快照', async () => {
    openList({
      appGrants: () => page([grant({ id: 'g1', appId: 'sales', state: 'requested', version: 1 })]),
      appGrantDetail: () => detail(grant({ id: 'g1', appId: 'hr', state: 'active', version: 9 })),
    });

    await selectSubject();
    await openDetail('g1');

    await waitFor(() => {
      expect(field('appId')).toBe('hr');
    });

    expect(field('version')).toBe('9');
    expect(field('state')).toContain('已生效');
    expect(detailSection().textContent).not.toContain('sales');
    expect(detailSection().textContent).not.toContain('申請中');
  });
});

describe('成功欄位同唯讀語意', () => {
  it('成功顯示全部唯讀欄位', async () => {
    const value = grant({
      id: 'g1',
      userId: 'u-wai',
      agentId: null,
      appId: 'sales',
      role: 'app_admin',
      scope: { kind: 'units', unitIds: ['ck'] },
      state: 'active',
      version: 3,
      requestedAt: '2026-11-06T02:00:00.000Z',
      approvedAt: '2026-11-06T02:05:00.000Z',
      activatedAt: '2026-11-06T02:06:00.000Z',
      revokedAt: null,
      rejectionReason: '範圍太大',
      replacesId: 'g0',
    });

    openList({ appGrantDetail: () => detail(value) });
    await selectSubject();
    await openDetail('g1');

    await waitFor(() => {
      expect(field('beneficiaryId')).toBe('u-wai');
    });

    expect(field('appId')).toBe('sales');
    expect(field('role')).toContain('app_admin');
    expect(field('scope')).toContain('指定單位');
    expect(field('state')).toContain('已生效');
    expect(field('version')).toBe('3');
    expect(field('requestedAt')).toContain('2026');
    expect(field('approvedAt')).toContain('2026');
    expect(field('activatedAt')).toContain('2026');
    expect(field('rejectionReason')).toContain('範圍太大');
    expect(field('replacesId')).toContain('g0');
  });

  it('null 欄位明示「未有」，唔捏造姓名／app 名／日期', async () => {
    const value = grant({
      id: 'g1',
      userId: null,
      agentId: 'a-x',
      approvedAt: null,
      activatedAt: null,
      revokedAt: null,
      rejectionReason: null,
      replacesId: null,
    });

    openList({ appGrantDetail: () => detail(value) });
    await selectSubject();
    await openDetail('g1');

    await waitFor(() => {
      expect(field('beneficiaryId')).toBe('a-x');
    });

    expect(field('approvedAt')).toBe('未有');
    expect(field('activatedAt')).toBe('未有');
    expect(field('revokedAt')).toBe('未有');
    expect(field('rejectionReason')).toContain('未有');
    expect(field('replacesId')).toBe('未有');
    expect(detailSection().textContent).not.toContain('林慧');
    expect(detailSection().textContent).not.toContain('老闆台');
  });

  it('兩個受益人 id 都係 null 時都明示「未有」', async () => {
    openList({ appGrantDetail: () => detail(grant({ id: 'g1', userId: null, agentId: null })) });
    await selectSubject();
    await openDetail('g1');

    await waitFor(() => {
      expect(field('beneficiaryId')).toBe('未有');
    });
  });

  it('approved 同 active 分開：approved 唔講已生效，詳情冇任何寫入操作鍵', async () => {
    openList({ appGrantDetail: () => detail(grant({ id: 'g1', state: 'approved' })) });
    await selectSubject();
    await openDetail('g1');

    await waitFor(() => {
      expect(field('state')).toContain('已批准');
    });

    expect(field('state')).not.toContain('已生效');

    for (const name of ['批准', '生效', '拒絕', '撤銷', '修改', '送出申請']) {
      expect(within(detailSection()).queryByRole('button', { name })).toBeNull();
    }
  });

  it('active 顯示已生效，唔講已批准', async () => {
    openList({ appGrantDetail: () => detail(grant({ id: 'g1', state: 'active' })) });
    await selectSubject();
    await openDetail('g1');

    await waitFor(() => {
      expect(field('state')).toContain('已生效');
    });

    expect(field('state')).not.toContain('已批准');
  });
});

describe('狀態分開', () => {
  it('載入中顯示載入中…，唔係空白畫面', async () => {
    const pending = deferred<FakeResponse>();
    openList({ appGrantDetail: () => pending.promise });
    await selectSubject();
    await openDetail('g1');

    await waitFor(() => {
      expect(document.querySelector('[data-detail-state="loading"]')).not.toBeNull();
    });

    expect(detailSection().textContent).toContain('載入中…');
    expect(document.querySelector('[data-grant-detail-fields]')).toBeNull();
    pending.resolveIt(detail(grant({ id: 'g1' })));
  });

  it('401 顯示登入失效，唔係成功或空資料', async () => {
    openList({ appGrantDetail: () => jsonResponse(401, { error: 'unauthenticated' }) });
    await selectSubject();
    await openDetail('g1');

    await waitFor(() => {
      expect(document.querySelector('[data-detail-state="unauthorized"]')).not.toBeNull();
    });

    expect(detailSection().textContent).toContain('登入已經失效，請重新登入。');
    expect(document.querySelector('[data-grant-detail-fields]')).toBeNull();
  });

  it('其他 403 顯示無權限，並原樣保留後端 message', async () => {
    openList({
      appGrantDetail: () => jsonResponse(403, { error: 'forbidden', message: '呢筆授權唔係你可以睇' }),
    });
    await selectSubject();
    await openDetail('g1');

    await waitFor(() => {
      expect(document.querySelector('[data-detail-state="denied"]')).not.toBeNull();
    });

    expect(detailSection().textContent).toContain('你沒有查看這些授權的權限。');
    expect(detailSection().textContent).toContain('呢筆授權唔係你可以睇');
    expect(document.querySelector('[data-grant-detail-fields]')).toBeNull();
  });

  it('password_change_required 分開顯示，唔當成無權限', async () => {
    openList({
      appGrantDetail: () => jsonResponse(403, { error: 'password_change_required' }),
    });
    await selectSubject();
    await openDetail('g1');

    await waitFor(() => {
      expect(document.querySelector('[data-detail-state="passwordRequired"]')).not.toBeNull();
    });

    expect(detailSection().textContent).toContain('你要先改密碼，才可以用其他功能。');
    expect(detailSection().textContent).toContain('去個人帳戶改密碼');
    expect(detailSection().textContent).not.toContain('你沒有查看這些授權的權限。');
    expect(document.querySelector('[data-grant-detail-fields]')).toBeNull();
  });

  it('404 只顯示一般搵唔到，唔推斷記錄存在、唔透露越權或已刪除', async () => {
    openList({
      appGrantDetail: () => jsonResponse(404, { error: 'grant_not_found', id: 'g1' }),
    });
    await selectSubject();
    await openDetail('g1');

    await waitFor(() => {
      expect(document.querySelector('[data-detail-state="notFound"]')).not.toBeNull();
    });

    expect(detailSection().textContent).toContain('找不到這筆授權。');
    expect(detailSection().textContent).not.toContain('權限');
    expect(detailSection().textContent).not.toContain('已刪除');
    expect(detailSection().textContent).not.toContain('grant_not_found');
    expect(document.querySelector('[data-grant-detail-fields]')).toBeNull();
  });

  it('5xx 顯示讀取失敗同後端理由，唔摺成搵唔到', async () => {
    openList({
      appGrantDetail: () => jsonResponse(500, { error: 'boom', reasons: ['資料庫暫時讀不到'] }),
    });
    await selectSubject();
    await openDetail('g1');

    await waitFor(() => {
      expect(document.querySelector('[data-detail-state="failed"]')).not.toBeNull();
    });

    expect(detailSection().textContent).toContain('讀不到這筆授權，請重試。');
    expect(detailSection().textContent).toContain('資料庫暫時讀不到');
    expect(detailSection().textContent).not.toContain('找不到這筆授權。');
    expect(document.querySelector('[data-grant-detail-fields]')).toBeNull();
  });

  it('網絡失敗顯示連唔到伺服器，唔摺成搵唔到', async () => {
    openList({
      appGrantDetail: () => {
        throw new Error('offline');
      },
    });
    await selectSubject();
    await openDetail('g1');

    await waitFor(() => {
      expect(document.querySelector('[data-detail-state="failed"]')).not.toBeNull();
    });

    expect(detailSection().textContent).toContain('讀不到這筆授權，請重試。');
    expect(detailSection().textContent).toContain('無法連線到伺服器');
    expect(document.querySelector('[data-grant-detail-fields]')).toBeNull();
  });

  it('失敗後重試成功，顯示重新讀取嘅資料', async () => {
    let attempts = 0;

    openList({
      appGrantDetail: () => {
        attempts += 1;

        return attempts === 1
          ? jsonResponse(503, { error: 'service_unavailable', reasons: ['暫時讀不到'] })
          : detail(grant({ id: 'g1' }));
      },
    });

    await selectSubject();
    await openDetail('g1');

    await waitFor(() => {
      expect(document.querySelector('[data-detail-state="failed"]')).not.toBeNull();
    });

    await userEvent.click(within(detailSection()).getByRole('button', { name: '重試' }));

    await waitFor(() => {
      expect(field('appId')).toBe('sales');
    });

    expect(document.querySelector('[data-detail-state="failed"]')).toBeNull();
  });
});

describe('競態保護', () => {
  it('快速切換 A、B：舊 A 回應唔可以覆蓋 B', async () => {
    const a = deferred<FakeResponse>();
    const b = deferred<FakeResponse>();

    openList({
      appGrants: () => page([grant({ id: 'g1', userId: 'u-wai' }), grant({ id: 'g2', userId: 'u-boss' })]),
      appGrantDetail: (request: RecordedRequest) =>
        request.path.endsWith('/g1') ? a.promise : b.promise,
    });

    await selectSubject();
    await waitFor(() => {
      expect(document.querySelectorAll('[data-grant-id]').length).toBe(2);
    });

    await userEvent.click(within(grantRow('g1')).getByRole('button', { name: '授權詳情' }));
    await waitFor(() => {
      expect(document.querySelector('[data-detail-state="loading"]')).not.toBeNull();
    });

    await userEvent.click(within(grantRow('g2')).getByRole('button', { name: '授權詳情' }));
    b.resolveIt(detail(grant({ id: 'g2', userId: 'u-boss', appId: 'hr' })));

    await waitFor(() => {
      expect(field('beneficiaryId')).toBe('u-boss');
    });

    a.resolveIt(detail(grant({ id: 'g1', userId: 'u-wai', appId: 'sales' })));
    await tick();

    expect(field('beneficiaryId')).toBe('u-boss');
    expect(field('appId')).toBe('hr');
    expect(detailSection().textContent).not.toContain('u-wai');
  });

  it('關閉詳情之後嘅慢回應唔可以重新打開詳情', async () => {
    const pending = deferred<FakeResponse>();
    openList({ appGrantDetail: () => pending.promise });
    await selectSubject();
    await openDetail('g1');

    await waitFor(() => {
      expect(document.querySelector('[data-detail-state="loading"]')).not.toBeNull();
    });

    await userEvent.click(within(detailSection()).getByRole('button', { name: '返回授權列表' }));
    expect(document.querySelector('[data-grant-detail]')).toBeNull();

    pending.resolveIt(detail(grant({ id: 'g1' })));
    await tick();

    expect(document.querySelector('[data-grant-detail]')).toBeNull();
    expect(document.querySelector('[data-grant-list]')).not.toBeNull();
  });

  it('重新載入失敗唔保留上一筆資料冒充本筆', async () => {
    let attempts = 0;

    openList({
      appGrantDetail: () => {
        attempts += 1;

        return attempts === 1
          ? detail(grant({ id: 'g1', appId: 'sales' }))
          : jsonResponse(503, { error: 'service_unavailable' });
      },
    });

    await selectSubject();
    await openDetail('g1');

    await waitFor(() => {
      expect(field('appId')).toBe('sales');
    });

    await userEvent.click(within(detailSection()).getByRole('button', { name: '重新載入' }));

    await waitFor(() => {
      expect(document.querySelector('[data-detail-state="failed"]')).not.toBeNull();
    });

    expect(document.querySelector('[data-grant-detail-fields]')).toBeNull();
    expect(detailSection().textContent).not.toContain('sales');
  });
});

describe('返回同寫入邊界', () => {
  it('返回保留原列表篩選同分頁，唔重新查清單', async () => {
    const api = openList({ appGrants: () => page([grant({ id: 'g1' })], 45) });
    await selectSubject();

    await waitFor(() => {
      expect(api.count('appGrants')).toBe(1);
    });

    await pick('篩選狀態', '申請中');
    await waitFor(() => {
      const last = api.calls.filter((call) => call.path.includes('/app-grants?')).at(-1);
      expect(last?.path).toContain('state=requested');
    });

    await userEvent.click(screen.getByRole('button', { name: '下一頁' }));
    await waitFor(() => {
      const last = api.calls.filter((call) => call.path.includes('/app-grants?')).at(-1);
      expect(last?.path).toContain('offset=20');
    });

    const before = api.calls.filter((call) => call.path.includes('/app-grants?')).length;

    await openDetail('g1');
    await userEvent.click(within(detailSection()).getByRole('button', { name: '返回授權列表' }));

    await waitFor(() => {
      expect(document.querySelector('[data-grant-detail]')).toBeNull();
    });

    const last = api.calls.filter((call) => call.path.includes('/app-grants?')).at(-1);
    expect(last?.path).toContain('state=requested');
    expect(last?.path).toContain('offset=20');
    expect(api.calls.filter((call) => call.path.includes('/app-grants?')).length).toBe(before);
    expect(document.body.textContent).toContain('第 21–40 筆，共 45 筆');
  });

  it('詳情由開到重試都唔發任何寫入請求', async () => {
    const api = openList({ appGrantDetail: () => jsonResponse(500, { error: 'boom' }) });
    await selectSubject();
    await openDetail('g1');

    await waitFor(() => {
      expect(document.querySelector('[data-detail-state="failed"]')).not.toBeNull();
    });

    await userEvent.click(within(detailSection()).getByRole('button', { name: '重試' }));

    await waitFor(() => {
      expect(api.count('appGrantDetail')).toBe(2);
    });

    const writes = api.calls.filter((call) => call.method !== 'GET');
    expect(writes.map((call) => `${call.method} ${call.path}`)).toEqual([]);
  });

  it('靜態檢查：GrantDetail.tsx 唔 import 任何寫入 API，亦唔寫死請求方法', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'apps/web/src/admin/GrantDetail.tsx'),
      'utf8',
    );

    for (const name of [
      'approveAppGrant',
      'activateAppGrant',
      'rejectAppGrant',
      'revokeAppGrant',
      'modifyAppGrant',
      'requestAppGrant',
    ]) {
      expect(source).not.toContain(name);
    }

    expect(source).not.toContain("method: 'POST'");
    expect(source).not.toContain("method: 'PATCH'");
    expect(source).not.toContain("method: 'PUT'");
    expect(source).not.toContain("method: 'DELETE'");
  });
});
