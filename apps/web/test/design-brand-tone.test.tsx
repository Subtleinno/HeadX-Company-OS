// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { changedPaths } from '@company-os/contracts';
import './helpers/rtl';
import { App } from '../src/App';
import { resetDirectoryCache } from '../src/frame/useDirectory';
import {
  installFakeApi,
  jsonResponse,
  resetBrowserState,
  type FakeHandlers,
} from './helpers/fake-api';
import { adjectiveTrait, fullToneDoc } from './fixtures/brandTone';
import { enterEditMode, whenEditable } from './helpers/brand-page';

/**
 * 語氣頁（issue #65，取代 #37）。
 *
 * 這一張要證明四件事：
 *
 *   1. 打開見到的是**立場句、特質與示範句、五句像五句不像**，不是幾個形容詞。
 *   2. 只有形容詞、沒有示範句就標成缺；禁用詞冇原因、樣本未夠五句、情境缺
 *      一個，都講得出是哪一件。
 *   3. 有編輯權的人改完，入了版本鏈，差異指出改了哪一欄；員工只讀。
 *   4. 這一頁不決定顏色、字體、標誌，也不寫渠道尺寸與頁數。
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

const TONE_PAGE = {
  id: 'p-tone',
  brandId: 'b-moonic',
  kind: 'fixed',
  key: 'tone',
  name: '語氣',
  brief: null,
  sortOrder: 50,
  current: null,
};

const PAGES = [TONE_PAGE];

const DOC = fullToneDoc();

const DOC_TEXT = JSON.stringify(DOC);

const V1 = {
  id: 'v1',
  versionNo: 1,
  createdAt: '2026-11-11T10:00:00.000Z',
  note: null,
  preview: '{"stance":"我們賣的是可以講清楚的療程",',
  policyVersionNo: 2,
};

type Fake = { content: string | null; versionNo: number; changed: string[] };

function detail(page: unknown, fake: Fake) {
  if (fake.content === null) {
    return { page, versions: [], current: null };
  }

  const current = {
    id: `v${fake.versionNo}`,
    versionNo: fake.versionNo,
    createdAt: '2026-11-12T09:00:00.000Z',
    note: null,
    preview: fake.content.slice(0, 120),
    policyVersionNo: 3,
    content: fake.content,
    // 後端就是這樣算的：欄位級路徑，不是整段內容。
    changed: fake.changed,
  };

  return { page, versions: [current, V1], current };
}

function openTone(
  user: typeof BOSS | typeof WAI,
  options: { doc?: string | null } = {},
  overrides: FakeHandlers = {},
): { api: ReturnType<typeof installFakeApi>; fake: Fake } {
  window.history.replaceState(null, '', '/#/design/brand/tone');

  const fake: Fake = {
    content: options.doc === undefined ? DOC_TEXT : options.doc,
    versionNo: 2,
    changed: [],
  };

  const api = installFakeApi({
    state: () => jsonResponse(200, { setupRequired: false, signedIn: true, user }),
    modules: () => jsonResponse(200, { modules: [DESIGN] }),
    brands: () => jsonResponse(200, { items: BRANDS }),
    brandFocus: () => jsonResponse(200, { brandId: 'b-moonic' }),
    brandPages: () => jsonResponse(200, { items: PAGES, canEdit: user.role === 'owner' }),
    brandPage: () => jsonResponse(200, detail(TONE_PAGE, fake)),
    brandPageSave: (request) => {
      const body = JSON.parse(request.body ?? '{}') as { content?: string };
      const before = JSON.parse(fake.content ?? '{}') as unknown;
      const after = JSON.parse(body.content ?? '{}') as unknown;

      fake.content = body.content ?? '';
      fake.versionNo += 1;
      // 後端的算法就是這樣：逐層落到欄位。差一句「改了情境的拒絕」不是猜的。
      fake.changed = changedPaths(before, after);

      return jsonResponse(201, {
        version: {
          id: `v${fake.versionNo}`,
          versionNo: fake.versionNo,
          createdAt: '2026-11-12T10:00:00.000Z',
          note: null,
          preview: fake.content.slice(0, 120),
          policyVersionNo: 3,
          content: fake.content,
          changed: fake.changed,
        },
      });
    },
    ...overrides,
  });

  render(<App />);

  return { api, fake };
}

function savedContent(api: ReturnType<typeof installFakeApi>): string {
  const call = api.calls.find((item) => item.method === 'POST' && item.path.endsWith('/versions'));
  const body = JSON.parse(call?.body ?? '{}') as { content?: string };

  return body.content ?? '';
}

afterEach(() => {
  cleanup();
  resetBrowserState();
  resetDirectoryCache();
});

describe('語氣頁', () => {
  it('看到的是立場句、特質與示範句、五句像五句不像', async () => {
    openTone(BOSS);

    await waitFor(() => {
      expect(document.querySelector('[data-tone-trait="0"]')).not.toBeNull();
    });

    // 第一屏是立場句。
    expect((document.querySelector('[data-tone-stance]') as HTMLTextAreaElement).value).toContain(
      '不是神秘感',
    );

    // 三個特質，每個都有會這樣講、不會這樣講，加一句示範。
    expect(document.querySelectorAll('[data-tone-trait]').length).toBe(3);
    expect((document.querySelector('[data-tone-do="0"]') as HTMLInputElement).value).toContain('直接');
    expect((document.querySelector('[data-tone-dont="0"]') as HTMLInputElement).value).toContain('請盡快');
    expect((document.querySelector('[data-tone-sentence="0"]') as HTMLTextAreaElement).value).toContain(
      '星期四下午三點前',
    );

    // 禁用詞逐個連原因。
    expect(document.querySelectorAll('[data-tone-banned-row]').length).toBe(3);
    expect((document.querySelector('[data-tone-banned-reason="0"]') as HTMLInputElement).value).toContain(
      '意思空',
    );

    // 五個情境與最難的一句。
    const keys = Array.from(document.querySelectorAll('[data-tone-context]')).map((row) =>
      row.getAttribute('data-tone-context'),
    );
    expect(keys).toEqual(['explain', 'invite', 'decline', 'apologize', 'incident']);
    expect(document.querySelectorAll('[data-tone-hardest]').length).toBe(2);

    // 樣本兩邊各五句。
    expect(document.querySelectorAll('[data-tone-sample-line^="like-"]').length).toBe(5);
    expect(document.querySelectorAll('[data-tone-sample-line^="unlike-"]').length).toBe(5);
    expect(document.querySelector('[data-tone-sample-count="like"]')?.textContent).toContain('5／5');
  });

  it('只有形容詞、沒有示範句：標成缺（驗收第一條）', async () => {
    openTone(BOSS, {
      doc: JSON.stringify({
        ...DOC,
        traits: [DOC.traits[0], adjectiveTrait('專業'), DOC.traits[2]],
      }),
    });

    await waitFor(() => {
      expect(document.querySelector('[data-tone-trait="1"]')).not.toBeNull();
    });

    expect(document.querySelector('[data-tone-trait="1"]')?.getAttribute('data-missing')).toBe('true');
    expect(document.querySelector('[data-tone-adjective-only="1"]')?.textContent).toContain('只有形容詞');
    expect(document.querySelector('[data-tone-missing]')?.textContent).toContain('專業');
    expect(document.querySelector('[data-tone-missing]')?.textContent).toContain('未寫齊');
  });

  it('禁用詞冇原因：指出是第幾條，也講明規則要原因', async () => {
    openTone(BOSS, {
      doc: JSON.stringify({
        ...DOC,
        banned: [
          { term: '賦能', reason: '意思空' },
          { term: '閉環', reason: '' },
        ],
      }),
    });

    await waitFor(() => {
      expect(document.querySelector('[data-tone-banned-row="1"]')).not.toBeNull();
    });

    expect(document.querySelector('[data-tone-banned-row="1"]')?.getAttribute('data-missing')).toBe('true');
    expect(document.querySelector('[data-tone-banned-gap="1"]')?.textContent).toContain('未寫為咩禁');
    expect(document.querySelector('[data-tone-missing]')?.textContent).toContain('為咩禁');
    expect(document.querySelector('[data-tone-missing]')?.textContent).toContain('閉環');
  });

  it('樣本未夠五句：講明是哪一邊，不當作差不多', async () => {
    openTone(BOSS, {
      doc: JSON.stringify({ ...DOC, samples: { ...DOC.samples, unlike: DOC.samples.unlike.slice(0, 3) } }),
    });

    await whenEditable();
    await enterEditMode();

    await waitFor(() => {
      expect(document.querySelector('[data-tone-missing]')).not.toBeNull();
    });

    expect(document.querySelector('[data-tone-missing]')?.textContent).toContain('不像的句子');
    expect(document.querySelector('[data-tone-sample-count="unlike"]')?.textContent).toContain('3／5');
    expect(document.querySelector('[data-tone-sample-add="unlike"]')).not.toBeNull();
    // 已經五句的那一邊沒有「新增一句」。
    expect(document.querySelector('[data-tone-sample-add="like"]')).toBeNull();
  });

  it('五個情境缺一個：逐個講得出是哪一個', async () => {
    openTone(BOSS, {
      doc: JSON.stringify({ ...DOC, contexts: { ...DOC.contexts, decline: '' } }),
    });

    await waitFor(() => {
      expect(document.querySelector('[data-tone-missing]')).not.toBeNull();
    });

    expect(document.querySelector('[data-tone-missing]')?.textContent).toContain('拒絕');
    expect(document.querySelector('[data-tone-context="decline"]')?.getAttribute('data-missing')).toBe('true');
    expect(document.querySelector('[data-tone-context="explain"]')?.getAttribute('data-missing')).toBe('false');
  });

  it('特質上限五個：加滿之後沒有「新增特質」', async () => {
    openTone(BOSS);

    await whenEditable();
    await enterEditMode();

    await waitFor(() => {
      expect(document.querySelector('[data-tone-trait-add]')).not.toBeNull();
    });

    for (let index = 0; index < 2; index += 1) {
      await userEvent.click(document.querySelector('[data-tone-trait-add]') as HTMLElement);
    }

    expect(document.querySelectorAll('[data-tone-trait]').length).toBe(5);
    expect(document.querySelector('[data-tone-trait-add]')).toBeNull();
    expect(document.querySelector('[data-tone-trait-limit]')?.textContent).toContain('五個');
  });

  it('少過三個特質：當場講明至少要三個', async () => {
    openTone(BOSS, {
      doc: JSON.stringify({ ...DOC, traits: [DOC.traits[0]] }),
    });

    await waitFor(() => {
      expect(document.querySelector('[data-tone-missing]')).not.toBeNull();
    });

    expect(document.querySelector('[data-tone-missing]')?.textContent).toContain('三個');
  });

  it('改一個欄位：入了版本鏈，差異指出改了哪一欄', async () => {
    const { api } = openTone(BOSS);

    await whenEditable();
    await enterEditMode();

    await waitFor(() => {
      expect(document.querySelector('[data-tone-context="decline"]')).not.toBeNull();
    });

    const decline = document.querySelector('[data-tone-context-text="decline"]') as HTMLTextAreaElement;

    await userEvent.clear(decline);
    await userEvent.type(decline, '呢個我們做唔到。');
    await userEvent.click(screen.getByRole('button', { name: '儲存為新版本' }));

    await waitFor(() => {
      expect(api.count('brandPageSave')).toBe(1);
    });

    const sent = JSON.parse(savedContent(api)) as typeof DOC;
    expect(sent.contexts.decline).toBe('呢個我們做唔到。');
    expect(sent.traits.length).toBe(3);

    // 差異講「情境 · 拒絕」，不是再印一次內容。
    await waitFor(() => {
      expect(document.querySelector('[data-brand-page-changed-item]')?.textContent).toContain('情境');
    });

    expect(document.querySelector('[data-brand-page-changed-item]')?.textContent).toContain('拒絕');

    // 重編／重新載入之後仍然是改過的：內容來自版本，不是本地狀態。
    await waitFor(() => {
      expect(
        (document.querySelector('[data-tone-context-text="decline"]') as HTMLTextAreaElement).value,
      ).toBe('呢個我們做唔到。');
    });
  });

  it('現行內容是舊形狀：講讀不到，不畫假特質', async () => {
    openTone(BOSS, {
      doc: JSON.stringify({ traits: [{ id: 't-1', name: '直接', does: '講清楚' }], situations: {}, bilingual: 'zhFirst' }),
    });

    expect(await screen.findByText('這一版內容不是語氣表，所以讀不到當中的特質。')).toBeTruthy();
    expect(document.querySelectorAll('[data-tone-trait]').length).toBe(0);
  });

  it('員工：看得到語氣，改不了（沒有儲存鍵、沒有新增）', async () => {
    openTone(WAI);

    await waitFor(() => {
      expect(document.querySelector('[data-tone-trait="0"]')).not.toBeNull();
    });

    expect(document.querySelector('[data-brand-page-save]')).toBeNull();
    expect(document.querySelector('[data-tone-trait-add]')).toBeNull();
    expect((document.querySelector('[data-tone-sentence="0"]') as HTMLTextAreaElement).readOnly).toBe(true);
    expect(screen.getByText('你只可以看這一頁。要改，請找老闆。')).toBeTruthy();
  });

  it('這一頁不決定顏色、字體、標誌', async () => {
    openTone(BOSS);

    await waitFor(() => {
      expect(document.querySelector('[data-tone-trait="0"]')).not.toBeNull();
    });

    const colourInputs = Array.from(document.querySelectorAll('input')).filter(
      (input) => input.type === 'color',
    );

    expect(colourInputs.length).toBe(0);
    expect(document.querySelector('[data-color-role]')).toBeNull();
    expect(document.querySelector('[data-type-family]')).toBeNull();
    expect(document.querySelector('[data-logo-asset]')).toBeNull();
  });
});
