import { describe, expect, it } from 'vitest';
import {
  AGENT_ABILITIES,
  FIXED_PAGE_KEYS,
  agentInstruction,
  pageLabel,
  refsOf,
  slotOfPageKey,
} from '../src/design/brandGuide';

/**
 * 「這一頁」面板的純資料（issue #53，v2.1）。
 *
 * 四個測試方向：
 *   1. 頁 → 策略槽的對應，與後端 `slotForPageKey` 同一條規則。八個固定頁，
 *      九個槽 —— 少一個就會令平台／圖像／範例被當成自定義頁。
 *   2. 引用關係必須對稱：A 說它用了 B，B 就要說它被 A 用。單邊寫漏會令
 *      老闆在一頁上見到「被 X 引用」，在 X 上卻見不到自己 —— 兩頁講兩個版本。
 *   3. 自定義頁的引用由 payload 決定（有沒有引用色彩角色、字體層級）。
 *   4. 給 agent 的是一句人話，不是 HTTP 方法、路徑與 JSON。
 */

describe('slotOfPageKey', () => {
  it('八張固定頁各自一個槽，examples 用 apply', () => {
    for (const key of FIXED_PAGE_KEYS) {
      expect(slotOfPageKey(key)).toBe(key === 'examples' ? 'apply' : key);
    }
  });

  it('自定義頁一律用 custom 槽', () => {
    expect(slotOfPageKey('packaging')).toBe('custom');
    expect(slotOfPageKey('photography')).toBe('custom');
  });

  it('固定頁清單就是那八個鍵，次序與左側欄一致', () => {
    expect([...FIXED_PAGE_KEYS]).toEqual([
      'home',
      'platform',
      'color',
      'type',
      'logo',
      'tone',
      'image',
      'examples',
    ]);
  });

  it('三個原本缺的頁有自己的名，不是原樣印出鍵', () => {
    expect(pageLabel('platform')).toBe('平台');
    expect(pageLabel('image')).toBe('圖像');
    expect(pageLabel('examples')).toBe('已核准範例');
  });
});

describe('refsOf', () => {
  it('色彩頁被標誌、字體、主頁、圖像與自定義頁引用', () => {
    const refs = refsOf('color');

    expect(refs.usedBy.map((link) => link.page).sort()).toEqual([
      'custom',
      'home',
      'image',
      'logo',
      'type',
    ]);
  });

  it('平台頁被主頁、五個識別頁與自定義頁引用', () => {
    const refs = refsOf('platform');

    expect([...new Set(refs.usedBy.map((link) => link.page))].sort()).toEqual([
      'color',
      'custom',
      'home',
      'image',
      'logo',
      'tone',
      'type',
    ]);
    expect(refs.uses).toEqual([]);
  });

  it('主頁用了其餘七頁與自定義頁', () => {
    const refs = refsOf('home');

    expect([...new Set(refs.uses.map((link) => link.page))].sort()).toEqual([
      'color',
      'custom',
      'examples',
      'image',
      'logo',
      'platform',
      'tone',
      'type',
    ]);
  });

  it('圖像頁引用平台、色彩與已核准範例', () => {
    const refs = refsOf('image');

    expect([...new Set(refs.uses.map((link) => link.page))].sort()).toEqual([
      'color',
      'examples',
      'platform',
    ]);
  });

  it('自定義頁永遠用語氣，未引用角色時不用色彩與字體', () => {
    const bare = refsOf('packaging');

    expect([...new Set(bare.uses.map((link) => link.page))].sort()).toEqual(['platform', 'tone']);
    expect(bare.usedBy.map((link) => link.page)).toEqual(['home']);
  });

  it('自定義頁引用了角色，就多出色彩與字體', () => {
    const withRoles = refsOf('packaging', { colors: true, types: true });

    expect([...new Set(withRoles.uses.map((link) => link.page))].sort()).toEqual([
      'color',
      'platform',
      'tone',
      'type',
    ]);
  });

  it('每一條 uses 都在對方頁的 usedBy 出現（對稱）', () => {
    const keys: string[] = [...FIXED_PAGE_KEYS, 'packaging'];

    for (const key of keys) {
      for (const link of refsOf(key, { colors: true, types: true }).uses) {
        const back = refsOf(link.page, { colors: true, types: true }).usedBy.some(
          (item) => item.page === key || (key === 'packaging' && item.page === 'custom'),
        );

        expect(back, `${key} 用了 ${link.page}，但 ${link.page} 沒有說被 ${key} 用`).toBe(true);
      }
    }
  });

  it('每一條 usedBy 都在對方頁的 uses 出現（對稱）', () => {
    const keys: string[] = [...FIXED_PAGE_KEYS, 'packaging'];

    for (const key of keys) {
      for (const link of refsOf(key, { colors: true, types: true }).usedBy) {
        const other = link.page === 'custom' ? 'packaging' : link.page;
        // 自定義頁在對方清單裡用 `custom` 概括（一個品牌可以有十張自定義頁）。
        const back = refsOf(other, { colors: true, types: true }).uses.some(
          (item) => item.page === key || (item.page === 'custom' && key === 'packaging'),
        );

        expect(
          back,
          `${key} 說被 ${link.page} 用，但 ${link.page} 沒有說自己用了 ${key}`,
        ).toBe(true);
      }
    }
  });

  it('主頁自己不在主頁的引用清單裡', () => {
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

describe('agentInstruction', () => {
  it('是一句人話，沒有 HTTP 方法與路徑', () => {
    const text = agentInstruction('color', 'Moonic 滿月堂');

    expect(text).toContain('Moonic 滿月堂');
    expect(text).toContain('色彩');
    expect(text).not.toContain('/api/');
    expect(text).not.toContain('POST');
    expect(text).not.toContain('{');
  });

  it('沒有品牌名時仍然說得通', () => {
    const text = agentInstruction('logo', null);

    expect(text).toContain('標誌');
    expect(text).toContain('這個品牌');
  });

  it('自定義頁用頁名，不是 p/ 前綴', () => {
    const text = agentInstruction('packaging', 'Moonic');

    expect(text).toContain('packaging');
    expect(text).not.toContain('p/');
  });
});
