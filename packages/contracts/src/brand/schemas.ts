import type {
  BrandBlock,
  BrandGapDraft,
  BrandLayout,
  BrandPayload,
  BrandSlot,
} from './document.ts';
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
    {
      id: 'audience',
      label: '受眾',
      kind: 'fields',
      path: '',
      fields: [
        { path: 'audience', label: '寫給誰看', kind: 'long' },
        { path: 'essence', label: '一句本質', kind: 'text' },
        { path: 'purpose', label: '為咩存在', kind: 'long' },
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
      id: 'references',
      label: '參考',
      kind: 'list',
      path: 'references',
      hint: '參考不是模仿：寫明參考它哪一點。',
    },
  ],
  empty() {
    return {
      stance: '',
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

    // 三個候選由 agent 讀完品牌資料後提出（#61）。少過三個就是缺一個交付：
    // 檔案型，不是判斷型 —— agent 交得，老闆只需要揀。
    if (typed.stance_candidates.filter((candidate) => candidate.text !== '').length < 3) {
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
        block('section', '定位六格是立場的拆解，讀的人要在同一屏內對得上立場句。', 'positioning'),
        block(
          'section',
          '價值要寫「不做什麼」才有約束力；放在定位之後，因為取捨是定位的結果。',
          'values',
        ),
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

    if (typed.stance !== '') {
      lines.push(`立場：${typed.stance}`);
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
  stance: string;
  roles: ColorRole[];
  order: { text: string; reason: string };
  ratios: { role: string; percent: number; reason: string }[];
  contrast_floor: number;
  large_floor: number;
  pairs: { allowed: { fg: string; bg: string; use: 'body' | 'large'; reason: string }[]; forbidden: { fg: string; bg: string; reason: string }[] };
  tints: { name: string; hex: string; reason: string }[];
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
    { id: 'stance', label: '立場', kind: 'stance', path: 'stance', hint: '沿用平台頁那句，不在這裡另寫。' },
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
        { path: 'name', label: '叫法', kind: 'text' },
        { path: 'hex', label: 'HEX', kind: 'hex' },
        { path: 'reason', label: '用在哪', kind: 'long' },
      ],
    },
  ],
  empty() {
    return {
      stance: '',
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
      stance: str(source.stance),
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
        return { name: str(value.name), hex: str(value.hex), reason: str(value.reason) };
      }),
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

    return gaps;
  },
  layout() {
    return {
      blocks: [
        block('stance', '先講立場，色彩是立場的證據，不是反過來。'),
        block('section', '角色表是這一頁的主體：其他頁只引用這裡的名字。', 'roles'),
        block('section', '用色順序講先後，撞色時才知道犧牲哪一個。', 'order'),
        block('section', '比例讓「大致上用這個色」變成可檢查的數。', 'ratios'),
        block('section', '配對與對比是可量化的部分，放在最後當驗收。', 'pairs'),
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

    lines.push(`對比下限：內文 ${typed.contrast_floor}:1，大字 ${typed.large_floor}:1`);

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

export type TypePayload = {
  stance: string;
  philosophy: string;
  families: {
    id: string;
    name: string;
    script: string;
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
  }[];
  roles: {
    role: string;
    family: string;
    weight: string;
    size: string;
    leading: string;
    /** 最小尺寸（px）。0 ＝未寫，`type.r2` 就是不通過。 */
    min: number;
    measure: string;
    /** 文字顏色只可以引用色彩頁的角色名，不可以在這裡發明色。 */
    color_role: string;
    reason: string;
  }[];
  pairing: string;
  sentence_anatomy: string;
  print_matrix: { item: string; spec: string }[];
  mixed_setting: string;
  misuse: { example: string; reason: string }[];
};

const type: PageSchema = {
  key: 'type',
  name: '字體',
  slot: 'type',
  sections: [
    { id: 'stance', label: '立場', kind: 'stance', path: 'stance' },
    {
      id: 'philosophy',
      label: '取態',
      kind: 'fields',
      path: '',
      hint: '一句：字體在這間公司負責講甚麼。',
      fields: [{ path: 'philosophy', label: '字體取態', kind: 'long' }],
    },
    {
      id: 'families',
      label: '家族與授權',
      kind: 'type-families',
      path: 'families',
      hint: '最多兩個家族。沒有可嵌入檔或授權，就標缺，不用系統字充當。',
      columns: [
        { path: 'name', label: '家族', kind: 'text' },
        { path: 'script', label: '字種', kind: 'text' },
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
      hint: '每一級都要有最小尺寸；沒有最小尺寸的字階等於沒有字階。',
      columns: [
        { path: 'role', label: '角色', kind: 'text' },
        { path: 'family', label: '家族', kind: 'text' },
        { path: 'weight', label: '字重', kind: 'text' },
        { path: 'size', label: '字級', kind: 'text' },
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
      stance: '',
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

    return {
      stance: str(source.stance),
      philosophy: str(source.philosophy),
      families: list(source.families).map((item) => {
        const value = rec(item);
        return {
          id: str(value.id),
          name: str(value.name),
          script: str(value.script),
          license_web: str(value.license_web),
          license_print: str(value.license_print),
          license_app: str(value.license_app),
          license_desktop: str(value.license_desktop),
          file_ref: str(value.file_ref),
        };
      }),
      roles: list(source.roles).map((item) => {
        const value = rec(item);
        return {
          role: str(value.role),
          family: str(value.family),
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

    for (const family of typed.families) {
      if (family.name === '') {
        continue;
      }

      if (family.file_ref.trim() === '') {
        gaps.push({
          item: `families.${family.name}`,
          what: `${family.name} 的可嵌入字體檔`,
          type: 'file',
          ruleId: 'type.r3',
          reason: '沒有可嵌入檔就畫不出真樣本；用系統字頂住會令人以為字體已經定了。',
        });
      }

      if (family.license_web.trim() === '' || family.license_print.trim() === '') {
        gaps.push({
          item: `families.${family.name}.license`,
          what: `${family.name} 的網頁或印刷授權`,
          type: 'file',
          ruleId: 'type.r3',
          reason: '授權文件是採購或法務交付的檔案，不是設計判斷。',
        });
      }
    }

    return gaps;
  },
  layout() {
    return {
      blocks: [
        block('stance', '字體是立場的聲音，先講立場再看樣本。'),
        block('section', '家族與授權要先確立：沒有授權的字體，樣本再美也不能用。', 'families'),
        block('section', '字階與分工是實際會被套用的部分，放在樣本之前。', 'roles'),
        block('section', '一句話的結構展示兩個家族如何接力。', 'pairing'),
      ],
    };
  },
  tokens(payload) {
    const typed = payload as TypePayload;
    const entries: Record<string, TokenValue> = {};

    for (const role of typed.roles) {
      if (role.role === '' || role.family === '') {
        continue;
      }

      entries[role.role] = {
        $type: 'typography',
        $value: {
          fontFamily: role.family,
          fontWeight: role.weight === '' ? 400 : role.weight,
          fontSize: role.size === '' ? '16px' : role.size,
          lineHeight: role.leading === '' ? '1.5' : role.leading,
        },
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

    if (typed.families.length > 0) {
      lines.push(
        `家族：${typed.families
          .filter((family) => family.name !== '')
          .map((family) => `${family.name}（網頁授權 ${family.license_web === '' ? '缺' : family.license_web}、印刷授權 ${family.license_print === '' ? '缺' : family.license_print}）`)
          .join('、')}`,
      );
    }

    for (const role of typed.roles) {
      if (role.role !== '') {
        lines.push(
          `字階 ${role.role}：${role.family} ${role.weight} ${role.size}/${role.leading}，最小 ${role.min === 0 ? '缺' : `${role.min}px`}`,
        );
      }
    }

    if (typed.mixed_setting !== '') {
      lines.push(`中英混排：${typed.mixed_setting}`);
    }

    return [{ title: '字體', lines }];
  },
};

/* ── 標誌頁 ───────────────────────────────────────────────────── */

export type LogoPayload = {
  stance: string;
  logic_line: string;
  assets: { class: string; label: string; file_ref: string; version: string }[];
  lockups: { id: string; use: string; min: string }[];
  construction: string;
  clear_space_x: { x: string; multiples: string; note: string };
  min_size: { screen_px: number; print_mm: number };
  modes: { mode: string; color_role: string; note: string }[];
  backgrounds: string;
  misuse: { example: string; reason: string }[];
  master_vector: string;
};

const logo: PageSchema = {
  key: 'logo',
  name: '標誌',
  slot: 'logo',
  sections: [
    { id: 'stance', label: '立場', kind: 'stance', path: 'stance' },
    {
      id: 'logic',
      label: '標誌邏輯',
      kind: 'fields',
      path: '',
      hint: '一句：這個標誌在講甚麼。不是描述外形，是講它代表誰。',
      fields: [
        { path: 'logic_line', label: '標誌邏輯', kind: 'long' },
        { path: 'master_vector', label: '向量主檔', kind: 'text' },
      ],
    },
    {
      id: 'assets',
      label: '檔案',
      kind: 'logo-assets',
      path: 'assets',
      hint: '缺 SVG 就標缺，不畫假標誌。',
      columns: [
        { path: 'class', label: '種類', kind: 'text' },
        { path: 'label', label: '名稱', kind: 'text' },
        { path: 'file_ref', label: '檔案', kind: 'text' },
        { path: 'version', label: '版本', kind: 'text' },
      ],
    },
    {
      id: 'lockups',
      label: '組合',
      kind: 'records',
      path: 'lockups',
      hint: '主標誌、橫式、直式、印章式：每一種寫明用在哪。',
      columns: [
        { path: 'id', label: '組合', kind: 'text' },
        { path: 'use', label: '用在哪', kind: 'long' },
        { path: 'min', label: '最小', kind: 'text' },
      ],
    },
    {
      id: 'space',
      label: '淨空間與最小尺寸',
      kind: 'fields',
      path: '',
      hint: '淨空間以 x 定義；螢幕與印刷分開寫，因為兩者不是同一個數。',
      fields: [
        { path: 'clear_space_x.x', label: 'x 指甚麼', kind: 'text' },
        { path: 'clear_space_x.multiples', label: '淨空間倍數', kind: 'text' },
        { path: 'min_size.screen_px', label: '螢幕最小 px', kind: 'number' },
        { path: 'min_size.print_mm', label: '印刷最小 mm', kind: 'number' },
        { path: 'construction', label: '構成說明', kind: 'long' },
      ],
    },
    {
      id: 'modes',
      label: '顏色模式',
      kind: 'logo-modes',
      path: 'modes',
      hint: '四種模式，每個引用一個存在的色彩角色。功能色不可用於標誌。',
      columns: [
        { path: 'mode', label: '模式', kind: 'text' },
        { path: 'color_role', label: '角色', kind: 'text' },
        { path: 'note', label: '用在哪', kind: 'long' },
      ],
    },
    {
      id: 'misuse',
      label: '不可以這樣用',
      kind: 'records',
      path: 'misuse',
      hint: '每一條要寫為咩。',
      columns: [
        { path: 'example', label: '例子', kind: 'text' },
        { path: 'reason', label: '為咩不可以', kind: 'long' },
      ],
    },
    { id: 'backgrounds', label: '背景', kind: 'fields', path: '', fields: [{ path: 'backgrounds', label: '可用背景', kind: 'long' }] },
  ],
  empty() {
    return {
      stance: '',
      logic_line: '',
      assets: [],
      lockups: [],
      construction: '',
      clear_space_x: { x: '', multiples: '', note: '' },
      min_size: { screen_px: 0, print_mm: 0 },
      modes: [],
      backgrounds: '',
      misuse: [],
      master_vector: '',
    } satisfies LogoPayload;
  },
  normalize(raw) {
    const source = rec(raw);
    const space = rec(source.clear_space_x);
    const minSize = rec(source.min_size);

    return {
      stance: str(source.stance),
      logic_line: str(source.logic_line),
      assets: list(source.assets).map((item) => {
        const value = rec(item);
        return {
          class: str(value.class),
          label: str(value.label),
          file_ref: str(value.file_ref),
          version: str(value.version),
        };
      }),
      lockups: list(source.lockups).map((item) => {
        const value = rec(item);
        return { id: str(value.id), use: str(value.use), min: str(value.min) };
      }),
      construction: str(source.construction),
      clear_space_x: { x: str(space.x), multiples: str(space.multiples), note: str(space.note) },
      min_size: { screen_px: num(minSize.screen_px), print_mm: num(minSize.print_mm) },
      modes: list(source.modes).map((item) => {
        const value = rec(item);
        return { mode: str(value.mode), color_role: str(value.color_role), note: str(value.note) };
      }),
      backgrounds: str(source.backgrounds),
      misuse: list(source.misuse).map((item) => {
        const value = rec(item);
        return { example: str(value.example), reason: str(value.reason) };
      }),
      master_vector: str(source.master_vector),
    } satisfies LogoPayload;
  },
  gaps(payload) {
    const typed = payload as LogoPayload;
    const gaps: BrandGapDraft[] = [];

    if (!typed.assets.some((asset) => asset.file_ref.trim() !== '')) {
      gaps.push({
        item: 'assets.primary',
        what: '主標誌向量檔（SVG）',
        type: 'file',
        ruleId: 'logo.r1',
        reason: '向量檔是交付物，不是判斷；沒有檔就畫不出真標誌。',
      });
    }

    for (const asset of typed.assets) {
      if (asset.label !== '' && asset.file_ref.trim() === '') {
        gaps.push({
          item: `assets.${asset.label}`,
          what: `${asset.label} 的檔案`,
          type: 'file',
          reason: '登記了這一種標誌但沒有檔，等於沒有這一種。',
        });
      }
    }

    if (typed.clear_space_x.multiples.trim() === '') {
      gaps.push({
        item: 'clear_space_x',
        what: '淨空間倍數',
        type: 'judgement',
        ruleId: 'logo.r1',
        reason: '「留足夠空間」不是規格；倍數是品牌設計師的決定。',
      });
    }

    return gaps;
  },
  layout() {
    return {
      blocks: [
        block('stance', '標誌是立場的印章，先講立場。'),
        block('section', '檔案先確認存在，否則整頁都是空談。', 'assets'),
        block('section', '顏色模式引用色彩角色，講明哪一個模式用在哪。', 'modes'),
        block('section', '淨空間與最小尺寸是可量化的部分。', 'space'),
        block('section', '組合與不可以用法，讓外判不必猜。', 'lockups'),
      ],
    };
  },
  tokens(payload) {
    const typed = payload as LogoPayload;
    const entries: Record<string, TokenValue> = {};

    if (typed.min_size.screen_px > 0) {
      entries['logo.minScreen'] = { $type: 'dimension', $value: `${typed.min_size.screen_px}px` };
    }

    if (typed.min_size.print_mm > 0) {
      entries['logo.minPrint'] = { $type: 'dimension', $value: `${typed.min_size.print_mm}mm` };
    }

    if (typed.clear_space_x.multiples.trim() !== '') {
      entries['logo.clearSpace'] = {
        $type: 'dimension',
        $value: typed.clear_space_x.multiples,
        ...(typed.clear_space_x.x === '' ? {} : { $description: `x ＝ ${typed.clear_space_x.x}` }),
      };
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

    if (typed.logic_line !== '') {
      lines.push(`標誌邏輯：${typed.logic_line}`);
    }

    if (typed.min_size.screen_px > 0 || typed.min_size.print_mm > 0) {
      lines.push(
        `最小尺寸：螢幕 ${typed.min_size.screen_px > 0 ? `${typed.min_size.screen_px}px` : '缺'}、印刷 ${typed.min_size.print_mm > 0 ? `${typed.min_size.print_mm}mm` : '缺'}`,
      );
    }

    if (typed.clear_space_x.multiples !== '') {
      lines.push(
        `淨空間：${typed.clear_space_x.multiples}${typed.clear_space_x.x === '' ? '（x 未定義）' : `，x ＝ ${typed.clear_space_x.x}`}`,
      );
    }

    if (typed.modes.length > 0) {
      lines.push(
        `顏色模式：${typed.modes
          .filter((mode) => mode.mode !== '')
          .map((mode) => `${mode.mode}=${mode.color_role === '' ? '缺' : mode.color_role}`)
          .join('、')}`,
      );
    }

    return [{ title: '標誌', lines }];
  },
};

/* ── 語氣頁 ───────────────────────────────────────────────────── */

export type TonePayload = {
  stance: string;
  traits: { name: string; do: string; dont: string; sentence: string }[];
  banned: { term: string; reason: string }[];
  language_policy: string;
  contexts: { explain: string; invite: string; decline: string; apologize: string; incident: string };
  samples: { like: string[]; unlike: string[] };
  hardest_line: { wrong: string; right: string };
};

const tone: PageSchema = {
  key: 'tone',
  name: '語氣',
  slot: 'tone',
  sections: [
    { id: 'stance', label: '立場', kind: 'stance', path: 'stance' },
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
        { path: 'explain', label: '解釋', kind: 'long' },
        { path: 'invite', label: '邀請', kind: 'long' },
        { path: 'decline', label: '拒絕', kind: 'long' },
        { path: 'apologize', label: '道歉', kind: 'long' },
        { path: 'incident', label: '事故', kind: 'long' },
      ],
    },
    {
      id: 'hardest',
      label: '最難的一句',
      kind: 'fields',
      path: 'hardest_line',
      hint: '拒絕客人而又不失禮的一句。',
      fields: [
        { path: 'wrong', label: '錯的寫法', kind: 'long' },
        { path: 'right', label: '對的寫法', kind: 'long' },
      ],
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
      stance: '',
      traits: [],
      banned: [],
      language_policy: '',
      contexts: { explain: '', invite: '', decline: '', apologize: '', incident: '' },
      samples: { like: [], unlike: [] },
      hardest_line: { wrong: '', right: '' },
    } satisfies TonePayload;
  },
  normalize(raw) {
    const source = rec(raw);
    const contexts = rec(source.contexts);
    const samples = rec(source.samples);
    const hardest = rec(source.hardest_line);

    return {
      stance: str(source.stance),
      traits: list(source.traits).map((item) => {
        const value = rec(item);
        return { name: str(value.name), do: str(value.do), dont: str(value.dont), sentence: str(value.sentence) };
      }),
      banned: list(source.banned).map((item) => {
        const value = rec(item);
        return { term: str(value.term), reason: str(value.reason) };
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
      hardest_line: { wrong: str(hardest.wrong), right: str(hardest.right) },
    } satisfies TonePayload;
  },
  gaps(payload) {
    const typed = payload as TonePayload;
    const gaps: BrandGapDraft[] = [];

    for (const trait of typed.traits) {
      if (trait.name === '') {
        continue;
      }

      if (trait.sentence.trim() === '') {
        gaps.push({
          item: `traits.${trait.name}`,
          what: `「${trait.name}」的一句示範`,
          type: 'judgement',
          ruleId: 'voice.r1',
          reason: '只有形容詞的語氣不能交給 agent；示範句要由品牌自己寫。',
        });
      }
    }

    if (typed.traits.length > 0 && typed.samples.like.length === 0) {
      gaps.push({
        item: 'samples.like',
        what: '語氣樣本（像的）',
        type: 'judgement',
        reason: '沒有樣本，agent 只會copy形容詞。',
      });
    }

    return gaps;
  },
  layout() {
    return {
      blocks: [
        block('stance', '語氣是立場的說法；先講立場，再講怎樣講。'),
        block('section', '特質連示範句，才是可以照寫的規則。', 'traits'),
        block('section', '樣本比形容詞有用：五句像、五句不像。', 'samples'),
        block('section', '禁用詞逐個有原因。', 'banned'),
        block('section', '五個情境展示同一把聲。', 'contexts'),
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

    for (const trait of typed.traits) {
      if (trait.name !== '') {
        lines.push(`語氣「${trait.name}」：會「${trait.do}」，不會「${trait.dont}」，示範：${trait.sentence}`);
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

    if (typed.samples.like.length > 0) {
      lines.push(`樣本（像）：${typed.samples.like.join('／')}`);
    }

    if (typed.samples.unlike.length > 0) {
      lines.push(`樣本（不像）：${typed.samples.unlike.join('／')}`);
    }

    return [{ title: '語氣', lines }];
  },
};

/* ── 圖像頁 ───────────────────────────────────────────────────── */

export type ImagePayload = {
  stance: string;
  photo: { subject: string; composition: string; light: string; tone: string; space: string; props: string };
  illustration: string;
  color_link: string[];
  like: string[];
  unlike: string[];
  approved_examples: { label: string; file_ref: string; use: string }[];
  rights: string;
  banned: { term: string; reason: string }[];
};

const image: PageSchema = {
  key: 'image',
  name: '圖像',
  slot: 'image',
  sections: [
    { id: 'stance', label: '立場', kind: 'stance', path: 'stance' },
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
        { path: 'tone', label: '調子', kind: 'long' },
        { path: 'space', label: '留白', kind: 'long' },
        { path: 'props', label: '道具', kind: 'long' },
      ],
    },
    {
      id: 'examples',
      label: '已核准範例',
      kind: 'records',
      path: 'approved_examples',
      hint: '沒有真實範例就標缺，不用圖庫圖假扮。',
      columns: [
        { path: 'label', label: '名稱', kind: 'text' },
        { path: 'file_ref', label: '檔案', kind: 'text' },
        { path: 'use', label: '用在哪', kind: 'text' },
      ],
    },
    {
      id: 'like',
      label: '要的樣子',
      kind: 'list',
      path: 'like',
      hint: '每一句講一個可觀察的特徵。',
    },
    {
      id: 'unlike',
      label: '不要的樣子',
      kind: 'list',
      path: 'unlike',
      hint: '講明為咩不要，不只是「不好看」。',
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
        { path: 'illustration', label: '插畫（如有）', kind: 'long' },
        { path: 'rights', label: '授權與使用權', kind: 'long' },
      ],
    },
  ],
  empty() {
    return {
      stance: '',
      photo: { subject: '', composition: '', light: '', tone: '', space: '', props: '' },
      illustration: '',
      color_link: [],
      like: [],
      unlike: [],
      approved_examples: [],
      rights: '',
      banned: [],
    } satisfies ImagePayload;
  },
  normalize(raw) {
    const source = rec(raw);
    const photo = rec(source.photo);

    return {
      stance: str(source.stance),
      photo: {
        subject: str(photo.subject),
        composition: str(photo.composition),
        light: str(photo.light),
        tone: str(photo.tone),
        space: str(photo.space),
        props: str(photo.props),
      },
      illustration: str(source.illustration),
      color_link: strs(source.color_link),
      like: strs(source.like),
      unlike: strs(source.unlike),
      approved_examples: list(source.approved_examples).map((item) => {
        const value = rec(item);
        return { label: str(value.label), file_ref: str(value.file_ref), use: str(value.use) };
      }),
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

    if (typed.photo.subject.trim() === '') {
      gaps.push({
        item: 'photo.subject',
        what: '攝影題材',
        type: 'judgement',
        reason: '拍甚麼是品牌判斷，不是外判可以代決定。',
      });
    }

    if (!typed.approved_examples.some((example) => example.file_ref.trim() !== '')) {
      gaps.push({
        item: 'approved_examples',
        what: '已核准的真實照片',
        type: 'file',
        reason: '沒有真範例，外判只會交圖庫圖；那是另一間公司的樣子。',
      });
    }

    return gaps;
  },
  layout() {
    return {
      blocks: [
        block('stance', '先講立場：照片是證明，不是裝飾。'),
        block('section', '攝影六格是外判唯一可以照做的部分。', 'photo'),
        block('section', '真範例比形容詞有力，放在規格之後。', 'examples'),
        block('section', '要與不要並列，避免只講一半。', 'like'),
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
    const pairs = [
      ['題材', photo.subject],
      ['構圖', photo.composition],
      ['光線', photo.light],
      ['調子', photo.tone],
      ['留白', photo.space],
      ['道具', photo.props],
    ].filter((entry) => entry[1] !== '');

    if (pairs.length > 0) {
      lines.push(`攝影：${pairs.map((entry) => `${entry[0]}＝${entry[1]}`).join('；')}`);
    }

    if (typed.like.length > 0) {
      lines.push(`要：${typed.like.join('、')}`);
    }

    if (typed.unlike.length > 0) {
      lines.push(`不要：${typed.unlike.join('、')}`);
    }

    if (typed.color_link.length > 0) {
      lines.push(`引用色彩角色：${typed.color_link.join('、')}`);
    }

    return [{ title: '圖像', lines }];
  },
};

/* ── 品牌主頁 ─────────────────────────────────────────────────── */

export type HomePayload = {
  stance: string;
  who: string;
  keywords: string[];
  color_order: { roles: string[]; note: string };
  logo_default: string;
  type_split: { serif: string; sans: string; note: string };
  voice_samples: string[];
  systems: { name: string; note: string; refs: string[] }[];
};

const home: PageSchema = {
  key: 'home',
  name: '品牌主頁',
  slot: 'home',
  sections: [
    { id: 'stance', label: '立場', kind: 'stance', path: 'stance' },
    {
      id: 'who',
      label: '是誰',
      kind: 'fields',
      path: '',
      fields: [
        { path: 'who', label: '一句話說自己是誰', kind: 'text' },
        { path: 'keywords', label: '關鍵詞', kind: 'list' },
      ],
      hint: '三到五個關鍵詞。關鍵詞來自平台頁，不另創新詞。',
    },
    {
      id: 'color_order',
      label: '用色順序',
      kind: 'tags',
      path: 'color_order.roles',
      hint: '只寫角色名，色值住在色彩頁。',
    },
    {
      id: 'type_split',
      label: '字體分工',
      kind: 'fields',
      path: 'type_split',
      hint: '只寫家族名；字階住在字體頁。',
      fields: [
        { path: 'serif', label: 'Serif 負責', kind: 'text' },
        { path: 'sans', label: 'Sans 負責', kind: 'text' },
        { path: 'note', label: '為咩這樣分', kind: 'long' },
      ],
    },
    {
      id: 'systems',
      label: '品牌專屬系統',
      kind: 'records',
      path: 'systems',
      hint: '自定義頁的精華。不放內容副本，只放入口。',
      columns: [
        { path: 'name', label: '系統', kind: 'text' },
        { path: 'note', label: '一句', kind: 'long' },
      ],
    },
    {
      id: 'voice_samples',
      label: '語氣',
      kind: 'quotes',
      path: 'voice_samples',
      hint: '引用語氣頁的樣本，不在這裡另寫。',
    },
  ],
  empty() {
    return {
      stance: '',
      who: '',
      keywords: [],
      color_order: { roles: [], note: '' },
      logo_default: '',
      type_split: { serif: '', sans: '', note: '' },
      voice_samples: [],
      systems: [],
    } satisfies HomePayload;
  },
  normalize(raw) {
    const source = rec(raw);
    const colorOrder = rec(source.color_order);
    const typeSplit = rec(source.type_split);

    return {
      stance: str(source.stance),
      who: str(source.who),
      keywords: strs(source.keywords),
      color_order: { roles: strs(colorOrder.roles), note: str(colorOrder.note) },
      logo_default: str(source.logo_default),
      type_split: { serif: str(typeSplit.serif), sans: str(typeSplit.sans), note: str(typeSplit.note) },
      voice_samples: strs(source.voice_samples),
      systems: list(source.systems).map((item) => {
        const value = rec(item);
        return { name: str(value.name), note: str(value.note), refs: strs(value.refs) };
      }),
    } satisfies HomePayload;
  },
  gaps(payload) {
    const typed = payload as HomePayload;
    const gaps: BrandGapDraft[] = [];

    if (typed.stance.trim() === '') {
      gaps.push({
        item: 'stance',
        what: '立場句',
        type: 'judgement',
        reason: '主頁第一屏一定要是立場；平台頁未定，主頁就缺。',
      });
    }

    if (typed.keywords.length === 0) {
      gaps.push({ item: 'keywords', what: '品牌關鍵詞', type: 'judgement', reason: '沒有關鍵詞的主頁只是一份目錄。' });
    }

    return gaps;
  },
  layout() {
    return {
      blocks: [
        block('stance', '第一屏是立場句，不是頁面索引（C112 明講）。'),
        block('section', '用色順序是主頁最容易被記住的一段。', 'color_order'),
        block('section', '字體分工用兩個真樣本，不用字體名列表。', 'type_split'),
        block('section', '品牌專屬系統展示這個品牌獨有的東西。', 'systems'),
        block('section', '語氣用樣本，不用形容詞。', 'voice_samples'),
        block('gaps', '主頁要看得見缺什麼，否則會以為品牌已經完成。'),
      ],
    };
  },
  tokens() {
    return null;
  },
  tokensNote: '主頁是彙整，不產生 token：它引用其他頁的現行版本（C112）。',
  prompt() {
    return [];
  },
};

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
  prompt() {
    return [];
  },
};

/* ── 自定義頁 ─────────────────────────────────────────────────── */

export type CustomPayload = {
  decided: string;
  notDecided: string;
  rules: string[];
  examples: string[];
  badExamples: string[];
  colorRoles: string[];
  typeRoles: string[];
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
        block('section', '規則是可以照做的那一部分。', 'rules'),
        block('section', '做對與做錯並列。', 'examples'),
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
  home,
  examples,
  custom,
};

/** 頁鍵 → schema。自定義頁的鍵是 slug，一律用 `custom`。 */
export function schemaForPage(pageKey: string, kind: 'fixed' | 'custom'): PageSchema {
  const base = kind === 'custom' ? custom : (PAGE_SCHEMAS[pageKey] ?? custom);

  return base.sections.some((section) => section.id === 'legacy')
    ? base
    : { ...base, sections: [...base.sections, LEGACY_SECTION] };
}

export const PAGE_KEYS_ORDERED = ['home', 'platform', 'color', 'type', 'logo', 'tone', 'image', 'examples'];
