// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import './helpers/rtl';
import { App } from '../src/App';
import {
  installFakeApi,
  jsonResponse,
  resetBrowserState,
  type FakeResponse,
  type RecordedRequest,
} from './helpers/fake-api';

/**
 * 品牌與組織頁（issue 120）。
 *
 * 與 #119 一樣用真實 `App` 與真實路由：管理區到不到得了、網址對不對，
 * 都算這一頁的驗收。
 *
 * 這裡刻意把三個界線釘成測試，因為它們最容易在重構時悄悄失效：
 *   1. 公司根 ≠ 品牌 Workspace；
 *   2. 選中單位 = 這一頁的編輯目標，不改全局工作範圍；
 *   3. 「恢復繼承」= 移除覆寫（DELETE），不是把上級目前的值抄一份（PUT）。
 */

const BOSS = { id: 'u1', email: 'boss@example.com', displayName: '陳老闆', role: 'owner' };

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

const ROOT = unit({ id: 'root', name: '滿月堂集團', type: 'company', isRoot: true });
const MOONIC = unit({ id: 'moonic', name: 'Moonic 滿月堂', type: 'clinic' });
/** 兩個上級：root 與 moonic。 */
const CHEONG_KEE = unit({ id: 'ck', name: '祥記食品', type: 'restaurant' });
/** type 字面就是 `brand`，但 UI 不可以因此把它當成品牌身份。 */
const BRANDISH = unit({ id: 'brandish', name: '未定身份單位', type: 'brand' });

const GRAPH = {
  units: [ROOT, MOONIC, CHEONG_KEE, BRANDISH],
  edges: [
    { parentId: 'root', childId: 'moonic', position: 0 },
    { parentId: 'root', childId: 'ck', position: 1 },
    { parentId: 'root', childId: 'brandish', position: 2 },
    { parentId: 'moonic', childId: 'ck', position: 0 },
  ],
};

function setting(key: string, value: unknown) {
  return { key, value, updatedAt: '2026-11-07T02:00:00.000Z', updatedBy: null };
}

/**
 * 後端只回可覆寫的 key；edition／install_code 這一類不會出現。
 *
 * `source` 的形狀照抄 `apps/platform/src/org/graph.ts` 的 `SettingSource`：
 * **物件**，不是字串。之前測試把它寫成字串，畫面顯示「來源：[object Object]」
 * 都仍然是綠的 —— 所以這裡刻意用真實形狀。
 */
function unitSettingsFor(unitId: string, over: { grace?: number } = {}) {
  return {
    unitId,
    settings: [
      { key: 'acceptance_rule', value: 'owner', source: { kind: 'company' } },
      { key: 'department_isolation', value: false, source: { kind: 'unit', unitId: 'root' } },
      { key: 'overdue_grace_hours', value: over.grace ?? 24, source: { kind: 'unit', unitId: 'root' } },
      { key: 'notification_channels', value: ['inapp'], source: { kind: 'unit', unitId } },
    ],
    overrides: [setting('notification_channels', ['inapp'])],
  };
}

const COMPANY_SETTINGS = [setting('edition', 'intl')];

function stateHandler() {
  return () =>
    jsonResponse(200, {
      setupRequired: false,
      signedIn: true,
      user: BOSS,
    });
}

function openOrg(handlers: Parameters<typeof installFakeApi>[0] = {}) {
  window.history.replaceState(null, '', '/#/admin/organisation');

  const api = installFakeApi({
    state: stateHandler(),
    settings: () => jsonResponse(200, { settings: COMPANY_SETTINGS }),
    orgUnits: () => jsonResponse(200, GRAPH),
    unitSettings: (request: RecordedRequest) => {
      const id = /\/org-units\/([^/]+)\/settings$/.exec(request.path)?.[1] ?? 'root';

      return jsonResponse(200, unitSettingsFor(id));
    },
    ...handlers,
  });

  render(<App />);

  return api;
}

/** 標題在「載入中」也會出現，所以要等四個單位都真的畫出來。 */
async function waitForTree(): Promise<void> {
  await waitFor(() => {
    expect(document.querySelectorAll('[data-org-unit]').length).toBe(4);
  });
}

function treeButton(id: string): HTMLElement {
  return document.querySelector(`[data-org-unit="${id}"]`) as HTMLElement;
}

function rowFor(key: string): HTMLElement {
  return document.querySelector(`[data-unit-setting="${key}"]`) as HTMLElement;
}

function unitIdHeading(): HTMLElement {
  return document.querySelector('.org__unit-id') as HTMLElement;
}

afterEach(() => {
  cleanup();
  resetBrowserState();
});

describe('讀取組織圖', () => {
  it('按上級關係排出單位，根在最上，並顯示類型與上級數', async () => {
    openOrg();

    await waitForTree();

    const ids = Array.from(document.querySelectorAll('[data-org-unit]')).map((node) =>
      node.getAttribute('data-org-unit'),
    );

    expect(ids).toEqual(['root', 'moonic', 'ck', 'brandish']);
    expect(treeButton('root').getAttribute('data-root')).toBe('true');
    expect(treeButton('root').textContent).toContain('公司（根單位）');
    expect(treeButton('ck').textContent).toContain('restaurant');
    // 祥記有兩個上級（root、moonic），這句是插值字串，要在畫面真的填得進去。
    expect(treeButton('ck').textContent).toContain('2 個上級');
  });

  it('公司根明示是「公司（根單位）」，並講明選單位不等於切換品牌', async () => {
    openOrg();

    await waitForTree();

    await userEvent.click(treeButton('root'));

    expect(within(document.querySelector('.org__detail') as HTMLElement).getByText('公司（根單位）')).toBeTruthy();
    expect(screen.getByText('根單位代表整間公司，不是品牌 Workspace。')).toBeTruthy();
    expect(screen.getByText(/畫面不會由 type 推斷你是不是品牌/)).toBeTruthy();
  });

  it('type 字面是 brand 也不會被當成品牌身份', async () => {
    openOrg();

    await waitForTree();
    await userEvent.click(treeButton('brandish'));

    // 照原樣顯示自由文字的 type，不加品牌樣式或品牌欄位。
    expect(treeButton('brandish').textContent).toContain('brand');
    expect(document.querySelector('[data-brand]')).toBeNull();
    expect(document.querySelector('[data-brand-id]')).toBeNull();

    const detail = document.querySelector('.org__detail') as HTMLElement;
    expect(within(detail).getByText('一般單位')).toBeTruthy();
    // 選中它之後，全局範圍仍然是公司（不是「某某品牌」）。
    // Frame 外殼嘅範圍位係純文字公司範圍，唔係失效品牌下拉。
    const scope = document.querySelector('[data-frame-slot="scope"]') as HTMLElement;
    expect(scope.querySelector('[data-frame-scope="company"]')).not.toBeNull();
  });

  it('組織圖真的是空的時候講真話，不是空白畫面', async () => {
    openOrg({ orgUnits: () => jsonResponse(200, { units: [], edges: [] }) });

    expect(await screen.findByText('組織圖是空的，連根單位都沒有。這是真的沒有資料。')).toBeTruthy();
    expect(document.querySelectorAll('[data-org-unit]').length).toBe(0);
  });

  it('讀取失敗顯示原因與重試；重試成功才顯示組織', async () => {
    let attempt = 0;

    openOrg({
      orgUnits: () => {
        attempt += 1;

        return attempt === 1 ? jsonResponse(500, { error: 'boom' }) : jsonResponse(200, GRAPH);
      },
    });

    expect(await screen.findByText('讀不到組織資料。')).toBeTruthy();
    expect(screen.queryByText(/組織圖是空的/)).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: '重試' }));

    await waitForTree();
  });

  it('員工被後端拒絕時顯示無權限，不是空組織', async () => {
    openOrg({ orgUnits: () => jsonResponse(403, { error: 'forbidden' }) });

    expect(await screen.findByText('只有老闆可以管理組織。')).toBeTruthy();
    expect(document.querySelectorAll('[data-org-unit]').length).toBe(0);
    expect(screen.queryByText(/組織圖是空的/)).toBeNull();
  });

  it('登入失效（401）時請人重新登入', async () => {
    openOrg({ orgUnits: () => jsonResponse(401, { error: 'unauthenticated' }) });

    expect(await screen.findByText('登入已經失效，請重新登入。')).toBeTruthy();
  });
});

describe('選中單位與全局上下文', () => {
  it('選單位只改這一頁的編輯目標，頂欄工作範圍仍然是公司', async () => {
    openOrg();

    await waitForTree();

    const scopeBefore = document
      .querySelector('[data-frame-scope="company"]')
      ?.getAttribute('data-frame-scope');

    await userEvent.click(treeButton('moonic'));

    expect(unitIdHeading().textContent).toBe('moonic');
    expect(treeButton('moonic').getAttribute('aria-current')).toBe('true');

    // 全局工作範圍沒有被暗改：範圍位仍然係純文字公司範圍。
    expect(
      document.querySelector('[data-frame-scope="company"]')?.getAttribute('data-frame-scope'),
    ).toBe(scopeBefore);
    expect(
      document.querySelector('[data-frame-scope="company"]')?.getAttribute('data-frame-scope'),
    ).toBe('company');
    expect(screen.queryByRole('button', { name: '工作範圍' })).toBeNull();
    expect(screen.queryByRole('button', { name: '選擇品牌' })).toBeNull();
  });

  it('快速換單位時，舊的設定回應不會覆蓋新目標', async () => {
    const pending = new Map<string, (response: FakeResponse) => void>();

    openOrg({
      unitSettings: (request: RecordedRequest) => {
        const id = /\/org-units\/([^/]+)\/settings$/.exec(request.path)?.[1] ?? '';

        return new Promise<FakeResponse>((resolve) => {
          pending.set(id, resolve);
        });
      },
    });

    await waitForTree();

    await userEvent.click(treeButton('moonic'));
    await waitFor(() => {
      expect(pending.has('moonic')).toBe(true);
    });

    await userEvent.click(treeButton('ck'));
    await waitFor(() => {
      expect(pending.has('ck')).toBe(true);
    });

    // 新目標先回來。
    pending.get('ck')?.(jsonResponse(200, unitSettingsFor('ck', { grace: 48 })));

    await waitFor(() => {
      expect(within(rowFor('overdue_grace_hours')).getByText('48')).toBeTruthy();
    });

    // 舊目標的回應遲到，要丟掉。
    pending.get('moonic')?.(jsonResponse(200, unitSettingsFor('moonic', { grace: 24 })));

    await waitFor(() => {
      expect(unitIdHeading().textContent).toBe('ck');
    });
    expect(within(rowFor('overdue_grace_hours')).getByText('48')).toBeTruthy();
    expect(within(rowFor('overdue_grace_hours')).queryByText('24')).toBeNull();
  });
});

describe('編輯單位', () => {
  it('未改動時儲存鍵停用，按下去也不會發請求', async () => {
    const api = openOrg();

    await waitForTree();
    await userEvent.click(treeButton('moonic'));

    const save = screen.getByRole('button', { name: '儲存' }) as HTMLButtonElement;

    expect(save.disabled).toBe(true);
    expect(screen.getByText('與伺服器相同，不會提交。')).toBeTruthy();
    expect(api.count('orgUnitPatch')).toBe(0);
  });

  it('只送改動過的欄位，並採用伺服器回傳的值', async () => {
    const api = openOrg({
      orgUnitPatch: () => jsonResponse(200, { unit: { ...MOONIC, name: 'Moonic 診所' } }),
    });

    await waitForTree();
    await userEvent.click(treeButton('moonic'));

    const name = screen.getByLabelText('名稱') as HTMLInputElement;
    await userEvent.clear(name);
    await userEvent.type(name, 'Moonic 診所');
    await userEvent.click(screen.getByRole('button', { name: '儲存' }));

    await waitFor(() => {
      expect(api.count('orgUnitPatch')).toBe(1);
    });

    const call = api.calls.find((item) => item.method === 'PATCH');
    expect(call?.path).toBe('/api/org-units/moonic');
    expect(JSON.parse(call?.body ?? '{}')).toEqual({
      name: 'Moonic 診所',
      type: 'clinic',
      country: 'HK',
      currency: 'HKD',
      timezone: 'Asia/Hong_Kong',
    });

    await waitFor(() => {
      expect(treeButton('moonic').textContent).toContain('Moonic 診所');
    });
  });

  it('伺服器拒絕時保留輸入，並顯示原文理由', async () => {
    openOrg({
      orgUnitPatch: () =>
        jsonResponse(422, {
          error: 'invalid_org_unit',
          reasons: ['country 必須是兩個大寫字母的 ISO 3166-1 代碼（收到："hk"）'],
        }),
    });

    await waitForTree();
    await userEvent.click(treeButton('moonic'));

    const country = screen.getByLabelText('國家（ISO 3166-1，兩個大寫字母）') as HTMLInputElement;
    await userEvent.clear(country);
    await userEvent.type(country, 'hk');
    await userEvent.click(screen.getByRole('button', { name: '儲存' }));

    expect(await screen.findByText(/必須是兩個大寫字母/)).toBeTruthy();
    // 輸入沒有被清空、也沒有被改回舊值。
    expect((screen.getByLabelText('國家（ISO 3166-1，兩個大寫字母）') as HTMLInputElement).value).toBe('hk');
  });
});

describe('上級關係', () => {
  it('根單位沒有加上級，也沒有移除上級', async () => {
    openOrg();

    await waitForTree();
    await userEvent.click(treeButton('root'));

    expect(screen.getByText('沒有上級（根單位）。')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '加上級' })).toBeNull();
    expect(screen.queryByRole('button', { name: '移除' })).toBeNull();
  });

  it('有兩個上級時可以移除其中一個', async () => {
    const api = openOrg({ orgParentRemove: () => jsonResponse(204, null) });

    await waitForTree();
    await userEvent.click(treeButton('ck'));

    const parents = document.querySelectorAll('.org__parent');
    expect(parents.length).toBe(2);

    const second = parents[1] as HTMLElement;
    await userEvent.click(within(second).getByRole('button', { name: '移除' }));

    await waitFor(() => {
      expect(api.count('orgParentRemove')).toBe(1);
    });

    const call = api.calls.find((item) => item.method === 'DELETE' && item.path.includes('/parents/'));
    expect(call?.path).toBe(`/api/org-units/ck/parents/${second.textContent?.includes('Moonic') ? 'moonic' : 'root'}`);
  });

  it('只剩一個上級時移除鍵停用，並說明要先接上另一個', async () => {
    openOrg();

    await waitForTree();
    await userEvent.click(treeButton('moonic'));

    const remove = screen.getByRole('button', { name: '移除' }) as HTMLButtonElement;

    expect(remove.disabled).toBe(true);
    expect(remove.getAttribute('title')).toBe('只剩一個上級，要接上另一個才可以移除。');
  });

  it('成環／重複邊被後端拒絕時顯示原文理由，不假裝成功', async () => {
    openOrg({
      // 真實後端的 409 寫法是單一條 `reason`（不是 `reasons` 陣列），
      // 這一條測試同時釘住「單條 reason 也要顯示成中文理由，不是錯誤碼」。
      orgParentAdd: () =>
        jsonResponse(409, {
          error: 'cycle',
          reason: '加這條邊會令組織圖成環：上級不可以是這個單位的下級',
        }),
    });

    await waitForTree();
    await userEvent.click(treeButton('moonic'));

    await userEvent.click(screen.getByRole('button', { name: '選擇上級' }));
    await userEvent.click(screen.getByRole('option', { name: '祥記食品' }));
    await userEvent.click(screen.getByRole('button', { name: '加上級' }));

    expect(await screen.findByText(/會令組織圖成環/)).toBeTruthy();
    // 不可以只顯示錯誤碼。
    expect(screen.queryByText('cycle')).toBeNull();
    // 清單沒有被改動：仍然只有 root 一個上級。
    expect(document.querySelectorAll('.org__parent').length).toBe(1);
  });
});

describe('新增單位', () => {
  it('建立時會送出上級，成功後重新讀取組織圖', async () => {
    let created = false;

    const api = openOrg({
      orgUnitCreate: () => {
        created = true;

        return jsonResponse(201, {
          unit: unit({ id: 'new', name: '新部門', type: 'dept' }),
          parents: [{ parentId: 'root', childId: 'new', position: 3 }],
        });
      },
      orgUnits: () =>
        jsonResponse(
          200,
          created
            ? {
                units: [...GRAPH.units, unit({ id: 'new', name: '新部門', type: 'dept' })],
                edges: [...GRAPH.edges, { parentId: 'root', childId: 'new', position: 3 }],
              }
            : GRAPH,
        ),
    });

    await waitForTree();
    await userEvent.click(screen.getByRole('button', { name: '新增單位' }));

    await userEvent.type(screen.getByLabelText('名稱'), '新部門');
    await userEvent.type(screen.getByLabelText('類型（自由文字）'), 'dept');
    await userEvent.click(screen.getByRole('checkbox', { name: '滿月堂集團' }));
    await userEvent.click(screen.getByRole('button', { name: '建立' }));

    await waitFor(() => {
      expect(api.count('orgUnitCreate')).toBe(1);
    });

    const call = api.calls.find((item) => item.method === 'POST' && item.path === '/api/org-units');
    expect(JSON.parse(call?.body ?? '{}')).toMatchObject({
      name: '新部門',
      type: 'dept',
      parentIds: ['root'],
    });

    await waitFor(() => {
      expect(document.querySelectorAll('[data-org-unit]').length).toBe(5);
    });
  });

  it('建立失敗時保留輸入，並顯示伺服器理由', async () => {
    openOrg({
      orgUnitCreate: () =>
        jsonResponse(422, {
          error: 'invalid_org_unit',
          reasons: ['新單位至少要有一個上級'],
        }),
    });

    await waitForTree();
    await userEvent.click(screen.getByRole('button', { name: '新增單位' }));
    await userEvent.type(screen.getByLabelText('名稱'), '孤兒單位');
    await userEvent.click(screen.getByRole('button', { name: '建立' }));

    expect(await screen.findByText('新單位至少要有一個上級')).toBeTruthy();
    // 表單仍然開著，輸入還在。
    expect((screen.getByLabelText('名稱') as HTMLInputElement).value).toBe('孤兒單位');
  });
});

describe('軟刪除', () => {
  it('根單位沒有刪除鍵', async () => {    openOrg();

    await waitForTree();
    await userEvent.click(treeButton('root'));

    expect(screen.queryByRole('button', { name: '刪除這個單位' })).toBeNull();
  });

  it('先講明是軟刪除與品牌缺口，確認後才發請求', async () => {
    const api = openOrg({ orgUnitDelete: () => jsonResponse(204, null) });

    await waitForTree();
    await userEvent.click(treeButton('ck'));
    await userEvent.click(screen.getByRole('button', { name: '刪除這個單位' }));

    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByText(/這是軟刪除：資料列會保留/)).toBeTruthy();
    expect(within(dialog).getByText(/這一頁不知道單位是否承載品牌身份/)).toBeTruthy();
    expect(api.count('orgUnitDelete')).toBe(0);

    await userEvent.click(within(dialog).getByRole('button', { name: '確認刪除' }));

    await waitFor(() => {
      expect(api.count('orgUnitDelete')).toBe(1);
    });

    const call = api.calls.find((item) => item.method === 'DELETE' && !item.path.includes('/parents/'));
    expect(call?.path).toBe('/api/org-units/ck');
  });

  it('對話框可以按 Escape 取消，不會發請求', async () => {
    const api = openOrg();

    await waitForTree();
    await userEvent.click(treeButton('moonic'));
    await userEvent.click(screen.getByRole('button', { name: '刪除這個單位' }));

    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(api.count('orgUnitDelete')).toBe(0);
  });

  it('刪除之後不會再去讀已刪除單位的設定（沒有幽靈請求）', async () => {
    let deleted = false;

    const api = openOrg({
      orgUnitDelete: () => {
        deleted = true;

        return jsonResponse(204, null);
      },
      orgUnits: () =>
        jsonResponse(200, {
          units: deleted ? GRAPH.units.filter((item) => item.id !== 'ck') : GRAPH.units,
          edges: deleted ? GRAPH.edges.filter((edge) => edge.childId !== 'ck') : GRAPH.edges,
        }),
    });

    await waitForTree();
    await userEvent.click(treeButton('ck'));
    await userEvent.click(screen.getByRole('button', { name: '刪除這個單位' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '確認刪除' }));

    await waitFor(() => {
      expect(document.querySelectorAll('[data-org-unit]').length).toBe(3);
    });

    // 刪除之後再讀 `ck` 的設定只會換來 404，畫面也用不到。
    const deleteAt = api.calls.findIndex((item) => item.method === 'DELETE' && item.path === '/api/org-units/ck');
    expect(deleteAt).toBeGreaterThanOrEqual(0);

    const ghost = api.calls.slice(deleteAt).filter((item) => item.path === '/api/org-units/ck/settings');
    expect(ghost).toEqual([]);
  });

  it('後端阻止（有下級）時顯示原文理由，單位仍然在', async () => {
    openOrg({
      orgUnitDelete: () =>
        jsonResponse(409, {
          error: 'has_children',
          reason: '還有 2 個未刪除的下級單位，請先處理它們',
        }),
    });

    await waitForTree();
    await userEvent.click(treeButton('ck'));
    await userEvent.click(screen.getByRole('button', { name: '刪除這個單位' }));

    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: '確認刪除' }));

    expect(await screen.findByText(/請先處理它們/)).toBeTruthy();
    await waitFor(() => {
      expect(document.querySelectorAll('[data-org-unit]').length).toBe(4);
    });
  });

  it('根單位的刪除被後端拒絕時也照原文講，不是靜靜失敗', async () => {
    openOrg({
      orgUnitDelete: () =>
        jsonResponse(409, {
          error: 'root_undeletable',
          reason: '根單位代表整間公司，不可以刪除',
        }),
    });

    await waitForTree();
    await userEvent.click(treeButton('moonic'));
    await userEvent.click(screen.getByRole('button', { name: '刪除這個單位' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '確認刪除' }));

    expect(await screen.findByText('根單位代表整間公司，不可以刪除')).toBeTruthy();
  });
});

describe('單位設定覆寫', () => {
  it('顯示有效值、來源，以及是不是本單位覆寫', async () => {
    openOrg();

    await waitForTree();
    await userEvent.click(treeButton('moonic'));

    await waitFor(() => {
      expect(document.querySelectorAll('[data-unit-setting]').length).toBe(4);
    });

    // 公司預設（來源是 company，不是某個單位）。
    expect(within(rowFor('acceptance_rule')).getByText('來源：公司預設')).toBeTruthy();
    expect(within(rowFor('acceptance_rule')).getByText('繼承')).toBeTruthy();

    // 繼承自上級，來源寫出名字而不是 id。
    expect(within(rowFor('overdue_grace_hours')).getByText('來源：來自「滿月堂集團」')).toBeTruthy();
    expect(within(rowFor('overdue_grace_hours')).getByText('24')).toBeTruthy();

    // 本單位自己覆寫。
    expect(within(rowFor('notification_channels')).getByText('本單位覆寫')).toBeTruthy();
    expect(within(rowFor('notification_channels')).getByText('來源：來自「Moonic 滿月堂」')).toBeTruthy();

    // 來源是物件，任何一行都不可以把它直接串成字串顯示。
    expect(document.querySelector('.admin-list')?.textContent).not.toContain('[object Object]');
  });

  it('連公司和上級都沒有這一項時，來源照實講沒有，不借用「公司預設」', async () => {
    openOrg({
      unitSettings: () =>
        jsonResponse(200, {
          unitId: 'moonic',
          settings: [{ key: 'overdue_grace_hours', value: null, source: null }],
          overrides: [],
        }),
    });

    await waitForTree();
    await userEvent.click(treeButton('moonic'));

    await waitFor(() => {
      expect(document.querySelectorAll('[data-unit-setting]').length).toBe(1);
    });

    const row = rowFor('overdue_grace_hours');
    expect(within(row).getByText('來源：公司和上級都沒有這一項')).toBeTruthy();
    expect(within(row).queryByText('來源：公司預設')).toBeNull();
    expect(within(row).getByText('未設定')).toBeTruthy();
  });

  it('只在後端回傳的可覆寫 key 上提供「改成」', async () => {
    openOrg();

    await waitForTree();
    await userEvent.click(treeButton('moonic'));

    await waitFor(() => {
      expect(document.querySelectorAll('[data-unit-setting]').length).toBe(4);
    });

    // edition／install_code 不在可覆寫清單，畫面就不提供提交入口。
    expect(document.querySelector('[data-unit-setting="edition"]')).toBeNull();
    expect(document.querySelector('[data-unit-setting="install_code"]')).toBeNull();
    expect(screen.queryByText('國際版（intl）')).toBeNull();
  });

  it('覆寫明確寫入選中的單位', async () => {
    const api = openOrg({
      unitSettingSave: () => jsonResponse(200, { setting: setting('department_isolation', true) }),
    });

    await waitForTree();
    await userEvent.click(treeButton('moonic'));

    await waitFor(() => {
      expect(document.querySelectorAll('[data-unit-setting]').length).toBe(4);
    });

    const row = rowFor('department_isolation');
    await userEvent.click(within(row).getByRole('button', { name: '改成' }));
    await userEvent.click(within(row).getByRole('checkbox'));
    await userEvent.click(within(row).getByRole('button', { name: '儲存' }));

    await waitFor(() => {
      expect(api.count('unitSettingSave')).toBe(1);
    });

    const call = api.calls.find((item) => item.method === 'PUT');
    expect(call?.path).toBe('/api/org-units/moonic/settings/department_isolation');
    expect(call?.body).toBe(JSON.stringify({ value: true }));
  });

  it('恢復繼承是移除覆寫，不是把上級的值抄一份', async () => {
    const api = openOrg({ unitSettingRemove: () => jsonResponse(204, null) });

    await waitForTree();
    await userEvent.click(treeButton('moonic'));

    await waitFor(() => {
      expect(document.querySelectorAll('[data-unit-setting]').length).toBe(4);
    });

    await userEvent.click(within(rowFor('notification_channels')).getByRole('button', { name: '恢復繼承' }));

    await waitFor(() => {
      expect(api.count('unitSettingRemove')).toBe(1);
    });

    const call = api.calls.find((item) => item.method === 'DELETE');
    expect(call?.path).toBe('/api/org-units/moonic/settings/notification_channels');
    // 關鍵：沒有用 PUT 把上級目前的值寫成本單位覆寫。
    expect(api.count('unitSettingSave')).toBe(0);
  });

  it('覆寫讀取失敗顯示原因與重試，不是空白清單', async () => {
    let attempt = 0;

    openOrg({
      unitSettings: (request: RecordedRequest) => {
        attempt += 1;
        const id = /\/org-units\/([^/]+)\/settings$/.exec(request.path)?.[1] ?? 'root';

        return attempt === 1
          ? jsonResponse(500, { error: 'boom' })
          : jsonResponse(200, unitSettingsFor(id));
      },
    });

    await waitForTree();
    await userEvent.click(treeButton('moonic'));

    expect(await screen.findByText('讀不到這個單位的設定。')).toBeTruthy();
    expect(document.querySelectorAll('[data-unit-setting]').length).toBe(0);

    await userEvent.click(screen.getByRole('button', { name: '重試' }));

    await waitFor(() => {
      expect(document.querySelectorAll('[data-unit-setting]').length).toBe(4);
    });
  });
});

describe('未保存就離開', () => {
  it('單位欄位有未儲存修改時，登出要先問', async () => {
    const api = openOrg();

    await waitForTree();
    await userEvent.click(treeButton('moonic'));

    await userEvent.type(screen.getByLabelText('名稱'), '改一改');
    await userEvent.click(screen.getByRole('button', { name: '登出' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('有未儲存的修改')).toBeTruthy();
    expect(within(dialog).getByText('未儲存：1 項')).toBeTruthy();

    await userEvent.click(within(dialog).getByRole('button', { name: '繼續編輯' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.count('logout')).toBe(0);
  });

  it('新增表單有輸入也算未儲存', async () => {
    const api = openOrg();

    await waitForTree();
    await userEvent.click(screen.getByRole('button', { name: '新增單位' }));
    await userEvent.type(screen.getByLabelText('名稱'), '打了一半');
    await userEvent.click(screen.getByRole('button', { name: '登出' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('未儲存：1 項')).toBeTruthy();

    await userEvent.click(within(dialog).getByRole('button', { name: '放棄修改' }));

    await waitFor(() => {
      expect(api.count('logout')).toBe(1);
    });
  });
});
