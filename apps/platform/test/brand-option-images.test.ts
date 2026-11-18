import { describe, expect, it } from 'vitest';
import { attachOptionImages } from '../src/brand-guide/option-images';

/**
 * 選項圖只負責「貼上網址」，不負責生成。這裡鎖住四件事：
 *   1. 有圖的選項多一個 img，沒有圖的選項一個 key 都不多；
 *   2. 同一個 id 在不同維度可以是兩張不同的圖（stage2 的 `ceramic` 同時是
 *      「材質」與「表面」，平放一層會被蓋掉）；
 *   3. 不改動傳進來的 schema（vm 載入的物件會被多個請求共用）；
 *   4. 沒有圖時原樣回傳，不做無謂複製。
 */

function schemaOf(): Record<string, unknown> {
  return {
    cat: {
      material: {
        title: '材質',
        groups: [
          {
            g: '陶瓷與礦物',
            items: [
              { id: 'ceramic', zh: '霧面陶瓷' },
              { id: 'marble', zh: '大理石' },
              { id: 'glass_clear', zh: '清透玻璃' },
            ],
          },
        ],
      },
      surface: {
        title: '表面',
        groups: [{ g: '處理', items: [{ id: 'ceramic', zh: '霧面陶瓷' }] }],
      },
    },
    SETS: {},
  };
}

describe('attachOptionImages', () => {
  it('有圖的選項才有 img，其餘不多一個 key', () => {
    const images = new Map([
      [
        'material',
        new Map([
          ['ceramic', '/api/brand-options/stage2/material/ceramic.webp'],
          ['marble', '/api/brand-options/stage2/material/marble.webp'],
        ]),
      ],
    ]);

    const next = attachOptionImages(schemaOf(), images);
    const cat = next.cat as Record<string, { groups: { items: Record<string, unknown>[] }[] }>;
    const items = cat.material?.groups[0]?.items ?? [];

    expect(items[0]).toEqual({
      id: 'ceramic',
      zh: '霧面陶瓷',
      img: '/api/brand-options/stage2/material/ceramic.webp',
    });
    expect(items[2]).toEqual({ id: 'glass_clear', zh: '清透玻璃' });
  });

  it('同一個 id 在不同維度貼不同的圖', () => {
    const images = new Map([
      ['material', new Map([['ceramic', '/api/brand-options/stage2/material/ceramic.webp']])],
      ['surface', new Map([['ceramic', '/api/brand-options/stage2/surface/ceramic.webp']])],
    ]);

    const next = attachOptionImages(schemaOf(), images);
    const cat = next.cat as Record<string, { groups: { items: Record<string, unknown>[] }[] }>;

    expect(cat.material?.groups[0]?.items[0]?.img).toBe(
      '/api/brand-options/stage2/material/ceramic.webp',
    );
    expect(cat.surface?.groups[0]?.items[0]?.img).toBe(
      '/api/brand-options/stage2/surface/ceramic.webp',
    );
  });

  it('只有一個維度有圖時，另一個維度原樣不動', () => {
    const images = new Map([
      ['material', new Map([['ceramic', '/api/brand-options/stage2/material/ceramic.webp']])],
    ]);

    const next = attachOptionImages(schemaOf(), images);
    const cat = next.cat as Record<string, { groups: { items: Record<string, unknown>[] }[] }>;

    expect(cat.surface?.groups[0]?.items[0]).toEqual({ id: 'ceramic', zh: '霧面陶瓷' });
  });

  it('不改動原本的 schema（同一個物件會被多個請求共用）', () => {
    const original = schemaOf();
    const images = new Map([
      ['material', new Map([['ceramic', '/api/brand-options/stage2/material/ceramic.webp']])],
    ]);

    attachOptionImages(original, images);

    const cat = original.cat as Record<string, { groups: { items: Record<string, unknown>[] }[] }>;
    expect(cat.material?.groups[0]?.items[0]).toEqual({ id: 'ceramic', zh: '霧面陶瓷' });
  });

  it('沒有圖時原樣回傳，不重新包裝', () => {
    const original = schemaOf();

    expect(attachOptionImages(original, new Map())).toBe(original);
  });

  it('圖對不上任何選項時原樣回傳', () => {
    const original = schemaOf();
    const images = new Map([['no_such_dimension', new Map([['ceramic', '/x.webp']])]]);

    expect(attachOptionImages(original, images)).toBe(original);
  });

  it('cat 不是物件時不炸，原樣回傳', () => {
    const broken = { cat: null };

    expect(
      attachOptionImages(broken, new Map([['material', new Map([['ceramic', '/x.webp']])]])),
    ).toBe(broken);
  });
});
