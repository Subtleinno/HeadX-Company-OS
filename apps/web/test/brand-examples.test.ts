import { describe, expect, it } from 'vitest';
import {
  addExample,
  addPrompt,
  addRef,
  brandVersionOf,
  exampleGaps,
  examplePreview,
  gapCount,
  hasAnyValue,
  parseExampleDoc,
  promptStale,
  refState,
  removeExample,
  removeRef,
  reusePlan,
  rowStale,
  rowVersions,
  serializeExampleDoc,
  setExample,
  setPrompt,
  type ExampleDoc,
} from '../src/design/brandExamples';
import type { BrandPageSummary } from '../src/api';
import { fullExampleDoc, thinExampleDoc } from './fixtures/brandExamples';

/**
 * 已核准範例（issue #68）的純規則。
 *
 * 驗的是三件事：範例記得住「當時用哪幾版」、品牌改過之後標「舊版」而唔改寫
 * 範例、重用的時候講得出差在哪（逐頁由第幾版到第幾版）。
 */

function page(
  key: string,
  name: string,
  order: number,
  versionNo: number | null,
  kind: 'fixed' | 'custom' = 'fixed',
): BrandPageSummary {
  return {
    id: `p-${key}`,
    brandId: 'b-1',
    kind,
    key,
    name,
    brief: null,
    sortOrder: order,
    group: 'identity',
    current:
      versionNo === null
        ? null
        : {
            id: `v-${key}-${versionNo}`,
            versionNo,
            createdAt: '2026-11-11T10:00:00.000Z',
            note: null,
            preview: '',
            policyVersionNo: 1,
            changed: [],
          },
  };
}

const PAGES: BrandPageSummary[] = [
  page('home', '品牌主頁', 10, 1),
  page('logo', '標誌', 20, 1),
  page('color', '色彩', 30, 3),
  page('type', '字體', 40, 2),
  page('tone', '語氣', 50, 2),
  page('examples', '已核准範例', 90, 1),
];

describe('讀與寫', () => {
  it('空內容是「未開始」，不是壞掉', () => {
    expect(parseExampleDoc('')).toEqual({ kind: 'empty' });
  });

  it('任意 JSON 不當成空表', () => {
    expect(parseExampleDoc('{"foo":1}')).toEqual({ kind: 'invalid' });
    expect(parseExampleDoc('not json')).toEqual({ kind: 'invalid' });
  });

  it('兩張表其中一張存在就認得，讀得返自己寫的', () => {
    const doc = fullExampleDoc();
    const parsed = parseExampleDoc(serializeExampleDoc(doc));

    expect(parsed.kind).toBe('ok');
    expect(parsed.kind === 'ok' && parsed.doc).toEqual(doc);
  });

  it('空表寫成空字串，唔會留一份空 JSON', () => {
    expect(hasAnyValue({ examples: [], prompts: [] })).toBe(false);
    expect(hasAnyValue(fullExampleDoc())).toBe(true);
  });
});

describe('登記範例', () => {
  it('加一件就是一件空白的，移除按索引', () => {
    let doc = addExample({ examples: [], prompts: [] });

    expect(doc.examples).toEqual([{ title: '', format: '', file_ref: '', page_refs: [], why: '' }]);
    expect(removeExample(doc, 0).examples).toEqual([]);

    doc = setExample(doc, 0, { title: '門貼' });
    expect(doc.examples[0]?.title).toBe('門貼');
  });

  it('同一頁只記一版：再勾一次是改版本，不是多一條', () => {
    let doc = addRef(fullExampleDoc(), 0, 'color', 2);

    expect(doc.examples[0]?.page_refs.filter((ref) => ref.page === 'color')).toEqual([
      { page: 'color', version: 2 },
    ]);

    doc = removeRef(doc, 0, 'color');
    expect(doc.examples[0]?.page_refs.some((ref) => ref.page === 'color')).toBe(false);
  });

  it('加成功 prompt 是空白三格', () => {
    const doc = addPrompt({ examples: [], prompts: [] });

    expect(doc.prompts).toEqual([{ prompt: '', output_ref: '', brand_ref: '', note: '' }]);
    expect(setPrompt(doc, 0, { prompt: '做一張貼文' }).prompts[0]?.prompt).toBe('做一張貼文');
  });
});

describe('品牌版本是各頁現行版本的組合', () => {
  it('按頁的次序串起來，冇版本的頁不入', () => {
    expect(brandVersionOf(PAGES)).toBe('品牌主頁 v1 · 標誌 v1 · 色彩 v3 · 字體 v2 · 語氣 v2 · 已核准範例 v1');
    expect(brandVersionOf([page('color', '色彩', 30, null)])).toBe('');
  });
});

describe('舊版判斷：範例保留它當時那一版', () => {
  it('頁還在但版本舊了就是 stale', () => {
    const ref = { page: 'color', version: 1 };

    expect(refState(ref, PAGES)).toBe('stale');
    expect(refState({ page: 'color', version: 3 }, PAGES)).toBe('ok');
    expect(refState({ page: 'naming', version: 1 }, PAGES)).toBe('missing-page');
    expect(refState({ page: 'type', version: 1 }, [page('type', '字體', 40, null)])).toBe('missing-page');
  });

  it('任何一頁舊了，這一件範例就標舊版', () => {
    expect(rowStale(fullExampleDoc().examples[0]!, PAGES)).toBe(true);
    expect(rowStale(fullExampleDoc().examples[1]!, PAGES)).toBe(false);
  });

  it('版本標籤顯示它用的版本，不是現在的版本', () => {
    expect(rowVersions(fullExampleDoc().examples[0]!, PAGES)).toBe('色彩 v1 · 語氣 v1');
  });

  it('成功 prompt 當時的版本與現在不同就是舊版', () => {
    const row = fullExampleDoc().prompts[0]!;

    expect(promptStale(row, PAGES)).toBe(true);
    expect(promptStale({ ...row, brand_ref: brandVersionOf(PAGES) }, PAGES)).toBe(false);
    // 未填版本不算舊版：它是缺，不是過時。
    expect(promptStale({ ...row, brand_ref: '' }, PAGES)).toBe(false);
  });
});

describe('重用：一定用現行版本，並講出差在哪', () => {
  it('逐頁講由第幾版到第幾版', () => {
    const plan = reusePlan(fullExampleDoc().prompts[0]!, PAGES);

    expect(plan.before).toBe('色彩 v1 · 語氣 v1');
    expect(plan.now).toContain('色彩 v3');
    expect(plan.moved).toEqual([
      { page: 'color', name: '色彩', from: 1, to: 3 },
      { page: 'tone', name: '語氣', from: 1, to: 2 },
    ]);
    expect(plan.gone).toEqual([]);
  });

  it('當時用過的頁現在未有版本：講「當時有，現在未有」', () => {
    const plan = reusePlan(
      { prompt: 'x', output_ref: 'y', brand_ref: '色彩 v1 · 圖像 v1', note: '' },
      PAGES,
    );

    expect(plan.moved).toEqual([{ page: 'color', name: '色彩', from: 1, to: 3 }]);
    expect(plan.gone).toEqual(['圖像']);
  });

  it('版本一樣就沒有差，可以直接重用', () => {
    const plan = reusePlan(
      { prompt: 'x', output_ref: 'y', brand_ref: brandVersionOf(PAGES), note: '' },
      PAGES,
    );

    expect(plan.moved).toEqual([]);
    expect(plan.gone).toEqual([]);
  });
});

describe('缺什麼：逐件逐格標', () => {
  it('一件範例缺四格、冇 prompt：逐項列出', () => {
    const gaps = exampleGaps(thinExampleDoc());

    expect(gaps.noExamples).toBe(false);
    expect(gaps.noPrompts).toBe(true);
    expect(gaps.rows[0]?.missing).toEqual(['file', 'format', 'why', 'refs']);
    // 1 個「冇 prompt」+ 4 格 = 5。
    expect(gapCount(gaps)).toBe(5);
  });

  it('一個範例都未有：兩張表各算一個缺', () => {
    const gaps = exampleGaps({ examples: [], prompts: [] });

    expect(gaps.noExamples).toBe(true);
    expect(gaps.noPrompts).toBe(true);
    expect(gapCount(gaps)).toBe(2);
  });

  it('成功 prompt 缺成品與版本，prompt 本身有寫就不算缺', () => {
    const doc: ExampleDoc = {
      examples: fullExampleDoc().examples,
      prompts: [{ prompt: '有寫', output_ref: '', brand_ref: '', note: '' }],
    };

    expect(exampleGaps(doc).prompts[0]?.missing).toEqual(['output', 'brand']);
  });

  it('齊了就是零缺', () => {
    const doc: ExampleDoc = { ...fullExampleDoc() };

    doc.examples = doc.examples.map((row) => ({
      ...row,
      page_refs: row.page_refs.map((ref) => ({ ...ref, version: PAGES.find((p) => p.key === ref.page)?.current?.versionNo ?? ref.version })),
    }));
    doc.prompts = doc.prompts.map((row) => ({ ...row, brand_ref: brandVersionOf(PAGES) }));

    expect(gapCount(exampleGaps(doc))).toBe(0);
  });
});

describe('版本預覽', () => {
  it('先講第一件範例的名稱，抽不到就空', () => {
    expect(examplePreview(serializeExampleDoc(fullExampleDoc()))).toBe('春季療程社交貼文');
    expect(examplePreview('{}')).toBe('');
  });
});
