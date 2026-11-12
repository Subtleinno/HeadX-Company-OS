/**
 * 品牌文件的**外殼**（issue #57，決策 C112）。
 *
 * 這裡只有「一頁品牌內容長什麼樣」這一件事，沒有任何一頁的欄位：各頁的欄位
 * 在 `schemas.ts` 由各頁 issue 定義。分開的原因很實際 —— 第一版把形狀散在
 * 六個編輯器裡，結果改一次欄位要改六個地方，改到第三個就開始不一致。
 *
 * 六件事，每一件都掛在同一個外殼上：
 *
 *   brand／page／version  由資料庫給（`brand_page_version`），不進來這裡。
 *   payload               這一頁的內容，帶型別（各頁自定）。
 *   layout                區塊清單：選哪些區塊、先後、重點、**理由**。
 *   rationale             逐個欄位的理由（`payload` 的路徑 → 一句話）。
 *   gaps                  缺什麼。缺是資料，不是畫面狀態 —— 所以存得入版本。
 *   refs                  這一版引用了哪一頁的哪一版、哪個資產、哪個範例。
 *
 * **HTML 不是內容。** `layout` 只講「用哪個區塊、為咩」，區塊本身怎樣畫由
 * renderer 決定（`output.ts` 與 web 的唯讀畫面）。所以同一份 payload 可以出
 * HTML、tokens.json、prompt 包、A4 印刷版，四者不會各說各話。
 *
 * **版號不是 `1` 起計的新東西。** 沿用 #33 的版本鏈：這一支只管 `document`
 * 這一欄的形狀。
 */

/** 九個策略槽（C113）。`custom` 是自定義頁通用槽。 */
export const BRAND_SLOTS = [
  'platform',
  'color',
  'type',
  'logo',
  'tone',
  'image',
  'home',
  'apply',
  'custom',
] as const;

export type BrandSlot = (typeof BRAND_SLOTS)[number];

/**
 * 八個固定頁的鍵，加上自定義頁（鍵由 slug 決定）。
 *
 * 次序是左側欄的次序（`home` 在最前，`examples` 在 APPLY 組）。鍵是網址的
 * 一部分，改一個字就會令舊書籤 404。
 */
export const BRAND_FIXED_PAGES: readonly {
  key: string;
  name: string;
  slot: BrandSlot;
  group: 'home' | 'identity' | 'apply';
  order: number;
}[] = [
  { key: 'home', name: '品牌主頁', slot: 'home', group: 'home', order: 10 },
  { key: 'platform', name: '平台', slot: 'platform', group: 'identity', order: 20 },
  { key: 'color', name: '色彩', slot: 'color', group: 'identity', order: 30 },
  { key: 'type', name: '字體', slot: 'type', group: 'identity', order: 40 },
  { key: 'logo', name: '標誌', slot: 'logo', group: 'identity', order: 50 },
  { key: 'tone', name: '語氣', slot: 'tone', group: 'identity', order: 60 },
  { key: 'image', name: '圖像', slot: 'image', group: 'identity', order: 70 },
  { key: 'examples', name: '已核准範例', slot: 'apply', group: 'apply', order: 90 },
];

export const BRAND_FIXED_PAGE_KEYS: readonly string[] = BRAND_FIXED_PAGES.map((page) => page.key);

/**
 * 區塊詞彙。**九種，不多不少**：多一種就要九個地方都畫得出來。
 *
 *   stance        立場句（每一頁第一屏，引用平台頁）
 *   section       這一頁自己的一個段落（`source` 指 schema 的 section id）
 *   swatches      色樣（只出現在色彩頁與引用色彩的頁）
 *   typeSpecimen  字階樣本
 *   logoGrid      標誌展示
 *   pairs         對照（可以／不可以並排）
 *   quotes        引文（語氣樣本、範例說明）
 *   entries       入口（指向另一頁，不複製內容）
 *   gaps          缺口
 *
 * 「品牌主頁」與其他頁的分別不是另一套詞彙，而是**用哪幾個、先後如何、重點
 * 在哪**——這正是 layout 要回答的問題。
 */
export const BRAND_BLOCK_KINDS = [
  'stance',
  'section',
  'swatches',
  'typeSpecimen',
  'logoGrid',
  'pairs',
  'quotes',
  'entries',
  'gaps',
] as const;

export type BrandBlockKind = (typeof BRAND_BLOCK_KINDS)[number];

export type BrandBlock = {
  kind: BrandBlockKind;
  /** `section` 的來源（schema 的 section id）。其他種類可以沒有。 */
  source?: string;
  /** 區塊標題。沒有就用 section 的標籤。 */
  title?: string;
  /** 重點：`lead` 會用大一級字，一個 layout 最多一個。 */
  emphasis?: 'lead' | 'normal';
  /** 為咩要有這一個區塊。空白理由＝畫面上不出現這一個區塊（共通規則 8）。 */
  reason: string;
};

export type BrandLayout = { blocks: BrandBlock[] };

/** 缺口的兩型（#58）。`file` 外判可交付；`judgement` 只有老闆可關。 */
export const BRAND_GAP_TYPES = ['file', 'judgement'] as const;
export type BrandGapType = (typeof BRAND_GAP_TYPES)[number];

/**
 * 缺口。
 *
 * `item` 是「頁內哪一個位置」（例如 `roles.surface`），`what` 是「缺什麼」
 * （例如「深色底色」）。兩個分開寫，是因為同一個位置可以缺不同東西：
 * 標誌頁的 `assets.primary` 可以缺 SVG，也可以缺印刷版。
 */
export type BrandGapDraft = {
  item: string;
  what: string;
  type: BrandGapType;
  /** 對應的策略規則 id（`color.r1`）。沒有規則管這一項就留空，不編一個。 */
  ruleId?: string;
  reason?: string;
};

/** 引用：這一版用了哪一頁的哪一版、哪個資產、哪個範例。 */
export type BrandRef = {
  kind: 'page' | 'asset' | 'example';
  /** `kind: 'page'` 時是頁鍵（`color`／`p/packaging`）。 */
  page?: string;
  versionNo?: number;
  /** 人讀得明的標籤（「色彩 v7」「主標誌 SVG」）。 */
  label: string;
};

/** 一頁的內容。`payload` 由各頁 schema 定型；這一層只要求它是物件。 */
export type BrandPayload = Record<string, unknown>;

export type BrandDocument = {
  /** 這一支的形狀版本。舊版本（#35–#39）讀入時轉換，不冒充。 */
  schema: 2;
  /**
   * 這一版用的立場句（快照）。
   *
   * 平台頁自己擁有它（`payload.stance`）；其他頁在儲存時由平台頁抄一份，
   * 所以「這一版當時的立場」永遠讀得返，而平台頁改了一句不會靜靜改寫
   * 已經出街的一版。
   */
  stance: string | null;
  payload: BrandPayload;
  layout: BrandLayout;
  /** 欄位路徑 → 一句理由。沒有理由的欄位不會出現在畫面（共通規則 8）。 */
  rationale: Record<string, string>;
  gaps: BrandGapDraft[];
  refs: BrandRef[];
};

/* ── 解析 ─────────────────────────────────────────────────────── */

export type DocumentParse =
  | { ok: true; value: BrandDocument }
  | { ok: false; errors: string[] };

const MAX_BLOCKS = 24;
const MAX_GAPS = 40;
const MAX_REFS = 40;
const MAX_REASON = 400;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBlockKind(value: unknown): value is BrandBlockKind {
  return typeof value === 'string' && (BRAND_BLOCK_KINDS as readonly string[]).includes(value);
}

function isGapType(value: unknown): value is BrandGapType {
  return typeof value === 'string' && (BRAND_GAP_TYPES as readonly string[]).includes(value);
}

/**
 * 解析一份文件。
 *
 * **空白理由一定拒絕**：`layout` 的每個區塊都要寫為咩存在。理由不是裝飾 ——
 * 品牌主頁的「差異可數」就是靠它講得出兩個品牌為咩排得不同。一個沒有理由的
 * 區塊，刪走它與留著它都講不出分別。
 *
 * 錯誤一次全部回，不是遇到第一個就停：一次修完比逐個試快，而且錯誤訊息本身
 * 就是畫面要顯示的東西。
 */
export function parseBrandDocument(raw: unknown): DocumentParse {
  const errors: string[] = [];

  if (!isRecord(raw)) {
    return { ok: false, errors: ['document 必須是物件'] };
  }

  if (raw.schema !== 2) {
    errors.push('document.schema 必須是 2');
  }

  if (!isRecord(raw.payload)) {
    errors.push('document.payload 必須是物件');
  }

  const stance = raw.stance;

  if (stance !== null && stance !== undefined && typeof stance !== 'string') {
    errors.push('document.stance 必須是字串或 null');
  }

  const layout = raw.layout;
  const blocks: BrandBlock[] = [];

  if (!isRecord(layout) || !Array.isArray(layout.blocks)) {
    errors.push('document.layout.blocks 必須是陣列');
  } else if (layout.blocks.length === 0) {
    errors.push('document.layout.blocks 不可以是空');
  } else if (layout.blocks.length > MAX_BLOCKS) {
    errors.push(`document.layout.blocks 不可以超過 ${MAX_BLOCKS} 個`);
  } else {
    layout.blocks.forEach((item, index) => {
      if (!isRecord(item)) {
        errors.push(`layout.blocks[${index}] 必須是物件`);
        return;
      }

      if (!isBlockKind(item.kind)) {
        errors.push(`layout.blocks[${index}].kind 不在區塊詞彙之內`);
        return;
      }

      const reason = typeof item.reason === 'string' ? item.reason.trim() : '';

      if (reason === '') {
        errors.push(`layout.blocks[${index}]（${item.kind}）沒有寫理由`);
        return;
      }

      if (reason.length > MAX_REASON) {
        errors.push(`layout.blocks[${index}].reason 不可以超過 ${MAX_REASON} 個字`);
        return;
      }

      const block: BrandBlock = { kind: item.kind, reason };

      if (typeof item.source === 'string' && item.source !== '') {
        block.source = item.source;
      }

      if (typeof item.title === 'string' && item.title !== '') {
        block.title = item.title;
      }

      if (item.emphasis === 'lead' || item.emphasis === 'normal') {
        block.emphasis = item.emphasis;
      }

      blocks.push(block);
    });
  }

  const rationale: Record<string, string> = {};

  if (raw.rationale !== undefined && raw.rationale !== null) {
    if (!isRecord(raw.rationale)) {
      errors.push('document.rationale 必須是物件');
    } else {
      for (const [path, value] of Object.entries(raw.rationale)) {
        if (typeof value !== 'string') {
          errors.push(`rationale.${path} 必須是字串`);
          continue;
        }

        if (value.length > MAX_REASON) {
          errors.push(`rationale.${path} 不可以超過 ${MAX_REASON} 個字`);
          continue;
        }

        rationale[path] = value;
      }
    }
  }

  const gaps: BrandGapDraft[] = [];

  if (raw.gaps !== undefined && raw.gaps !== null) {
    if (!Array.isArray(raw.gaps)) {
      errors.push('document.gaps 必須是陣列');
    } else if (raw.gaps.length > MAX_GAPS) {
      errors.push(`document.gaps 不可以超過 ${MAX_GAPS} 個`);
    } else {
      raw.gaps.forEach((item, index) => {
        if (!isRecord(item)) {
          errors.push(`gaps[${index}] 必須是物件`);
          return;
        }

        if (typeof item.item !== 'string' || item.item.trim() === '') {
          errors.push(`gaps[${index}].item 不可以空白`);
          return;
        }

        if (typeof item.what !== 'string' || item.what.trim() === '') {
          errors.push(`gaps[${index}].what 不可以空白`);
          return;
        }

        if (!isGapType(item.type)) {
          errors.push(`gaps[${index}].type 只可以是 file 或 judgement`);
          return;
        }

        const gap: BrandGapDraft = {
          item: item.item.trim(),
          what: item.what.trim(),
          type: item.type,
        };

        if (typeof item.ruleId === 'string' && item.ruleId !== '') {
          gap.ruleId = item.ruleId;
        }

        if (typeof item.reason === 'string' && item.reason !== '') {
          gap.reason = item.reason;
        }

        gaps.push(gap);
      });
    }
  }

  const refs: BrandRef[] = [];

  if (raw.refs !== undefined && raw.refs !== null) {
    if (!Array.isArray(raw.refs)) {
      errors.push('document.refs 必須是陣列');
    } else if (raw.refs.length > MAX_REFS) {
      errors.push(`document.refs 不可以超過 ${MAX_REFS} 個`);
    } else {
      raw.refs.forEach((item, index) => {
        if (!isRecord(item)) {
          errors.push(`refs[${index}] 必須是物件`);
          return;
        }

        if (item.kind !== 'page' && item.kind !== 'asset' && item.kind !== 'example') {
          errors.push(`refs[${index}].kind 只可以是 page、asset 或 example`);
          return;
        }

        if (typeof item.label !== 'string' || item.label.trim() === '') {
          errors.push(`refs[${index}].label 不可以空白`);
          return;
        }

        const ref: BrandRef = { kind: item.kind, label: item.label.trim() };

        if (typeof item.page === 'string' && item.page !== '') {
          ref.page = item.page;
        }

        if (typeof item.versionNo === 'number' && Number.isInteger(item.versionNo) && item.versionNo > 0) {
          ref.versionNo = item.versionNo;
        }

        refs.push(ref);
      });
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      schema: 2,
      stance: typeof stance === 'string' && stance.trim() !== '' ? stance.trim() : null,
      payload: raw.payload as BrandPayload,
      layout: { blocks },
      rationale,
      gaps,
      refs,
    },
  };
}

/** 一份空白文件：有 layout（立場＋缺口），沒有內容。各頁用它起手。 */
export function emptyBrandDocument(layout: BrandLayout): BrandDocument {
  return {
    schema: 2,
    stance: null,
    payload: {},
    layout,
    rationale: {},
    gaps: [],
    refs: [],
  };
}

/* ── 讀取路徑（給 renderer／編輯器用） ────────────────────────── */

/** 由 `a.b.0.c` 讀一個值。讀不到回 `undefined` —— 不是拋錯，缺就是缺。 */
export function readPath(source: unknown, path: string): unknown {
  if (path === '') {
    return source;
  }

  let cursor: unknown = source;

  for (const part of path.split('.')) {
    if (Array.isArray(cursor)) {
      const index = Number(part);

      if (!Number.isInteger(index)) {
        return undefined;
      }

      cursor = cursor[index];
      continue;
    }

    if (!isRecord(cursor)) {
      return undefined;
    }

    cursor = cursor[part];
  }

  return cursor;
}

/** 由 `a.b.0.c` 寫一個值，回傳新物件（不改原來那份）。路上缺的容器自動補。 */
export function writePath(source: BrandPayload, path: string, value: unknown): BrandPayload {
  const parts = path.split('.');

  if (parts.length === 0 || parts[0] === undefined || parts[0] === '') {
    return source;
  }

  // 沿途每一層都換一個新容器：只複製第一層的話，寫入仍然會改到傳入那份的
  // 子物件 —— 而呼叫者（編輯器）會以為自己拿到一份可以隨便改的副本。
  const clone = (input: unknown): Record<string, unknown> | unknown[] =>
    Array.isArray(input) ? [...input] : { ...(input as Record<string, unknown>) };

  const root = clone(source);
  let cursor: Record<string, unknown> | unknown[] = root;

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];

    if (part === undefined) {
      return root as BrandPayload;
    }

    const last = index === parts.length - 1;
    const nextIsIndex = /^\d+$/.test(parts[index + 1] ?? '');

    if (Array.isArray(cursor)) {
      const position = Number(part);

      if (last) {
        cursor[position] = value;
        continue;
      }

      const existing = cursor[position];
      const next = isRecord(existing) || Array.isArray(existing) ? clone(existing) : nextIsIndex ? [] : {};

      cursor[position] = next;
      cursor = next;
      continue;
    }

    if (last) {
      cursor[part] = value;
      continue;
    }

    const existing = cursor[part];
    const next = isRecord(existing) || Array.isArray(existing) ? clone(existing) : nextIsIndex ? [] : {};

    cursor[part] = next;
    cursor = next;
  }

  return root as BrandPayload;
}

/** 由兩個 payload 找出**改了哪些欄位**（版本抽屜用，不畫整頁差異）。 */
export function changedPaths(before: unknown, after: unknown, prefix = ''): string[] {
  if (before === after) {
    return [];
  }

  if (isRecord(before) && isRecord(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    const changed: string[] = [];

    for (const key of keys) {
      const path = prefix === '' ? key : `${prefix}.${key}`;
      changed.push(...changedPaths(before[key], after[key], path));
    }

    return changed;
  }

  if (Array.isArray(before) && Array.isArray(after)) {
    if (before.length !== after.length) {
      return [prefix === '' ? '[]' : prefix];
    }

    const changed: string[] = [];

    for (let index = 0; index < before.length; index += 1) {
      changed.push(...changedPaths(before[index], after[index], `${prefix}.${index}`));
    }

    return changed;
  }

  return [prefix === '' ? 'document' : prefix];
}
