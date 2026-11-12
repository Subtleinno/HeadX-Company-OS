/**
 * 已核准範例的**資料層**（issue #68）。
 *
 * 品牌除了規則，也要有「做對的樣子」。這一頁的兩張表是兩件事：
 *
 *   1. 範例：一件真的成品，連格式、連它用了哪幾頁的哪一版、連一句「為咩好」。
 *   2. 成功 prompt：成品、prompt、當時的品牌版本三者一齊存 —— 少一樣就重用
 *      不到，只可以看。
 *
 * 「品牌版本」在後端是 `brand_release`：每次落一版，快照就是**當時每一頁的
 * 版號**。那一份快照正好就是範例要記的東西，所以範例直接存「哪一頁的第幾版」
 * （`色彩 v3 · 語氣 v2` 是它的可讀寫法），而不是另存一個 release 編號 ——
 * 前端目前拿不到 release_no，而就算拿到，也只是同一份資料的另一個寫法。
 * 品牌一改，這一組就對不上，範例照樣保留它自己的版本，並標「舊版」。這是
 * 驗收第二條（舊範例仍標示它用的版本）的實作。
 *
 * 舊版判斷、缺口、重用計劃全部是純函式：畫面只決定人怎樣改。
 */

import { schemaForPage, type ExamplePayload } from '@company-os/contracts';
import type { BrandPageSummary } from '../api';

export type ExampleDoc = ExamplePayload;

export type ExampleRow = ExamplePayload['examples'][number];

export type PromptRow = ExamplePayload['prompts'][number];

export type PageRef = ExampleRow['page_refs'][number];

const EXAMPLE_SCHEMA = schemaForPage('examples', 'fixed');

/* ── 讀與寫 ───────────────────────────────────────────────── */

export type ParseExampleResult =
  | { kind: 'ok'; doc: ExampleDoc }
  | { kind: 'empty' }
  | { kind: 'invalid' };

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * 認得這份 JSON 是不是一張範例表。
 *
 * 這兩張表之前不存在（#39 之後一直是自由文字），所以「讀不到」的情況主要是
 * 任意 JSON。硬讀會畫出一張「一個範例都未有」的空表，而它看起來像已經檢查過。
 */
export function parseExampleDoc(value: string): ParseExampleResult {
  if (value.trim() === '') {
    return { kind: 'empty' };
  }

  let raw: unknown;

  try {
    raw = JSON.parse(value);
  } catch {
    return { kind: 'invalid' };
  }

  const record = asRecord(raw);

  if (record === null) {
    return { kind: 'invalid' };
  }

  const shaped = Array.isArray(record.examples) || Array.isArray(record.prompts);

  if (!shaped) {
    return { kind: 'invalid' };
  }

  return { kind: 'ok', doc: EXAMPLE_SCHEMA.normalize(raw) as ExampleDoc };
}

export function serializeExampleDoc(doc: ExampleDoc): string {
  return JSON.stringify(EXAMPLE_SCHEMA.normalize(doc));
}

export function emptyExampleDoc(): ExampleDoc {
  return { examples: [], prompts: [] };
}

export function hasAnyValue(doc: ExampleDoc): boolean {
  return doc.examples.length > 0 || doc.prompts.length > 0;
}

/* ── 範例 ─────────────────────────────────────────────────── */

export function emptyExampleRow(): ExampleRow {
  return { title: '', format: '', file_ref: '', page_refs: [], why: '' };
}

export function emptyPromptRow(): PromptRow {
  return { prompt: '', output_ref: '', brand_ref: '', note: '' };
}

export function addExample(doc: ExampleDoc): ExampleDoc {
  return { ...doc, examples: [...doc.examples, emptyExampleRow()] };
}

export function removeExample(doc: ExampleDoc, index: number): ExampleDoc {
  return { ...doc, examples: doc.examples.filter((_, at) => at !== index) };
}

export function setExample(doc: ExampleDoc, index: number, patch: Partial<ExampleRow>): ExampleDoc {
  return {
    ...doc,
    examples: doc.examples.map((row, at) => (at === index ? { ...row, ...patch } : row)),
  };
}

/* ── 一份範例用了哪幾頁的哪一版 ────────────────────────────── */

export function addRef(doc: ExampleDoc, index: number, page: string, version: number): ExampleDoc {
  const row = doc.examples[index];

  if (row === undefined || page.trim() === '') {
    return doc;
  }

  // 同一頁只記一版：兩版同時「用過」是兩份真相。
  const refs = row.page_refs.filter((ref) => ref.page !== page);
  const next = [...refs, { page: page.trim(), version }];

  return setExample(doc, index, { page_refs: next });
}

export function removeRef(doc: ExampleDoc, index: number, page: string): ExampleDoc {
  const row = doc.examples[index];

  if (row === undefined) {
    return doc;
  }

  return setExample(doc, index, { page_refs: row.page_refs.filter((ref) => ref.page !== page) });
}

/* ── 成功 prompt ──────────────────────────────────────────── */

export function addPrompt(doc: ExampleDoc): ExampleDoc {
  return { ...doc, prompts: [...doc.prompts, emptyPromptRow()] };
}

export function removePrompt(doc: ExampleDoc, index: number): ExampleDoc {
  return { ...doc, prompts: doc.prompts.filter((_, at) => at !== index) };
}

export function setPrompt(doc: ExampleDoc, index: number, patch: Partial<PromptRow>): ExampleDoc {
  return {
    ...doc,
    prompts: doc.prompts.map((row, at) => (at === index ? { ...row, ...patch } : row)),
  };
}

/* ── 品牌版本：各頁現行版本的組合 ─────────────────────────── */

export type VersionPin = { page: string; name: string; version: number };

/** 每個有現行版本的頁，按頁的次序排。冇版本的頁不入（未有一版＝未有版本可引用）。 */
export function currentPins(pages: BrandPageSummary[]): VersionPin[] {
  return pages
    .filter((page) => page.current !== null)
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((page) => ({ page: page.key, name: page.name, version: page.current?.versionNo ?? 0 }));
}

/**
 * 現行品牌版本的寫法：`色彩 v3 · 語氣 v2`。
 *
 * 這不是一個全域編號 —— 平台沒有。用組合，是因為「品牌版本」變了實際上就是
 * 某幾頁變了；寫成一個數字反而講不出差在哪。
 */
export function brandVersionOf(pages: BrandPageSummary[]): string {
  return currentPins(pages)
    .map((pin) => `${pin.name} v${pin.version}`)
    .join(' · ');
}

/* ── 舊版判斷 ─────────────────────────────────────────────── */

export type RefState = 'ok' | 'missing-page' | 'stale';

/** 一條引用：頁還在不在、當時那一版是不是仍然現行。 */
export function refState(ref: PageRef, pages: BrandPageSummary[]): RefState {
  const page = pages.find((item) => item.key === ref.page);

  if (page === undefined || page.current === null) {
    return 'missing-page';
  }

  return page.current.versionNo > ref.version ? 'stale' : 'ok';
}

/** 這一個範例有沒有用到舊版（任何一頁）。 */
export function rowStale(row: ExampleRow, pages: BrandPageSummary[]): boolean {
  return row.page_refs.some((ref) => refState(ref, pages) !== 'ok');
}

/** 範例的版本標籤：用的版本，不是現在的版本 —— 舊範例要保留它當時那一版。 */
export function rowVersions(row: ExampleRow, pages: BrandPageSummary[]): string {
  return row.page_refs
    .map((ref) => {
      const page = pages.find((item) => item.key === ref.page);
      return `${page?.name ?? ref.page} v${ref.version}`;
    })
    .join(' · ');
}

/** 成功 prompt 當時的品牌版本與現在不同就是舊版。 */
export function promptStale(row: PromptRow, pages: BrandPageSummary[]): boolean {
  return row.brand_ref.trim() !== '' && row.brand_ref.trim() !== brandVersionOf(pages);
}

/* ── 重用 ─────────────────────────────────────────────────── */

export type ReusePlan = {
  /** 以現行版本重用的品牌版本。 */
  now: string;
  /** 由舊版變成現行的頁。 */
  moved: { page: string; name: string; from: number; to: number }[];
  /** 當時用了、現在未有現行版本的頁。 */
  gone: string[];
  /** 當時的品牌版本（重用之前那一組）。 */
  before: string;
};

/**
 * 重用計劃：重用一定用**現行**版本，而畫面上要講清楚「與當時差在哪」。
 *
 * 只講「可以重用」沒有用：品牌改過之後，同一個 prompt 會做出另一間公司的
 * 東西。所以要逐頁講由第幾版變成第幾版。
 */
export function reusePlan(row: PromptRow, pages: BrandPageSummary[]): ReusePlan {
  const moved: ReusePlan['moved'] = [];
  const gone: string[] = [];

  for (const pin of currentPins(pages)) {
    const marker = `${pin.name} v`;
    const at = row.brand_ref.indexOf(marker);

    if (at < 0) {
      continue;
    }

    const tail = row.brand_ref.slice(at + marker.length);
    const from = Number(/^\d+/.exec(tail)?.[0] ?? '');

    if (!Number.isFinite(from)) {
      continue;
    }

    if (pin.version > from) {
      moved.push({ page: pin.page, name: pin.name, from, to: pin.version });
    }
  }

  for (const name of row.brand_ref.split(' · ')) {
    const pageName = name.replace(/\s+v\d+$/, '').trim();

    if (pageName === '' || pageName === row.brand_ref.trim()) {
      continue;
    }

    const live = pages.some((page) => page.name === pageName && page.current !== null);

    if (!live) {
      gone.push(pageName);
    }
  }

  return { now: brandVersionOf(pages), moved, gone, before: row.brand_ref.trim() };
}

/* ── 缺什麼 ───────────────────────────────────────────────── */

export type ExampleGaps = {
  noExamples: boolean;
  noPrompts: boolean;
  /** 逐個範例標缺：名稱、檔案、格式、為咩好、用了哪幾頁版本。 */
  rows: { index: number; missing: ('title' | 'file' | 'format' | 'why' | 'refs')[] }[];
  /** 逐個成功 prompt 標缺：prompt、成品、品牌版本。 */
  prompts: { index: number; missing: ('prompt' | 'output' | 'brand')[] }[];
};

export function exampleGaps(doc: ExampleDoc): ExampleGaps {
  return {
    noExamples: doc.examples.length === 0,
    noPrompts: doc.prompts.length === 0,
    rows: doc.examples
      .map((row, index) => {
        const missing: ('title' | 'file' | 'format' | 'why' | 'refs')[] = [];

        if (row.title.trim() === '') {
          missing.push('title');
        }

        if (row.file_ref.trim() === '') {
          missing.push('file');
        }

        if (row.format.trim() === '') {
          missing.push('format');
        }

        if (row.why.trim() === '') {
          missing.push('why');
        }

        if (row.page_refs.length === 0) {
          missing.push('refs');
        }

        return { index, missing };
      })
      .filter((row) => row.missing.length > 0),
    prompts: doc.prompts
      .map((row, index) => {
        const missing: ('prompt' | 'output' | 'brand')[] = [];

        if (row.prompt.trim() === '') {
          missing.push('prompt');
        }

        if (row.output_ref.trim() === '') {
          missing.push('output');
        }

        if (row.brand_ref.trim() === '') {
          missing.push('brand');
        }

        return { index, missing };
      })
      .filter((row) => row.missing.length > 0),
  };
}

export function gapCount(gaps: ExampleGaps): number {
  return (
    (gaps.noExamples ? 1 : 0) +
    (gaps.noPrompts ? 1 : 0) +
    gaps.rows.reduce((total, row) => total + row.missing.length, 0) +
    gaps.prompts.reduce((total, row) => total + row.missing.length, 0)
  );
}

/* ── 版本預覽 ─────────────────────────────────────────────── */

/** 版本列表的預覽：先講第一個範例，再講有幾個 prompt。抽不到就空。 */
export function examplePreview(value: string): string {
  const title = /"title":"([^"\\]{1,80})/.exec(value);

  if (title?.[1] !== undefined && title[1].trim() !== '') {
    return title[1].trim();
  }

  return '';
}
