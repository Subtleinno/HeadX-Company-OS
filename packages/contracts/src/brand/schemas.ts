import type {
  BrandBlock,
  BrandGapDraft,
  BrandLayout,
  BrandPayload,
  BrandSlot,
} from './document.ts';
import { BRAND_BLOCK_KINDS } from './document.ts';
import { BODY_FLOOR, LARGE_FLOOR } from './contrast.ts';

/**
 * 每一頁的 payload 形狀（issue #57 定外殼，各頁 issue 定自己的欄位）。
 *
 * 為咩集中在一個檔案：六個編輯器各自解釋自己的 JSON，結果同一個概念在六處
 * 有六個名（`familes`／`families`／`family`）。集中在這裡之後，「這一頁有
 * 哪些欄位」只有一個答案，而 renderer、編輯器、tokens、prompt 四者都讀同一份。
 *
 * 每個 schema 要答五條問題：
 *   1. `normalize`  讀入舊資料／半份資料時，缺的欄位怎樣補（補空，不是補假）。
 *   2. `gaps`       哪些位置沒有內容就是缺口，缺口是哪一型（檔案／判斷）。
 *   3. `layout`     預設區塊次序與理由（agent 可以改，改完要寫理由）。
 *   4. `tokens`     這一頁有哪些欄位會進 tokens.json（沒有就 null，並講為咩）。
 *   5. `prompt`     這一頁在品牌 prompt 包裡佔哪幾段，要帶哪些數字。
 */

export type FieldKind = 'text' | 'long' | 'hex' | 'number' | 'list';

export type Field = {
  path: string;
  label: string;
  kind: FieldKind;
  /** 這一欄為咩要填（畫面在欄位下面顯示，不是 tooltip）。 */
  hint?: string;
};

export type SectionKind =
  | 'stance'
  | 'fields'
  | 'records'
  | 'color-roles'
  | 'color-pairs'
  | 'type-families'
  | 'type-roles'
  | 'logo-assets'
  | 'logo-modes'
  | 'voice-traits'
  | 'voice-samples'
  | 'quotes'
  | 'list'
  | 'entries'
  | 'tags';

export type Section = {
  id: string;
  label: string;
  kind: SectionKind;
  /** payload 裡這一段的位置。`stance` 用 `stance`。 */
  path?: string;
  fields?: Field[];
  columns?: Field[];
  /** 這一段要決定什麼（一句）。 */
  hint?: string;
};

export type TokenValue = {
  $type: 'color' | 'typography' | 'dimension' | 'number';
  $value: string | number | Record<string, string | number>;
  $description?: string;
};

export type TokenGroups = { light: Record<string, Record<string, TokenValue>>; dark: Record<string, Record<string, TokenValue>> };

export type PromptSection = { title: string; lines: string[] };

export type PageSchema = {
  key: string;
  name: string;
  slot: BrandSlot;
  sections: Section[];
  empty(): BrandPayload;
  normalize(raw: unknown): BrandPayload;
  gaps(payload: BrandPayload): BrandGapDraft[];
  layout(payload: BrandPayload): BrandLayout;
  tokens(payload: BrandPayload): TokenGroups | null;
  /** 這一頁不進 tokens 的原因（null＝有進）。 */
  tokensNote: string | null;
  prompt(payload: BrandPayload): PromptSection[];
};

/* ── 讀值的小工具 ─────────────────────────────────────────────── */

function rec(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function strs(value: unknown): string[] {
  return list(value)
    .map((item) => str(item).trim())
    .filter((item) => item !== '');
}

function block(kind: BrandBlock['kind'], reason: string, source?: string, title?: string): BrandBlock {
  const item: BrandBlock = { kind, reason };

  if (source !== undefined) {
    item.source = source;
  }

  if (title !== undefined) {
    item.title = title;
  }

  return item;
}

/* ── 平台頁 ───────────────────────────────────────────────────── */

export type PlatformPayload = {
  /**
   * 關鍵詞三到五個（v2.1）。原本寫在主頁，但「這個品牌是哪幾個字」是定位的
   * 一部分，擁有者是平台頁；主頁只引用。
   *
   * 超過五個不截斷：截斷等於靜靜丟資料。多出來的在檢查摘要講，由人刪。
   */
  keywords: string[];
  positioning: { for: string; who: string; category: string; benefit: string; unlike: string; because: string };
  purpose: string;
  values: { name: string; do: string; dont: string }[];
  traits: string[];
  essence: string;
  audience: string;
  references: string[];
  stance_candidates: { text: string; reason: string }[];
  stance: string;
  tests: { real: string; relevant: string; unique: string };
};

const platform: PageSchema = {
  key: 'platform',
  name: '平台',
  slot: 'platform',
  sections: [
    {
      id: 'stance',
      label: '立場',
      kind: 'stance',
      path: 'stance',
      hint: '一句話。之後每一頁第一屏都是這一句。',
    },
    {
      // v2.1：關鍵詞由主頁搬過來。它是定位的一部分，不是主頁的裝飾。
      id: 'keywords',
      label: '關鍵詞',
      kind: 'tags',
      path: 'keywords',
      hint: '三到五個。多過五個就不是關鍵詞，是清單。',
    },
    {
      // 本質與目的是「這個品牌為什麼存在」，一區兩欄。
      // 舊版把 essence 塞在「受眾」裡，令人以為本質是寫給誰看的。
      id: 'essence',
      label: '品牌本質與目的',
      kind: 'fields',
      path: '',
      hint: '一句本質、一段目的。本質不是標語，是拿掉所有形容詞之後仍然成立的那一句。',
      fields: [
        { path: 'essence', label: '一句本質', kind: 'text' },
        { path: 'purpose', label: '為甚麼存在', kind: 'long' },
      ],
    },
    {
      id: 'positioning',
      label: '定位',
      kind: 'fields',
      path: 'positioning',
      hint: '六格都要填：為誰、是誰、屬於哪一類、給什麼好處、不同在哪、憑什麼。',
      fields: [
        { path: 'for', label: '為誰', kind: 'text' },
        { path: 'who', label: '我們是誰', kind: 'text' },
        { path: 'category', label: '屬於哪一類', kind: 'text' },
        { path: 'benefit', label: '給什麼好處', kind: 'text' },
        { path: 'unlike', label: '同類不同在', kind: 'text' },
        { path: 'because', label: '憑什麼', kind: 'text' },
      ],
    },
    {
      id: 'values',
      label: '價值與取捨',
      kind: 'records',
      path: 'values',
      hint: '每一條價值都要有「做」與「不做」，只寫形容詞等於沒有立場。',
      columns: [
        { path: 'name', label: '價值', kind: 'text' },
        { path: 'do', label: '所以我們會', kind: 'long' },
        { path: 'dont', label: '所以我們不會', kind: 'long' },
      ],
    },


    {
      id: 'traits',
      label: '特質',
      kind: 'tags',
      path: 'traits',
      hint: '三到五個。多過五個就不是特質，是清單。',
    },
    {
      id: 'audience',
      label: '受眾與參考對象',
      kind: 'fields',
      path: '',
      hint: '受眾寫給誰看；參考對象寫明參考它哪一點，不是模仿它。',
      fields: [{ path: 'audience', label: '寫給誰看', kind: 'long' }],
    },
    {
      id: 'tests',
      label: '定位三檢',
      kind: 'fields',
      path: 'tests',
      hint: '三項各要一句證據（一件做過的事），不是換一個形容詞。',
      fields: [
        { path: 'real', label: '真實', kind: 'long' },
        { path: 'relevant', label: '相關', kind: 'long' },
        { path: 'unique', label: '獨特', kind: 'long' },
      ],
    },
  ],
  empty() {
    return {
      stance: '',
      keywords: [],
      positioning: { for: '', who: '', category: '', benefit: '', unlike: '', because: '' },
      purpose: '',
      values: [],
      traits: [],
      essence: '',
      audience: '',
      references: [],
      stance_candidates: [],
      tests: { real: '', relevant: '', unique: '' },
    } satisfies PlatformPayload;
  },
  normalize(raw) {
    const source = rec(raw);
    const positioning = rec(source.positioning);
    const tests = rec(source.tests);

    return {
      stance: str(source.stance),
      // 去重但保留全部：超過五個由檢查摘要講，不在這裡丟。
      keywords: [...new Set(strs(source.keywords))],
      positioning: {
        for: str(positioning.for),
        who: str(positioning.who),
        category: str(positioning.category),
        benefit: str(positioning.benefit),
        unlike: str(positioning.unlike),
        because: str(positioning.because),
      },
      purpose: str(source.purpose),
      values: list(source.values).map((item) => {
        const value = rec(item);
        return { name: str(value.name), do: str(value.do), dont: str(value.dont) };
      }),
      traits: strs(source.traits),
      essence: str(source.essence),
      audience: str(source.audience),
      references: strs(source.references),
      stance_candidates: list(source.stance_candidates).map((item) => {
        const value = rec(item);
        return { text: str(value.text), reason: str(value.reason) };
      }),
      tests: { real: str(tests.real), relevant: str(tests.relevant), unique: str(tests.unique) },
    } satisfies PlatformPayload;
  },
  gaps(payload) {
    const typed = payload as PlatformPayload;
    const gaps: BrandGapDraft[] = [];

    if (typed.stance.trim() === '') {
      gaps.push({
        item: 'stance',
        what: '立場句',
        type: 'judgement',
        reason: '立場句是老闆的決定，不是可以外判的檔案。',
      });
    }

    const tests: { key: keyof PlatformPayload['tests']; label: string }[] = [
      { key: 'real', label: '真實' },
      { key: 'relevant', label: '相關' },
      { key: 'unique', label: '獨特' },
    ];

    for (const test of tests) {
      if (typed.tests[test.key].trim() === '') {
        gaps.push({
          item: `tests.${test.key}`,
          what: `定位「${test.label}」的證據`,
          type: 'judgement',
          ruleId: 'platform.r1',
          reason: '證據要由老闆講，外判寫不出「我們做過什麼」。',
        });
      }
    }

    // 關鍵詞不足三個（v2.1）。它是判斷型：寫哪三個字是老闆的定位決定，
    // 不是外判交得出來的檔案。
    if (typed.keywords.length < 3) {
      gaps.push({
        item: 'keywords',
        what: '三到五個關鍵詞',
        type: 'judgement',
        reason: '關鍵詞是定位的一部分，要老闆自己揀，不能由外判代寫。',
      });
    }

    // 三個候選由 agent 讀完品牌資料後提出（#61）。少過三個就是缺一個交付：
    // 檔案型，不是判斷型 —— agent 交得，老闆只需要揀。
    //
    // v2.1：**只在立場句還是空的時候才算。** 立場已經選定，候選就不再重要 ——
    // 繼續把「候選不夠」算成缺口，等於叫 agent 交一份沒有人會再讀的稿。
    if (typed.stance.trim() === '' && typed.stance_candidates.filter((candidate) => candidate.text !== '').length < 3) {
      gaps.push({
        item: 'stance_candidates',
        what: '三個立場句候選（各附一句理由）',
        type: 'file',
        reason: '沒有候選，立場句就只能靠即場想 —— 那不是判斷，是猜。',
      });
    }

    return gaps;
  },
  layout() {
    return {
      blocks: [
        block('stance', '立場句是這一頁的唯一重點：先講自己是誰，其餘六格都是支撐。'),
        block('section', '關鍵詞緊貼立場：它們是同一句話的幾個字，分開兩屏就對不上。', 'keywords'),
        block('section', '定位六格是立場的拆解，讀的人要在同一屏內對得上立場句。', 'positioning'),
        block(
          'section',
          '價值要寫「不做什麼」才有約束力；放在定位之後，因為取捨是定位的結果。',
          'values',
        ),
        block('section', '特質是立場的形容詞化：每一條要寫到可以被違反為止。', 'traits'),
        block('section', '三檢是這一頁的證據，放在最後當作驗收。', 'tests'),
        block('section', '受眾與本質補完「為誰」，不是第二個立場。', 'audience'),
      ],
    };
  },
  tokens() {
    return null;
  },
  tokensNote: '平台頁是文字決定，沒有可量化的設計 token；它的數字（立場、三檢）進 prompt。',
  prompt(payload) {
    const typed = payload as PlatformPayload;
    const lines: string[] = [];

    // 立場句是這一頁的根。它缺的時候，其餘欄位都只是碎片 —— 輸出整段
    // 「缺」，不把定位、價值、特質當成半份立場交出去。
    if (typed.stance === '') {
      return [{ title: '立場', lines: ['缺'] }];
    }

    lines.push(`立場：${typed.stance}`);

    if (typed.keywords.length > 0) {
      lines.push(`關鍵詞：${typed.keywords.join('、')}`);
    }

    if (typed.essence !== '') {
      lines.push(`品牌本質：${typed.essence}`);
    }

    if (typed.purpose !== '') {
      lines.push(`為甚麼存在：${typed.purpose}`);
    }

    const positioning = typed.positioning;
    const pairs = [
      ['為誰', positioning.for],
      ['是誰', positioning.who],
      ['類別', positioning.category],
      ['好處', positioning.benefit],
      ['不同在', positioning.unlike],
      ['憑什麼', positioning.because],
    ].filter((entry) => entry[1] !== '');

    if (pairs.length > 0) {
      lines.push(`定位：${pairs.map((entry) => `${entry[0]}＝${entry[1]}`).join('；')}`);
    }

    if (typed.traits.length > 0) {
      lines.push(`特質：${typed.traits.join('、')}`);
    }

    for (const value of typed.values) {
      if (value.name !== '') {
        lines.push(`價值「${value.name}」：會${value.do === '' ? '（未寫）' : value.do}；不會${value.dont === '' ? '（未寫）' : value.dont}`);
      }
    }

    if (typed.audience !== '') {
      lines.push(`受眾：${typed.audience}`);
    }

    return [{ title: '平台與立場', lines }];
  },
};

/* ── 色彩頁 ───────────────────────────────────────────────────── */

export type ColorGroup = 'brand' | 'reading' | 'function';

export type ColorRole = {
  id: string;
  group: ColorGroup;
  name: string;
  hex: string;
  cmyk: string;
  dark: string;
  usage: string;
  reason: string;
};

export type ColorPayload = {
  roles: ColorRole[];
  order: { text: string; reason: string };
  ratios: { role: string; percent: number; reason: string }[];
  contrast_floor: number;
  large_floor: number;
  pairs: { allowed: { fg: string; bg: string; use: 'body' | 'large'; reason: string }[]; forbidden: { fg: string; bg: string; reason: string }[] };
  /** 同族深淺：來源角色 → 調整後，一定要寫為甚麼調（v2.1 第 4 節）。 */
  tints: { role: string; from: string; hex: string; reason: string }[];
  /** Afterglow 與天色：兩個色值＋角度＋用途，不再以一段 CSS 文字收藏。 */
  gradients?: { id: string; name: string; from: string; to: string; angle: number; use: string; css?: string }[];
  gradient_note?: string;
};

export const COLOR_GROUPS: readonly ColorGroup[] = ['brand', 'reading', 'function'];

/** 四個必要角色（color.r1）。`surface` 只在深色要。 */
export const REQUIRED_COLOR_ROLES = ['brand.primary', 'ink', 'paper'] as const;

function isColorGroup(value: unknown): value is ColorGroup {
  return value === 'brand' || value === 'reading' || value === 'function';
}

const color: PageSchema = {
  key: 'color',
  name: '色彩',
  slot: 'color',
  sections: [
    {
      id: 'roles',
      label: '角色',
      kind: 'color-roles',
      path: 'roles',
      hint: '一格一個角色。角色名公開，其他頁只引用名字，不引用色值。',
      columns: [
        { path: 'id', label: '角色', kind: 'text' },
        { path: 'name', label: '品牌叫法', kind: 'text' },
        { path: 'hex', label: '螢幕 HEX', kind: 'hex' },
        { path: 'cmyk', label: '印刷 CMYK', kind: 'text' },
        { path: 'dark', label: '深色值', kind: 'hex' },
        { path: 'usage', label: '用途', kind: 'text' },
        { path: 'reason', label: '理由', kind: 'long' },
      ],
    },
    {
      id: 'order',
      label: '用色順序',
      kind: 'fields',
      path: 'order',
      hint: '先甚麼、後甚麼。順序就是優先級：撞色時先犧牲後面的。',
      fields: [
        { path: 'text', label: '順序', kind: 'long' },
        { path: 'reason', label: '理由', kind: 'long' },
      ],
    },
    {
      id: 'ratios',
      label: '用色比例',
      kind: 'records',
      path: 'ratios',
      hint: '百分比加起來要是 100。比例是紀律，不是建議。',
      columns: [
        { path: 'role', label: '角色', kind: 'text' },
        { path: 'percent', label: '百分比', kind: 'number' },
        { path: 'reason', label: '理由', kind: 'long' },
      ],
    },
    {
      id: 'pairs',
      label: '配對與對比',
      kind: 'color-pairs',
      path: 'pairs',
      hint: '內文 4.5:1、大字 3:1。不達標就換色，不是改門檻。',
      columns: [
        { path: 'fg', label: '前景', kind: 'text' },
        { path: 'bg', label: '底色', kind: 'text' },
        { path: 'reason', label: '理由', kind: 'long' },
      ],
    },
    {
      id: 'tints',
      label: '同族深淺',
      kind: 'records',
      path: 'tints',
      hint: '只是同一個角色的深淺候選，不是第二套角色名。',
      columns: [
        { path: 'role', label: '來源角色', kind: 'text' },
        { path: 'from', label: '原本', kind: 'text' },
        { path: 'hex', label: '調整後', kind: 'hex' },
        { path: 'reason', label: '為甚麼調', kind: 'long' },
      ],
    },
  ],
  empty() {
    return {
      roles: [],
      order: { text: '', reason: '' },
      ratios: [],
      contrast_floor: BODY_FLOOR,
      large_floor: LARGE_FLOOR,
      pairs: { allowed: [], forbidden: [] },
      tints: [],
    } satisfies ColorPayload;
  },
  normalize(raw) {
    const source = rec(raw);
    const order = rec(source.order);
    const pairs = rec(source.pairs);

    return {
      roles: list(source.roles).map((item) => {
        const value = rec(item);
        return {
          id: str(value.id),
          group: isColorGroup(value.group) ? value.group : 'brand',
          name: str(value.name),
          hex: str(value.hex),
          cmyk: str(value.cmyk),
          dark: str(value.dark),
          usage: str(value.usage),
          reason: str(value.reason),
        };
      }),
      order: { text: str(order.text), reason: str(order.reason) },
      ratios: list(source.ratios).map((item) => {
        const value = rec(item);
        return { role: str(value.role), percent: num(value.percent), reason: str(value.reason) };
      }),
      contrast_floor: num(source.contrast_floor, BODY_FLOOR),
      large_floor: num(source.large_floor, LARGE_FLOOR),
      pairs: {
        allowed: list(pairs.allowed).map((item) => {
          const value = rec(item);
          return {
            fg: str(value.fg),
            bg: str(value.bg),
            use: value.use === 'large' ? ('large' as const) : ('body' as const),
            reason: str(value.reason),
          };
        }),
        forbidden: list(pairs.forbidden).map((item) => {
          const value = rec(item);
          return { fg: str(value.fg), bg: str(value.bg), reason: str(value.reason) };
        }),
      },
      tints: list(source.tints).map((item) => {
        const value = rec(item);
        return {
          role: str(value.role),
          from: str(value.from),
          hex: str(value.hex),
          reason: str(value.reason),
        };
      }),
      ...(list(source.gradients).length > 0
        ? {
            gradients: list(source.gradients).map((item) => {
              const value = rec(item);
              return {
                id: str(value.id),
                name: str(value.name),
                from: str(value.from),
                to: str(value.to),
                angle: num(value.angle),
                use: str(value.use),
                ...(str(value.css) !== '' ? { css: str(value.css) } : {}),
              };
            }),
          }
        : {}),
      ...(str(source.gradient_note) !== '' ? { gradient_note: str(source.gradient_note) } : {}),
    } satisfies ColorPayload;
  },
  gaps(payload) {
    const typed = payload as ColorPayload;
    const seen = new Set<string>();
    const gaps: BrandGapDraft[] = [];

    for (const role of typed.roles) {
      if (role.id === '') {
        continue;
      }

      seen.add(role.id);

      if (role.hex.trim() === '') {
        gaps.push({
          item: `roles.${role.id}`,
          what: `${role.id} 的色值`,
          type: 'judgement',
          ruleId: 'color.r1',
          reason: '顏色是品牌決定，要老闆或品牌設計師定，不是外判填空。',
        });
      }
    }

    for (const required of REQUIRED_COLOR_ROLES) {
      if (!seen.has(required)) {
        gaps.push({
          item: `roles.${required}`,
          what: `${required} 這個角色`,
          type: 'judgement',
          ruleId: 'color.r1',
          reason: '策略明講這幾個角色一定要有；未定就是未定，不借別人的色。',
        });
      }
    }

    if (!seen.has('surface')) {
      gaps.push({
        item: 'roles.surface',
        what: '深色底色 surface',
        type: 'judgement',
        ruleId: 'color.r1',
        reason: '深色模式沒有底色就等於沒有深色模式。',
      });
    }

    // 准用組合與比例（v2.1 第 6 節）：沒有內文組合、沒有大字組合、比例合計
    // 不是 100，三件都是「這一頁還未有甚麼」，各計一項。「未定」的角色
    // （brand.secondary、muted、功能色）不計 —— 那是設計決定，不是缺口。
    const usable = typed.pairs.allowed.filter((pair) => pair.fg.trim() !== '' && pair.bg.trim() !== '');

    if (!usable.some((pair) => pair.use === 'body')) {
      gaps.push({
        item: 'pairs.body',
        what: '內文准用組合',
        type: 'judgement',
        ruleId: 'color.r2',
        reason: '沒有准用組合，其他頁就不知道哪一個前景可以放在哪一個底色上。',
      });
    }

    if (!usable.some((pair) => pair.use === 'large')) {
      gaps.push({
        item: 'pairs.large',
        what: '大字准用組合',
        type: 'judgement',
        ruleId: 'color.r3',
        reason: '大字與內文的門檻不同；沒有寫，大字就會被當成內文用。',
      });
    }

    const usedRatios = typed.ratios.filter((item) => item.role !== '');
    const total = usedRatios.reduce((sum, item) => sum + item.percent, 0);

    if (usedRatios.length > 0 && total !== 100) {
      gaps.push({
        item: 'ratios',
        what: '用色比例合計 100',
        type: 'judgement',
        reason: `比例合計是 ${total}%，不是 100%：比例是紀律，撞色時要靠它決定犧牲哪一個。`,
      });
    }

    return gaps;
  },
  layout() {
    return {
      blocks: [
        block('section', '角色表是這一頁的主體：其他頁只引用這裡的名字。', 'roles'),
        block('section', '用色順序講先後，撞色時才知道犧牲哪一個。', 'order'),
        block('section', '比例讓「大致上用這個色」變成可檢查的數。', 'ratios'),
        block('section', '配對與對比是可量化的部分，放在最後當驗收。', 'pairs'),
        block('section', '同族深淺：每個角色的明暗層級，印刷與實物要用得到。', 'tints'),
      ],
    };
  },
  tokens(payload) {
    const typed = payload as ColorPayload;
    const light: Record<string, TokenValue> = {};
    const dark: Record<string, TokenValue> = {};

    for (const role of typed.roles) {
      if (role.id === '' || role.hex === '') {
        continue;
      }

      light[role.id] = {
        $type: 'color',
        $value: role.hex,
        ...(role.reason === '' ? {} : { $description: role.reason }),
      };

      if (role.dark !== '') {
        dark[role.id] = {
          $type: 'color',
          $value: role.dark,
          ...(role.reason === '' ? {} : { $description: role.reason }),
        };
      }
    }

    // 深色沒有指定的角色，用淺色值頂住：一個缺了 ink 的深色模式不能用，
    // 而 tokens 不是缺口報告（缺口另有 gaps）。這是唯一一處「借值」，
    // 而且借的是同一個角色，不是另一個角色的色。
    for (const [key, token] of Object.entries(light)) {
      if (dark[key] === undefined) {
        dark[key] = token;
      }
    }

    return { light: { color: light }, dark: { color: dark } };
  },
  tokensNote: null,
  prompt(payload) {
    const typed = payload as ColorPayload;
    const lines: string[] = [];

    if (typed.order.text !== '') {
      lines.push(`用色順序：${typed.order.text}`);
    }

    if (typed.roles.length > 0) {
      const named = typed.roles
        .filter((role) => role.id !== '')
        .map((role) => `${role.id}${role.name === '' ? '' : `（${role.name}）`}=${role.hex === '' ? '缺' : role.hex}`);

      lines.push(`角色：${named.join('、')}`);
    }

    if (typed.ratios.length > 0) {
      lines.push(
        `比例：${typed.ratios
          .filter((item) => item.role !== '')
          .map((item) => `${item.role} ${item.percent}%`)
          .join('、')}`,
      );
    }

    // 對比下限是策略常數，不是品牌內容。四個必要角色齊了才寫：缺角色時
    // 寫下限只會令 agent 以為這個品牌已經定好了對比。
    const complete = REQUIRED_COLOR_ROLES.every((required) =>
      typed.roles.some((role) => role.id === required && role.hex.trim() !== ''),
    );

    if (complete) {
      lines.push(`對比下限：內文 ${typed.contrast_floor}:1，大字 ${typed.large_floor}:1`);
    }

    if (typed.pairs.forbidden.length > 0) {
      lines.push(
        `禁止配對：${typed.pairs.forbidden
          .filter((item) => item.fg !== '' && item.bg !== '')
          .map((item) => `${item.fg} on ${item.bg}`)
          .join('、')}`,
      );
    }

    return [{ title: '色彩', lines }];
  },
};

/* ── 字體頁 ───────────────────────────────────────────────────── */

/**
 * 聲部（voice）。
 *
 * 策略原文說「一套品牌最多兩個家族，中英各一」，但真實的品牌書做不到：
 * Moonic 用 Canto／Noto Serif HK／Inter／Noto Sans HK／Bodoni Moda 五個檔，
 * 主張是「Serif to feel, Sans to read」—— 那是**兩個聲部**，每個聲部各有
 * 拉丁與中文。所以上限改為「兩個聲部，每聲部每字種一個家族」，最多四個檔。
 *
 * 這是產品決定（`brand-type-backend-functions.md` 4.1），已回報老闆。
 */
export const TYPE_VOICES: readonly string[] = ['serif', 'sans'];

/** 字種。一個聲部要齊這兩種才算排得出字。 */
export const TYPE_SCRIPTS: readonly string[] = ['latin', 'chinese'];

/** 四個必要層級。其他頁（標誌的字標、主頁的樣本）引用的是這幾個。 */
export const TYPE_ROLES: readonly string[] = ['display', 'heading', 'body', 'caption'];

export type TypeFamily = {
  id: string;
  name: string;
  script: string;
  /** 屬於哪個聲部。空＝未決定（v2.1 之前的內容就是這樣）。 */
  voice: string;
  /**
   * 四個授權渠道，逐一寫明（issue #63）：網頁、印刷、應用程式、桌面。
   * 空＝未寫明，不是「沒有授權」。`type.r3` 只要求有寫明一種，
   * 其餘是「有就要講清楚」的部分 —— 一套字只用於網頁時，
   * 應用程式那一格本來就應該空著，而不是填「不適用」。
   */
  license_web: string;
  license_print: string;
  license_app: string;
  license_desktop: string;
  file_ref: string;
  /** 備用字：只作後備，不是第二個品牌字，不計入「家族」。 */
  fallback: string[];
};

export type TypeRole = {
  role: string;
  /** 這一級用哪個聲部。舊版存的是家族 id，`normalize` 會換成聲部。 */
  voice: string;
  weight: string;
  /** 字級：只認 px。`18` 不是 18 像素，是缺；`pt` 是印刷尺寸，不換算。 */
  size: string;
  leading: string;
  /** 最小尺寸（px）。0 ＝未寫，`type.r2` 就是不通過。 */
  min: number;
  measure: string;
  /** 文字顏色只可以引用色彩頁的角色名，不可以在這裡發明色。 */
  color_role: string;
  reason: string;
};

export type TypePayload = {
  philosophy: string;
  families: TypeFamily[];
  roles: TypeRole[];
  pairing: string;
  sentence_anatomy: string;
  print_matrix: { item: string; spec: string }[];
  mixed_setting: string;
  misuse: { example: string; reason: string }[];
};

/** 四個渠道任何一個寫了授權，就算「有授權」（`type.r3` 只要求一種）。 */
export function familyLicensed(family: TypeFamily): boolean {
  return [family.license_web, family.license_print, family.license_app, family.license_desktop].some(
    (value) => value.trim() !== '',
  );
}

/** 排得出字＝有名、有授權、有可嵌入檔。缺任何一樣都不准用來排版。 */
export function familyReady(family: TypeFamily): boolean {
  return family.name.trim() !== '' && familyLicensed(family) && family.file_ref.trim() !== '';
}

/** 某個聲部裡、某個字種的家族（一個聲部每個字種最多一個）。 */
export function familyOfVoice(
  families: readonly TypeFamily[],
  voice: string,
  script: string,
): TypeFamily | null {
  if (voice.trim() === '') {
    return null;
  }

  return families.find((family) => family.voice === voice && family.script === script) ?? null;
}

/**
 * 一個聲部的字體堆疊：拉丁 → 中文 → 備用字。
 *
 * 缺的家族**不出現**（不寫系統字名稱代替），最後由 `fallback` 收尾。
 */
export function voiceStack(families: readonly TypeFamily[], voice: string): string[] {
  const stack: string[] = [];

  for (const script of TYPE_SCRIPTS) {
    const family = familyOfVoice(families, voice, script);

    if (family !== null && familyReady(family)) {
      stack.push(`"${family.name}"`);
      stack.push(...family.fallback.map((name) => `"${name}"`));
    }
  }

  return stack;
}

/** 完全沒有家族（連未填的都算沒有）的字種。這是「字種缺」，不重複計家族缺。 */
export function scriptsWithoutFamily(families: readonly TypeFamily[]): string[] {
  return TYPE_SCRIPTS.filter(
    (script) => !families.some((family) => family.script === script && family.name.trim() !== ''),
  );
}

/** 字級只認 px：`18`、`1.5rem`、`42pt` 都不是 px，所以比較不了。 */
export function typeSizePx(value: string): number | null {
  const match = /^(\d+(?:\.\d+)?)px$/.exec(value.trim());

  return match === null ? null : Number(match[1]);
}

/** 一級自己缺哪幾樣（不是家族的缺）。 */
export function roleMissingFields(role: TypeRole): string[] {
  const missing: string[] = [];

  if (role.voice.trim() === '') {
    missing.push('聲部');
  }

  if (typeSizePx(role.size) === null) {
    missing.push('字級（px）');
  }

  if (!/^\d+(\.\d+)?(px|%)?$/.test(role.leading.trim())) {
    missing.push('行高');
  }

  if (role.weight.trim() === '') {
    missing.push('字重');
  }

  if (role.min <= 0) {
    missing.push('最小尺寸');
  }

  if (role.color_role.trim() === '') {
    missing.push('文字色');
  }

  return missing;
}

const type: PageSchema = {
  key: 'type',
  name: '字體',
  slot: 'type',
  sections: [
    {
      id: 'philosophy',
      label: '取態',
      kind: 'fields',
      path: '',
      hint: '一句：字體在這間公司負責講甚麼。立場句在平台頁，這一頁不重複。',
      fields: [{ path: 'philosophy', label: '字體取態', kind: 'long' }],
    },
    {
      id: 'families',
      label: '聲部與家族',
      kind: 'type-families',
      path: 'families',
      hint: '最多兩個聲部，每個聲部一個拉丁家族加一個中文字族。沒有可嵌入檔或授權，就標缺，不用系統字充當。',
      columns: [
        { path: 'name', label: '家族', kind: 'text' },
        { path: 'script', label: '字種', kind: 'text' },
        { path: 'voice', label: '聲部', kind: 'text' },
        { path: 'license_web', label: '網頁授權', kind: 'text' },
        { path: 'license_print', label: '印刷授權', kind: 'text' },
        { path: 'license_app', label: '應用程式授權', kind: 'text' },
        { path: 'license_desktop', label: '桌面授權', kind: 'text' },
        { path: 'file_ref', label: '可嵌入檔', kind: 'text' },
      ],
    },
    {
      id: 'roles',
      label: '字階與分工',
      kind: 'type-roles',
      path: 'roles',
      hint: '每一級都要有最小尺寸；沒有最小尺寸的字階等於沒有字階。字級一律 px。',
      columns: [
        { path: 'role', label: '角色', kind: 'text' },
        { path: 'voice', label: '聲部', kind: 'text' },
        { path: 'weight', label: '字重', kind: 'text' },
        { path: 'size', label: '字級（px）', kind: 'text' },
        { path: 'leading', label: '行高', kind: 'text' },
        { path: 'min', label: '最小 px', kind: 'number' },
        { path: 'measure', label: '每行字數', kind: 'text' },
        { path: 'color_role', label: '文字色角色', kind: 'text' },
        { path: 'reason', label: '理由', kind: 'long' },
      ],
    },
    {
      id: 'pairing',
      label: '搭配',
      kind: 'fields',
      path: '',
      hint: '誰負責語氣、誰負責資訊。兩者不可交換。',
      fields: [
        { path: 'pairing', label: '分工', kind: 'long' },
        { path: 'sentence_anatomy', label: '一句話的結構', kind: 'long' },
        { path: 'mixed_setting', label: '中英混排', kind: 'long' },
      ],
    },
    {
      id: 'print_matrix',
      label: '印刷矩陣',
      kind: 'records',
      path: 'print_matrix',
      hint: '同一級字在印刷品上的實際尺寸。',
      columns: [
        { path: 'item', label: '項目', kind: 'text' },
        { path: 'spec', label: '規格', kind: 'text' },
      ],
    },
    {
      id: 'misuse',
      label: '不可以這樣用',
      kind: 'records',
      path: 'misuse',
      hint: '每一條都要寫為咩不可以。',
      columns: [
        { path: 'example', label: '例子', kind: 'text' },
        { path: 'reason', label: '為咩不可以', kind: 'long' },
      ],
    },
  ],
  empty() {
    return {
      philosophy: '',
      families: [],
      roles: [],
      pairing: '',
      sentence_anatomy: '',
      print_matrix: [],
      mixed_setting: '',
      misuse: [],
    } satisfies TypePayload;
  },
  normalize(raw) {
    const source = rec(raw);

    const families = list(source.families).map((item): TypeFamily => {
      const value = rec(item);
      return {
        id: str(value.id),
        name: str(value.name),
        script: str(value.script),
        voice: str(value.voice),
        license_web: str(value.license_web),
        license_print: str(value.license_print),
        license_app: str(value.license_app),
        license_desktop: str(value.license_desktop),
        file_ref: str(value.file_ref),
        fallback: strs(value.fallback),
      };
    });

    // v2.1 之前，層級存的是家族 id（`roles[].family`）。這裡換成聲部：
    // 認得那個家族就用它的聲部，認不到就留空（＝未決定），不靜靜丟掉
    // 那一格 —— 空著會出現在缺口裡，被人看見。
    const voiceOfFamily = new Map(families.map((family) => [family.id, family.voice]));

    return {
      philosophy: str(source.philosophy),
      families,
      roles: list(source.roles).map((item): TypeRole => {
        const value = rec(item);
        const legacyFamily = str(value.family);
        const voice = str(value.voice);

        return {
          role: str(value.role),
          voice: voice !== '' ? voice : (voiceOfFamily.get(legacyFamily) ?? ''),
          weight: str(value.weight),
          size: str(value.size),
          leading: str(value.leading),
          min: num(value.min),
          measure: str(value.measure),
          color_role: str(value.color_role),
          reason: str(value.reason),
        };
      }),
      pairing: str(source.pairing),
      sentence_anatomy: str(source.sentence_anatomy),
      print_matrix: list(source.print_matrix).map((item) => {
        const value = rec(item);
        return { item: str(value.item), spec: str(value.spec) };
      }),
      mixed_setting: str(source.mixed_setting),
      misuse: list(source.misuse).map((item) => {
        const value = rec(item);
        return { example: str(value.example), reason: str(value.reason) };
      }),
    } satisfies TypePayload;
  },
  gaps(payload) {
    const typed = payload as TypePayload;
    const gaps: BrandGapDraft[] = [];

    // 一個字種完全沒有家族：計一件。已經有家族（即使缺檔）就不再算字種缺
    // —— 否則同一件事會計兩次。
    for (const script of scriptsWithoutFamily(typed.families)) {
      gaps.push({
        item: `type.script.${script}`,
        what: script === 'latin' ? '拉丁字家族' : '中文字家族',
        type: 'file',
        ruleId: 'type.r1',
        reason: '這個字種沒有家族，就沒有品牌字可用；用系統字頂住會令人以為字體已經定了。',
      });
    }

    for (const family of typed.families) {
      if (family.name.trim() === '') {
        continue;
      }

      const missing: string[] = [];

      if (!familyLicensed(family)) {
        missing.push('授權');
      }

      if (family.file_ref.trim() === '') {
        missing.push('可嵌入檔');
      }

      if (missing.length > 0) {
        gaps.push({
          item: `type.family.${family.id}`,
          what: `${family.name} 的${missing.join('與')}`,
          type: 'file',
          ruleId: 'type.r3',
          reason: '授權是採購或法務交付的文件；可嵌入檔沒有就畫不出真樣本。',
        });
      }
    }

    // 一級缺幾樣都只計一件：同一個根本原因不重複計。
    for (const key of TYPE_ROLES) {
      const role = typed.roles.find((row) => row.role === key);
      const missing = role === undefined ? ['聲部', '字級', '行高', '字重', '最小尺寸', '文字色'] : roleMissingFields(role);

      if (missing.length > 0) {
        gaps.push({
          item: `type.role.${key}`,
          what: `${key} 的${missing.join('、')}`,
          type: 'judgement',
          ruleId: 'type.r2',
          reason: '字階是會被直接套用的數字；一格空著，那一級就排不出來。',
        });
      }
    }

    if (typed.philosophy.trim() === '') {
      gaps.push({
        item: 'type.philosophy',
        what: '字體取態',
        type: 'judgement',
        reason: '一句話講這套字在公司裡負責甚麼，其餘數字才有依據。',
      });
    }

    if (typed.pairing.trim() === '') {
      gaps.push({
        item: 'type.pairing',
        what: '聲部分工（搭配）',
        type: 'judgement',
        reason: '兩個聲部要講清楚誰負責語氣、誰負責資訊，否則會互相搶。',
      });
    }

    return gaps;
  },
  layout() {
    return {
      blocks: [
        block('section', '字體取態先講一句：這套字負責講甚麼。', 'philosophy'),
        block('section', '聲部與家族要先確立：沒有授權的字體，樣本再美也不能用。', 'families'),
        block('section', '字階是實際會被套用的部分，放在樣本之前。', 'roles'),
        block('section', '一句話的結構展示兩個聲部如何接力。', 'pairing'),
        block('section', '印刷矩陣：A4 實物會用到的級數與行距。', 'print_matrix'),
        block('section', '不可以這樣用：寫明為甚麼不，外判先讀這一段。', 'misuse'),
      ],
    };
  },
  tokens(payload) {
    const typed = payload as TypePayload;
    const entries: Record<string, TokenValue> = {};

    for (const role of typed.roles) {
      const size = typeSizePx(role.size);
      const stack = voiceStack(typed.families, role.voice);

      // 缺的家族不出現：堆疊是空的，就沒有這一級，不用系統字代替。
      if (role.role === '' || stack.length === 0) {
        continue;
      }

      const value: Record<string, string | number> = {
        fontFamily: stack.join(', '),
        fontWeight: role.weight === '' ? 400 : role.weight,
        lineHeight: role.leading === '' ? '1.5' : role.leading,
      };

      // 字級不是 px 就不寫：寫一個猜出來的數字等於假裝知道。
      if (size !== null) {
        value.fontSize = `${size}px`;
      }

      entries[role.role] = {
        $type: 'typography',
        $value: value,
        ...(role.reason === '' ? {} : { $description: role.reason }),
      };
    }

    if (Object.keys(entries).length === 0) {
      return null;
    }

    return { light: { typography: entries }, dark: { typography: entries } };
  },
  tokensNote: null,
  prompt(payload) {
    const typed = payload as TypePayload;
    const lines: string[] = [];

    if (typed.philosophy !== '') {
      lines.push(`字體取態：${typed.philosophy}`);
    }

    // 逐個聲部講：拉丁用誰、中文用誰。缺的寫「缺」，不寫系統字名稱。
    for (const voice of TYPE_VOICES) {
      const latin = familyOfVoice(typed.families, voice, 'latin');
      const chinese = familyOfVoice(typed.families, voice, 'chinese');

      if (latin === null && chinese === null) {
        continue;
      }

      const label = (family: TypeFamily | null): string => {
        if (family === null || family.name.trim() === '') {
          return '缺';
        }

        // 兩個渠道寫同一份授權時只寫一次，不寫成「OFL、OFL」。
        const licence = Array.from(
          new Set(
            [family.license_web, family.license_print].filter((value) => value.trim() !== ''),
          ),
        );

        return licence.length === 0 ? `${family.name}（授權 缺）` : `${family.name}（${licence.join('、')}）`;
      };

      lines.push(`聲部 ${voice}：拉丁 ${label(latin)}、中文 ${label(chinese)}`);
    }

    // 未有聲部的家族（v2.1 之前的內容）仍然要寫出來：不寫就等於靜靜丟掉
    // 別人填過的家族名。
    const voiceless = typed.families.filter(
      (family) => family.name.trim() !== '' && !TYPE_VOICES.includes(family.voice),
    );

    if (voiceless.length > 0) {
      lines.push(
        `未定聲部的家族：${voiceless
          .map(
            (family) =>
              `${family.name}（${family.script === 'chinese' ? '中文' : '拉丁'}、${familyLicensed(family) ? '已寫授權' : '授權 缺'}${family.file_ref.trim() === '' ? '、檔案 缺' : ''}）`,
          )
          .join('、')}`,
      );
    }

    if (typed.roles.length === 0 && typed.families.length === 0) {
      lines.push('家族：缺');
    }

    for (const role of typed.roles) {
      if (role.role === '') {
        continue;
      }

      const size = typeSizePx(role.size);

      lines.push(
        `字階 ${role.role}：${role.voice === '' ? '聲部 缺' : role.voice} ${role.weight === '' ? '字重缺' : role.weight} ${size === null ? '字級 缺' : `${size}px`}/${role.leading === '' ? '行高缺' : role.leading}，最小 ${role.min > 0 ? `${role.min}px` : '缺'}，文字色 ${role.color_role === '' ? '缺' : role.color_role}`,
      );
    }

    if (typed.mixed_setting !== '') {
      lines.push(`中英混排：${typed.mixed_setting}`);
    }

    if (typed.misuse.filter((row) => row.example !== '').length > 0) {
      lines.push(
        `不可以這樣用：${typed.misuse
          .filter((row) => row.example !== '')
          .map((row) => `${row.example}（${row.reason === '' ? '未寫為甚麼' : row.reason}）`)
          .join('、')}`,
      );
    }

    return [{ title: '字體', lines }];
  },
};

/* ── 標誌頁 ───────────────────────────────────────────────────── */

/** 五類資產。App icon 與 favicon 合起來一類，所以不是六類。 */
export const LOGO_ASSET_CLASSES: readonly string[] = ['logo', 'wordmark', 'mark', 'monogram', 'appicon'];

/** 四種顏色模式，次序固定。 */
export const LOGO_MODE_KEYS: readonly string[] = ['brand', 'mono', 'reverse', 'onDark'];

/** 錯誤用法的預設類別：示例由向量主檔自動生成，不用上傳。 */
export const LOGO_MISUSE_PRESETS: readonly string[] = [
  'stretch',
  'squash',
  'rotate',
  'shadow',
  'gradient',
  'recolor',
  'kerning',
  'retype',
  'below_min',
  'custom',
];

export type LogoAsset = {
  class: string;
  label: string;
  file_ref: string;
  /** 上載 UUID 沒有副檔名；保留原檔名才能誠實判斷向量／位圖。 */
  file_name?: string;
  version: string;
  /** 這一類有沒有用。false ＝不適用，要寫一句為甚麼，不計缺口。 */
  applicable: boolean;
  na_reason: string;
};

export type LogoLockup = {
  id: string;
  name: string;
  use: string;
  /** 每一種鎖定都有自己的實際圖檔；舊版本沒有這格，仍可讀。 */
  file_ref?: string;
  file_name?: string;
  /** 印刷最小尺寸（mm）。0 ＝未寫。 */
  min_mm: number;
  /** 螢幕最小尺寸（px）。0 ＝未寫。 */
  min_px: number;
};

export type LogoMode = {
  mode: string;
  /** 前景（標誌本身）引用的色彩角色。 */
  fg_role: string;
  /** 底色引用的色彩角色。沒有底色就判斷不了對比。 */
  bg_role: string;
  note: string;
};

export type LogoMisuse = { preset: string; what: string; why: string };

export type LogoPayload = {
  logic_line: string;
  assets: LogoAsset[];
  lockups: LogoLockup[];
  construction: string;
  clear_space_x: { x: string; multiples: string; note: string };
  modes: LogoMode[];
  /** 預設用哪個模式（品牌主頁要引用）。 */
  default_mode: string;
  backgrounds: { allowed_roles: string[]; forbidden: string };
  misuse: LogoMisuse[];
  /** 服務標與子標的系統規則。選填，沒有不計缺口。 */
  sub_marks: string;
  /** Brand Kit 的結構圖與逐款服務標記；新增欄位，不打亂舊版本。 */
  construction_ref?: string;
  construction_file_name?: string;
  service_marks?: { id: string; name: string; use: string; file_ref: string; file_name?: string }[];
};

/** 副檔名認得的就是向量，其他一律當位圖。 */
export function isVectorFile(path: string, fileName = ''): boolean {
  return /\.(svg|ai|eps|pdf)$/i.test(`${path.trim()} ${fileName.trim()}`.replace(/\s+$/, ''));
}

/**
 * 功能色是「系統在講話」的顏色（成功／警告／危險），不是品牌的聲音。
 *
 * `color.r4` 的同一條界線：標誌不可以用功能色。寫在契約層而不是各處再寫一次
 * 三個字串，因為漏一個就等於靜靜放行。
 */
export function isFunctionColourRole(role: string): boolean {
  return role === 'success' || role === 'warning' || role === 'danger';
}

/** 主標誌＝類別為 `logo` 而且不是「不適用」的那一件。不再另存 primaryId。 */
export function primaryLogoAsset(payload: LogoPayload): LogoAsset | null {
  return (
    payload.assets.find((asset) => asset.class === 'logo' && asset.applicable !== false) ?? null
  );
}

/** 一個模式齊不齊：前景與底色都要有角色。 */
export function logoModeComplete(mode: LogoMode | undefined): boolean {
  return mode !== undefined && mode.fg_role.trim() !== '' && mode.bg_role.trim() !== '';
}

const logo: PageSchema = {
  key: 'logo',
  name: '標誌',
  slot: 'logo',
  sections: [
    {
      id: 'logic',
      label: '標誌邏輯',
      kind: 'fields',
      path: '',
      hint: '一句：這個標誌在講甚麼。不是描述外形，是講它代表誰。',
      fields: [{ path: 'logic_line', label: '標誌邏輯', kind: 'long' }],
    },
    {
      id: 'assets',
      label: '資產',
      kind: 'logo-assets',
      path: 'assets',
      hint: '每一類最多一件；檔案只在這裡登記一次。缺 SVG 就標缺，不畫假標誌。',
      columns: [
        { path: 'class', label: '種類', kind: 'text' },
        { path: 'label', label: '名稱', kind: 'text' },
        { path: 'file_ref', label: '檔案', kind: 'text' },
        { path: 'version', label: '版本', kind: 'text' },
      ],
    },
    {
      id: 'lockups',
      label: '組合與最小尺寸',
      kind: 'records',
      path: 'lockups',
      hint: '每一個組合寫明用在哪，以及螢幕（px）與印刷（mm）的最小尺寸。',
      columns: [
        { path: 'id', label: '組合', kind: 'text' },
        { path: 'name', label: '名稱', kind: 'text' },
        { path: 'use', label: '用在哪', kind: 'long' },
        { path: 'min_px', label: '螢幕最小 px', kind: 'number' },
        { path: 'min_mm', label: '印刷最小 mm', kind: 'number' },
      ],
    },
    {
      id: 'space',
      label: '淨空間與構成',
      kind: 'fields',
      path: '',
      hint: '淨空間以 x 定義；x 要講明是甚麼（字標高度、標記直徑）。',
      fields: [
        { path: 'clear_space_x.x', label: 'x 指甚麼', kind: 'text' },
        { path: 'clear_space_x.multiples', label: '淨空間倍數', kind: 'text' },
        { path: 'construction', label: '構成說明', kind: 'long' },
      ],
    },
    {
      id: 'modes',
      label: '顏色模式',
      kind: 'logo-modes',
      path: 'modes',
      hint: '四種模式，每一種寫前景與底色兩個角色（只可以引用品牌色與閱讀色）。',
      columns: [
        { path: 'mode', label: '模式', kind: 'text' },
        { path: 'fg_role', label: '前景角色', kind: 'text' },
        { path: 'bg_role', label: '底色角色', kind: 'text' },
        { path: 'note', label: '用在哪', kind: 'long' },
      ],
    },
    {
      id: 'sub_marks',
      label: '服務標與子標',
      kind: 'fields',
      path: '',
      hint: '選填：服務標或子標的系統規則（字距、大小、位置）。沒有就留空。',
      fields: [{ path: 'sub_marks', label: '服務標與子標', kind: 'long' }],
    },
    {
      id: 'misuse',
      label: '不可以這樣用',
      kind: 'records',
      path: 'misuse',
      hint: '每一條要寫為甚麼不可以；示例由向量主檔套用對應變換生成。',
      columns: [
        { path: 'preset', label: '類別', kind: 'text' },
        { path: 'what', label: '例子', kind: 'text' },
        { path: 'why', label: '為甚麼不可以', kind: 'long' },
      ],
    },
    {
      id: 'backgrounds',
      label: '背景',
      kind: 'fields',
      path: '',
      fields: [
        { path: 'backgrounds.allowed_roles', label: '可放的底色', kind: 'text' },
        { path: 'backgrounds.forbidden', label: '不可以放', kind: 'long' },
      ],
    },
  ],
  empty() {
    return {
      logic_line: '',
      assets: [],
      lockups: [],
      construction: '',
      clear_space_x: { x: '', multiples: '', note: '' },
      modes: [],
      default_mode: '',
      backgrounds: { allowed_roles: [], forbidden: '' },
      misuse: [],
      sub_marks: '',
    } satisfies LogoPayload;
  },
  normalize(raw) {
    const source = rec(raw);
    const space = rec(source.clear_space_x);
    const backgrounds = source.backgrounds;

    return {
      logic_line: str(source.logic_line),
      assets: list(source.assets).map((item): LogoAsset => {
        const value = rec(item);
        return {
          class: str(value.class),
          label: str(value.label),
          file_ref: str(value.file_ref),
          ...(str(value.file_name) !== '' ? { file_name: str(value.file_name) } : {}),
          version: str(value.version),
          // 舊內容沒有這一格：預設「有用」，不是「不適用」——
          // 把未寫過的當成不適用，會靜靜把一類資產從缺口裡消失。
          applicable: value.applicable === false ? false : true,
          na_reason: str(value.na_reason),
        };
      }),
      lockups: list(source.lockups).map((item): LogoLockup => {
        const value = rec(item);
        return {
          id: str(value.id),
          name: str(value.name),
          use: str(value.use),
          ...(str(value.file_ref) !== '' ? { file_ref: str(value.file_ref) } : {}),
          ...(str(value.file_name) !== '' ? { file_name: str(value.file_name) } : {}),
          min_mm: num(value.min_mm),
          min_px: num(value.min_px),
        };
      }),
      construction: str(source.construction),
      clear_space_x: { x: str(space.x), multiples: str(space.multiples), note: str(space.note) },
      modes: list(source.modes).map((item): LogoMode => {
        const value = rec(item);
        // 舊內容只有一個 `color_role`：當它是前景，底色留空（＝缺）。
        // 不猜底色，因為猜錯會令對比看起來達標。
        return {
          mode: str(value.mode),
          fg_role: str(value.fg_role) !== '' ? str(value.fg_role) : str(value.color_role),
          bg_role: str(value.bg_role),
          note: str(value.note),
        };
      }),
      default_mode: str(source.default_mode),
      backgrounds:
        typeof backgrounds === 'string'
          ? // v2.1 之前是一句自由文字：留在「不可以放」，不丟掉。
            { allowed_roles: [], forbidden: backgrounds.trim() }
          : {
              allowed_roles: strs(rec(backgrounds).allowed_roles),
              forbidden: str(rec(backgrounds).forbidden),
            },
      misuse: list(source.misuse).map((item): LogoMisuse => {
        const value = rec(item);
        return {
          preset: str(value.preset),
          what: str(value.what) !== '' ? str(value.what) : str(value.example),
          why: str(value.why) !== '' ? str(value.why) : str(value.reason),
        };
      }),
      sub_marks: str(source.sub_marks),
      ...(str(source.construction_ref) !== ''
        ? {
            construction_ref: str(source.construction_ref),
            construction_file_name: str(source.construction_file_name),
          }
        : {}),
      ...(list(source.service_marks).length > 0
        ? {
            service_marks: list(source.service_marks).map((item) => {
              const value = rec(item);
              return {
                id: str(value.id),
                name: str(value.name),
                use: str(value.use),
                file_ref: str(value.file_ref),
                ...(str(value.file_name) !== '' ? { file_name: str(value.file_name) } : {}),
              };
            }),
          }
        : {}),
    } satisfies LogoPayload;
  },
  gaps(payload) {
    const typed = payload as LogoPayload;
    const gaps: BrandGapDraft[] = [];

    const primary = primaryLogoAsset(typed);

    if (primary === null || primary.file_ref.trim() === '') {
      gaps.push({
        item: 'logo.primary',
        what: '主標誌向量檔（SVG）',
        type: 'file',
        ruleId: 'logo.r3',
        reason: '向量檔是交付物，不是判斷；沒有檔就畫不出真標誌。',
      });
    }

    // 一件資產一個缺口，不管缺幾樣；同一類出現兩件也計一個（沒有決定）。
    const seen = new Set<string>();

    for (const asset of typed.assets) {
      if (asset.applicable === false) {
        continue;
      }

      const duplicate = seen.has(asset.class);
      seen.add(asset.class);

      const missingFile = asset.file_ref.trim() === '';
      const bitmap = !missingFile && !isVectorFile(asset.file_ref, asset.file_name ?? '');
      const noName = asset.label.trim() === '';

      if (duplicate) {
        gaps.push({
          item: `logo.asset.${asset.class}.duplicate`,
          what: `${asset.class} 有兩件`,
          type: 'judgement',
          reason: '一類只可以有一件；兩件等於未決定哪一件是準。',
        });
        continue;
      }

      if (missingFile || bitmap || noName) {
        gaps.push({
          item: `logo.asset.${asset.class}`,
          what: `${asset.label === '' ? asset.class : asset.label} 的${[noName ? '名稱' : '', missingFile ? '檔案' : '', bitmap ? '向量檔（現在是位圖）' : ''].filter((item) => item !== '').join('、')}`,
          type: 'file',
          ruleId: 'logo.r3',
          reason: '缺檔或位圖就排不出真標誌；位圖放大會起格。',
        });
      }
    }

    for (const key of LOGO_MODE_KEYS) {
      const mode = typed.modes.find((row) => row.mode === key);
      const functional =
        mode !== undefined &&
        (isFunctionColourRole(mode.fg_role) || isFunctionColourRole(mode.bg_role));

      if (!logoModeComplete(mode) || functional) {
        gaps.push({
          item: `logo.mode.${key}`,
          what: `${key} 模式的前景與底色角色`,
          type: 'judgement',
          ruleId: functional ? 'color.r4' : 'logo.r3',
          reason: functional
            ? '功能色是系統在講話的顏色，不是品牌的聲音；標誌不可以用它。'
            : '沒有前景與底色兩個角色，就講不出標誌放在哪個底上、對比夠不夠。',
        });
      }
    }

    if (typed.clear_space_x.multiples.trim() === '' || typed.clear_space_x.x.trim() === '') {
      gaps.push({
        item: 'logo.clear_space',
        what: '淨空間（倍數與 x 的定義）',
        type: 'judgement',
        ruleId: 'logo.r1',
        reason: '「留足夠空間」不是規格；倍數與 x 是品牌設計師的決定。',
      });
    }

    const primaryLockup = typed.lockups.find((row) => row.id !== '');

    if (primaryLockup === undefined || primaryLockup.min_mm <= 0 || primaryLockup.min_px <= 0) {
      gaps.push({
        item: 'logo.min_size',
        what: '主標誌組合的最小尺寸（螢幕 px、印刷 mm）',
        type: 'judgement',
        ruleId: 'logo.r2',
        reason: '沒有最小尺寸，外判會自己決定，然後出事。',
      });
    }

    if (typed.backgrounds.allowed_roles.length === 0) {
      gaps.push({
        item: 'logo.backgrounds',
        what: '可以放標誌的底色',
        type: 'judgement',
        reason: '沒有寫可以放的底色，就等於任何底色都可以。',
      });
    }

    if (typed.logic_line.trim() === '') {
      gaps.push({
        item: 'logo.logic',
        what: '標誌邏輯一句',
        type: 'judgement',
        reason: '一句講這個標誌代表誰；沒有它，之後所有變體都沒有依據。',
      });
    }

    return gaps;
  },
  layout() {
    return {
      blocks: [
        block('section', '標誌邏輯先講一句：它代表誰。', 'logic'),
        block('section', '資產先確認存在，否則整頁都是空談。', 'assets'),
        block('section', '顏色模式引用色彩角色，講明放在哪個底上。', 'modes'),
        block('section', '淨空間與最小尺寸是可量化的部分。', 'space'),
        block('section', '組合：每一種鎖定點樣擺在一起。', 'lockups'),
        block('section', '服務標與子標：五個服務各自的標記。', 'sub_marks'),
        block('section', '不可以用法，讓外判不必猜。', 'misuse'),
        block('section', '背景：放在哪個底上、唔可以放喺邊。', 'backgrounds'),
      ],
    };
  },
  tokens(payload) {
    const typed = payload as LogoPayload;
    const entries: Record<string, TokenValue> = {};

    for (const lockup of typed.lockups) {
      if (lockup.id === '') {
        continue;
      }

      if (lockup.min_px > 0) {
        entries[`logo.${lockup.id}.minScreen`] = {
          $type: 'dimension',
          $value: `${lockup.min_px}px`,
        };
      }

      if (lockup.min_mm > 0) {
        entries[`logo.${lockup.id}.minPrint`] = {
          $type: 'dimension',
          $value: `${lockup.min_mm}mm`,
        };
      }
    }

    if (typed.clear_space_x.multiples.trim() !== '') {
      entries['logo.clearSpace'] = {
        $type: 'dimension',
        $value: typed.clear_space_x.multiples,
        ...(typed.clear_space_x.x === '' ? {} : { $description: `x ＝ ${typed.clear_space_x.x}` }),
      };
    }

    for (const mode of typed.modes) {
      if (mode.mode === '' || !logoModeComplete(mode)) {
        continue;
      }

      entries[`logo.${mode.mode}.fg`] = { $type: 'color', $value: `{color.${mode.fg_role}}` };
      entries[`logo.${mode.mode}.bg`] = { $type: 'color', $value: `{color.${mode.bg_role}}` };
    }

    if (typed.default_mode !== '') {
      entries['logo.defaultMode'] = { $type: 'number', $value: typed.default_mode };
    }

    if (Object.keys(entries).length === 0) {
      return null;
    }

    return { light: { dimension: entries }, dark: { dimension: entries } };
  },
  tokensNote: null,
  prompt(payload) {
    const typed = payload as LogoPayload;
    const lines: string[] = [];

    const primary = primaryLogoAsset(typed);

    // 沒有主標誌檔就寫「缺」，不描述外形 —— 描述一個不存在的標誌等於叫
    // agent 自己發明一個。
    if (primary === null || primary.file_ref.trim() === '') {
      lines.push('標誌：缺');
    } else {
      lines.push(
        `主標誌：${primary.label === '' ? primary.class : primary.label}（${primary.file_ref}${primary.version === '' ? '' : `，${primary.version}`}）`,
      );
    }

    if (typed.logic_line !== '') {
      lines.push(`標誌邏輯：${typed.logic_line}`);
    }

    for (const lockup of typed.lockups) {
      if (lockup.id === '') {
        continue;
      }

      lines.push(
        `組合 ${lockup.id}${lockup.name === '' ? '' : `（${lockup.name}）`}：${lockup.use === '' ? '用途 缺' : lockup.use}；最小 螢幕 ${lockup.min_px > 0 ? `${lockup.min_px}px` : '缺'}、印刷 ${lockup.min_mm > 0 ? `${lockup.min_mm}mm` : '缺'}`,
      );
    }

    if (typed.clear_space_x.multiples !== '') {
      lines.push(
        `淨空間：${typed.clear_space_x.multiples}${typed.clear_space_x.x === '' ? '（x 未定義）' : `，x ＝ ${typed.clear_space_x.x}`}`,
      );
    }

    for (const key of LOGO_MODE_KEYS) {
      const mode = typed.modes.find((row) => row.mode === key);

      if (mode === undefined) {
        lines.push(`顏色模式 ${key}：缺`);
        continue;
      }

      lines.push(
        `顏色模式 ${key}：前景 ${mode.fg_role === '' ? '缺' : mode.fg_role}、底色 ${mode.bg_role === '' ? '缺' : mode.bg_role}${mode.note === '' ? '' : `；用在哪 ${mode.note}`}`,
      );
    }

    if (typed.default_mode !== '') {
      lines.push(`預設模式：${typed.default_mode}`);
    }

    if (typed.backgrounds.allowed_roles.length > 0) {
      lines.push(`可放的底色：${typed.backgrounds.allowed_roles.join('、')}`);
    }

    if (typed.backgrounds.forbidden !== '') {
      lines.push(`不可以放：${typed.backgrounds.forbidden}`);
    }

    if (typed.sub_marks !== '') {
      lines.push(`服務標與子標：${typed.sub_marks}`);
    }

    if (typed.misuse.filter((row) => row.what !== '').length > 0) {
      lines.push(
        `不可以這樣用：${typed.misuse
          .filter((row) => row.what !== '')
          .map((row) => `${row.what}（${row.why === '' ? '未寫為甚麼' : row.why}）`)
          .join('、')}`,
      );
    }

    return [{ title: '標誌', lines }];
  },
};

/* ── 語氣頁 ───────────────────────────────────────────────────── */

/** 有專業或法規邊界的話題：品牌語言講到哪裡停，由誰接手。 */
export type ToneBoundary = { topic: string; handoff: string };

export type TonePayload = {
  traits: { name: string; do: string; dont: string; sentence: string }[];
  banned: { term: string; reason: string }[];
  /** 專業邊界。選填：沒有邊界的品牌留空，不計缺口。 */
  boundaries: ToneBoundary[];
  language_policy: string;
  contexts: { explain: string; invite: string; decline: string; apologize: string; incident: string };
  samples: { like: string[]; unlike: string[] };
  /** 最容易說錯的一句。`context` 選填，拒絕客人只是其中一個例子。 */
  hardest_line: { context: string; wrong: string; right: string };
  /** 與立場句呼應的句式規則。選填。 */
  sentence_rule: string;
};

/** 五個情境的顯示名（照策略原文：說明、邀請、拒絕、致歉、出問題）。 */
const CONTEXT_LABELS: { key: keyof TonePayload['contexts']; label: string }[] = [
  { key: 'explain', label: '說明' },
  { key: 'invite', label: '邀請' },
  { key: 'decline', label: '拒絕' },
  { key: 'apologize', label: '致歉' },
  { key: 'incident', label: '出問題' },
];

/** 特質三到五個：少過三個不夠用，多過五個沒人記得。 */
const TONE_MIN_TRAITS = 3;
const TONE_MAX_TRAITS = 5;

/** 樣本五句像、五句不像。少過就是未夠。 */
const TONE_SAMPLE_TARGET = 5;

const tone: PageSchema = {
  key: 'tone',
  name: '語氣',
  slot: 'tone',
  sections: [
    {
      id: 'traits',
      label: '特質',
      kind: 'voice-traits',
      path: 'traits',
      hint: '每一條要有「會這樣講」「不會這樣講」加一句真句。只有形容詞就標缺。',
      columns: [
        { path: 'name', label: '特質', kind: 'text' },
        { path: 'do', label: '會這樣講', kind: 'long' },
        { path: 'dont', label: '不會這樣講', kind: 'long' },
        { path: 'sentence', label: '一句示範', kind: 'long' },
      ],
    },
    {
      id: 'banned',
      label: '禁用',
      kind: 'records',
      path: 'banned',
      hint: '每一個詞都要寫為咩禁。沒有原因的禁用詞，下一次就會被人解禁。',
      columns: [
        { path: 'term', label: '詞', kind: 'text' },
        { path: 'reason', label: '為咩禁', kind: 'long' },
      ],
    },
    {
      id: 'samples',
      label: '樣本',
      kind: 'voice-samples',
      path: 'samples',
      hint: '五句像、五句不像。不像的也要是這一間公司可能寫出來的句子。',
    },
    {
      id: 'contexts',
      label: '情境',
      kind: 'fields',
      path: 'contexts',
      hint: '同一把聲，五個場合。',
      fields: [
        { path: 'explain', label: '說明', kind: 'long' },
        { path: 'invite', label: '邀請', kind: 'long' },
        { path: 'decline', label: '拒絕', kind: 'long' },
        { path: 'apologize', label: '致歉', kind: 'long' },
        { path: 'incident', label: '出問題', kind: 'long' },
      ],
    },
    {
      id: 'hardest',
      label: '最容易說錯的一句',
      kind: 'fields',
      path: 'hardest_line',
      hint: '這個品牌最容易說錯的一句，以及正確說法。拒絕客人只是其中一個例子。',
      fields: [
        { path: 'context', label: '在哪個場合（選填）', kind: 'text' },
        { path: 'wrong', label: '錯的寫法', kind: 'long' },
        { path: 'right', label: '對的寫法', kind: 'long' },
      ],
    },
    {
      id: 'boundaries',
      label: '專業邊界',
      kind: 'records',
      path: 'boundaries',
      hint: '選填：哪些話題品牌語言不碰，由誰接手。沒有邊界就留空，不計缺口。',
      columns: [
        { path: 'topic', label: '話題', kind: 'text' },
        { path: 'handoff', label: '由誰接手', kind: 'long' },
      ],
    },
    {
      id: 'sentence_rule',
      label: '句式規則',
      kind: 'fields',
      path: '',
      hint: '選填：與立場句呼應的句式規則。',
      fields: [{ path: 'sentence_rule', label: '句式規則', kind: 'long' }],
    },
    {
      id: 'policy',
      label: '語言政策',
      kind: 'fields',
      path: '',
      fields: [{ path: 'language_policy', label: '用哪種語言、何時用', kind: 'long' }],
    },
  ],
  empty() {
    return {
      traits: [],
      banned: [],
      boundaries: [],
      language_policy: '',
      contexts: { explain: '', invite: '', decline: '', apologize: '', incident: '' },
      samples: { like: [], unlike: [] },
      hardest_line: { context: '', wrong: '', right: '' },
      sentence_rule: '',
    } satisfies TonePayload;
  },
  normalize(raw) {
    const source = rec(raw);
    const contexts = rec(source.contexts);
    const samples = rec(source.samples);
    const hardest = rec(source.hardest_line);

    return {
      traits: list(source.traits).map((item) => {
        const value = rec(item);
        return { name: str(value.name), do: str(value.do), dont: str(value.dont), sentence: str(value.sentence) };
      }),
      banned: list(source.banned).map((item) => {
        const value = rec(item);
        return { term: str(value.term), reason: str(value.reason) };
      }),
      boundaries: list(source.boundaries).map((item): ToneBoundary => {
        const value = rec(item);
        return { topic: str(value.topic), handoff: str(value.handoff) };
      }),
      language_policy: str(source.language_policy),
      contexts: {
        explain: str(contexts.explain),
        invite: str(contexts.invite),
        decline: str(contexts.decline),
        apologize: str(contexts.apologize),
        incident: str(contexts.incident),
      },
      samples: { like: strs(samples.like), unlike: strs(samples.unlike) },
      hardest_line: {
        context: str(hardest.context),
        wrong: str(hardest.wrong),
        right: str(hardest.right),
      },
      sentence_rule: str(source.sentence_rule),
    } satisfies TonePayload;
  },
  gaps(payload) {
    const typed = payload as TonePayload;
    const gaps: BrandGapDraft[] = [];

    const named = typed.traits.filter((trait) => trait.name.trim() !== '');

    // 不足三個：一次講清楚，不是逐個空位各計一項。
    if (named.length < TONE_MIN_TRAITS) {
      gaps.push({
        item: 'tone.traits',
        what: `聲音特質（現在 ${named.length} 個，最少 ${TONE_MIN_TRAITS} 個）`,
        type: 'judgement',
        ruleId: 'voice.r1',
        reason: '少過三個特質，等於只有一個形容詞；agent 照寫就會變成自己的語氣。',
      });
    }

    // 超過五個：截斷會令第六個永久消失（v2.1 第 4.4 節），所以保留並講出來。
    if (typed.traits.length > TONE_MAX_TRAITS) {
      gaps.push({
        item: 'tone.traits.over',
        what: `聲音特質有 ${typed.traits.length} 個，超過 ${TONE_MAX_TRAITS} 個`,
        type: 'judgement',
        ruleId: 'voice.r1',
        reason: '超過五個沒人記得；請合併或刪除，系統不會替你丟掉。',
      });
    }

    // 一個特質一個缺口，不管缺幾樣。
    for (const trait of typed.traits) {
      if (trait.name.trim() === '') {
        continue;
      }

      const missing = [
        trait.do.trim() === '' ? '會這樣講' : '',
        trait.dont.trim() === '' ? '不會這樣講' : '',
        trait.sentence.trim() === '' ? '一句示範' : '',
      ].filter((item) => item !== '');

      if (missing.length > 0) {
        gaps.push({
          item: `tone.trait.${trait.name}`,
          what: `「${trait.name}」的${missing.join('、')}`,
          type: 'judgement',
          ruleId: 'voice.r1',
          reason: '只有形容詞的語氣不能交給 agent；示範句要由品牌自己寫。',
        });
      }
    }

    const banned = typed.banned.filter((item) => item.term.trim() !== '');

    if (banned.length === 0) {
      gaps.push({
        item: 'tone.banned',
        what: '禁用詞',
        type: 'judgement',
        ruleId: 'voice.r1',
        reason: '沒有禁用詞，就沒有人知道哪些字一寫出來就不是這個品牌。',
      });
    }

    for (const item of typed.banned) {
      if (item.term.trim() !== '' && item.reason.trim() === '') {
        gaps.push({
          item: `tone.banned.${item.term}`,
          what: `「${item.term}」為甚麼不可以`,
          type: 'judgement',
          ruleId: 'voice.r1',
          reason: '沒有原因的禁用詞，下一次就會被人解禁。',
        });
      }
    }

    if (typed.language_policy.trim() === '') {
      gaps.push({
        item: 'tone.language_policy',
        what: '語言政策（用哪種語言、何時用）',
        type: 'judgement',
        reason: '不寫就由系統代答「只用繁中」，而那不是品牌的決定。',
      });
    }

    for (const { key, label } of CONTEXT_LABELS) {
      if (typed.contexts[key].trim() === '') {
        gaps.push({
          item: `tone.context.${key}`,
          what: `${label}場合的寫法`,
          type: 'judgement',
          reason: '同一把聲的五個場合；缺一個，agent 就會自己編一個語氣。',
        });
      }
    }

    for (const kind of ['like', 'unlike'] as const) {
      const count = typed.samples[kind].filter((line) => line.trim() !== '').length;

      if (count < TONE_SAMPLE_TARGET) {
        gaps.push({
          item: `tone.samples.${kind}`,
          what: `語氣樣本（${kind === 'like' ? '像' : '不像'}，現在 ${count}／${TONE_SAMPLE_TARGET} 句）`,
          type: 'judgement',
          reason: '沒有樣本，agent 只會照抄形容詞。',
        });
      }
    }

    // 錯與對是同一個決定（一組對比），所以任一邊空只計 1 項。
    if (typed.hardest_line.wrong.trim() === '' || typed.hardest_line.right.trim() === '') {
      gaps.push({
        item: 'tone.hardest_line',
        what: '最容易說錯的一句（錯與對）',
        type: 'judgement',
        reason: '一組錯對比才示範得到邊界在哪；只有一邊等於沒有對照。',
      });
    }

    // 不計：專業邊界、句式規則（都是選填），以及立場句（屬平台頁）。

    return gaps;
  },
  layout() {
    return {
      blocks: [
        block('stance', '語氣是立場的說法；先讀立場（平台頁），再講怎樣講。'),
        block('section', '特質連示範句，才是可以照寫的規則。', 'traits'),
        block('section', '最容易說錯的一句：左錯右對。', 'hardest'),
        block('section', '同一把聲的五個場合。', 'contexts'),
        block('section', '樣本比形容詞有用：五句像、五句不像。', 'samples'),
        block('section', '禁用詞逐個有原因。', 'banned'),
        block('section', '專業邊界：品牌語言講到哪裡停。', 'boundaries'),
        block('section', '句式規則：一句話的骨架，寫稿先讀這一段。', 'sentence_rule'),
        block('section', '語言政策：用邊種語言、點樣混。', 'policy'),
      ],
    };
  },
  tokens() {
    return null;
  },
  tokensNote: '語氣沒有可量化的設計 token；它全部進 prompt 的語氣段落與樣本庫。',
  prompt(payload) {
    const typed = payload as TonePayload;
    const lines: string[] = [];

    // 立場句不在這一頁：它唯一住在平台頁，所以 prompt 也不重複寫一次。

    for (const trait of typed.traits) {
      if (trait.name !== '') {
        lines.push(
          `語氣「${trait.name}」：會「${trait.do === '' ? '缺' : trait.do}」，不會「${trait.dont === '' ? '缺' : trait.dont}」，示範：${trait.sentence === '' ? '缺' : trait.sentence}`,
        );
      }
    }

    if (typed.banned.length > 0) {
      lines.push(
        `禁用：${typed.banned
          .filter((item) => item.term !== '')
          .map((item) => `${item.term}（${item.reason === '' ? '未寫原因' : item.reason}）`)
          .join('、')}`,
      );
    }

    const like = typed.samples.like.filter((line) => line.trim() !== '');
    const unlike = typed.samples.unlike.filter((line) => line.trim() !== '');

    lines.push(`樣本（像）：${like.length === 0 ? '缺' : like.join('／')}`);
    lines.push(`樣本（不像）：${unlike.length === 0 ? '缺' : unlike.join('／')}`);

    if (typed.boundaries.length > 0) {
      lines.push(
        `專業邊界：${typed.boundaries
          .filter((item) => item.topic.trim() !== '')
          .map((item) => `${item.topic}（${item.handoff === '' ? '未寫誰接手' : item.handoff}）`)
          .join('、')}`,
      );
    }

    const contextLines = CONTEXT_LABELS.filter(({ key }) => typed.contexts[key].trim() !== '').map(
      ({ key, label }) => `${label}：${typed.contexts[key]}`,
    );

    if (contextLines.length > 0) {
      lines.push(`同一把聲的五個場合：${contextLines.join('；')}`);
    }

    lines.push(
      `最容易說錯的一句${typed.hardest_line.context === '' ? '' : `（${typed.hardest_line.context}）`}：錯的寫法「${typed.hardest_line.wrong === '' ? '缺' : typed.hardest_line.wrong}」，對的寫法「${typed.hardest_line.right === '' ? '缺' : typed.hardest_line.right}」`,
    );

    if (typed.sentence_rule !== '') {
      lines.push(`句式規則：${typed.sentence_rule}`);
    }

    if (typed.language_policy !== '') {
      lines.push(`語言政策：${typed.language_policy}`);
    }

    return [{ title: '語氣', lines }];
  },
};

/* ── 圖像頁 ───────────────────────────────────────────────────── */

/** 參考照片的授權三態。未確認就要人確認，不是預設可以用。 */
export const IMAGE_RIGHTS = ['own', 'licensed', 'unknown'] as const;

export type ImageRights = (typeof IMAGE_RIGHTS)[number];

/** 參考照片：這個品牌自己拍的，用來告訴外判「我們的照片長這樣」。 */
export type ImageReferencePhoto = {
  label: string;
  file_ref: string;
  /** 素材模組的 id。現階段留空，日後只存 id 不存檔案副本。 */
  material_id: string;
  use: string;
  rights: ImageRights;
};

/** 要的樣子：一句可觀察的特徵，可附一張參考照片（用它的 label 指）。 */
export type ImageLike = { text: string; photo: string };

/** 不要的樣子：同樣要講為甚麼不要。 */
export type ImageUnlike = { text: string; reason: string; photo: string };

/** 吉祥物角色：一個角色一份資產。 */
export type MascotCharacter = {
  id: string;
  name: string;
  role: string;
  description: string;
  file_ref: string;
  file_name?: string;
};

/** 吉祥物頁的完整內容（v2.2 由圖像頁搬出）。 */
export type MascotPayload = {
  /** 修正與作廢：以前講錯的吉祥物設定，以及為甚麼改。 */
  correction: string;
  /** 核心一句：這個吉祥物代表品牌的那一句話。 */
  spine: string;
  /** 邊界：吉祥物可以出醜、不可以出錯的界線。 */
  boundaries: string[];
  /** 未決：還未定的問題，一條一條列出。 */
  open: string[];
  /** 角色資產：每個角色一筆，帶圖檔。 */
  characters: MascotCharacter[];
};

export type ImagePayload = {
  /** 圖像立場：這一頁自己的一句（例：照片是證明，不是裝飾）。 */
  image_stance: string;
  photo: { subject: string; composition: string; light: string; tone: string; space: string; props: string };
  reference_photos: ImageReferencePhoto[];
  like: ImageLike[];
  unlike: ImageUnlike[];
  color_link: string[];
  /** 結合品牌色的手法。選填。 */
  color_note: string;
  illustration: string;
  /**
   * 吉祥物（舊版住在這裡）。新版搬到吉祥物頁，但型別保留相容舊版本 ——
   * 舊版本讀入不炸，output 不再從這裡畫吉祥物。
   */
  mascot?: MascotPayload;
  rights: string;
  banned: { term: string; reason: string }[];
};

/** 每一邊至少三組才算齊（策略原文）。 */
export const IMAGE_LIST_TARGET = 3;

function rightsOf(value: unknown): ImageRights {
  return value === 'own' || value === 'licensed' || value === 'unknown' ? value : 'unknown';
}

const image: PageSchema = {
  key: 'image',
  name: '圖像',
  slot: 'image',
  sections: [
    {
      id: 'stance',
      label: '圖像立場',
      kind: 'fields',
      path: '',
      hint: '一句：這個品牌的照片在證明甚麼。不是描述風格。',
      fields: [{ path: 'image_stance', label: '圖像立場', kind: 'long' }],
    },
    {
      id: 'photo',
      label: '攝影',
      kind: 'fields',
      path: 'photo',
      hint: '六格：題材、構圖、光、調、空間、道具。寫得愈具體，外判愈不會猜。',
      fields: [
        { path: 'subject', label: '題材', kind: 'long' },
        { path: 'composition', label: '構圖', kind: 'long' },
        { path: 'light', label: '光線', kind: 'long' },
        { path: 'tone', label: '調子與後期', kind: 'long' },
        { path: 'space', label: '留白', kind: 'long' },
        { path: 'props', label: '道具', kind: 'long' },
      ],
    },
    {
      id: 'photos',
      label: '參考照片',
      kind: 'records',
      path: 'reference_photos',
      hint: '沒有真照片就標缺，不用圖庫圖假扮。每一張要寫用在哪與授權。',
      columns: [
        { path: 'label', label: '名稱', kind: 'text' },
        { path: 'file_ref', label: '檔案', kind: 'text' },
        { path: 'use', label: '用在哪', kind: 'text' },
        { path: 'rights', label: '授權', kind: 'text' },
      ],
    },
    {
      id: 'like',
      label: '要的樣子',
      kind: 'records',
      path: 'like',
      hint: '每一句講一個可觀察的特徵，可附一張參考照片。至少三組。',
      columns: [
        { path: 'text', label: '要的樣子', kind: 'long' },
        { path: 'photo', label: '參考照片', kind: 'text' },
      ],
    },
    {
      id: 'unlike',
      label: '不要的樣子',
      kind: 'records',
      path: 'unlike',
      hint: '講明為甚麼不要，不只是「不好看」。至少三組。',
      columns: [
        { path: 'text', label: '不要的樣子', kind: 'long' },
        { path: 'reason', label: '為甚麼不要', kind: 'long' },
        { path: 'photo', label: '反面參考照片', kind: 'text' },
      ],
    },
    {
      id: 'banned',
      label: '禁止',
      kind: 'records',
      path: 'banned',
      hint: '每一條寫為咩。',
      columns: [
        { path: 'term', label: '禁', kind: 'text' },
        { path: 'reason', label: '為咩', kind: 'long' },
      ],
    },
    {
      id: 'link',
      label: '與色彩、插畫的關係',
      kind: 'fields',
      path: '',
      fields: [
        { path: 'color_link', label: '引用哪些色彩角色', kind: 'list' },
        { path: 'color_note', label: '結合品牌色的手法', kind: 'long' },
        { path: 'illustration', label: '插畫（如有）', kind: 'long' },
        { path: 'rights', label: '授權與使用權', kind: 'long' },
      ],
    },
  ],
  empty() {
    return {
      image_stance: '',
      photo: { subject: '', composition: '', light: '', tone: '', space: '', props: '' },
      reference_photos: [],
      like: [],
      unlike: [],
      color_link: [],
      color_note: '',
      illustration: '',
      rights: '',
      banned: [],
    } satisfies ImagePayload;
  },
  normalize(raw) {
    const source = rec(raw);
    const photo = rec(source.photo);

    // `approved_examples` 是舊鍵：照原樣讀進來，不丟資料。舊版沒有授權，
    // 所以 rights 是 `unknown`（未確認），不是「可以用」。
    const photos = list(source.reference_photos).length > 0 ? list(source.reference_photos) : list(source.approved_examples);

    return {
      // 舊版只有一個 `stance`：可能是品牌立場副本，也可能是圖像立場。
      // 分不出來就保留，不刪 —— 刪了就是替人決定。
      image_stance: str(source.image_stance) !== '' ? str(source.image_stance) : str(source.stance),
      photo: {
        subject: str(photo.subject),
        composition: str(photo.composition),
        light: str(photo.light),
        tone: str(photo.tone),
        space: str(photo.space),
        props: str(photo.props),
      },
      reference_photos: photos.map((item): ImageReferencePhoto => {
        const value = rec(item);
        return {
          label: str(value.label),
          file_ref: str(value.file_ref),
          material_id: str(value.material_id),
          use: str(value.use),
          rights: rightsOf(value.rights),
        };
      }),
      // 舊版 `like` 是純字串陣列；新版是 `{text, photo}`。兩種都讀得返。
      like: list(source.like).map((item): ImageLike => {
        if (typeof item === 'string') {
          return { text: item, photo: '' };
        }

        const value = rec(item);

        return { text: str(value.text), photo: str(value.photo) };
      }),
      unlike: list(source.unlike).map((item): ImageUnlike => {
        const value = rec(item);
        return {
          text: typeof item === 'string' ? item : str(value.text),
          reason: str(value.reason),
          photo: str(value.photo),
        };
      }),
      color_link: strs(source.color_link),
      color_note: str(source.color_note),
      illustration: str(source.illustration),
      ...(typeof source.mascot === 'object' && source.mascot !== null
        ? {
            mascot: {
              correction: str(rec(source.mascot).correction),
              spine: str(rec(source.mascot).spine),
              boundaries: strs(rec(source.mascot).boundaries),
              open: strs(rec(source.mascot).open),
              characters: list(rec(source.mascot).characters).map((item) => {
                const value = rec(item);
                return {
                  id: str(value.id),
                  name: str(value.name),
                  role: str(value.role),
                  description: str(value.description),
                  file_ref: str(value.file_ref),
                  ...(str(value.file_name) !== '' ? { file_name: str(value.file_name) } : {}),
                };
              }),
            },
          }
        : {}),
      rights: str(source.rights),
      banned: list(source.banned).map((item) => {
        const value = rec(item);
        return { term: str(value.term), reason: str(value.reason) };
      }),
    } satisfies ImagePayload;
  },
  gaps(payload) {
    const typed = payload as ImagePayload;
    const gaps: BrandGapDraft[] = [];

    if (typed.image_stance.trim() === '') {
      gaps.push({
        item: 'image.stance',
        what: '圖像立場一句',
        type: 'judgement',
        ruleId: 'image.r1',
        reason: '一句講照片在證明甚麼；沒有它，六格只是六個風格偏好。',
      });
    }

    const photoLabels: Record<string, string> = {
      subject: '題材',
      composition: '構圖',
      light: '光線',
      tone: '調子與後期',
      space: '留白',
      props: '道具',
    };

    for (const [key, label] of Object.entries(photoLabels)) {
      if (typed.photo[key as keyof ImagePayload['photo']].trim() === '') {
        gaps.push({
          item: `image.photo.${key}`,
          what: `攝影六格：${label}`,
          type: 'judgement',
          reason: '拍甚麼是品牌判斷，不是外判可以代決定。',
        });
      }
    }

    // 一件真照片都冇 → 1 項（檔案型）。單件缺檔不另計，否則同一件事扣兩次。
    const real = typed.reference_photos.filter((photo) => photo.file_ref.trim() !== '');

    if (real.length === 0) {
      gaps.push({
        item: 'image.reference_photos',
        what: '一張有檔案的參考照片',
        type: 'file',
        reason: '沒有真照片，外判只會交圖庫圖；那是另一間公司的樣子。',
      });
    } else {
      // 已經有一張真的之後，其餘缺檔的才各計 1。
      for (const photo of typed.reference_photos) {
        if (photo.file_ref.trim() === '') {
          gaps.push({
            item: `image.reference_photos.${photo.label === '' ? '未命名' : photo.label}`,
            what: `${photo.label === '' ? '未命名的參考照片' : photo.label} 的檔案`,
            type: 'file',
            reason: '登記了但沒有檔，外判拿不到。',
          });
        }
      }
    }

    for (const [key, label] of [
      ['like', '要的樣子'],
      ['unlike', '不要的樣子'],
    ] as const) {
      const filled = typed[key].filter((item) => item.text.trim() !== '').length;

      if (filled < IMAGE_LIST_TARGET) {
        gaps.push({
          item: `image.${key}`,
          what: `${label}（現在 ${filled}／${IMAGE_LIST_TARGET} 組）`,
          type: 'judgement',
          ruleId: key === 'unlike' ? 'image.r1' : undefined,
          reason:
            key === 'unlike'
              ? '只講要的樣子，等於沒有講邊界；每一組還要講為甚麼不要。'
              : '至少三組對照，外判才歸納得出規則。',
        });
      }
    }

    // 不要的樣子缺原因：每組 1 項（`image.r1`）。
    for (const item of typed.unlike) {
      if (item.text.trim() !== '' && item.reason.trim() === '') {
        gaps.push({
          item: `image.unlike.${item.text}`,
          what: `「${item.text}」為甚麼不要`,
          type: 'judgement',
          ruleId: 'image.r1',
          reason: '沒有原因的「不要」，下一次就會被人加回來。',
        });
      }
    }

    if (typed.color_link.length === 0) {
      gaps.push({
        item: 'image.color_link',
        what: '與色彩的關係（引用哪些角色）',
        type: 'judgement',
        ruleId: 'image.r2',
        reason: '沒有寫照片怎樣用品牌色，六格就只是風格參考。',
      });
    }

    if (typed.rights.trim() === '') {
      gaps.push({
        item: 'image.rights',
        what: '授權與使用權',
        type: 'judgement',
        reason: '冇授權的照片不可以用，這不是排版問題。',
      });
    }

    const banned = typed.banned.filter((item) => item.term.trim() !== '');

    if (banned.length === 0) {
      gaps.push({
        item: 'image.banned',
        what: '禁止（一條都沒有）',
        type: 'judgement',
        ruleId: 'image.r1',
        reason: '沒有禁止，就沒有人知道哪些做法一出來就不是這個品牌。',
      });
    }

    for (const item of typed.banned) {
      if (item.term.trim() !== '' && item.reason.trim() === '') {
        gaps.push({
          item: `image.banned.${item.term}`,
          what: `禁止「${item.term}」為甚麼`,
          type: 'judgement',
          ruleId: 'image.r1',
          reason: '沒有原因的禁止，下一次就會被人解禁。',
        });
      }
    }

    // 不計：插畫為空、`color_note` 為空、已核准範例（屬應用層）。

    return gaps;
  },
  layout() {
    return {
      blocks: [
        block('stance', '先讀立場（平台頁），再講這一頁的圖像立場。'),
        block('section', '圖像立場一句：照片在證明甚麼。', 'stance'),
        block('section', '攝影六格是外判唯一可以照做的部分。', 'photo'),
        block('section', '真照片比形容詞有力，放在六格之後。', 'photos'),
        block('section', '要的樣子：每一條是可觀察的特徵。', 'like'),
        block('section', '不要的樣子與要的並列，避免只講一半。', 'unlike'),
        block('section', '禁止：寫明為甚麼不要，唔好靠感覺。', 'banned'),
        block('section', '與色彩的關係：角色與手法。', 'link'),
      ],
    };
  },
  tokens() {
    return null;
  },
  tokensNote: '圖像沒有設計 token；它進 prompt 的圖像段落，並以範例引用（#68）。',
  prompt(payload) {
    const typed = payload as ImagePayload;
    const lines: string[] = [];
    const photo = typed.photo;
    const pairs: [string, string][] = [
      ['題材', photo.subject],
      ['構圖', photo.composition],
      ['光線', photo.light],
      ['調子與後期', photo.tone],
      ['留白', photo.space],
      ['道具', photo.props],
    ];

    if (typed.image_stance !== '') {
      lines.push(`圖像立場：${typed.image_stance}`);
    }

    // 六格逐格寫，缺的寫「缺」：少寫一格，外判就會自己補一個。
    lines.push(
      `攝影六格：${pairs.map(([label, value]) => `${label}＝${value === '' ? '缺' : value}`).join('；')}`,
    );

    // 沒有真照片就講明，並提示不可以用圖庫圖替代。
    const real = typed.reference_photos.filter((item) => item.file_ref.trim() !== '');

    if (real.length === 0) {
      lines.push('參考照片：缺（不可以用圖庫圖替代）');
    } else {
      const rightsLabel: Record<string, string> = { own: '自家拍攝', licensed: '已授權', unknown: '未確認' };

      lines.push(
        `參考照片：${real
          .map(
            (item) =>
              `${item.label === '' ? '未命名' : item.label}（${item.file_ref}；用於${item.use === '' ? '未寫' : item.use}；${rightsLabel[item.rights] ?? '未確認'}）`,
          )
          .join('、')}`,
      );
    }

    const like = typed.like.filter((item) => item.text.trim() !== '');

    lines.push(
      like.length === 0
        ? '要的樣子：缺'
        : `要的樣子：${like
            .map((item) => `${item.text}${item.photo === '' ? '' : `［${item.photo}］`}`)
            .join('、')}`,
    );

    const unlike = typed.unlike.filter((item) => item.text.trim() !== '');

    lines.push(
      unlike.length === 0
        ? '不要的樣子：缺'
        : `不要的樣子：${unlike
            .map(
              (item) =>
                `${item.text}（${item.reason === '' ? '未寫原因' : item.reason}）${item.photo === '' ? '' : `［${item.photo}］`}`,
            )
            .join('、')}`,
    );

    if (typed.color_link.length > 0) {
      lines.push(`引用色彩角色：${typed.color_link.join('、')}`);
    }

    if (typed.color_note !== '') {
      lines.push(`結合品牌色的手法：${typed.color_note}`);
    }

    if (typed.illustration !== '') {
      lines.push(`插畫：${typed.illustration}`);
    }

    if (typed.banned.length > 0) {
      lines.push(
        `禁止：${typed.banned
          .filter((item) => item.term !== '')
          .map((item) => `${item.term}（${item.reason === '' ? '未寫原因' : item.reason}）`)
          .join('、')}`,
      );
    }

    if (typed.rights !== '') {
      lines.push(`授權：${typed.rights}`);
    }

    return [{ title: '圖像', lines }];
  },
};

/* ── 吉祥物頁 ─────────────────────────────────────────────────── */

const mascot: PageSchema = {
  key: 'mascot',
  name: '吉祥物',
  slot: 'mascot',
  sections: [
    {
      id: 'correction',
      label: '修正與作廢',
      kind: 'fields',
      path: '',
      hint: '以前講錯的吉祥物設定，以及為甚麼改。不寫就會有人照舊版做。',
      fields: [{ path: 'correction', label: '修正與作廢', kind: 'long' }],
    },
    {
      id: 'spine',
      label: '核心一句',
      kind: 'fields',
      path: '',
      hint: '這個吉祥物代表品牌的那一句話。不是外形描述，是它替品牌講的那一句。',
      fields: [{ path: 'spine', label: '核心一句', kind: 'long' }],
    },
    {
      id: 'boundaries',
      label: '邊界',
      kind: 'list',
      path: 'boundaries',
      hint: '可以出醜、不可以出錯的界線。每一條要可以被違反，才算邊界。',
    },
    {
      id: 'open',
      label: '未決',
      kind: 'list',
      path: 'open',
      hint: '還未定的問題。留空不等於沒有問題，只是還未寫出來。',
    },
    {
      id: 'characters',
      label: '角色資產',
      kind: 'records',
      path: 'characters',
      hint: '每個角色一筆，帶圖檔。冇圖檔的角色只是名字。',
      columns: [
        { path: 'name', label: '名稱', kind: 'text' },
        { path: 'role', label: '角色', kind: 'text' },
        { path: 'description', label: '描述', kind: 'long' },
        { path: 'file_ref', label: '檔案', kind: 'text' },
      ],
    },
  ],
  empty() {
    return { correction: '', spine: '', boundaries: [], open: [], characters: [] } satisfies MascotPayload;
  },
  normalize(raw) {
    const source = rec(raw);

    return {
      correction: str(source.correction),
      spine: str(source.spine),
      boundaries: strs(source.boundaries),
      open: strs(source.open),
      characters: list(source.characters).map((item): MascotCharacter => {
        const value = rec(item);
        return {
          id: str(value.id),
          name: str(value.name),
          role: str(value.role),
          description: str(value.description),
          file_ref: str(value.file_ref),
          ...(str(value.file_name) !== '' ? { file_name: str(value.file_name) } : {}),
        };
      }),
    } satisfies MascotPayload;
  },
  gaps(payload) {
    const typed = payload as MascotPayload;
    const gaps: BrandGapDraft[] = [];

    if (typed.correction.trim() === '') {
      gaps.push({
        item: 'mascot.correction',
        what: '修正與作廢',
        type: 'judgement',
        reason: '不寫以前講錯了甚麼，外判會照舊版做，然後再錯一次。',
      });
    }

    if (typed.spine.trim() === '') {
      gaps.push({
        item: 'mascot.spine',
        what: '核心一句',
        type: 'judgement',
        reason: '一句講這個吉祥物代表甚麼；冇它，角色設計就沒有依據。',
      });
    }

    if (typed.boundaries.length === 0) {
      gaps.push({
        item: 'mascot.boundaries',
        what: '邊界（可以出醜、不可以出錯的界線）',
        type: 'judgement',
        reason: '冇邊界的吉祥物，出事時冇人知道界線在哪。',
      });
    }

    if (typed.open.length === 0) {
      gaps.push({
        item: 'mascot.open',
        what: '未決（還未定的問題）',
        type: 'judgement',
        reason: '留空不等於冇問題，只是還未寫出來；不寫就會被當成已經定了。',
      });
    }

    if (typed.characters.length === 0) {
      gaps.push({
        item: 'mascot.characters',
        what: '至少一個角色資產',
        type: 'file',
        reason: '冇角色就冇吉祥物；名字本身不是資產。',
      });
    }

    for (const character of typed.characters) {
      if (character.name.trim() !== '' && character.file_ref.trim() === '') {
        gaps.push({
          item: `mascot.character.${character.name}`,
          what: `「${character.name}」的圖檔`,
          type: 'file',
          reason: '登記了但冇圖檔，外判拿不到，畫不出真樣子。',
        });
      }
    }

    return gaps;
  },
  layout() {
    return {
      blocks: [
        block('stance', '先讀立場（平台頁），再講這個吉祥物替品牌講哪一句。'),
        block('section', '修正與作廢：以前講錯了甚麼。', 'correction'),
        block('section', '核心一句：吉祥物代表品牌的那一句話。', 'spine'),
        block('section', '邊界：可以出醜，不可以出錯。', 'boundaries'),
        block('section', '未決：還未定的問題。', 'open'),
        block('section', '角色資產：每個角色一筆，帶圖檔。', 'characters'),
      ],
    };
  },
  tokens() {
    return null;
  },
  tokensNote: '吉祥物冇可量化的設計 token；它進 prompt 的吉祥物段落，資產以圖檔引用。',
  prompt(payload) {
    const typed = payload as MascotPayload;
    const lines: string[] = [];

    if (typed.correction !== '') {
      lines.push(`修正與作廢：${typed.correction}`);
    }

    if (typed.spine !== '') {
      lines.push(`核心一句：${typed.spine}`);
    }

    if (typed.boundaries.length > 0) {
      lines.push(`邊界：${typed.boundaries.join('、')}`);
    }

    if (typed.open.length > 0) {
      lines.push(`未決：${typed.open.join('、')}`);
    }

    for (const character of typed.characters) {
      if (character.name === '') {
        continue;
      }

      const parts = [`角色「${character.name}」`];

      if (character.role !== '') {
        parts.push(`角色定位：${character.role}`);
      }

      if (character.description !== '') {
        parts.push(character.description);
      }

      if (character.file_ref !== '') {
        parts.push(`圖檔：${character.file_ref}`);
      }

      lines.push(parts.join('，'));
    }

    return [{ title: '吉祥物與角色', lines }];
  },
};

/* ── 影片頁（長片與短片共用工廠） ─────────────────────────────── */

/** 已核准影片範例：一支真片，連同格式與為甚麼好。 */
export type VideoExample = {
  id: string;
  title: string;
  file_ref: string;
  file_name?: string;
  format: string;
  why: string;
};

export type VideoPayload = {
  /** 影片立場：這一頁自己的一句。 */
  video_stance: string;
  duration: string;
  aspect: string;
  pacing: string;
  structure: { hook: string; body: string; cta: string };
  audio: string;
  captions: string;
  thumbnail: string;
  examples: VideoExample[];
  do: string[];
  dont: string[];
};

/**
 * 影片頁工廠：長片與短片共用同一套欄位，只有名稱與少量提示不同。
 *
 * 長片偏敘事／教育，短片偏前三秒鉤子／直屏 —— 差異在 hint，不在形狀。
 */
function makeVideoSchema(key: string, name: string, hints: { stance: string; duration: string; pacing: string }): PageSchema {
  return {
    key,
    name,
    slot: 'video',
    sections: [
      {
        id: 'stance',
        label: '影片立場',
        kind: 'fields',
        path: '',
        hint: hints.stance,
        fields: [{ path: 'video_stance', label: '影片立場', kind: 'long' }],
      },
      {
        id: 'spec',
        label: '規格',
        kind: 'fields',
        path: '',
        hint: hints.duration,
        fields: [
          { path: 'duration', label: '時長', kind: 'text' },
          { path: 'aspect', label: '畫幅', kind: 'text' },
          { path: 'pacing', label: '節奏', kind: 'long' },
        ],
      },
      {
        id: 'structure',
        label: '結構',
        kind: 'fields',
        path: 'structure',
        hint: '開頭、中段、結尾各做甚麼。三段都要寫，少一段就是冇結構。',
        fields: [
          { path: 'hook', label: '開頭鉤子', kind: 'long' },
          { path: 'body', label: '中段', kind: 'long' },
          { path: 'cta', label: '結尾行動', kind: 'long' },
        ],
      },
      {
        id: 'audio',
        label: '聲音與字幕',
        kind: 'fields',
        path: '',
        hint: '聲音、字幕。封面是資產，出現在實物層，不在這裡佔一行。',
        fields: [
          { path: 'audio', label: '聲音', kind: 'long' },
          { path: 'captions', label: '字幕', kind: 'long' },
        ],
      },
      {
        id: 'examples',
        label: '已核准範例',
        kind: 'records',
        path: 'examples',
        hint: '真片，連同格式與為甚麼好。冇片就標缺，不用示意圖假扮。',
        columns: [
          { path: 'title', label: '名稱', kind: 'text' },
          { path: 'format', label: '格式', kind: 'text' },
          { path: 'file_ref', label: '檔案', kind: 'text' },
          { path: 'why', label: '為甚麼好', kind: 'long' },
        ],
      },
      {
        id: 'do',
        label: '要',
        kind: 'list',
        path: 'do',
        hint: '每一條是「要做」的具體動作。',
      },
      {
        id: 'dont',
        label: '不要',
        kind: 'list',
        path: 'dont',
        hint: '每一條寫明為甚麼不要。',
      },
    ],
    empty() {
      return {
        video_stance: '',
        duration: '',
        aspect: '',
        pacing: '',
        structure: { hook: '', body: '', cta: '' },
        audio: '',
        captions: '',
        thumbnail: '',
        examples: [],
        do: [],
        dont: [],
      } satisfies VideoPayload;
    },
    normalize(raw) {
      const source = rec(raw);
      const structure = rec(source.structure);

      return {
        video_stance: str(source.video_stance),
        duration: str(source.duration),
        aspect: str(source.aspect),
        pacing: str(source.pacing),
        structure: { hook: str(structure.hook), body: str(structure.body), cta: str(structure.cta) },
        audio: str(source.audio),
        captions: str(source.captions),
        thumbnail: str(source.thumbnail),
        examples: list(source.examples).map((item): VideoExample => {
          const value = rec(item);
          return {
            id: str(value.id),
            title: str(value.title),
            file_ref: str(value.file_ref),
            ...(str(value.file_name) !== '' ? { file_name: str(value.file_name) } : {}),
            format: str(value.format),
            why: str(value.why),
          };
        }),
        do: strs(source.do),
        dont: strs(source.dont),
      } satisfies VideoPayload;
    },
    gaps(payload) {
      const typed = payload as VideoPayload;
      const gaps: BrandGapDraft[] = [];

      if (typed.video_stance.trim() === '') {
        gaps.push({
          item: `${key}.stance`,
          what: '影片立場一句',
          type: 'judgement',
          reason: '一句講這些影片在證明甚麼；冇它，規格只是規格。',
        });
      }

      if (typed.duration.trim() === '') {
        gaps.push({
          item: `${key}.duration`,
          what: '時長',
          type: 'judgement',
          reason: '冇時長就剪不出長度對的片。',
        });
      }

      if (typed.aspect.trim() === '') {
        gaps.push({
          item: `${key}.aspect`,
          what: '畫幅（直屏／橫屏）',
          type: 'judgement',
          reason: '直屏與橫屏的構圖完全不同，不講就會剪錯。',
        });
      }

      if (typed.examples.length === 0) {
        gaps.push({
          item: `${key}.examples`,
          what: '第一個已核准影片範例',
          type: 'file',
          reason: '冇真片，「做對的樣子」只存在於對話裡。',
        });
      }

      typed.examples.forEach((example, index) => {
        const at = index + 1;

        if (example.title.trim() === '') {
          gaps.push({
            item: `${key}.examples.${index}.title`,
            what: `第 ${at} 個影片範例的名稱`,
            type: 'judgement',
            reason: '冇名，日後引用不到這一支。',
          });
        }

        if (example.file_ref.trim() === '') {
          gaps.push({
            item: `${key}.examples.${index}.file_ref`,
            what: `第 ${at} 個影片範例的檔案`,
            type: 'file',
            reason: '冇檔案就只是一句形容；過兩年冇人知係邊一支。',
          });
        }
      });

      return gaps;
    },
    layout() {
      return {
        blocks: [
          block('stance', `先讀立場（平台頁），再講${name}的立場。`),
          block('section', '影片立場一句：這些片在證明甚麼。', 'stance'),
          block('section', '規格是剪片的起點：時長、畫幅、節奏。', 'spec'),
          block('section', '結構三段：鉤子、中段、行動。', 'structure'),
          block('section', '聲音、字幕、封面三樣都要寫。', 'audio'),
          block('section', '已核准範例：真片比形容詞有力。', 'examples'),
          block('section', '要：每一條是「要做」的具體動作。', 'do'),
          block('section', '不要與要並列，避免只講一半。', 'dont'),
        ],
      };
    },
    tokens() {
      return null;
    },
    tokensNote: `${name}冇設計 token；它進 prompt 的影片段落，範例以檔案引用。`,
    prompt(payload) {
      const typed = payload as VideoPayload;
      const lines: string[] = [];

      if (typed.video_stance !== '') {
        lines.push(`影片立場：${typed.video_stance}`);
      }

      const specPairs: [string, string][] = [
        ['時長', typed.duration],
        ['畫幅', typed.aspect],
        ['節奏', typed.pacing],
      ];

      lines.push(`規格：${specPairs.map(([label, value]) => `${label}＝${value === '' ? '缺' : value}`).join('；')}`);

      lines.push(
        `結構：鉤子＝${typed.structure.hook === '' ? '缺' : typed.structure.hook}；中段＝${typed.structure.body === '' ? '缺' : typed.structure.body}；行動＝${typed.structure.cta === '' ? '缺' : typed.structure.cta}`,
      );

      const audioPairs: [string, string][] = [
        ['聲音', typed.audio],
        ['字幕', typed.captions],
        ['封面', typed.thumbnail],
      ];

      lines.push(`聲音與字幕：${audioPairs.map(([label, value]) => `${label}＝${value === '' ? '缺' : value}`).join('；')}`);

      if (typed.examples.length === 0) {
        lines.push('已核准影片範例：缺');
      } else {
        for (const example of typed.examples) {
          if (example.title === '') {
            continue;
          }

          const parts = [`範例《${example.title}》`];

          if (example.format !== '') {
            parts.push(`（${example.format}）`);
          }

          if (example.why !== '') {
            parts.push(`為甚麼好：${example.why}`);
          }

          if (example.file_ref !== '') {
            parts.push(`檔案：${example.file_ref}`);
          }

          lines.push(parts.join(' '));
        }
      }

      if (typed.do.length > 0) {
        lines.push(`要：${typed.do.join('、')}`);
      }

      if (typed.dont.length > 0) {
        lines.push(`不要：${typed.dont.join('、')}`);
      }

      return [{ title: name, lines }];
    },
  };
}

const videoLong = makeVideoSchema('video-long', '長影片', {
  stance: '一句：長影片在證明甚麼。偏敘事與教育，不是短片的加長版。',
  duration: '時長、畫幅、節奏。長片可以慢慢講，但仍然要有節奏。',
  pacing: '長片偏敘事／教育；節奏要支持內容深度，不是短片的快剪。',
});

const videoShort = makeVideoSchema('video-short', '短影片', {
  stance: '一句：短影片在證明甚麼。偏前三秒鉤子與直屏，不是長片的縮短版。',
  duration: '時長、畫幅、節奏。短片靠前三秒，時長一錯就冇人睇完。',
  pacing: '短片偏前三秒鉤子／直屏；節奏要快，但仍然要有結構。',
});

/* ── 品牌主頁 ─────────────────────────────────────────────────── */

/**
 * 主頁的一個版面區塊（issue #67）。
 *
 * 主頁不是索引：它決定「用哪幾塊、先後如何、重點在哪」，而且要寫出理由。
 * 所以次序存在 payload 裡，不是寫死在程式的 `layout()` —— 寫死的話，每一間
 * 公司的品牌手冊都會是同一個模板。
 *
 * `emphasis` 只有 `lead`／`normal` 兩級：一個 layout 最多一個 `lead`，否則
 * 全部都是重點，等於沒有重點。
 */
export type HomeLayoutBlock = {
  block: BrandBlock['kind'];
  /** 這一塊的來源：schema 的 section id（`color_order`）或者頁 key（`tone`）。 */
  source: string;
  emphasis: 'lead' | 'normal';
  /** 為咩要有這一塊、為咩排在這個位置。空白理由＝這一塊不會出現（共通規則 8）。 */
  reason: string;
};

export type HomeDesignerNote = {
  /** 一句指示。不是規則：規則是各頁自己的事，這裡只講「怎樣排、要小心甚麼」。 */
  text: string;
  /** 寫的人（user id）。冇記錄就講唔到邊個寫，所以一定要存。 */
  author: string;
  created_at: string;
};

export type HomeCompiledRef = {
  /** 來源頁 key。 */
  page: string;
  /** 編這一版時，那一頁的現行版號。 */
  version: number;
};

export type HomePayload = {
  layout: HomeLayoutBlock[];
  /** 設計師指示。重編主頁時必須保留（這是人手寫的，不是算出來的）。 */
  designer_notes: HomeDesignerNote[];
  /** 這一版編的時候，每個來源頁的現行版號。用來判斷「要不要重編」。 */
  compiled_from: HomeCompiledRef[];
};

const home: PageSchema = {
  key: 'home',
  name: '品牌主頁',
  slot: 'home',
  sections: [
    {
      id: 'layout',
      label: '版面',
      kind: 'records',
      path: 'layout',
      hint: '每一塊用哪一種、由哪一頁來、重點在哪、為甚麼排這個位置。沒有理由的區塊不會出現。',
      columns: [
        { path: 'block', label: '區塊', kind: 'text' },
        { path: 'source', label: '來源', kind: 'text' },
        { path: 'emphasis', label: '重點', kind: 'text' },
        { path: 'reason', label: '為甚麼', kind: 'long' },
      ],
    },
    {
      id: 'designer_notes',
      label: '設計師指示',
      kind: 'records',
      path: 'designer_notes',
      hint: '人手寫的指示。重編主頁時原封不動留著。',
      columns: [{ path: 'text', label: '指示', kind: 'long' }],
    },
    {
      id: 'compiled_from',
      label: '編譯來源',
      kind: 'records',
      path: 'compiled_from',
      hint: '這一版是照哪幾頁的哪一版編出來的。版本一變就過時。',
      columns: [
        { path: 'page', label: '頁', kind: 'text' },
        { path: 'version', label: '版本', kind: 'text' },
      ],
    },
  ],
  empty() {
    return { layout: [], designer_notes: [], compiled_from: [] } satisfies HomePayload;
  },
  normalize(raw) {
    const source = rec(raw);

    return {
      // 舊形狀（`stance`、`who`、`keywords`…）一律忽略，不拋錯：那些版本仍然
      // 留在版本歷史裡，GET 照原樣回傳。這裡只讀主頁現在擁有的三樣。
      layout: list(source.layout).map((item) => {
        const value = rec(item);
        const kind = str(value.block);

        return {
          // 認不到的區塊種類退回 `section`：畫得出來，而理由仍然留著。
          block: (BRAND_BLOCK_KINDS as readonly string[]).includes(kind)
            ? (kind as BrandBlock['kind'])
            : 'section',
          source: str(value.source),
          emphasis: str(value.emphasis) === 'lead' ? 'lead' : 'normal',
          reason: str(value.reason),
        };
      }),
      designer_notes: list(source.designer_notes)
        .map((item) => {
          const value = rec(item);

          return { text: str(value.text), author: str(value.author), created_at: str(value.created_at) };
        })
        .filter((note) => note.text.trim() !== ''),
      compiled_from: list(source.compiled_from)
        .map((item) => {
          const value = rec(item);

          return { page: str(value.page), version: num(value.version) };
        })
        .filter((ref) => ref.page !== '' && ref.version >= 0),
    } satisfies HomePayload;
  },
  gaps(payload) {
    const typed = payload as HomePayload;
    const gaps: BrandGapDraft[] = [];

    // 主頁只計根本原因（brand-home-backend-functions.md §5 B4）：來源頁沒有
    // 現行版本（每頁一項，由 composePages 補）＋ 主頁沒有版面。立場句缺、
    // 關鍵詞缺那些屬於來源頁，主頁不重複計 —— 同一件事計兩次會令人以為
    // 有兩件事要做。
    if (typed.layout.filter((row) => row.reason.trim() !== '').length === 0) {
      gaps.push({
        item: 'layout',
        what: '版面次序與理由',
        type: 'judgement',
        reason: '沒有寫理由的版面就是模板；每一間公司的品牌手冊會一模一樣。',
      });
    }

    return gaps;
  },
  layout(payload) {
    const typed = payload as HomePayload;
    const authored = typed.layout.filter((row) => row.reason.trim() !== '');

    // 有人寫過版面：照它排。區塊本身的畫法仍然由 renderer 決定。
    if (authored.length > 0) {
      return {
        blocks: authored.map((row) => {
          const item: BrandBlock = {
            kind: row.block,
            reason: row.reason,
            emphasis: row.emphasis,
          };

          if (row.source !== '') {
            item.source = row.source;
          }

          return item;
        }),
      };
    }

    return {
      blocks: [
        block('stance', '第一屏是立場句，不是頁面索引（C112 明講）。', 'platform'),
        block('section', '用色順序是主頁最容易被記住的一段。', 'color'),
        block('section', '字體分工用兩個真樣本，不用字體名列表。', 'type'),
        block('section', '品牌專屬系統展示這個品牌獨有的東西。', 'custom'),
        block('section', '語氣用樣本，不用形容詞。', 'tone'),
        block('gaps', '主頁要看得見缺什麼，否則會以為品牌已經完成。'),
      ],
    };
  },
  tokens() {
    return null;
  },
  tokensNote: '主頁是彙整，不產生 token：它引用其他頁的現行版本（C112）。',
  prompt(payload) {
    const typed = payload as HomePayload;
    const authored = typed.layout.filter((row) => row.reason.trim() !== '');
    const lines: string[] = [];

    // 版面是主頁自己的判斷，所以要進 prompt：唔講次序，agent 會用回模板。
    if (authored.length > 0) {
      lines.push(
        `版面次序：${authored
          .map(
            (row, index) =>
              `${index + 1}. ${row.block}${row.source === '' ? '' : `（${row.source}）`}${row.emphasis === 'lead' ? '【重點】' : ''} —— ${row.reason}`,
          )
          .join('；')}`,
      );
    } else {
      lines.push('版面：缺');
    }

    for (const note of typed.designer_notes) {
      if (note.text.trim() !== '') {
        lines.push(`設計師指示：${note.text.trim()}`);
      }
    }

    return [{ title: '品牌主頁', lines }];
  },
};

/**
 * 主頁儲存前的檢查（B1）：一份 layout 最多一個 `lead`，每一塊都要有理由。
 *
 * 為咩不在 `gaps()` 裡做：缺口是「還未有甚麼」，這是「寫成這樣不行」。
 * 兩件事混在一起，畫面就會把一個已經寫了但寫錯的版面講成「未有版面」。
 */
export function homeLayoutIssues(payload: HomePayload): string[] {
  const issues: string[] = [];
  const leads = payload.layout.filter((row) => row.emphasis === 'lead');

  if (leads.length > 1) {
    issues.push(`重點只能有一塊，現在有 ${leads.length} 塊：${leads.map((row) => row.block).join('、')}。`);
  }

  const missing = payload.layout.filter((row) => row.reason.trim() === '');

  if (missing.length > 0) {
    issues.push(`每一塊都要寫理由，第 ${payload.layout.indexOf(missing[0] as HomeLayoutBlock) + 1} 塊沒有。`);
  }

  return issues;
}

/* ── 已核准範例（應用層） ─────────────────────────────────────── */

export type ExamplePayload = {
  examples: { title: string; format: string; file_ref: string; page_refs: { page: string; version: number }[]; why: string }[];
  prompts: { prompt: string; output_ref: string; brand_ref: string; note: string }[];
};

const examples: PageSchema = {
  key: 'examples',
  name: '已核准範例',
  slot: 'apply',
  sections: [
    {
      id: 'examples',
      label: '範例',
      kind: 'records',
      path: 'examples',
      hint: '做對的樣子，連同當時用的頁版本。',
      columns: [
        { path: 'title', label: '名稱', kind: 'text' },
        { path: 'format', label: '格式', kind: 'text' },
        { path: 'file_ref', label: '檔案', kind: 'text' },
        { path: 'why', label: '為咩好', kind: 'long' },
      ],
    },
    {
      id: 'prompts',
      label: '成功的 prompt',
      kind: 'records',
      path: 'prompts',
      hint: '成品、prompt、當時品牌版本三者一齊存，才可以重用。',
      columns: [
        { path: 'prompt', label: 'Prompt', kind: 'long' },
        { path: 'output_ref', label: '成品', kind: 'text' },
        { path: 'brand_ref', label: '品牌版本', kind: 'text' },
        { path: 'note', label: '備註', kind: 'text' },
      ],
    },
  ],
  empty() {
    return { examples: [], prompts: [] } satisfies ExamplePayload;
  },
  normalize(raw) {
    const source = rec(raw);

    return {
      examples: list(source.examples).map((item) => {
        const value = rec(item);
        return {
          title: str(value.title),
          format: str(value.format),
          file_ref: str(value.file_ref),
          page_refs: list(value.page_refs).map((ref) => {
            const entry = rec(ref);
            return { page: str(entry.page), version: num(entry.version) };
          }),
          why: str(value.why),
        };
      }),
      prompts: list(source.prompts).map((item) => {
        const value = rec(item);
        return {
          prompt: str(value.prompt),
          output_ref: str(value.output_ref),
          brand_ref: str(value.brand_ref),
          note: str(value.note),
        };
      }),
    } satisfies ExamplePayload;
  },
  gaps(payload) {
    const typed = payload as ExamplePayload;
    const gaps: BrandGapDraft[] = [];

    if (typed.examples.length === 0) {
      gaps.push({
        item: 'examples',
        what: '第一個已核准範例',
        type: 'file',
        reason: '沒有範例，「做對的樣子」只存在於對話裡。',
      });
    }

    // 逐個範例標缺，不是一句「有範例未齊」：每一格要做的動作不同（補檔、
    // 揀格式、寫一句為咩），合併成一句就等於叫人在迷霧裡猜。
    typed.examples.forEach((example, index) => {
      const at = index + 1;

      if (example.title.trim() === '') {
        gaps.push({
          item: `examples.${index}.title`,
          what: `第 ${at} 個範例的名稱`,
          type: 'judgement',
          reason: '冇名，日後引用不到這一個。',
        });
      }

      if (example.file_ref.trim() === '') {
        gaps.push({
          item: `examples.${index}.file_ref`,
          what: `第 ${at} 個範例的檔案`,
          type: 'file',
          reason: '冇檔案就只是一句形容；過兩年冇人知係邊一張。',
        });
      }

      if (example.format.trim() === '') {
        gaps.push({
          item: `examples.${index}.format`,
          what: `第 ${at} 個範例的格式`,
          type: 'judgement',
          reason: '社交與印刷 A2 的安全區、字階都不同，唔講格式就重用不到。',
        });
      }

      if (example.why.trim() === '') {
        gaps.push({
          item: `examples.${index}.why`,
          what: `第 ${at} 個範例「為咩好」`,
          type: 'judgement',
          reason: '唔講為咩好，下一次只會抄到表面，抄不到判斷。',
        });
      }

      if (example.page_refs.length === 0) {
        gaps.push({
          item: `examples.${index}.page_refs`,
          what: `第 ${at} 個範例用了哪幾頁版本`,
          type: 'judgement',
          reason: '唔記版本，品牌一改就分不清「做得對」還是「用舊版」。',
        });
      }
    });

    typed.prompts.forEach((row, index) => {
      const at = index + 1;

      if (row.prompt.trim() === '') {
        gaps.push({
          item: `prompts.${index}.prompt`,
          what: `第 ${at} 個成功 prompt 的內容`,
          type: 'judgement',
          reason: '冇 prompt 就重用不到；成品只可以看，不可以再做一次。',
        });
      }

      if (row.output_ref.trim() === '') {
        gaps.push({
          item: `prompts.${index}.output_ref`,
          what: `第 ${at} 個成功 prompt 的成品`,
          type: 'file',
          reason: '冇成品就唔知這個 prompt 真的做過甚麼。',
        });
      }

      if (row.brand_ref.trim() === '') {
        gaps.push({
          item: `prompts.${index}.brand_ref`,
          what: `第 ${at} 個成功 prompt 當時的品牌版本`,
          type: 'judgement',
          reason: '冇當時的版本，重用時唔知要對哪一版，也講不出差在哪。',
        });
      }
    });

    return gaps;
  },
  layout() {
    return {
      blocks: [
        block('gaps', '先講還缺幾個範例，再列已有的。'),
        block('section', '範例與它用的頁版本一起看，舊版要標出來。', 'examples'),
        block('section', '成功的 prompt 可以重用，但要連當時的版本一齊讀。', 'prompts'),
      ],
    };
  },
  tokens() {
    return null;
  },
  tokensNote: '範例是引用，不是 token 來源；它以 refs 進 prompt 包。',
  prompt(payload) {
    const typed = payload as ExamplePayload;
    const lines: string[] = [];

    // 引用，不是複製：寫出「用了哪一頁的哪一版」，agent 才知道要去讀哪一份。
    typed.examples.forEach((example) => {
      const used = example.page_refs.map((ref) => `${ref.page} v${ref.version}`).join('、');
      const parts = [
        `範例《${example.title === '' ? '未命名' : example.title}》${example.format === '' ? '' : `（${example.format}）`}`,
      ];

      if (example.why !== '') {
        parts.push(`為咩好：${example.why}`);
      }

      if (used !== '') {
        parts.push(`用了：${used}`);
      }

      if (example.file_ref !== '') {
        parts.push(`檔案：${example.file_ref}`);
      }

      lines.push(parts.join(' —— '));
    });

    typed.prompts.forEach((row) => {
      lines.push(
        `成功 prompt${row.brand_ref === '' ? '' : `（品牌版本 ${row.brand_ref}）`}：${row.prompt}${row.output_ref === '' ? '' : ` —— 成品：${row.output_ref}`}`,
      );
    });

    return lines.length === 0 ? [] : [{ title: '已核准範例', lines }];
  },
};

/* ── 自定義頁 ─────────────────────────────────────────────────── */

/** 自定義頁的資產檔：日後任何品牌內容都能開頁，資產跟頁走。 */
export type CustomAsset = {
  id: string;
  label: string;
  file_ref: string;
  file_name?: string;
  use: string;
};

export type CustomPayload = {
  decided: string;
  notDecided: string;
  rules: string[];
  examples: string[];
  badExamples: string[];
  colorRoles: string[];
  typeRoles: string[];
  /** 資產檔：上載的檔案，每一件帶名稱與用途。 */
  assets: CustomAsset[];
};

const custom: PageSchema = {
  key: 'custom',
  name: '自定義頁',
  slot: 'custom',
  sections: [
    {
      id: 'decided',
      label: '這一頁決定什麼',
      kind: 'fields',
      path: '',
      hint: '一句。brief 是起點，這一句是結論。',
      fields: [{ path: 'decided', label: '決定什麼', kind: 'long' }],
    },
    {
      id: 'notDecided',
      label: '不決定什麼',
      kind: 'fields',
      path: '',
      hint: '寫明邊界，這一頁才不會變成第二個色彩頁。',
      fields: [{ path: 'notDecided', label: '不決定什麼', kind: 'long' }],
    },
    { id: 'rules', label: '規則', kind: 'list', path: 'rules', hint: '每一條要可以被檢查。' },
    { id: 'examples', label: '做對的樣子', kind: 'list', path: 'examples' },
    { id: 'badExamples', label: '做錯的樣子', kind: 'list', path: 'badExamples' },
    {
      id: 'assets',
      label: '資產',
      kind: 'records',
      path: 'assets',
      hint: '上載的檔案，每一件帶名稱與用途。留空不算缺口。',
      columns: [
        { path: 'label', label: '名稱', kind: 'text' },
        { path: 'file_ref', label: '檔案', kind: 'text' },
        { path: 'use', label: '用途', kind: 'long' },
      ],
    },
    { id: 'refs', label: '引用', kind: 'fields', path: '', fields: [
      { path: 'colorRoles', label: '色彩角色', kind: 'list' },
      { path: 'typeRoles', label: '字體角色', kind: 'list' },
    ] },
  ],
  empty() {
    return {
      decided: '',
      notDecided: '',
      rules: [],
      examples: [],
      badExamples: [],
      colorRoles: [],
      typeRoles: [],
      assets: [],
    } satisfies CustomPayload;
  },
  normalize(raw) {
    const source = rec(raw);

    return {
      decided: str(source.decided),
      notDecided: str(source.notDecided),
      rules: strs(source.rules),
      examples: strs(source.examples),
      badExamples: strs(source.badExamples),
      colorRoles: strs(source.colorRoles),
      typeRoles: strs(source.typeRoles),
      assets: list(source.assets).map((item): CustomAsset => {
        const value = rec(item);
        return {
          id: str(value.id),
          label: str(value.label),
          file_ref: str(value.file_ref),
          ...(str(value.file_name) !== '' ? { file_name: str(value.file_name) } : {}),
          use: str(value.use),
        };
      }),
    } satisfies CustomPayload;
  },
  gaps(payload) {
    const typed = payload as CustomPayload;
    const gaps: BrandGapDraft[] = [];

    if (typed.decided.trim() === '') {
      gaps.push({
        item: 'decided',
        what: '這一頁決定什麼',
        type: 'judgement',
        reason: '自定義頁沒有這一句，就沒有邊界，日後一定與其他頁重疊。',
      });
    }

    if (typed.rules.length === 0) {
      gaps.push({ item: 'rules', what: '可檢查的規則', type: 'judgement', reason: '沒有規則的一頁只是文章。' });
    }

    return gaps;
  },
  layout() {
    return {
      blocks: [
        block('section', '先講這一頁決定什麼，再講不決定什麼。', 'decided'),
        block('section', '不決定什麼：寫明邊界，唔好任人延伸。', 'notDecided'),
        block('section', '規則是可以照做的那一部分。', 'rules'),
        block('section', '做對的樣子：可以照抄的一邊。', 'examples'),
        block('section', '做錯的樣子與做對的並列，避免只講一半。', 'badExamples'),
        block('section', '資產：這一頁要用的實物檔。', 'assets'),
        block('section', '引用哪一頁的哪些角色；引用處講，唔在這裡複製。', 'refs'),
      ],
    };
  },
  tokens() {
    return null;
  },
  tokensNote: '自定義頁的內容進 prompt；token 要由它引用的色彩／字體頁提供。',
  prompt(payload) {
    const typed = payload as CustomPayload;
    const lines: string[] = [];

    if (typed.decided !== '') {
      lines.push(`決定：${typed.decided}`);
    }

    if (typed.notDecided !== '') {
      lines.push(`不決定：${typed.notDecided}`);
    }

    for (const rule of typed.rules) {
      lines.push(`規則：${rule}`);
    }

    if (typed.colorRoles.length > 0) {
      lines.push(`引用色彩角色：${typed.colorRoles.join('、')}`);
    }

    for (const asset of typed.assets) {
      if (asset.label === '' && asset.file_ref === '') {
        continue;
      }

      lines.push(`資產：${asset.label === '' ? '未命名' : asset.label}${asset.use === '' ? '' : `（${asset.use}）`}`);
    }

    return [{ title: '自定義頁', lines }];
  },
};

/**
 * 舊版（#35–#39）留下的自由文字。
 *
 * 每一個 schema 都有這一段，但它**不在任何預設 layout** 之內：新版本永遠
 * 不會用到它。只有讀到舊格式的版本時，文件才會引用這一段，把原文原樣顯示
 * 出來。這樣舊版仍然讀得返，而沒有被讀到的時候，它不佔任何畫面。
 */
const LEGACY_SECTION: Section = {
  id: 'legacy',
  label: '舊版內容',
  kind: 'fields',
  path: '',
  hint: '第一版留下的一段自由文字。下一次編輯會把它改寫成結構化欄位。',
  fields: [{ path: 'legacy_text', label: '內容', kind: 'long' }],
};

export const PAGE_SCHEMAS: Record<string, PageSchema> = {
  platform,
  color,
  type,
  logo,
  tone,
  image,
  mascot,
  home,
  examples,
  'video-long': videoLong,
  'video-short': videoShort,
  custom,
};

/** 頁鍵 → schema。自定義頁的鍵是 slug，一律用 `custom`。 */
export function schemaForPage(pageKey: string, kind: 'fixed' | 'custom'): PageSchema {
  const base = kind === 'custom' ? custom : (PAGE_SCHEMAS[pageKey] ?? custom);

  return base.sections.some((section) => section.id === 'legacy')
    ? base
    : { ...base, sections: [...base.sections, LEGACY_SECTION] };
}

export const PAGE_KEYS_ORDERED = ['home', 'platform', 'color', 'type', 'logo', 'tone', 'image', 'mascot', 'examples', 'video-long', 'video-short'];
