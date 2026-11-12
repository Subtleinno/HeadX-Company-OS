// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import './helpers/rtl';
import { App } from '../src/App';
import { resetDirectoryCache } from '../src/frame/useDirectory';
import {
  installFakeApi,
  jsonResponse,
  resetBrowserState,
  type FakeHandlers,
} from './helpers/fake-api';

/**
 * 每頁頂部的「這一頁」（issue #53）。
 *
 * 要證明四件事：
 *   1. 三段都在，而且第一屏就有 —— 這正是老闆說「我係UI度唔係好見到D乜」的那一段。
 *   2. 策略只有老闆見到編輯鍵。員工見到同一份正文，但見到的是「只有老闆可以改」。
 *   3. 儲存策略打的是 `/api/policy/:slot/versions` —— 與 Boss Portal 同一條路，
 *      不是另一個副本。
 *   4. 缺口數字由表身上報：表身報 6，面板就寫 6；表身報 null，面板就不講數字。
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
  id: 'u-wai',
  email: 'wai@example.com',
  displayName: '林慧',
  role: 'staff',
  department: 'design',
  mustChangePassword: false,
};

const BRANDS = [{ id: 'b-moonic', code: 'moonic', name: 'Moonic' }];

const DESIGN = {
  id: 'design',
  title: 'Design',
  kind: 'department',
  department: 'design',
  order: 10,
  available: true,
  route: '/design',
};

/** 五張固定頁，只有色彩頁有版本 —— 其餘四頁就是要驗「未有版本」那一句。 */
const PAGES = [
  { id: 'p-home', kind: 'fixed', key: 'home', name: '品牌主頁', brief: null, sortOrder: 10, current: null },
  { id: 'p-logo', kind: 'fixed', key: 'logo', name: '標誌', brief: null, sortOrder: 20, current: null },
  { id: 'p-color', kind: 'fixed', key: 'color', name: '色彩', brief: null, sortOrder: 30, current: null },
  { id: 'p-type', kind: 'fixed', key: 'type', name: '字體', brief: null, sortOrder: 40, current: null },
  { id: 'p-tone', kind: 'fixed', key: 'tone', name: '語氣', brief: null, sortOrder: 50, current: null },
].map((page) => ({ ...page, brandId: 'b-moonic' }));

const COLOR_V3 = {
  id: 'v3',
  versionNo: 3,
  createdAt: '2026-11-12T02:20:00.000Z',
  note: null,
  preview: '九個角色',
  policyVersionNo: 3,
};

const COLOR_POLICY = {
  id: 'pv-color-3',
  versionNo: 3,
  createdAt: '2026-11-11T09:00:00.000Z',
  note: null,
  preview: '每一個色都要有角色。',
  content: '每一個色都要有角色。分品牌色、閱讀色、功能色，不准混用。',
};

const POLICY_SLOTS = [
  { slot: 'home', current: null, versions: [] },
  { slot: 'logo', current: null, versions: [] },
  { slot: 'color', current: COLOR_POLICY, versions: [COLOR_POLICY] },
  { slot: 'type', current: null, versions: [] },
  { slot: 'tone', current: null, versions: [] },
  { slot: 'custom', current: null, versions: [] },
];

function colorDetail(current: unknown = COLOR_V3) {
  return {
    page: PAGES.find((page) => page.key === 'color'),
    versions: current === null ? [] : [current],
    current:
      current === null
        ? null
        : {
            ...(current as typeof COLOR_V3),
            // 空表：#62 之後缺口數只數「有規定的」—— 四個必要角色（各缺一項）
            // 加上內文配對與大字配對各未指定，共 6 項。功能色未定不算缺。
            content: JSON.stringify({ roles: [], pairs: { allowed: [], forbidden: [] } }),
          },
  };
}

function openColor(
  user: typeof BOSS | typeof WAI,
  overrides: FakeHandlers = {},
  current: unknown = COLOR_V3,
): ReturnType<typeof installFakeApi> {
  window.history.replaceState(null, '', '/#/design/brand/color');

  const api = installFakeApi({
    state: () => jsonResponse(200, { setupRequired: false, signedIn: true, user }),
    modules: () => jsonResponse(200, { modules: [DESIGN] }),
    brands: () => jsonResponse(200, { items: BRANDS }),
    brandFocus: () => jsonResponse(200, { brandId: 'b-moonic' }),
    brandPages: () => jsonResponse(200, { items: PAGES, canEdit: user.role === 'owner' }),
    brandPage: (request) => {
      const key = request.path.split('/').pop();
      const page = PAGES.find((item) => item.key === key);

      return jsonResponse(200, {
        page,
        versions: key === 'color' && current !== null ? [current] : [],
        current: key === 'color' ? colorDetail(current).current : null,
      });
    },
    policy: () => jsonResponse(200, { slots: POLICY_SLOTS }),
    ...overrides,
  });

  render(<App />);

  return api;
}

async function waitForGuide(): Promise<HTMLElement> {
  await waitFor(() => {
    expect(document.querySelector('[data-page-guide="color"]')).not.toBeNull();
  });

  return document.querySelector<HTMLElement>('[data-page-guide="color"]') as HTMLElement;
}

afterEach(() => {
  cleanup();
  resetBrowserState();
  resetDirectoryCache();
});

describe('「這一頁」面板', () => {
  it('三段都在：現況、策略、給 AI Agent', async () => {
    openColor(BOSS);
    await waitForGuide();

    expect(document.querySelector('[data-guide-section="state"]')).not.toBeNull();
    expect(document.querySelector('[data-guide-section="policy"]')).not.toBeNull();
    expect(document.querySelector('[data-guide-section="agent"]')).not.toBeNull();
  });

  it('現況第一句就是現行第幾版', async () => {
    openColor(BOSS);
    await waitForGuide();

    await waitFor(() => {
      expect(document.querySelector('[data-guide-current]')?.getAttribute('data-guide-current')).toBe(
        '3',
      );
    });
  });

  it('第一句講明這一頁用來做甚麼，不是一句通用的「這一頁是甚麼」', async () => {
    openColor(BOSS);
    await waitForGuide();

    expect(document.querySelector('.brand-guide__lead')?.textContent).toContain('每一個色的角色');
  });

  it('缺口數字由表身上報：四個必要角色加兩種配對，共六項', async () => {
    openColor(BOSS);
    await waitForGuide();

    await waitFor(() => {
      expect(document.querySelector('[data-guide-gaps]')?.getAttribute('data-guide-gaps')).toBe('6');
    });

    expect(screen.getByText('缺口 6 項，逐項在下面的表身。')).toBeTruthy();
  });

  it('未有版本時講「仲未有版本」，不畫一個假的第 0 版', async () => {
    openColor(BOSS, {}, null);
    await waitForGuide();

    expect(document.querySelector('[data-guide-current]')?.getAttribute('data-guide-current')).toBe(
      'none',
    );
    expect(screen.getByText('這一頁仲未有版本。')).toBeTruthy();
  });

  it('引用關係：色彩頁講明被標誌、字體、主頁用', async () => {
    openColor(BOSS);
    await waitForGuide();

    const usedBy = document.querySelector('[data-guide-used-by]')?.textContent ?? '';

    expect(usedBy).toContain('標誌');
    expect(usedBy).toContain('字體');
    expect(usedBy).toContain('品牌主頁');
  });

  it('老闆：見到策略正文，也有「改策略（新增一版）」', async () => {
    openColor(BOSS);
    await waitForGuide();

    await waitFor(() => {
      expect(document.querySelector('[data-guide-policy-body]')).not.toBeNull();
    });

    expect(document.querySelector('[data-guide-policy-body]')?.textContent).toContain(
      '每一個色都要有角色。',
    );
    expect(document.querySelector('[data-guide-policy-edit]')).not.toBeNull();
  });

  it('員工：同一份策略讀得到，但沒有編輯鍵，改為講「只有老闆可以改」', async () => {
    openColor(WAI);
    await waitForGuide();

    await waitFor(() => {
      expect(document.querySelector('[data-guide-policy-body]')).not.toBeNull();
    });

    expect(document.querySelector('[data-guide-policy-edit]')).toBeNull();
    expect(document.querySelector('[data-guide-policy-owner-only]')?.textContent).toContain(
      '只有老闆可以改',
    );
  });

  it('這個槽未有策略：講缺，不畫一個空的第 1 版', async () => {
    openColor(
      BOSS,
      {
        policy: () =>
          jsonResponse(200, {
            slots: POLICY_SLOTS.map((slot) =>
              slot.slot === 'color' ? { ...slot, current: null, versions: [] } : slot,
            ),
          }),
      },
    );

    await waitForGuide();

    await waitFor(() => {
      expect(document.querySelector('[data-guide-policy="none"]')).not.toBeNull();
    });
  });

  it('儲存策略：打 /api/policy/color/versions，body 就是打的那段字', async () => {
    const api = openColor(BOSS, {
      policySave: (request) => {
        const body = JSON.parse(request.body ?? '{}') as { content?: string };

        return jsonResponse(201, {
          version: {
            id: 'pv-color-4',
            versionNo: 4,
            createdAt: '2026-11-12T03:00:00.000Z',
            note: null,
            preview: '',
            content: body.content ?? '',
          },
        });
      },
    });

    await waitForGuide();

    const user = userEvent.setup();
    const edit = await screen.findByText('改策略（新增一版）');
    await user.click(edit);

    const box = document.querySelector<HTMLTextAreaElement>('[data-guide-policy-editor] textarea');
    expect(box).not.toBeNull();

    await user.clear(box as HTMLTextAreaElement);
    await user.type(box as HTMLTextAreaElement, '新的色彩標準');

    await user.click(document.querySelector('[data-guide-policy-save]') as HTMLElement);

    await waitFor(() => {
      expect(screen.getByText('已儲存策略第 4 版。')).toBeTruthy();
    });

    const saved = api.calls.filter((call) => call.path.endsWith('/policy/color/versions'));

    expect(saved.length).toBe(1);
    expect(JSON.parse(saved[0]?.body ?? '{}')).toEqual({ content: '新的色彩標準' });
  });

  it('agent 段：三件可以、兩件不准，範例路徑真的是這一頁的版本路徑', async () => {
    openColor(BOSS);
    await waitForGuide();

    expect(document.querySelectorAll('[data-guide-agent="allowed"] [data-guide-ability]').length).toBe(
      3,
    );
    expect(document.querySelectorAll('[data-guide-agent="blocked"] [data-guide-ability]').length).toBe(
      2,
    );

    const example = document.querySelector('[data-guide-agent-example]')?.textContent ?? '';

    expect(example).toContain('POST /api/brands/{brandId}/pages/color/versions');
    expect(example).toContain('content');
  });

  it('收起之後三段一齊消失，再按一次回來', async () => {
    openColor(BOSS);
    await waitForGuide();

    const user = userEvent.setup();
    await user.click(document.querySelector('[data-guide-toggle]') as HTMLElement);

    expect(document.querySelector('[data-guide-section="state"]')).toBeNull();

    await user.click(document.querySelector('[data-guide-toggle]') as HTMLElement);

    expect(document.querySelector('[data-guide-section="state"]')).not.toBeNull();
  });
});
