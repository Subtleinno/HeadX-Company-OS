// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import './helpers/rtl';
import { enterEditMode, whenEditable } from './helpers/brand-page';
import { App } from '../src/App';
import { resetDirectoryCache } from '../src/frame/useDirectory';
import { installFakeApi, jsonResponse, resetBrowserState } from './helpers/fake-api';

/**
 * 閱讀態與編輯態（v2.1，共通修正第 6 節）。
 *
 * 這一條守三件事，全部在畫面上看得到：
 *   1. 打開就是閱讀態：輸入框只讀、標籤輸入收起、沒有儲存鍵。
 *   2. 按「編輯」才有「放棄」與「儲存為新版本」。
 *   3. 「放棄」把改過的字還原，並且回到閱讀態。
 *
 * 為甚麼要單獨一條：其他品牌頁測試都要先按「編輯」才改得到，那一步要是
 * 壞了（例如按不到、按了沒有反應），其他測試會用「找不到輸入框」的姿態紅，
 * 講不出根因。這一條紅就代表根因在那裡。
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

const VERSION = {
  id: 'v1',
  versionNo: 4,
  createdAt: '2026-11-11T10:00:00.000Z',
  note: null,
  preview: '',
  policyVersionNo: 2,
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
  stance: '先是 Afterglow 白，再由 Dusk 墨定義。',
  keywords: ['安靜', '克制', '屬於你的時間'],
  essence: '把一小時，還給自己。',
  purpose: '讓忙碌的人有一個可以放慢的地方。',
  positioning: {},
  values: [],
  traits: ['溫和'],
  audience: '城市工作者',
  references: [],
  stance_candidates: [],
  tests: { real: '做過二千個療程', relevant: '客人說沒有時間', unique: '同區沒有同類' },
});

function open(user: typeof BOSS | typeof WAI = BOSS, canEdit = true) {
  window.history.replaceState(null, '', '/#/design/brand/platform');

  installFakeApi({
    state: () => jsonResponse(200, { setupRequired: false, signedIn: true, user }),
    modules: () => jsonResponse(200, { modules: [DESIGN] }),
    brands: () => jsonResponse(200, { items: BRANDS }),
    brandFocus: () => jsonResponse(200, { brandId: 'b-moonic' }),
    brandPages: () => jsonResponse(200, { items: [PAGE], canEdit }),
    brandPage: () =>
      jsonResponse(200, { page: PAGE, versions: [], current: { ...VERSION, content: CONTENT } }),
    brandPageSave: () =>
      jsonResponse(201, { version: { ...VERSION, versionNo: 5, content: CONTENT } }),
  });

  render(<App />);
}

afterEach(() => {
  cleanup();
  resetBrowserState();
  resetDirectoryCache();
});

describe('閱讀態與編輯態', () => {
  it('打開是閱讀態：有「編輯」，沒有「儲存」與「放棄」', async () => {
    open();

    await whenEditable();

    expect(document.querySelector('[data-brand-page-toolbar]')?.getAttribute('data-mode')).toBe('read');
    expect(document.querySelector('[data-brand-page-edit]')).not.toBeNull();
    expect(document.querySelector('[data-brand-page-save]')).toBeNull();
    expect(document.querySelector('[data-brand-page-discard]')).toBeNull();
  });

  it('閱讀態改不到：輸入框只讀、標籤輸入收起', async () => {
    open();

    await waitFor(() => {
      expect(document.querySelector('[data-brand-platform-stance]')).not.toBeNull();
    });

    expect(
      document.querySelector<HTMLInputElement>('[data-brand-platform-field="essence"]')?.readOnly,
    ).toBe(true);
    expect(document.querySelector('[data-brand-platform-tag-input="keyword"]')).toBeNull();
  });

  it('按「編輯」才有「放棄」與「儲存為新版本」', async () => {
    open();

    await whenEditable();
    await enterEditMode();

    expect(document.querySelector('[data-brand-page-toolbar]')?.getAttribute('data-mode')).toBe('edit');
    expect(document.querySelector('[data-brand-page-save]')).not.toBeNull();
    expect(document.querySelector('[data-brand-page-discard]')).not.toBeNull();
    expect(document.querySelector('[data-brand-page-edit]')).toBeNull();
  });

  it('「放棄」把改過的字還原，並回到閱讀態', async () => {
    open();

    await whenEditable();
    await enterEditMode();

    const essence = () =>
      document.querySelector<HTMLInputElement>('[data-brand-platform-field="essence"]');

    await userEvent.type(essence() as HTMLInputElement, '改過的');

    expect(essence()?.value).not.toBe('把一小時，還給自己。');

    await userEvent.click(document.querySelector('[data-brand-page-discard]') as HTMLElement);

    await waitFor(() => {
      expect(document.querySelector('[data-brand-page-toolbar]')?.getAttribute('data-mode')).toBe('read');
    });

    expect(essence()?.value).toBe('把一小時，還給自己。');
  });

  it('沒有編輯權的人：連「編輯」都沒有，只讀', async () => {
    open(WAI, false);

    await waitFor(() => {
      expect(document.querySelector('[data-brand-page="platform"]')).not.toBeNull();
    });

    expect(document.querySelector('[data-brand-page-edit]')).toBeNull();
    expect(document.querySelector('[data-brand-page-save]')).toBeNull();
    expect(document.querySelector('[data-brand-page-readonly]')).not.toBeNull();
    expect(
      document.querySelector<HTMLInputElement>('[data-brand-platform-field="essence"]')?.readOnly,
    ).toBe(true);
  });

  it('儲存成功之後回到閱讀態，並講明建立了第幾版', async () => {
    open();

    await whenEditable();
    await enterEditMode();

    await userEvent.type(
      document.querySelector('[data-brand-platform-field="essence"]') as HTMLInputElement,
      '，再一句',
    );

    await userEvent.click(document.querySelector('[data-brand-page-save]') as HTMLElement);

    await waitFor(() => {
      expect(document.querySelector('[data-brand-page-toolbar]')?.getAttribute('data-mode')).toBe('read');
    });

    expect(screen.getByText(/已儲存第 .* 版/)).toBeTruthy();
  });
});
