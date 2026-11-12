import { describe, expect, it } from 'vitest';
import {
  AGENT_ABILITIES,
  FIXED_PAGE_KEYS,
  agentExample,
  refsOf,
  slotOfPageKey,
} from '../src/design/brandGuide';

/**
 * 「這一頁」面板的純資料（issue #53）。
 *
 * 三個測試方向：
 *   1. 頁 → 策略槽的對應，與後端 `slotForPageKey` 同一條規則。
 *   2. 引用關係必須對稱：A 說它用了 B，B 就要說它被 A 用。單邊寫漏會令
 *      老闆在一頁上見到「被 X 引用」，在 X 上卻見不到自己 —— 兩頁講兩個版本。
 *   3. 給 agent 的範例要對得上真實路徑，不准寫一條打不中的路。
 */

describe('slotOfPageKey', () => {
  it('五張固定頁各自一個槽', () => {
    for (const key of FIXED_PAGE_KEYS) {
      expect(slotOfPageKey(key)).toBe(key);
    }
  });

  it('自定義頁一律用 custom 槽', () => {
    expect(slotOfPageKey('packaging')).toBe('custom');
    expect(slotOfPageKey('photography')).toBe('custom');
  });

  it('固定頁清單就是那五個鍵，不多不少', () => {
    expect([...FIXED_PAGE_KEYS]).toEqual(['home', 'logo', 'color', 'type', 'tone']);
  });
});

describe('refsOf', () => {
  it('色彩頁被標誌、字體、主頁引用', () => {
    const refs = refsOf('color');

    expect(refs.usedBy.map((link) => link.page).sort()).toEqual(['home', 'logo', 'type']);
  });

  it('自定義頁沒有跨頁引用', () => {
    expect(refsOf('packaging')).toEqual({ uses: [], usedBy: [] });
  });

  it('每一條 uses 都在對方頁的 usedBy 出現（對稱）', () => {
    const keys = [...FIXED_PAGE_KEYS, 'packaging'];

    for (const key of keys) {
      for (const link of refsOf(key).uses) {
        const back = refsOf(link.page).usedBy.some((item) => item.page === key);

        expect(back, `${key} 用了 ${link.page}，但 ${link.page} 沒有說被 ${key} 用`).toBe(true);
      }
    }
  });

  it('每一條 usedBy 都在對方頁的 uses 出現（對稱）', () => {
    const keys = [...FIXED_PAGE_KEYS, 'packaging'];

    for (const key of keys) {
      for (const link of refsOf(key).usedBy) {
        const back = refsOf(link.page).uses.some((item) => item.page === key);

        expect(back, `${key} 說被 ${link.page} 用，但 ${link.page} 沒有說自己用了 ${key}`).toBe(
          true,
        );
      }
    }
  });

  it('主頁自己不在主頁的入口清單裡', () => {
    expect(refsOf('home').uses.some((link) => link.page === 'home')).toBe(false);
  });
});

describe('AGENT_ABILITIES', () => {
  it('三件可以做', () => {
    expect(AGENT_ABILITIES.filter((item) => item.allowed).map((item) => item.key).sort()).toEqual([
      'read',
      'readPolicy',
      'write',
    ]);
  });

  it('兩件不准做', () => {
    expect(AGENT_ABILITIES.filter((item) => !item.allowed).map((item) => item.key).sort()).toEqual([
      'noDelete',
      'noPolicy',
    ]);
  });
});

describe('agentExample', () => {
  it('範例路徑打的就是真的版本路徑', () => {
    const example = agentExample('color');

    expect(example.method).toBe('POST');
    expect(example.path).toBe('/api/brands/{brandId}/pages/color/versions');
  });

  it('自定義頁用 slug，不是 p/', () => {
    expect(agentExample('packaging').path).toBe('/api/brands/{brandId}/pages/packaging/versions');
  });

  it('body 是 content 一個欄位，不是整份包起來', () => {
    expect(JSON.parse(agentExample('tone').body)).toEqual({ content: '<JSON>' });
  });
});
