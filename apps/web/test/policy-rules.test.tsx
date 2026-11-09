// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import './helpers/rtl';
import { App } from '../src/App';
import {
  installFakeApi,
  jsonResponse,
  resetBrowserState,
  type FakeHandlers,
  type RecordedRequest,
} from './helpers/fake-api';

/**
 * 政策規則頁（issue #162／F-05）。
 *
 * 一律用真 `App` 同真路由 `/#/admin/policy`，唔直接渲染畫面元件：
 * 「管理區第五頁係咪真係到得了、網址對唔對」都係驗收一部分。
 *
 * 呢張最緊要係「唔好講大話」：空清單要講明沒有規則＝全部要批准；
 * 讀取失敗／401／403／網絡失敗唔可以偽裝成空清單；422 reasons 原樣顯示；
 * 每次寫入成功後重新 GET，畫面以伺服器重新讀取結果為準（後端無版本欄位）。
 */

const BOSS = { id: 'u1', email: 'boss@example.com', displayName: '陳老闆', role: 'owner' };

const UNIT_A = '11111111-1111-4111-8111-111111111111';
const UNIT_B = '22222222-2222-4222-8222-222222222222';
const UNKNOWN_UNIT = '33333333-3333-4333-8333-333333333333';

const UNITS = [
  {
    id: UNIT_A,
    name: '會計部',
    type: 'division',
    isRoot: false,
    country: null,
    currency: null,
    timezone: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  },
  {
    id: UNIT_B,
    name: '採購部',
    type: 'division',
    isRoot: false,
    country: null,
    currency: null,
    timezone: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  },
];

type Rule = {
  id: string;
  domain: string;
  condition: { all: { field: string; op: string; value: unknown; currency?: string }[] };
  action: string;
  priority: number;
  enabled: boolean;
  note: string | null;
  orgUnitId: string | null;
  createdAt: string;
  updatedAt: string;
};

function rule(over: Partial<Rule> = {}): Rule {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    domain: 'payment',
    condition: { all: [{ field: 'amount', op: 'lte', value: 5000, currency: 'HKD' }] },
    action: 'require_approval',
    priority: 10,
    enabled: true,
    note: null,
    orgUnitId: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-02T00:00:00.000Z',
    ...over,
  };
}

function openPolicy(handlers: FakeHandlers = {}) {
  window.history.replaceState(null, '', '/#/admin/policy');

  const api = installFakeApi({
    state: () =>
      jsonResponse(200, { setupRequired: false, signedIn: true, user: BOSS }),
    settings: () => jsonResponse(200, { settings: [] }),
    modules: () => jsonResponse(200, { modules: [] }),
    orgUnits: () => jsonResponse(200, { units: UNITS, edges: [] }),
    policyRules: () => jsonResponse(200, { rules: [] }),
    ...handlers,
  });

  render(<App />);

  return api;
}

function clauses(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-policy-clause]'));
}

function rows(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-policy-rule-id]'));
}

async function waitForPage(): Promise<void> {
  await waitFor(() => {
    expect(document.querySelector('[data-policy-page]')).not.toBeNull();
  });
}

async function waitForRows(count: number): Promise<void> {
  await waitFor(() => {
    expect(rows().length).toBe(count);
  });
}

/** 新增表單填到可以提交：類別、一个 eq 子句（欄位名＋值）。 */
async function fillMinimalCreate(): Promise<void> {
  await userEvent.type(screen.getByRole('textbox', { name: '類別' }), 'payment');
  const clause = clauses()[0] as HTMLElement;
  await userEvent.type(within(clause).getByRole('textbox', { name: '要比對的項目' }), 'region');
  await userEvent.type(within(clause).getByRole('textbox', { name: '要比對的值' }), 'HK');
}

afterEach(() => {
  cleanup();
  resetBrowserState();
});

describe('讀取與狀態', () => {
  it('載入中顯示「正在讀取政策規則…」，唔係空白畫面', async () => {
    openPolicy({
      policyRules: () => new Promise(() => undefined),
    });

    await waitForPage();
    expect(await screen.findByText('正在讀取政策規則…')).toBeTruthy();
    expect(screen.queryByText(/目前沒有任何規則/)).toBeNull();
  });

  it('空清單講明「沒有規則」同「需要批准」，唔渲染任何規則列，唔暗示全部放行', async () => {
    openPolicy();

    await waitForPage();
    expect(await screen.findByText(/目前沒有任何規則/)).toBeTruthy();
    const empty = document.querySelector('[data-policy-empty]') as HTMLElement;
    expect(empty.textContent).toContain('所有動作一律需要批准');
    expect(empty.textContent).toContain('這是真的沒有資料，不是畫面出錯');
    expect(rows().length).toBe(0);
    expect(screen.queryByText(/全部放行/)).toBeNull();
    expect(document.querySelector('[data-policy-empty]')).not.toBeNull();
  });

  it('有資料：次序照後端回傳，唔喺前端重排', async () => {
    const first = rule({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', domain: 'payment', priority: 10 });
    const second = rule({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', domain: 'outbound', priority: 20 });

    openPolicy({ policyRules: () => jsonResponse(200, { rules: [second, first] }) });

    await waitForPage();
    await waitForRows(2);
    expect(rows()[0]?.getAttribute('data-policy-rule-id')).toBe(second.id);
    expect(rows()[1]?.getAttribute('data-policy-rule-id')).toBe(first.id);
  });

  it('八個欄位標題全部出現', async () => {
    openPolicy({ policyRules: () => jsonResponse(200, { rules: [rule()] }) });

    await waitForPage();
    await waitForRows(1);
    for (const label of ['類別', '條件', '動作', '優先次序', '狀態', '適用範圍', '備註', '更新時間']) {
      expect(screen.getAllByRole('columnheader', { name: label }).length).toBeGreaterThan(0);
    }
  });

  it('401 顯示登入失效，唔係空清單', async () => {
    openPolicy({ policyRules: () => jsonResponse(401, { error: 'unauthenticated' }) });

    await waitForPage();
    expect(await screen.findByText('登入已經失效，請重新登入。')).toBeTruthy();
    expect(screen.queryByText(/目前沒有任何規則/)).toBeNull();
    expect(rows().length).toBe(0);
  });

  it('403 顯示老闆先可以管理，唔係空清單', async () => {
    openPolicy({ policyRules: () => jsonResponse(403, { error: 'forbidden' }) });

    await waitForPage();
    expect(await screen.findByText('只有老闆可以管理政策規則。')).toBeTruthy();
    expect(screen.queryByText(/目前沒有任何規則/)).toBeNull();
    expect(rows().length).toBe(0);
  });

  it('讀取失敗顯示原因同重試，唔偽裝成空清單；重試成功後顯示資料', async () => {
    let attempt = 0;

    openPolicy({
      policyRules: () => {
        attempt += 1;

        return attempt === 1
          ? jsonResponse(500, { error: 'boom', reasons: ['資料庫暫時讀不到'] })
          : jsonResponse(200, { rules: [rule()] });
      },
    });

    await waitForPage();
    expect(await screen.findByText('讀不到政策規則。')).toBeTruthy();
    expect(screen.getByText('資料庫暫時讀不到')).toBeTruthy();
    expect(screen.queryByText(/目前沒有任何規則/)).toBeNull();
    expect(rows().length).toBe(0);

    await userEvent.click(screen.getByRole('button', { name: '重試' }));

    await waitForRows(1);
    expect(screen.queryByText('讀不到政策規則。')).toBeNull();
  });

  it('網絡失敗用 error.network，唔係空清單', async () => {
    openPolicy({
      policyRules: () => {
        throw new Error('offline');
      },
    });

    await waitForPage();
    expect(await screen.findByText('錯誤：無法連線到伺服器，請稍後再試。')).toBeTruthy();
    expect(screen.queryByText(/目前沒有任何規則/)).toBeNull();
    expect(rows().length).toBe(0);
  });
});

describe('條件摘要同適用範圍', () => {
  it('條件摘要四種運算子都係人話，唔顯示 raw JSON', async () => {
    const four = rule({
      condition: {
        all: [
          { field: 'amount', op: 'lte', value: 5000, currency: 'HKD' },
          { field: 'amount', op: 'gte', value: 100, currency: 'HKD' },
          { field: 'region', op: 'eq', value: 'HK' },
          { field: 'channel', op: 'in', value: ['web', 'app'] },
        ],
      },
    });

    openPolicy({ policyRules: () => jsonResponse(200, { rules: [four] }) });

    await waitForPage();
    await waitForRows(1);
    const row = rows()[0] as HTMLElement;
    const text = within(row).getByText(/不高於/).textContent ?? '';
    expect(text).toContain('amount 不高於 HKD 5000');
    expect(text).toContain('amount 不低於 HKD 100');
    expect(text).toContain('region 等於 HK');
    expect(text).toContain('channel 屬於其中之一：web、app');
    expect(within(row).queryByText(/\{"all"/)).toBeNull();
  });

  it('適用範圍：orgUnitId 為 null 顯示整間公司', async () => {
    openPolicy({ policyRules: () => jsonResponse(200, { rules: [rule({ orgUnitId: null })] }) });

    await waitForPage();
    await waitForRows(1);
    expect(within(rows()[0] as HTMLElement).getByText('整間公司')).toBeTruthy();
  });

  it('適用範圍：指定單位讀到名就顯示單位名', async () => {
    openPolicy({ policyRules: () => jsonResponse(200, { rules: [rule({ orgUnitId: UNIT_A })] }) });

    await waitForPage();
    await waitForRows(1);
    expect(within(rows()[0] as HTMLElement).getByText('指定單位：會計部')).toBeTruthy();
  });

  it('適用範圍：GET /org-units 失敗時顯示單位 id 並如實講明名稱未能讀取', async () => {
    openPolicy({
      orgUnits: () => jsonResponse(500, { error: 'boom' }),
      policyRules: () => jsonResponse(200, { rules: [rule({ orgUnitId: UNIT_A })] }),
    });

    await waitForPage();
    await waitForRows(1);
    const text = within(rows()[0] as HTMLElement).getByText(/單位名稱未能讀取/).textContent ?? '';
    expect(text).toContain(UNIT_A);
    expect(text).toContain('單位名稱未能讀取');
  });

  it('適用範圍：單位 id 唔喺清單內時顯示 id 並如實講明名稱未能讀取', async () => {
    openPolicy({
      policyRules: () => jsonResponse(200, { rules: [rule({ orgUnitId: UNKNOWN_UNIT })] }),
    });

    await waitForPage();
    await waitForRows(1);
    const text = within(rows()[0] as HTMLElement).getByText(/單位名稱未能讀取/).textContent ?? '';
    expect(text).toContain(UNKNOWN_UNIT);
  });
});

describe('新增', () => {
  it('新增成功後重新 GET，畫面以重新讀取結果為準，成功只講「已建立規則。」', async () => {
    const created = rule({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', domain: 'payment' });
    let getCount = 0;
    let postBody: string | null = null;

    const api = openPolicy({
      policyRules: () => {
        getCount += 1;

        return jsonResponse(200, { rules: getCount === 1 ? [] : [created] });
      },
      policyRuleCreate: (request: RecordedRequest) => {
        postBody = request.body;

        return jsonResponse(201, { rule: created });
      },
    });

    await waitForPage();
    expect(await screen.findByText(/目前沒有任何規則/)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: '新增規則' }));
    await fillMinimalCreate();
    await userEvent.click(screen.getByRole('button', { name: '儲存' }));

    await waitForRows(1);
    expect(getCount).toBeGreaterThanOrEqual(2);
    expect(api.count('policyRuleCreate')).toBe(1);
    expect(await screen.findByText('已建立規則。')).toBeTruthy();
    expect(screen.queryByText(/已生效/)).toBeNull();

    // 驗收 9：POST 只含後端認得嘅七個欄位，無未知欄位。
    const parsed = JSON.parse(postBody ?? '{}') as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(
      ['action', 'condition', 'domain', 'enabled', 'note', 'orgUnitId', 'priority'].sort(),
    );
    expect(parsed['domain']).toBe('payment');
    expect(parsed['condition']).toEqual({
      all: [{ field: 'region', op: 'eq', value: 'HK' }],
    });
  });

  it('新增 422 原樣顯示 reasons，保留輸入，唔顯示成功', async () => {
    openPolicy({
      policyRuleCreate: () =>
        jsonResponse(422, {
          error: 'invalid_policy_rule',
          reasons: ['domain 必須是小寫字母開頭、只用小寫英數與底線的非空字串'],
        }),
    });

    await waitForPage();
    await userEvent.click(screen.getByRole('button', { name: '新增規則' }));
    const domain = screen.getByRole('textbox', { name: '類別' });
    await userEvent.type(domain, 'BadDomain');
    const clause = clauses()[0] as HTMLElement;
    await userEvent.type(within(clause).getByRole('textbox', { name: '要比對的項目' }), 'region');
    await userEvent.type(within(clause).getByRole('textbox', { name: '要比對的值' }), 'HK');
    await userEvent.click(screen.getByRole('button', { name: '儲存' }));

    expect(
      await screen.findByText('domain 必須是小寫字母開頭、只用小寫英數與底線的非空字串'),
    ).toBeTruthy();
    expect((screen.getByRole('textbox', { name: '類別' }) as HTMLInputElement).value).toBe('BadDomain');
    expect(screen.queryByText('已建立規則。')).toBeNull();
    expect(screen.queryByText('已儲存')).toBeNull();
  });

  it('lte／gte 缺貨幣唔提交，顯示金額比較一定要填貨幣', async () => {
    const api = openPolicy();

    await waitForPage();
    await userEvent.click(screen.getByRole('button', { name: '新增規則' }));
    await userEvent.type(screen.getByRole('textbox', { name: '類別' }), 'payment');
    const clause = clauses()[0] as HTMLElement;
    await userEvent.type(within(clause).getByRole('textbox', { name: '要比對的項目' }), 'amount');
    await userEvent.selectOptions(
      within(clause).getByRole('combobox', { name: '比較方式' }),
      'lte',
    );
    await userEvent.type(within(clause).getByRole('textbox', { name: '要比對的值' }), '5000');
    await userEvent.click(screen.getByRole('button', { name: '儲存' }));

    expect(api.count('policyRuleCreate')).toBe(0);
    expect((await screen.findAllByText('金額比較一定要填貨幣。')).length).toBeGreaterThan(0);
  });

  it('條件至少一個子句：移除晒就唔提交', async () => {
    const api = openPolicy();

    await waitForPage();
    await userEvent.click(screen.getByRole('button', { name: '新增規則' }));
    await userEvent.type(screen.getByRole('textbox', { name: '類別' }), 'payment');
    await userEvent.click(screen.getAllByRole('button', { name: '移除子句' })[0] as HTMLElement);
    await userEvent.click(screen.getByRole('button', { name: '儲存' }));

    expect(api.count('policyRuleCreate')).toBe(0);
    expect((await screen.findAllByText('條件至少要有一個子句。')).length).toBeGreaterThan(0);
  });

  it('提交中防重送：連按兩次只送一次 POST', async () => {
    let release: (value: ReturnType<typeof jsonResponse>) => void = () => undefined;
    const pending = new Promise<ReturnType<typeof jsonResponse>>((resolvePending) => {
      release = resolvePending;
    });

    const api = openPolicy({ policyRuleCreate: () => pending });

    await waitForPage();
    await userEvent.click(screen.getByRole('button', { name: '新增規則' }));
    await fillMinimalCreate();
    const save = screen.getByRole('button', { name: '儲存' });
    await userEvent.click(save);
    await userEvent.click(save);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '儲存中…' })).toBeTruthy();
    });
    expect(api.count('policyRuleCreate')).toBe(1);

    release(jsonResponse(201, { rule: rule() }));
    await waitFor(() => {
      expect(screen.getByText('已建立規則。')).toBeTruthy();
    });
  });
});

describe('編輯／停用／啟用／刪除', () => {
  it('編輯只送改動欄位，成功只講「已儲存」', async () => {
    let patchBody: string | null = null;
    const api = openPolicy({
      policyRules: () => jsonResponse(200, { rules: [rule()] }),
      policyRulePatch: (request: RecordedRequest) => {
        patchBody = request.body;

        return jsonResponse(200, { rule: rule({ note: '由老闆修改' }) });
      },
    });

    await waitForPage();
    await waitForRows(1);
    await userEvent.click(within(rows()[0] as HTMLElement).getByRole('button', { name: '編輯' }));
    await userEvent.type(screen.getByRole('textbox', { name: '備註' }), '由老闆修改');
    await userEvent.click(screen.getByRole('button', { name: '儲存' }));

    await waitFor(() => {
      expect(api.count('policyRulePatch')).toBe(1);
    });
    expect(Object.keys(JSON.parse(patchBody ?? '{}') as Record<string, unknown>)).toEqual(['note']);
    expect(await screen.findByText('已儲存')).toBeTruthy();
    expect(screen.queryByText(/已生效/)).toBeNull();
  });

  it('停用只送 enabled:false，唔開表單', async () => {
    let patchBody: string | null = null;
    const api = openPolicy({
      policyRules: () => jsonResponse(200, { rules: [rule({ enabled: true })] }),
      policyRulePatch: (request: RecordedRequest) => {
        patchBody = request.body;

        return jsonResponse(200, { rule: rule({ enabled: false }) });
      },
    });

    await waitForPage();
    await waitForRows(1);
    await userEvent.click(within(rows()[0] as HTMLElement).getByRole('button', { name: '停用' }));

    await waitFor(() => {
      expect(api.count('policyRulePatch')).toBe(1);
    });
    expect(JSON.parse(patchBody ?? '{}')).toEqual({ enabled: false });
    expect(await screen.findByText('已停用')).toBeTruthy();
  });

  it('啟用只送 enabled:true', async () => {
    let patchBody: string | null = null;
    const api = openPolicy({
      policyRules: () => jsonResponse(200, { rules: [rule({ enabled: false })] }),
      policyRulePatch: (request: RecordedRequest) => {
        patchBody = request.body;

        return jsonResponse(200, { rule: rule({ enabled: true }) });
      },
    });

    await waitForPage();
    await waitForRows(1);
    await userEvent.click(within(rows()[0] as HTMLElement).getByRole('button', { name: '啟用' }));

    await waitFor(() => {
      expect(api.count('policyRulePatch')).toBe(1);
    });
    expect(JSON.parse(patchBody ?? '{}')).toEqual({ enabled: true });
    expect(await screen.findByText('已啟用')).toBeTruthy();
  });

  it('刪除要確認（講明軟刪除、資料列保留），確認後送 DELETE 並重新讀取', async () => {
    let getCount = 0;
    const api = openPolicy({
      policyRules: () => {
        getCount += 1;

        return jsonResponse(200, { rules: getCount === 1 ? [rule()] : [] });
      },
      policyRuleDelete: () => jsonResponse(204, {}),
    });

    await waitForPage();
    await waitForRows(1);
    await userEvent.click(within(rows()[0] as HTMLElement).getByRole('button', { name: '刪除' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('刪除規則')).toBeTruthy();
    expect(within(dialog).getByText('這是軟刪除：規則會從列表消失，但資料列會保留。')).toBeTruthy();

    const before = api.count('policyRuleDelete');
    await userEvent.click(within(dialog).getByRole('button', { name: '確認刪除' }));

    await waitFor(() => {
      expect(api.count('policyRuleDelete')).toBe(before + 1);
    });
    await waitForRows(0);
    expect(getCount).toBeGreaterThanOrEqual(2);
    expect(await screen.findByText('已刪除')).toBeTruthy();
  });

  it('404 policy_rule_not_found 顯示規則已不存在並重新讀取', async () => {
    let getCount = 0;
    const api = openPolicy({
      policyRules: () => {
        getCount += 1;

        return jsonResponse(200, { rules: [rule()] });
      },
      policyRuleDelete: () =>
        jsonResponse(404, { error: 'policy_rule_not_found', id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }),
    });

    await waitForPage();
    await waitForRows(1);
    await userEvent.click(within(rows()[0] as HTMLElement).getByRole('button', { name: '刪除' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: '確認刪除' }));

    expect(await screen.findByText('這條規則已不存在，請重新載入。')).toBeTruthy();
    await waitFor(() => {
      expect(getCount).toBeGreaterThanOrEqual(2);
    });
    expect(api.count('policyRuleDelete')).toBe(1);
  });
});

describe('未保存攔截、無 localStorage、靜態檢查', () => {
  it('表單未保存就登出，沿用管理區攔截', async () => {
    const api = openPolicy();

    await waitForPage();
    await userEvent.click(screen.getByRole('button', { name: '新增規則' }));
    await userEvent.click(screen.getByRole('button', { name: '登出' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('有未儲存的修改')).toBeTruthy();
    expect(api.count('logout')).toBe(0);

    await userEvent.click(within(dialog).getByRole('button', { name: '繼續編輯' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('政策規則頁唔寫 localStorage', async () => {
    window.localStorage.clear();
    openPolicy({ policyRules: () => jsonResponse(200, { rules: [rule()] }) });

    await waitForPage();
    await waitForRows(1);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('靜態檢查：apps/web/src 內無 policy-rules.json 引用，亦無預設／示例規則陣列', () => {
    const srcRoot = resolve(process.cwd(), 'apps/web/src');

    function collect(dir: string): string[] {
      const out: string[] = [];

      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);

        if (statSync(full).isDirectory()) {
          out.push(...collect(full));
        } else if (/\.(ts|tsx)$/.test(entry)) {
          out.push(full);
        }
      }

      return out;
    }

    const sources = collect(srcRoot);
    const withSeedRef = sources.filter((file) => readFileSync(file, 'utf8').includes('policy-rules.json'));
    expect(withSeedRef).toEqual([]);

    const screenFile = join(srcRoot, 'admin/PolicyRulesScreen.tsx');
    const screenSource = readFileSync(screenFile, 'utf8');
    // 硬編一條示例規則會係一個陣列入面嘅 { domain: … }、寫死嘅 domain 值，
    // 或者一個叫 RULES 嘅常數陣列；表單空白初值（domain: ''）同識別字唔算。
    expect(/\[\s*\{\s*domain\s*:/.test(screenSource)).toBe(false);
    expect(/domain:\s*['"][a-z][a-z0-9_]*['"]/.test(screenSource)).toBe(false);
    expect(/(DEFAULT|EXAMPLE|SAMPLE|MOCK|SEED|PRESET)_RULES/.test(screenSource)).toBe(false);
  });
});
