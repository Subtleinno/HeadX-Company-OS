import { describe, expect, it } from 'vitest';
import {
  buildShellHash,
  isScopeAllowed,
  parseShellHash,
  planAppSwitch,
} from '../src/deep-link.js';
import type { PrototypeApp } from '../src/workspace.js';

/**
 * 深連結與切換矩陣的契約（#118 切片 C、決策 C48、WORKSPACE 第 6–7 節）。
 *
 * 呢兩個係純函數，所以可以逐格驗：矩陣冇模糊地帶，深連結冇「大概讀到」。
 * 特別守住「未選範圍 ≠ 公司範圍」同「切換唔會改授權」兩條。
 */

const companyApp: PrototypeApp = { id: 'a', title: 'App A', mode: 'company', menu: [] };
const brandApp: PrototypeApp = { id: 'b', title: 'App B', mode: 'brand', menu: [] };
const mixedApp: PrototypeApp = { id: 'c', title: 'App C', mode: 'mixed', menu: [] };

const brands = ['jia', 'yi'];

describe('parseShellHash：講得出位置，但唔講授權', () => {
  it('唔係 app 路徑就當冇（例如登入頁）', () => {
    expect(parseShellHash('').kind).toBe('none');
    expect(parseShellHash('#/').kind).toBe('none');
    expect(parseShellHash('#/login').kind).toBe('none');
    expect(parseShellHash('#/setup').kind).toBe('none');
  });

  it('只有 app：範圍與頁面都是 null，不是「公司」', () => {
    expect(parseShellHash('#/app/a')).toEqual({
      kind: 'app',
      appId: 'a',
      scope: null,
      page: null,
    });
  });

  it('公司範圍', () => {
    expect(parseShellHash('#/app/a/company')).toEqual({
      kind: 'app',
      appId: 'a',
      scope: { kind: 'company' },
      page: null,
    });
  });

  it('品牌範圍與頁面', () => {
    expect(parseShellHash('#/app/b/brand.jia/overview')).toEqual({
      kind: 'app',
      appId: 'b',
      scope: { kind: 'brand', brandId: 'jia' },
      page: 'overview',
    });
  });

  it('尾斜線不影響結果', () => {
    expect(parseShellHash('#/app/b/brand.jia/').kind).toBe('app');
  });

  it('app id 格式不對就明示 invalid，不會靜靜當成首頁', () => {
    const result = parseShellHash('#/app/B');

    expect(result.kind).toBe('invalid');
  });

  it('未知的範圍字串明示 invalid —— 唔會當成 null，亦唔會當成公司', () => {
    const result = parseShellHash('#/app/b/somebrand');

    expect(result.kind).toBe('invalid');
  });

  it('有頁面但沒有範圍：明示 invalid（唔會替它補一個公司範圍）', () => {
    expect(parseShellHash('#/app/b/overview').kind).toBe('invalid');
  });

  it('段數太多明示 invalid', () => {
    expect(parseShellHash('#/app/a/company/overview/extra').kind).toBe('invalid');
  });
});

describe('buildShellHash：可還原', () => {
  it('冇範圍就冇範圍段', () => {
    expect(buildShellHash({ appId: 'a', scope: null, page: null })).toBe('#/app/a');
  });

  it('公司與品牌各自編碼', () => {
    expect(buildShellHash({ appId: 'a', scope: { kind: 'company' }, page: null })).toBe(
      '#/app/a/company',
    );
    expect(
      buildShellHash({ appId: 'b', scope: { kind: 'brand', brandId: 'jia' }, page: null }),
    ).toBe('#/app/b/brand.jia');
  });

  it('範圍係 null 時丟棄頁面，不會偽造一個公司範圍去裝住它', () => {
    expect(buildShellHash({ appId: 'b', scope: null, page: 'overview' })).toBe('#/app/b');
  });

  it('來回轉一次得到同一個結果', () => {
    const hash = buildShellHash({
      appId: 'b',
      scope: { kind: 'brand', brandId: 'yi' },
      page: 'overview',
    });

    expect(parseShellHash(hash)).toEqual({
      kind: 'app',
      appId: 'b',
      scope: { kind: 'brand', brandId: 'yi' },
      page: 'overview',
    });
  });
});

describe('planAppSwitch：切 app 之後範圍如何', () => {
  it('切去公司型：一定回到公司範圍，即使目前是品牌', () => {
    const plan = planAppSwitch({
      target: companyApp,
      currentScope: { kind: 'brand', brandId: 'jia' },
      availableBrandIds: brands,
    });

    expect(plan).toEqual({ kind: 'ready', scope: { kind: 'company' } });
  });

  it('切去品牌型但目前在公司範圍：要先選品牌', () => {
    const plan = planAppSwitch({
      target: brandApp,
      currentScope: { kind: 'company' },
      availableBrandIds: brands,
    });

    expect(plan).toEqual({ kind: 'needs-scope', appId: 'b' });
  });

  it('切去品牌型而目前的品牌仍然可用：保留它', () => {
    const plan = planAppSwitch({
      target: brandApp,
      currentScope: { kind: 'brand', brandId: 'jia' },
      availableBrandIds: brands,
    });

    expect(plan).toEqual({ kind: 'ready', scope: { kind: 'brand', brandId: 'jia' } });
  });

  it('切去品牌型而目前的品牌已不可用：重新選', () => {
    const plan = planAppSwitch({
      target: brandApp,
      currentScope: { kind: 'brand', brandId: 'gwo' },
      availableBrandIds: brands,
    });

    expect(plan).toEqual({ kind: 'needs-scope', appId: 'b' });
  });

  it('切去混合型：公司範圍保留', () => {
    const plan = planAppSwitch({
      target: mixedApp,
      currentScope: { kind: 'company' },
      availableBrandIds: brands,
    });

    expect(plan).toEqual({ kind: 'ready', scope: { kind: 'company' } });
  });

  it('切去混合型：可用的品牌保留', () => {
    const plan = planAppSwitch({
      target: mixedApp,
      currentScope: { kind: 'brand', brandId: 'yi' },
      availableBrandIds: brands,
    });

    expect(plan).toEqual({ kind: 'ready', scope: { kind: 'brand', brandId: 'yi' } });
  });

  it('切去混合型：完全未選範圍就要問，不會自動等於公司', () => {
    const plan = planAppSwitch({ target: mixedApp, currentScope: null, availableBrandIds: brands });

    expect(plan).toEqual({ kind: 'needs-scope', appId: 'c' });
  });
});

describe('isScopeAllowed：同一個範圍在唔同 app 的合法性', () => {
  it('公司型不接受品牌範圍', () => {
    expect(
      isScopeAllowed({ app: companyApp, scope: { kind: 'brand', brandId: 'jia' }, availableBrandIds: brands }),
    ).toBe(false);
  });

  it('品牌型不接受公司範圍', () => {
    expect(
      isScopeAllowed({ app: brandApp, scope: { kind: 'company' }, availableBrandIds: brands }),
    ).toBe(false);
  });

  it('混合型兩種都接受', () => {
    expect(isScopeAllowed({ app: mixedApp, scope: { kind: 'company' }, availableBrandIds: brands })).toBe(
      true,
    );
    expect(
      isScopeAllowed({ app: mixedApp, scope: { kind: 'brand', brandId: 'jia' }, availableBrandIds: brands }),
    ).toBe(true);
  });

  it('品牌型不接受清單以外的品牌', () => {
    expect(
      isScopeAllowed({ app: brandApp, scope: { kind: 'brand', brandId: 'gwo' }, availableBrandIds: brands }),
    ).toBe(false);
  });
});
