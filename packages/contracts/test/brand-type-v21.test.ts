import { describe, expect, it } from 'vitest';
import {
  emptyBrandDocument,
  renderBrandHtml,
  schemaForPage,
  type ComposedBrand,
  type ComposedPage,
} from '../src/brand/index.ts';

/**
 * 字體頁 v2.1（聲部模型）在三種輸出裡的形狀。
 *
 * 三條都是「文件與程式對不上」修正後必須成立的事：
 *   1. tokens 的字體堆疊是**聲部的堆疊**：拉丁 → 中文 → 備用字；缺的家族
 *      不出現（不用系統字名稱代替）。
 *   2. prompt 缺家族寫「缺」；未有聲部的家族仍然列出來（不靜靜丟掉）。
 *   3. 缺口每個根本原因只計一次：全空 8 項，有家族但缺檔就 1 項家族缺、
 *      不再同時算字種缺。
 */

const schema = schemaForPage('type', 'fixed');

const FAMILIES = [
  { id: 'f-serif-latin', name: 'Bodoni Moda', script: 'latin', voice: 'serif', license_web: 'OFL 1.1', license_print: 'OFL 1.1', license_app: '', license_desktop: '', file_ref: 'aaaaaaa1-1111-4111-8111-111111111111', fallback: ['Iowan Old Style'] },
  { id: 'f-serif-chinese', name: 'Noto Serif HK', script: 'chinese', voice: 'serif', license_web: 'OFL 1.1', license_print: 'OFL 1.1', license_app: '', license_desktop: '', file_ref: 'aaaaaaa2-1111-4111-8111-111111111111', fallback: [] },
  { id: 'f-sans-latin', name: 'Inter', script: 'latin', voice: 'sans', license_web: 'OFL 1.1', license_print: 'OFL 1.1', license_app: '', license_desktop: '', file_ref: 'aaaaaaa3-1111-4111-8111-111111111111', fallback: ['system-ui'] },
  { id: 'f-sans-chinese', name: 'Noto Sans HK', script: 'chinese', voice: 'sans', license_web: 'OFL 1.1', license_print: 'OFL 1.1', license_app: '', license_desktop: '', file_ref: 'aaaaaaa4-1111-4111-8111-111111111111', fallback: [] },
];

const ROLES = [
  { role: 'display', voice: 'serif', weight: '700', size: '56px', leading: '64px', min: 32, measure: '24 字元', color_role: 'ink', reason: '' },
  { role: 'body', voice: 'sans', weight: '400', size: '17px', leading: '26px', min: 14, measure: '32 字元', color_role: 'ink', reason: '' },
];

function payloadOf(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    philosophy: '字要撐得住一整頁價目表。',
    families: FAMILIES,
    roles: ROLES,
    pairing: '襯線講語氣，無襯線講資訊。',
    sentence_anatomy: '',
    print_matrix: [],
    mixed_setting: '',
    misuse: [],
    ...overrides,
  };
}

function page(overrides: Record<string, unknown> = {}): ComposedPage {
  const payload = payloadOf(overrides);

  return {
    key: 'type',
    name: '字體',
    kind: 'fixed',
    versionNo: 3,
    policyVersionNo: 2,
    document: {
      ...emptyBrandDocument(schema.layout(schema.normalize(payload))),
      payload,
    },
  };
}

function brand(overrides: Record<string, unknown> = {}): ComposedBrand {
  return { code: 'moonic', name: 'Moonic 滿月堂', releaseNo: 5, pages: [page(overrides)], gaps: [] };
}

describe('字體 tokens（v2.1）', () => {
  it('字體堆疊是聲部的堆疊：拉丁 → 中文 → 備用字', () => {
    const tokens = schema.tokens(schema.normalize(payloadOf()));
    const display = tokens?.light['typography']?.['display']?.$value as Record<string, unknown>;

    expect(display['fontFamily']).toBe(
      '"Bodoni Moda", "Iowan Old Style", "Noto Serif HK"',
    );
    expect(display['fontSize']).toBe('56px');
    expect(display['fontWeight']).toBe('700');
  });

  it('缺的家族不出現：不寫系統字名稱代替', () => {
    const families = FAMILIES.filter((family) => family.id !== 'f-serif-latin');
    const tokens = schema.tokens(schema.normalize(payloadOf({ families })));
    const display = tokens?.light['typography']?.['display'];

    // 剩中文家族：堆疊只有它，沒有 sans-serif 之類的系統字。
    expect(display?.$value).toMatchObject({ fontFamily: '"Noto Serif HK"' });
  });

  it('一個聲部一個家族都沒有：那一級不出現', () => {
    const families = FAMILIES.filter((family) => family.voice !== 'serif');
    const tokens = schema.tokens(schema.normalize(payloadOf({ families })));

    expect(tokens?.light['typography']?.['display']).toBeUndefined();
    expect(tokens?.light['typography']?.['body']).toBeDefined();
  });

  it('字級不是 px 就不寫 fontSize：不寫一個猜出來的數字', () => {
    const roles = [{ ...ROLES[1]!, size: '42pt' }];
    const tokens = schema.tokens(schema.normalize(payloadOf({ roles })));
    const body = tokens?.light['typography']?.['body']?.$value as Record<string, unknown>;

    expect(body['fontSize']).toBeUndefined();
    expect(body['fontFamily']).toBe('"Inter", "system-ui", "Noto Sans HK"');
  });
});

describe('字體 prompt（v2.1）', () => {
  it('逐個聲部寫拉丁與中文；缺的寫「缺」，不寫系統字名稱', () => {
    const families = FAMILIES.filter((family) => family.id !== 'f-serif-chinese');
    const section = schema.prompt(schema.normalize(payloadOf({ families })))[0];

    expect(section?.lines).toContain('聲部 serif：拉丁 Bodoni Moda（OFL 1.1）、中文 缺');
  });

  it('未有聲部的家族仍然列出來：不靜靜丟掉', () => {
    const families = [{ ...FAMILIES[2]!, voice: '' }];
    const section = schema.prompt(schema.normalize(payloadOf({ families })))[0];
    const text = section?.lines.join('\n') ?? '';

    expect(text).toContain('未定聲部的家族：Inter');
  });

  it('字階寫 px 與最小尺寸；不是 px 的寫「缺」', () => {
    const roles = [{ ...ROLES[1]!, size: '42pt' }];
    const section = schema.prompt(schema.normalize(payloadOf({ roles })))[0];

    expect(section?.lines.join('\n')).toContain('字階 body：sans 400 字級 缺/26px，最小 14px');
  });
});

describe('字體缺口（v2.1：每個根本原因只計一次）', () => {
  it('全空＝8 項：兩個字種、四級、取態、搭配', () => {
    const gaps = schema.gaps(schema.normalize(schema.empty()));

    expect(gaps).toHaveLength(8);
    expect(gaps.filter((gap) => gap.item.startsWith('type.script.'))).toHaveLength(2);
    expect(gaps.filter((gap) => gap.item.startsWith('type.role.'))).toHaveLength(4);
  });

  it('有一個家族但缺檔：家族 1 項，而且不算字種缺', () => {
    const families = [{ ...FAMILIES[2]!, file_ref: '', license_web: '' }];
    const gaps = schema.gaps(schema.normalize(payloadOf({ families, roles: [], philosophy: '', pairing: '' })));

    expect(gaps.filter((gap) => gap.item.startsWith('type.family.'))).toHaveLength(1);
    expect(gaps.filter((gap) => gap.item.startsWith('type.script.'))).toHaveLength(1);
  });

  it('一級缺幾樣都只計一件', () => {
    const gaps = schema.gaps(
      schema.normalize(payloadOf({ roles: [{ role: 'body', voice: '', weight: '', size: '', leading: '', min: 0, measure: '', color_role: '', reason: '' }] })),
    );

    expect(gaps.filter((gap) => gap.item === 'type.role.body')).toHaveLength(1);
  });
});

describe('字體頁 HTML（v2.1）', () => {
  it('樣本用聲部堆疊，並標明聲部', () => {
    const html = renderBrandHtml(brand(), { pageKey: 'type' });

    expect(html).toContain('data-voice="serif"');
    // 堆疊：拉丁家族 → 它的備用字 → 中文字族（引號由 HTML 逃逸成 &quot;）。
    expect(html).toContain('Bodoni Moda');
    expect(html).toContain('Iowan Old Style');
    expect(html).toContain('Noto Serif HK');
  });

  it('沒有家族的一級講「排不出樣本」，不畫一個用系統字的假樣本', () => {
    const families = FAMILIES.filter((family) => family.voice !== 'serif');
    const html = renderBrandHtml(brand({ families }), { pageKey: 'type' });

    expect(html).toContain('缺家族，排不出樣本');
    expect(html).not.toContain('data-role="display" style');
  });
});
