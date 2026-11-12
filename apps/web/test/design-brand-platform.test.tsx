// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import './helpers/rtl';
import { App } from '../src/App';
import { resetDirectoryCache } from '../src/frame/useDirectory';
import { installFakeApi, jsonResponse, resetBrowserState, type FakeHandlers } from './helpers/fake-api';

/**
 * 平台頁與立場句選擇（issue #61）。
 *
 * 四件事在畫面上看得到：
 *   1. 立場句自己一屏，不是七個欄位之一；未選就講未選。
 *   2. 定位六格、價值、三檢分開畫，三檢缺證據標「缺」。
 *   3. 立場對話框：三個候選連理由，可以自己寫一句，確定之後立場換了。
 *   4. 缺證據可以當場建立 Need（判斷型，只有老闆有那個鍵）。
 */

const BOSS = {
  id: 'u-boss',
  email: 'boss@example.com',
  displayName: '陳老闆',
  role: 'owner',
  department: null,
  mustChangePassword: false,
};

const DESIGNER = {
  id: 'u-designer',
  email: 'designer@example.com',
  displayName: '設計師',
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

const VERSION = {
  id: 'v1',
  versionNo: 1,
  createdAt: '2026-11-11T10:00:00.000Z',
  note: null,
  preview: '',
  policyVersionNo: 1,
};

const PAGE = {
  id: 'p-platform',
  brandId: 'b-moonic',
  kind: 'fixed',
  key: 'platform',
  name: '平台',
  brief: null,
  sortOrder: 20,
  group: 'identity',
  current: VERSION,
};

const CONTENT = JSON.stringify({
  stance: '',
  positioning: {
    for: '想被認真看待的人',
    who: '一間做臨床與品牌的公司',
    category: '設計研究',
    benefit: '一句可以用的定位',
    unlike: '同時做臨床與品牌',
    because: '二〇二四年起做了十二個品牌',
  },
  purpose: '令專業講得清',
  values: [{ name: '先專業', do: '先寫證據', dont: '先寫形容詞' }],
  traits: ['慢', '準'],
  essence: '一句頂十句',
  audience: '老闆與設計師',
  references: ['Kinfolk：留白'],
  stance_candidates: [
    { text: '先白，後墨，再藍。', reason: '白是底，墨是字，藍只標一件事' },
    { text: '少即是多。', reason: '減法比加法難' },
    { text: '只做一件事。', reason: '專注才有辨識' },
  ],
  tests: { real: '二〇二四年幫三家診所改過預約流程', relevant: '', unique: '' },
});

function open(options: { user?: typeof BOSS | typeof DESIGNER; overrides?: FakeHandlers } = {}) {
  window.history.replaceState(null, '', '/#/design/brand/platform');

  const api = installFakeApi({
    state: () => jsonResponse(200, { setupRequired: false, signedIn: true, user: options.user ?? BOSS }),
    modules: () => jsonResponse(200, { modules: [DESIGN] }),
    brands: () => jsonResponse(200, { items: BRANDS }),
    brandFocus: () => jsonResponse(200, { brandId: 'b-moonic' }),
    brandPages: () => jsonResponse(200, { items: [PAGE], canEdit: true }),
    brandPage: () =>
      jsonResponse(200, { page: PAGE, versions: [], current: { ...VERSION, content: CONTENT } }),
    ...options.overrides,
  });

  render(<App />);

  return api;
}

afterEach(() => {
  cleanup();
  resetBrowserState();
  resetDirectoryCache();
});

describe('平台頁的形狀', () => {
  it('立場句自己一屏；未選就講未選，不是留白', async () => {
    open();

    await waitFor(() => {
      expect(screen.getByText('未選立場句。')).toBeTruthy();
    });

    expect(document.querySelector('[data-brand-platform-stance]')).not.toBeNull();
  });

  it('定位六格、價值、三檢分開畫；缺證據標「缺」', async () => {
    open();

    await waitFor(() => {
      expect(document.querySelector('[data-brand-platform="ready"]')).not.toBeNull();
    });

    const forField = document.querySelector('[data-brand-platform-field="for"]') as HTMLInputElement;
    expect(forField.value).toBe('想被認真看待的人');

    expect(document.querySelector('[data-brand-platform-test="relevant"]')?.getAttribute('data-state')).toBe('missing');
    expect(document.querySelector('[data-brand-platform-test="real"]')?.getAttribute('data-state')).toBe('ok');
    expect(screen.getAllByText(/缺$/).length).toBeGreaterThanOrEqual(2);
  });

  it('老闆：缺證據有「建立 Need」；設計師：沒有那個鍵', async () => {
    open();

    await waitFor(() => {
      expect(document.querySelector('[data-brand-platform="ready"]')).not.toBeNull();
    });

    await userEvent.click(screen.getByRole('button', { name: '選一句立場' }));

    // 對話框內三檢小卡：缺的兩項有建立鍵（老闆）。
    expect(document.querySelectorAll('[data-stance-need]')).toHaveLength(2);

    cleanup();
    resetBrowserState();
    resetDirectoryCache();

    open({ user: DESIGNER });

    await waitFor(() => {
      expect(document.querySelector('[data-brand-platform="ready"]')).not.toBeNull();
    });

    await userEvent.click(screen.getByRole('button', { name: '選一句立場' }));

    expect(document.querySelectorAll('[data-stance-need]')).toHaveLength(0);
  });
});

describe('立場句選擇', () => {
  it('三個候選連理由，按落去換立場', async () => {
    open();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '選一句立場' })).toBeTruthy();
    });

    await userEvent.click(screen.getByRole('button', { name: '選一句立場' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('選一句，作為這個品牌的立場');
    expect(document.querySelectorAll('[data-stance-candidate]')).toHaveLength(3);
    expect(dialog.textContent).toContain('白是底，墨是字，藍只標一件事');

    await userEvent.click(screen.getByText('少即是多。'));

    await waitFor(() => {
      expect(document.querySelector('[data-stance-candidate="2"]')?.getAttribute('data-picked')).toBe('true');
    });

    await userEvent.click(screen.getByRole('button', { name: '確定' }));

    await waitFor(() => {
      expect(document.querySelector('[data-brand-platform-stance-text]')?.textContent).toBe('少即是多。');
    });
  });

  it('自己寫一句：蓋過已選的候選', async () => {
    open();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '選一句立場' })).toBeTruthy();
    });

    await userEvent.click(screen.getByRole('button', { name: '選一句立場' }));

    const own = document.querySelector('[data-stance-own]') as HTMLInputElement;
    await userEvent.type(own, '先做人，後做圖。');
    await userEvent.click(screen.getByRole('button', { name: '確定' }));

    await waitFor(() => {
      expect(document.querySelector('[data-brand-platform-stance-text]')?.textContent).toBe('先做人，後做圖。');
    });
  });

  it('缺證據建立 Need：送出的是那一項，並貼上編號', async () => {
    const api = open({
      overrides: {
        brandGapNeed: () => jsonResponse(201, { need: { id: 'n-1', code: 'COS-INTL-001' }, created: true }),
      },
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '選一句立場' })).toBeTruthy();
    });

    await userEvent.click(screen.getByRole('button', { name: '選一句立場' }));
    await userEvent.click(screen.getAllByRole('button', { name: '建立 Need' })[0] as HTMLElement);

    await waitFor(() => {
      expect(api.count('brandGapNeed')).toBe(1);
    });

    const call = api.calls.find((item) => item.path.includes('/gaps/needs'));
    expect(call?.body).toContain('tests.relevant');
    expect(screen.getByText('已建立 COS-INTL-001，交回老闆。')).toBeTruthy();
  });
});
