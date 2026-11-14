import { describe, expect, it } from 'vitest';
import {
  emptyBrandDocument,
  renderBrandHtml,
  schemaForPage,
  type ComposedBrand,
  type ComposedPage,
  type MascotPayload,
  type VideoPayload,
  type CustomPayload,
} from '../src/brand/index.ts';

/**
 * 吉祥物頁、影片頁（長片／短片）、自定義頁 assets（v2.2）。
 *
 * 三個要點：
 *   1. normalize 舊資料／半份資料讀入不炸（向後相容）。
 *   2. gaps 每個根本原因各計一條。
 *   3. prompt 完整輸出；tokens 回 null。
 */

/* ── 吉祥物頁 ─────────────────────────────────────────────────── */

describe('吉祥物頁 schema', () => {
  const schema = schemaForPage('mascot', 'fixed');

  it('slot 是 mascot，tokens 回 null', () => {
    expect(schema.slot).toBe('mascot');
    expect(schema.tokens(schema.empty())).toBeNull();
    expect(schema.tokensNote).not.toBeNull();
  });

  it('empty 給出完整空結構', () => {
    const payload = schema.empty() as MascotPayload;
    expect(payload.correction).toBe('');
    expect(payload.spine).toBe('');
    expect(payload.boundaries).toEqual([]);
    expect(payload.open).toEqual([]);
    expect(payload.characters).toEqual([]);
  });

  it('normalize 舊資料不炸：缺的欄位補空', () => {
    const payload = schema.normalize({ correction: '以前說錯了', characters: [{ name: '小明' }] }) as MascotPayload;
    expect(payload.correction).toBe('以前說錯了');
    expect(payload.spine).toBe('');
    expect(payload.boundaries).toEqual([]);
    expect(payload.characters).toHaveLength(1);
    expect(payload.characters[0]?.name).toBe('小明');
    expect(payload.characters[0]?.file_ref).toBe('');
  });

  it('全空時 gaps：correction／spine／boundaries／open／角色各一條', () => {
    const gaps = schema.gaps(schema.empty());
    expect(gaps).toHaveLength(5);
    expect(gaps.map((g) => g.item)).toEqual([
      'mascot.correction',
      'mascot.spine',
      'mascot.boundaries',
      'mascot.open',
      'mascot.characters',
    ]);
  });

  it('角色缺 file_ref 各計一條', () => {
    const payload = schema.normalize({
      correction: 'x',
      spine: 'x',
      boundaries: ['x'],
      open: ['x'],
      characters: [
        { name: 'A', file_ref: '' },
        { name: 'B', file_ref: 'file-123' },
      ],
    });
    const gaps = schema.gaps(payload);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.item).toBe('mascot.character.A');
    expect(gaps[0]?.type).toBe('file');
  });

  it('prompt 完整輸出吉祥物', () => {
    const payload = schema.normalize({
      correction: '以前說吉祥物會飛，其實不會',
      spine: '它是品牌的笨朋友',
      boundaries: ['可以撞板', '不可以講專業的事'],
      open: ['名字還未定'],
      characters: [{ name: '小明', role: '主角', description: '笨但忠誠', file_ref: 'file-1' }],
    });
    const sections = schema.prompt(payload);
    expect(sections).toHaveLength(1);
    const lines = sections[0]!.lines;
    expect(lines.some((l) => l.includes('以前說吉祥物會飛'))).toBe(true);
    expect(lines.some((l) => l.includes('笨朋友'))).toBe(true);
    expect(lines.some((l) => l.includes('可以撞板'))).toBe(true);
    expect(lines.some((l) => l.includes('小明'))).toBe(true);
    expect(lines.some((l) => l.includes('file-1'))).toBe(true);
  });
});

/* ── 影片頁 ───────────────────────────────────────────────────── */

describe('影片頁 schema（長片與短片）', () => {
  for (const key of ['video-long', 'video-short'] as const) {
    const schema = schemaForPage(key, 'fixed');

    it(`${key}：slot 是 video，tokens 回 null`, () => {
      expect(schema.slot).toBe('video');
      expect(schema.tokens(schema.empty())).toBeNull();
    });

    it(`${key}：empty 給出完整空結構`, () => {
      const payload = schema.empty() as VideoPayload;
      expect(payload.video_stance).toBe('');
      expect(payload.structure).toEqual({ hook: '', body: '', cta: '' });
      expect(payload.examples).toEqual([]);
    });

    it(`${key}：normalize 舊資料不炸`, () => {
      const payload = schema.normalize({ video_stance: 'x', examples: [{ title: 'A' }] }) as VideoPayload;
      expect(payload.video_stance).toBe('x');
      expect(payload.duration).toBe('');
      expect(payload.examples[0]?.title).toBe('A');
    });

    it(`${key}：全空時 gaps 有立場、時長、畫幅、範例`, () => {
      const gaps = schema.gaps(schema.empty());
      const items = gaps.map((g) => g.item);
      expect(items).toContain(`${key}.stance`);
      expect(items).toContain(`${key}.duration`);
      expect(items).toContain(`${key}.aspect`);
      expect(items).toContain(`${key}.examples`);
    });

    it(`${key}：範例缺 file_ref 各計一條`, () => {
      const payload = schema.normalize({
        video_stance: 'x',
        duration: 'x',
        aspect: 'x',
        examples: [{ title: 'A', file_ref: '' }],
      });
      const gaps = schema.gaps(payload);
      expect(gaps.some((g) => g.item === `${key}.examples.0.file_ref`)).toBe(true);
    });

    it(`${key}：prompt 輸出規格與結構`, () => {
      const payload = schema.normalize({
        video_stance: '教人做事',
        duration: '3 分鐘',
        aspect: '直屏 9:16',
        pacing: '快',
        structure: { hook: '前三秒', body: '教學', cta: '追蹤' },
        audio: '背景音樂',
        captions: '全字幕',
        thumbnail: '封面要有字',
        examples: [{ title: '第一支', format: 'MP4', file_ref: 'f1', why: '好' }],
        do: ['用真場景'],
        dont: ['不要濾鏡'],
      });
      const lines = schema.prompt(payload)[0]!.lines;
      expect(lines.some((l) => l.includes('教人做事'))).toBe(true);
      expect(lines.some((l) => l.includes('3 分鐘'))).toBe(true);
      expect(lines.some((l) => l.includes('前三秒'))).toBe(true);
      expect(lines.some((l) => l.includes('第一支'))).toBe(true);
      expect(lines.some((l) => l.includes('用真場景'))).toBe(true);
    });
  }
});

/* ── 自定義頁 assets ───────────────────────────────────────────── */

describe('自定義頁 assets', () => {
  const schema = schemaForPage('custom', 'custom');

  it('empty 給出 assets: []', () => {
    const payload = schema.empty() as CustomPayload;
    expect(payload.assets).toEqual([]);
  });

  it('normalize 保留 assets', () => {
    const payload = schema.normalize({
      decided: 'x',
      assets: [{ id: '1', label: '圖', file_ref: 'f1', use: '封面' }],
    }) as CustomPayload;
    expect(payload.assets).toHaveLength(1);
    expect(payload.assets[0]?.label).toBe('圖');
    expect(payload.assets[0]?.use).toBe('封面');
  });

  it('gaps 不強制要有 assets', () => {
    const gaps = schema.gaps(schema.normalize({ decided: 'x', rules: ['r1'] }));
    expect(gaps).toHaveLength(0);
  });

  it('prompt 列出 assets 的 label 與 use', () => {
    const payload = schema.normalize({
      decided: 'x',
      assets: [{ id: '1', label: '包裝圖', file_ref: 'f1', use: '印刷' }],
    }) as CustomPayload;
    const lines = schema.prompt(payload)[0]!.lines;
    expect(lines.some((l) => l.includes('包裝圖') && l.includes('印刷'))).toBe(true);
  });
});

/* ── output：mascot／video／custom 分支 ───────────────────────── */

function makePage(key: string, kind: 'fixed' | 'custom', payload: Record<string, unknown>): ComposedPage {
  const schema = schemaForPage(key, kind);
  return {
    key,
    name: schema.name,
    kind,
    versionNo: 1,
    policyVersionNo: null,
    document: { ...emptyBrandDocument(schema.layout(schema.normalize(payload))), payload },
  };
}

function composed(pages: ComposedPage[]): ComposedBrand {
  return { code: 'test', name: '測試品牌', releaseNo: 1, pages, gaps: [] };
}

describe('renderBrandKitExtras：mascot／video／custom 分支', () => {
  it('mascot 頁輸出角色圖檔（故事由 schema sections 畫，唔重複）', () => {
    const page = makePage('mascot', 'fixed', {
      correction: '以前說錯了',
      spine: '核心一句',
      boundaries: ['邊界一'],
      open: ['未決一'],
      characters: [{ id: '1', name: '小明', role: '主角', description: '笨', file_ref: 'f1' }],
    });
    const html = renderBrandHtml(composed([page]));
    expect(html).toContain('data-block="mascot"');
    expect(html).toContain('角色圖檔');
    expect(html).toContain('核心一句');
    expect(html).toContain('小明');
  });

  it('video 頁輸出「已核准影片範例」', () => {
    const page = makePage('video-long', 'fixed', {
      video_stance: 'x',
      examples: [{ id: '1', title: '第一支', file_ref: 'f1', format: 'MP4', why: '好' }],
    });
    const html = renderBrandHtml(composed([page]));
    expect(html).toContain('data-block="video-examples"');
    expect(html).toContain('已核准影片範例');
    expect(html).toContain('第一支');
  });

  it('video 頁封面出 figure，不出 UUID 文字欄', () => {
    const page = makePage('video-long', 'fixed', {
      video_stance: 'x',
      audio: '旁白',
      captions: '字幕',
      thumbnail: '4d9baa47-6f85-49fb-91f0-a9c307b6e7f4',
      examples: [],
    });
    const html = renderBrandHtml(composed([page]));
    expect(html).toContain('data-block="video-thumbnail"');
    // 封面是資產（figure），唔可以淪為 fields 行入面嘅 raw UUID。
    expect(html).not.toContain('data-field="thumbnail"');
    expect(html).not.toContain('4d9baa47-6f85-49fb-91f0-a9c307b6e7f4');
  });

  it('custom 頁輸出 assets kit-grid（鍵係 slug，唔係 custom）', () => {
    // 真實自定義頁嘅鍵係 slug（packaging）；用 'custom' 做鍵會遮住 kind 判斷嘅 bug。
    const page = makePage('packaging', 'custom', {
      decided: 'x',
      assets: [{ id: '1', label: '包裝圖', file_ref: 'f1', use: '印刷' }],
    });
    const html = renderBrandHtml(composed([page]));
    expect(html).toContain('data-block="custom-assets"');
    expect(html).toContain('包裝圖');
    expect(html).toContain('印刷');
  });

  it('records 檔案欄印檔名，唔印 raw UUID', () => {
    const page = makePage('mascot', 'fixed', {
      correction: '',
      spine: '',
      boundaries: [],
      open: [],
      characters: [
        { id: '1', name: '貓', role: '客人', description: 'x', file_ref: '493d61ad-7a84-4931-be24-1ccee27aa253', file_name: 'moonic-cat.svg' },
        { id: '2', name: '寵物', role: '部位', description: 'x', file_ref: '692a4d10-9a35-44ab-9de7-9499be185d5f' },
      ],
    });
    const html = renderBrandHtml(composed([page]));
    expect(html).toContain('moonic-cat.svg');
    expect(html).not.toContain('493d61ad-7a84-4931-be24-1ccee27aa253');
    // 冇 file_name 就如實寫「資產檔」，唔編一個假檔名。
    expect(html).toContain('資產檔');
  });

  it('image 頁不再輸出吉祥物（搬到了 mascot 頁）', () => {
    const page = makePage('image', 'fixed', {
      image_stance: '照片是證明',
      reference_photos: [],
      mascot: {
        correction: 'x',
        spine: 'x',
        boundaries: [],
        open: [],
        characters: [{ id: '1', name: '小明', role: '', description: '', file_ref: 'f1' }],
      },
    });
    const html = renderBrandHtml(composed([page]));
    expect(html).not.toContain('data-block="mascot"');
    expect(html).not.toContain('吉祥物與角色');
  });
});
