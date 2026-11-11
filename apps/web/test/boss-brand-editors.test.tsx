// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import './helpers/rtl';
import { App } from '../src/App';
import { resetDirectoryCache } from '../src/frame/useDirectory';
import { installFakeApi, jsonResponse, resetBrowserState, type FakeHandlers } from './helpers/fake-api';

/**
 * 品牌級編輯權（issue #32 第 11、12 點）。
 *
 * 這一段要證明四件事：
 *
 *   1. 授予是 **(品牌, 人)** 一對的事，不是職位：勾選之後送的是那一條路，
 *      而名單上沒有老闆 —— 他永遠可以改，寫進來只會出現講不通的狀態。
 *   2. 勾選即儲存（PUT）／取消即收回（DELETE），不是按一個「儲存」。
 *   3. 失敗要講真原因，而且勾選要回到真正的事實，不是留在用戶按的那個。
 *   4. 一個品牌都未有時，講明冇人可以獲授權，不是一個空表。
 *
 * 後端是否真的擋住沒有編輯權的人，另有 `brand-custom-pages.integration.test.ts`
 * （員工四條寫入全 403，而且資料未變）。
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
  department: 'design',
  mustChangePassword: false,
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

const BRANDS = [
  { id: 'b-moonic', code: 'moonic', name: 'Moonic' },
  { id: 'b-subtle', code: 'subtle', name: 'Subtle Inno' },
];

const EDITOR = {
  userId: WAI.id,
  displayName: WAI.displayName,
  email: WAI.email,
  grantedAt: '2026-11-12T09:00:00.000Z',
};

function openMembers(options: {
  brands?: typeof BRANDS;
  editors?: (typeof EDITOR)[];
  overrides?: FakeHandlers;
} = {}) {
  window.history.replaceState(null, '', '/#/boss/people/members');

  const api = installFakeApi({
    state: () => jsonResponse(200, { setupRequired: false, signedIn: true, user: BOSS }),
    modules: () => jsonResponse(200, { modules: [DESIGN] }),
    staff: () => jsonResponse(200, { staff: [WAI], total: 1 }),
    brands: () => jsonResponse(200, { items: options.brands ?? BRANDS }),
    brandFocus: () => jsonResponse(200, { brandId: null }),
    brandEditors: () => jsonResponse(200, { items: options.editors ?? [] }),
    ...options.overrides,
  });

  render(<App />);

  return api;
}

async function checkbox(): Promise<HTMLInputElement> {
  await waitFor(() => {
    expect(document.querySelector(`[data-brand-editor="${WAI.id}"]`)).not.toBeNull();
  });

  return document.querySelector(`[data-brand-editor="${WAI.id}"]`) as HTMLInputElement;
}

afterEach(() => {
  cleanup();
  resetBrowserState();
  resetDirectoryCache();
});

describe('誰可以改這個品牌的頁', () => {
  it('列出人員，未授予的人未勾選；老闆不在名單裡，並講明原因', async () => {
    openMembers();

    const box = await checkbox();

    expect(box.checked).toBe(false);
    const panel = document.querySelector('[data-brand-editors]') as HTMLElement;
    expect(within(panel).getByText('林慧')).toBeTruthy();
    // 老闆永遠可以改，所以不在這張表上 —— 這一句要出現在畫面上。
    expect(screen.getByText('你（老闆）永遠可以改所有品牌，所以你不在名單裡。')).toBeTruthy();
  });

  it('勾選：即刻送 PUT，成功之後講明已授予', async () => {
    const api = openMembers({
      overrides: {
        brandEditorGrant: () => jsonResponse(200, { items: [EDITOR] }),
      },
    });

    const box = await checkbox();
    await userEvent.click(box);

    await waitFor(() => {
      expect(api.count('brandEditorGrant')).toBe(1);
    });

    expect(api.calls.some((call) => call.path.endsWith(`/editors/${WAI.id}`))).toBe(true);
    expect(await screen.findByText('已讓 林慧 可以改這個品牌的頁。')).toBeTruthy();
    await waitFor(() => {
      expect((document.querySelector(`[data-brand-editor="${WAI.id}"]`) as HTMLInputElement).checked).toBe(true);
    });
  });

  it('已授予的人：取消勾選送 DELETE', async () => {
    const api = openMembers({
      editors: [EDITOR],
      overrides: {
        brandEditorRevoke: () => jsonResponse(200, { items: [] }),
      },
    });

    const box = await checkbox();

    await waitFor(() => {
      expect(box.checked).toBe(true);
    });

    await userEvent.click(box);

    await waitFor(() => {
      expect(api.count('brandEditorRevoke')).toBe(1);
    });

    expect(await screen.findByText('已收回 林慧 對這個品牌的編輯權。')).toBeTruthy();
  });

  it('失敗：講明做唔到，勾選回到真正的事實', async () => {
    openMembers({
      overrides: {
        brandEditorGrant: () => jsonResponse(500, { error: 'boom' }),
      },
    });

    const box = await checkbox();
    await userEvent.click(box);

    expect(await screen.findByText('做唔到，請再試一次。')).toBeTruthy();
    expect((document.querySelector(`[data-brand-editor="${WAI.id}"]`) as HTMLInputElement).checked).toBe(
      false,
    );
  });

  it('一個品牌都未有：講明冇人可以獲授權，不畫一個空表', async () => {
    openMembers({ brands: [] });

    expect(
      await screen.findByText('這間公司還未有品牌，所以沒有人可以獲授權。'),
    ).toBeTruthy();
    expect(document.querySelector(`[data-brand-editor="${WAI.id}"]`)).toBeNull();
  });

  it('切換品牌：重新讀那個品牌的名單，不會沿用上一個品牌的勾選', async () => {
    openMembers({
      overrides: {
        brandEditors: (request) =>
          jsonResponse(200, {
            items: request.path.includes('b-moonic') ? [EDITOR] : [],
          }),
      },
    });

    const box = await checkbox();

    await waitFor(() => {
      expect(box.checked).toBe(true);
    });

    await userEvent.selectOptions(screen.getByLabelText('品牌'), 'b-subtle');

    await waitFor(() => {
      expect(
        (document.querySelector(`[data-brand-editor="${WAI.id}"]`) as HTMLInputElement).checked,
      ).toBe(false);
    });
  });
});
