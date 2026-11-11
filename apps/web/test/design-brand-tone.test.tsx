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
 * 語氣頁（issue #37）。
 *
 * 這一張要證明四件事：
 *
 *   1. 打開見到的是**特質與對照句子**，不是三個形容詞。
 *   2. 只有形容詞、沒有句子就標成缺；五個情境缺一個都講得出是哪一個。
 *   3. 有編輯權的人改完，重新載入仍然是改過的；員工只讀。
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

const DOC = {
  traits: [
    {
      id: 't-1',
      name: '直接',
      does: '講清楚要對方做甚麼',
      doesExample: '星期四下午三點前把樣板寄回，唔該。',
      doesNot: '不用「請盡快」這種講了等於無講的話',
      doesNotExample: '請盡快回覆，謝謝。',
    },
    {
      id: 't-2',
      name: '有溫度',
      does: '先認同對方的事，再講做法',
      doesExample: '明白你趕時間。我今日幫你排進去。',
      doesNot: '不假裝熱情',
      doesNotExample: '太棒了！！！好開心！！！',
    },
    {
      id: 't-3',
      name: '不裝',
      does: '用日常講法',
      doesExample: '呢個療程要分三次做。',
      doesNot: '不講「賦能」這類字',
      doesNotExample: '我們賦能客戶的增長閉環。',
    },
  ],
  banned: ['賦能', '閉環'],
  bilingual: 'zhFirst',
  bilingualNote: '療程名保留英文原名。',
  situations: {
    explain: '呢個療程分三次做，每次隔兩星期。',
    invite: '下星期三下午有位，你想上午定下午？',
    refuse: '呢個做法我們做唔到，但我可以幫你轉介。',
    apologise: '上一次等得太久，是我們排期出錯。',
    incident: '系統今早出問題，你今日的預約我已經改到星期五。',
  },
};

const DOC_TEXT = JSON.stringify(DOC);

const V1 = {
  id: 'v1',
  versionNo: 1,
  createdAt: '2026-11-11T10:00:00.000Z',
  note: null,
  preview: '{"traits":[{"id":"t-1","name":"直接"',
  policyVersionNo: 2,
};

type Fake = { content: string | null; versionNo: number };

function detail(page: unknown, content: string | null, versionNo: number) {
  if (content === null) {
    return { page, versions: [], current: null };
  }

  const current = {
    id: `v${versionNo}`,
    versionNo,
    createdAt: '2026-11-12T09:00:00.000Z',
    note: null,
    preview: content.slice(0, 120),
    policyVersionNo: 3,
    content,
  };

  return { page, versions: [current, V1], current };
}

function openTone(
  user: typeof BOSS | typeof WAI,
  options: { doc?: string | null } = {},
  overrides: FakeHandlers = {},
): { api: ReturnType<typeof installFakeApi>; fake: Fake } {
  window.history.replaceState(null, '', '/#/design/brand/tone');

  const fake: Fake = { content: options.doc === undefined ? DOC_TEXT : options.doc, versionNo: 2 };

  const api = installFakeApi({
    state: () => jsonResponse(200, { setupRequired: false, signedIn: true, user }),
    modules: () => jsonResponse(200, { modules: [DESIGN] }),
    brands: () => jsonResponse(200, { items: BRANDS }),
    brandFocus: () => jsonResponse(200, { brandId: 'b-moonic' }),
    brandPages: () => jsonResponse(200, { items: PAGES, canEdit: user.role === 'owner' }),
    brandPage: () => jsonResponse(200, detail(TONE_PAGE, fake.content, fake.versionNo)),
    brandPageSave: (request) => {
      const body = JSON.parse(request.body ?? '{}') as { content?: string };

      fake.content = body.content ?? '';
      fake.versionNo += 1;

      return jsonResponse(201, {
        version: {
          id: `v${fake.versionNo}`,
          versionNo: fake.versionNo,
          createdAt: '2026-11-12T10:00:00.000Z',
          note: null,
          preview: fake.content.slice(0, 120),
          policyVersionNo: 3,
          content: fake.content,
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
  it('看到的是特質與對照句子，不是三個形容詞', async () => {
    openTone(BOSS);

    await waitFor(() => {
      expect(document.querySelector('[data-tone-trait="t-1"]')).not.toBeNull();
    });

    // 三個特質，每個都有做、不做，兩邊各有一句實際句子。
    expect(document.querySelectorAll('[data-tone-trait]').length).toBe(3);
    expect((document.querySelector('[data-tone-do-example="t-1"]') as HTMLTextAreaElement).value).toContain(
      '星期四下午三點前',
    );
    expect(
      (document.querySelector('[data-tone-dont-example="t-1"]') as HTMLTextAreaElement).value,
    ).toContain('請盡快回覆');

    // 五個情境逐句。
    expect(document.querySelectorAll('[data-tone-situation]').length).toBe(5);
    const keys = Array.from(document.querySelectorAll('[data-tone-situation]')).map((row) =>
      row.getAttribute('data-tone-situation'),
    );
    expect(keys).toEqual(['explain', 'invite', 'refuse', 'apologise', 'incident']);

    // 禁用詞與中英並用。
    expect(document.querySelectorAll('[data-tone-banned-item]').length).toBe(2);
    expect((document.querySelector('[data-tone-bilingual]') as HTMLSelectElement).value).toBe('zhFirst');
  });

  it('只有形容詞、沒有句子：標成缺，並講明是哪些特質', async () => {
    openTone(BOSS, {
      doc: JSON.stringify({
        ...DOC,
        traits: [
          DOC.traits[0],
          {
            id: 't-9',
            name: '專業',
            does: '（寫得出，但沒有示範）',
            doesExample: '',
            doesNot: '',
            doesNotExample: '',
          },
          DOC.traits[2],
        ],
      }),
    });

    await waitFor(() => {
      expect(document.querySelector('[data-tone-trait="t-9"]')).not.toBeNull();
    });

    expect(document.querySelector('[data-tone-trait="t-9"]')?.getAttribute('data-missing')).toBe('true');
    expect(document.querySelector('[data-tone-trait="t-9"]')?.textContent).toContain('只有形容詞');
    expect(document.querySelector('[data-tone-missing]')?.textContent).toContain('專業');
  });

  it('五個情境缺一個：逐個講得出是哪一個', async () => {
    openTone(BOSS, {
      doc: JSON.stringify({ ...DOC, situations: { ...DOC.situations, refuse: '' } }),
    });

    await waitFor(() => {
      expect(document.querySelector('[data-tone-missing]')).not.toBeNull();
    });

    expect(document.querySelector('[data-tone-missing]')?.textContent).toContain('拒絕');
    expect(document.querySelector('[data-tone-situation="refuse"]')?.getAttribute('data-missing')).toBe(
      'true',
    );
    expect(
      document.querySelector('[data-tone-situation="explain"]')?.getAttribute('data-missing'),
    ).toBe('false');
  });

  it('特質上限五個：加滿之後沒有「新增特質」', async () => {
    openTone(BOSS);

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

  it('有編輯權的人改完：入了版本鏈，重新載入仍然是改過的', async () => {
    const { api } = openTone(BOSS);

    await waitFor(() => {
      expect(document.querySelector('[data-tone-situation="refuse"]')).not.toBeNull();
    });

    const refuse = document.querySelector('[data-tone-situation-text="refuse"]') as HTMLTextAreaElement;

    await userEvent.clear(refuse);
    await userEvent.type(refuse, '呢個我們做唔到。');
    await userEvent.click(screen.getByRole('button', { name: '儲存（新增一版）' }));

    await waitFor(() => {
      expect(api.count('brandPageSave')).toBe(1);
    });

    const sent = JSON.parse(savedContent(api)) as typeof DOC;
    expect(sent.situations.refuse).toBe('呢個我們做唔到。');
    expect(sent.traits.length).toBe(3);

    await waitFor(() => {
      expect(
        (document.querySelector('[data-tone-situation-text="refuse"]') as HTMLTextAreaElement).value,
      ).toBe('呢個我們做唔到。');
    });
  });

  it('現行內容不是語氣表（舊的自由文字）：講讀不到，不畫假特質', async () => {
    openTone(BOSS, { doc: '語氣要專業、友善。' });

    expect(await screen.findByText('這一版內容不是語氣表，所以讀不到當中的特質。')).toBeTruthy();
    expect(document.querySelectorAll('[data-tone-trait]').length).toBe(0);
  });

  it('員工：看得到語氣，改不了（沒有儲存鍵、沒有新增特質）', async () => {
    openTone(WAI);

    await waitFor(() => {
      expect(document.querySelector('[data-tone-trait="t-1"]')).not.toBeNull();
    });

    expect(document.querySelector('[data-brand-page-save]')).toBeNull();
    expect(document.querySelector('[data-tone-trait-add]')).toBeNull();
    expect(
      (document.querySelector('[data-tone-do-example="t-1"]') as HTMLTextAreaElement).readOnly,
    ).toBe(true);
    expect(screen.getByText('你只可以看這一頁。要改，請找老闆。')).toBeTruthy();
  });

  it('這一頁不決定顏色、字體、標誌', async () => {
    openTone(BOSS);

    await waitFor(() => {
      expect(document.querySelector('[data-tone-trait="t-1"]')).not.toBeNull();
    });

    // 沒有任何色值欄位、字體家族選擇、標誌資產欄位。
    const colourInputs = Array.from(document.querySelectorAll('input')).filter(
      (input) => input.type === 'color',
    );

    expect(colourInputs.length).toBe(0);
    expect(document.querySelector('[data-color-role]')).toBeNull();
    expect(document.querySelector('[data-type-family]')).toBeNull();
    expect(document.querySelector('[data-logo-asset]')).toBeNull();
  });
});
