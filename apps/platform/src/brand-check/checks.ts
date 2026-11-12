import {
  contrastRatio,
  schemaForPage,
  type ColorPayload,
  type LogoPayload,
  type PlatformPayload,
  type TonePayload,
  type TypePayload,
} from '@company-os/contracts';
import { POLICY_RULES } from '../brand-policy/rules.js';

/**
 * 驗證規則：一個 id 一個 checker（issue #59）。
 *
 * 規則 id 的表住在 `brand-policy/rules.ts`，這一支只實作它列出的 id。兩邊靠
 * 一個雙向測試對上：表裡有一個 id 但這裡沒有 checker 會紅，這裡有一條
 * checker 但表裡沒有 id 也會紅。原因是「策略寫了但沒有人檢查」與「檢查了
 * 一條已經不存在的策略」都會令人以為有保障。
 *
 * **三態不是禮貌，是誠實。** 缺資料回 `undetermined`，不是 `pass`：
 *   - 色彩頁未有版本 → 所有色彩規則都無法判斷，而不是全部通過。
 *   - 未指定哪一組是內文 → 對比規則無法判斷，而不是「沒有不達標的配對」。
 * 一個永遠綠的檢查比沒有檢查更貴，因為它會令人停止懷疑。
 *
 * **只報告，不阻止儲存。** 儲存是老闆與設計師的決定；檢查是給他們看的。
 */

export type CheckState = 'pass' | 'fail' | 'undetermined';

export type CheckResult = {
  ruleId: string;
  state: CheckState;
  /** 哪一頁、哪一個位置。 */
  location: string;
  /** 一句說明（為咩通過／為咩不通過／缺什麼）。 */
  detail: string;
  /** 怎樣改。不通過與無法判斷都要有。 */
  fix: string;
};

export type CheckPage = {
  key: string;
  name: string;
  kind: 'fixed' | 'custom';
  versionNo: number;
  document: { payload: Record<string, unknown> };
};

export type CheckSummary = { pass: number; fail: number; undetermined: number };

export type CheckReport = {
  items: CheckResult[];
  summary: CheckSummary;
  /** 最重要的一條：不通過優先，其次無法判斷。摘要條用。 */
  headline: CheckResult | null;
};

type Context = {
  pages: readonly CheckPage[];
  payloadOf(key: string): Record<string, unknown> | null;
  versionOf(key: string): number;
  colors: Map<string, { hex: string; group: string }>;
};

function buildContext(pages: readonly CheckPage[]): Context {
  const byKey = new Map(pages.map((page) => [page.key, page]));
  const colors = new Map<string, { hex: string; group: string }>();

  const colorPage = byKey.get('color');

  if (colorPage !== undefined) {
    const payload = schemaForPage('color', 'fixed').normalize(colorPage.document.payload) as ColorPayload;

    for (const role of payload.roles) {
      if (role.id !== '') {
        colors.set(role.id, { hex: role.hex, group: role.group });
      }
    }
  }

  return {
    pages,
    colors,
    payloadOf(key) {
      const page = byKey.get(key);
      return page === undefined ? null : schemaForPage(page.key, page.kind).normalize(page.document.payload);
    },
    versionOf(key) {
      return byKey.get(key)?.versionNo ?? 0;
    },
  };
}

/* ── 個別判斷 ─────────────────────────────────────────────────── */

/**
 * 一句「證據」是不是只是在換一個形容詞。
 *
 * 這一條永遠有爭議，所以界線寫得窄：太短（少於 8 個字）或者整句就是一個
 * 價值形容詞，就算形容詞。其餘一律當證據 —— 寧願放過一句弱的證據，也不要
 * 把一句真的證據判死。
 */
const ADJECTIVES = [
  '專業',
  '創新',
  '用心',
  '以人為本',
  '高品質',
  '優質',
  '可靠',
  '領先',
  '卓越',
  '專注',
];

export function looksLikeAdjective(text: string): boolean {
  const value = text.trim();

  if (value.length < 8) {
    return true;
  }

  return ADJECTIVES.some((word) => value === word || value === `${word}。` || value === `${word}！`);
}

function fail(ruleId: string, location: string, detail: string, fix: string): CheckResult {
  return { ruleId, state: 'fail', location, detail, fix };
}

function pass(ruleId: string, location: string, detail: string): CheckResult {
  return { ruleId, state: 'pass', location, detail, fix: '' };
}

function undetermined(ruleId: string, location: string, detail: string, fix: string): CheckResult {
  return { ruleId, state: 'undetermined', location, detail, fix };
}

/* ── 檢查器 ───────────────────────────────────────────────────── */

export type Checker = {
  ruleId: string;
  page: string;
  run(context: Context): CheckResult;
};

const platformR1: Checker = {
  ruleId: 'platform.r1',
  page: 'platform',
  run(context) {
    if (context.versionOf('platform') === 0) {
      return undetermined('platform.r1', '平台', '平台頁未有版本。', '先寫平台頁，三檢才有東西可以檢查。');
    }

    const payload = context.payloadOf('platform') as PlatformPayload | null;

    if (payload === null) {
      return undetermined('platform.r1', '平台', '平台頁的內容讀不到。', '重新儲存平台頁。');
    }

    const tests = [
      { key: 'real', label: '真實' },
      { key: 'relevant', label: '相關' },
      { key: 'unique', label: '獨特' },
    ] as const;

    for (const test of tests) {
      const evidence = payload.tests[test.key];

      if (evidence.trim() === '') {
        return fail(
          'platform.r1',
          `平台／三檢・${test.label}`,
          `${test.label}沒有證據。`,
          `在「${test.label}」寫一件做過的事，例如一個真實案例、一個客人問題、一個只有你們有的做法。`,
        );
      }

      if (looksLikeAdjective(evidence)) {
        return fail(
          'platform.r1',
          `平台／三檢・${test.label}`,
          `${test.label}的「${evidence}」只是形容詞。`,
          '換成一件可以查證的事：誰、幾時、發生過什麼。',
        );
      }
    }

    return pass('platform.r1', '平台／三檢', '三項都有可查證的證據。');
  },
};

const colorR1: Checker = {
  ruleId: 'color.r1',
  page: 'color',
  run(context) {
    if (context.versionOf('color') === 0) {
      return undetermined('color.r1', '色彩', '色彩頁未有版本。', '先建立色彩頁，四個必要角色才有東西可以檢查。');
    }

    const payload = context.payloadOf('color') as ColorPayload | null;

    if (payload === null || payload.roles.length === 0) {
      return undetermined('color.r1', '色彩', '色彩頁未有角色。', '先建立角色表。');
    }

    const byId = new Map(payload.roles.map((role) => [role.id, role]));
    const duplicates = payload.roles.map((role) => role.id).filter((id, index, all) => id !== '' && all.indexOf(id) !== index);

    if (duplicates.length > 0) {
      return fail(
        'color.r1',
        `色彩／${duplicates[0] ?? ''}`,
        `${duplicates[0] ?? ''} 出現兩次。`,
        '同一個角色只可以有一行；兩個值會令引用它的頁無所適從。',
      );
    }

    for (const required of ['brand.primary', 'ink', 'paper', 'surface']) {
      const role = byId.get(required);

      if (role === undefined || role.hex.trim() === '') {
        return fail(
          'color.r1',
          `色彩／${required}`,
          `${required} 未有值。`,
          `補上 ${required}：這是策略明講必須存在的角色，缺了就不是一個完整的色彩系統。`,
        );
      }
    }

    return pass('color.r1', '色彩／角色表', '四個必要角色都有值。');
  },
};

const colorR2: Checker = {
  ruleId: 'color.r2',
  page: 'color',
  run(context) {
    if (context.versionOf('color') === 0) {
      return undetermined('color.r2', '色彩', '色彩頁未有版本，計不出對比。', '先建立色彩頁。');
    }

    const payload = context.payloadOf('color') as ColorPayload | null;

    if (payload === null) {
      return undetermined('color.r2', '色彩', '色彩頁的內容讀不到。', '重新儲存色彩頁。');
    }

    const body = payload.pairs.allowed.filter((pair) => pair.use === 'body');

    if (body.length === 0) {
      return undetermined(
        'color.r2',
        '色彩／配對',
        '未指定哪一組是內文配對。',
        '在配對表加一組「內文」：前景與底色各選一個角色。',
      );
    }

    for (const pair of body) {
      const fg = context.colors.get(pair.fg)?.hex ?? '';
      const bg = context.colors.get(pair.bg)?.hex ?? '';

      if (fg === '' || bg === '') {
        return undetermined(
          'color.r2',
          `色彩／${pair.fg} on ${pair.bg}`,
          '配對的其中一方缺色值，計不出比值。',
          '補上缺的那個角色，或者換一組有值的配對。',
        );
      }

      const ratio = contrastRatio(fg, bg);

      if (ratio === null) {
        return undetermined('color.r2', `色彩／${pair.fg} on ${pair.bg}`, '色值格式讀不到。', '色值要用 HEX。');
      }

      if (ratio < payload.contrast_floor) {
        return fail(
          'color.r2',
          `色彩／${pair.fg} on ${pair.bg}`,
          `實測 ${ratio}:1，低於下限 ${payload.contrast_floor}:1。`,
          `把 ${pair.fg} 調深或調淺，或者在角色表加一個替代色並寫明用在哪。`,
        );
      }
    }

    return pass('color.r2', '色彩／配對', `內文配對全部達到 ${payload.contrast_floor}:1。`);
  },
};

const colorR3: Checker = {
  ruleId: 'color.r3',
  page: 'color',
  run(context) {
    if (context.versionOf('color') === 0) {
      return undetermined('color.r3', '色彩', '色彩頁未有版本，計不出大字對比。', '先建立色彩頁。');
    }

    const payload = context.payloadOf('color') as ColorPayload | null;

    if (payload === null) {
      return undetermined('color.r3', '色彩', '色彩頁的內容讀不到。', '重新儲存色彩頁。');
    }

    const large = payload.pairs.allowed.filter((pair) => pair.use === 'large');

    if (large.length === 0) {
      return undetermined(
        'color.r3',
        '色彩／配對',
        '未指定哪一組是大字用色。',
        '在配對表加一組「大字」：標題會用哪個前景色、放在哪個底色上。',
      );
    }

    for (const pair of large) {
      const fg = context.colors.get(pair.fg)?.hex ?? '';
      const bg = context.colors.get(pair.bg)?.hex ?? '';
      const ratio = fg === '' || bg === '' ? null : contrastRatio(fg, bg);

      if (ratio === null) {
        return undetermined('color.r3', `色彩／${pair.fg} on ${pair.bg}`, '缺色值，計不出比值。', '補上缺的角色。');
      }

      if (ratio < payload.large_floor) {
        return fail(
          'color.r3',
          `色彩／${pair.fg} on ${pair.bg}`,
          `大字實測 ${ratio}:1，低於下限 ${payload.large_floor}:1。`,
          '大字不是藉口：把前景色調深，或者改用另一個角色。',
        );
      }
    }

    return pass('color.r3', '色彩／大字配對', `大字配對全部達到 ${payload.large_floor}:1。`);
  },
};

const colorR4: Checker = {
  ruleId: 'color.r4',
  // 規則住在色彩槽（`rulesForSlot('color')` 有它），但它讀的是標誌頁的模式。
  // 所以掛在色彩頁，跨頁讀標誌 —— 見 `runChecks` 的說明。
  page: 'color',
  run(context) {
    if (context.versionOf('logo') === 0) {
      return undetermined('color.r4', '標誌', '標誌頁未有版本。', '先建立標誌頁的四種顏色模式。');
    }

    if (context.colors.size === 0) {
      return undetermined('color.r4', '標誌', '色彩頁未有角色，核對不到模式引用了什麼。', '先建立色彩頁的角色表。');
    }

    const logo = context.payloadOf('logo') as LogoPayload | null;

    for (const mode of logo?.modes ?? []) {
      const role = context.colors.get(mode.color_role);

      if (role !== undefined && role.group === 'function') {
        return fail(
          'color.r4',
          `標誌／${mode.mode}`,
          `${mode.color_role} 是功能色。`,
          '功能色是「系統在講話」的顏色，不是品牌的聲音；改用品牌色或閱讀色。',
        );
      }
    }

    return pass('color.r4', '標誌／顏色模式', '沒有模式引用功能色。');
  },
};

const typeR1: Checker = {
  ruleId: 'type.r1',
  page: 'type',
  run(context) {
    if (context.versionOf('type') === 0) {
      return undetermined('type.r1', '字體', '字體頁未有版本。', '先建立字體頁。');
    }

    const payload = context.payloadOf('type') as TypePayload | null;
    const families = payload?.families.filter((family) => family.name !== '') ?? [];

    if (families.length === 0) {
      return undetermined('type.r1', '字體', '未有任何家族。', '建立一至兩個家族。');
    }

    if (families.length > 2) {
      return fail(
        'type.r1',
        '字體／家族',
        `有 ${families.length} 個家族。`,
        '收回到兩個（一個語氣、一個資訊）；真有例外，在策略寫明。',
      );
    }

    return pass('type.r1', '字體／家族', `${families.length} 個家族。`);
  },
};

const typeR2: Checker = {
  ruleId: 'type.r2',
  page: 'type',
  run(context) {
    if (context.versionOf('type') === 0) {
      return undetermined('type.r2', '字體', '字體頁未有版本。', '先建立字體頁。');
    }

    const payload = context.payloadOf('type') as TypePayload | null;
    const roles = payload?.roles.filter((role) => role.role !== '') ?? [];

    if (roles.length === 0) {
      return undetermined('type.r2', '字體', '未有任何字階。', '建立字階，每一級寫最小尺寸。');
    }

    for (const role of roles) {
      if (role.min <= 0) {
        return fail(
          'type.r2',
          `字體／${role.role}`,
          `${role.role} 未有最小尺寸。`,
          '填一個正數（px）。沒有最小尺寸的字階，印刷與細屏都會出事。',
        );
      }
    }

    return pass('type.r2', '字體／字階', '每一級都有最小尺寸。');
  },
};

const typeR3: Checker = {
  ruleId: 'type.r3',
  page: 'type',
  run(context) {
    if (context.versionOf('type') === 0) {
      return undetermined('type.r3', '字體', '字體頁未有版本。', '先建立字體頁。');
    }

    const payload = context.payloadOf('type') as TypePayload | null;
    const families = payload?.families.filter((family) => family.name !== '') ?? [];

    if (families.length === 0) {
      return undetermined('type.r3', '字體', '未有任何家族。', '建立家族並填授權。');
    }

    for (const family of families) {
      if (family.license_web.trim() === '' || family.license_print.trim() === '') {
        return fail(
          'type.r3',
          `字體／${family.name}`,
          `${family.name} 的授權未寫齊。`,
          '網頁與印刷兩個授權都要寫（可以是「不允許」）—— 空白與不允許是兩件事。',
        );
      }
    }

    return pass('type.r3', '字體／授權', '每個家族的網頁與印刷授權都有寫。');
  },
};

const logoR1: Checker = {
  ruleId: 'logo.r1',
  page: 'logo',
  run(context) {
    if (context.versionOf('logo') === 0) {
      return undetermined('logo.r1', '標誌', '標誌頁未有版本。', '先建立標誌頁。');
    }

    const payload = context.payloadOf('logo') as LogoPayload | null;

    if (payload === null || payload.clear_space_x.multiples.trim() === '') {
      return fail(
        'logo.r1',
        '標誌／淨空間',
        '未寫淨空間倍數。',
        '寫一個倍數（例如 2x）；「留足夠空間」不是規格。',
      );
    }

    if (payload.clear_space_x.x.trim() === '') {
      return fail(
        'logo.r1',
        '標誌／淨空間',
        '有倍數但沒有定義 x 是甚麼。',
        '寫明 x 等於幾多，例如「x ＝ 字標高度」。',
      );
    }

    return pass('logo.r1', '標誌／淨空間', `${payload.clear_space_x.multiples}，x ＝ ${payload.clear_space_x.x}。`);
  },
};

const logoR2: Checker = {
  ruleId: 'logo.r2',
  page: 'logo',
  run(context) {
    if (context.versionOf('logo') === 0) {
      return undetermined('logo.r2', '標誌', '標誌頁未有版本。', '先建立標誌頁。');
    }

    const payload = context.payloadOf('logo') as LogoPayload | null;

    if (payload === null || payload.min_size.screen_px <= 0 || payload.min_size.print_mm <= 0) {
      return fail(
        'logo.r2',
        '標誌／最小尺寸',
        '螢幕與印刷兩個下限未寫齊。',
        '兩個都要寫：px 是螢幕，mm 是印刷，兩者不是同一個數。',
      );
    }

    if (payload.min_size.screen_px === payload.min_size.print_mm) {
      return fail(
        'logo.r2',
        '標誌／最小尺寸',
        '螢幕與印刷寫了同一個數。',
        'px 與 mm 不是同一個單位；分開量一次。',
      );
    }

    return pass('logo.r2', '標誌／最小尺寸', `${payload.min_size.screen_px}px ／ ${payload.min_size.print_mm}mm。`);
  },
};

const logoR3: Checker = {
  ruleId: 'logo.r3',
  page: 'logo',
  run(context) {
    if (context.versionOf('logo') === 0) {
      return undetermined('logo.r3', '標誌', '標誌頁未有版本。', '先建立標誌頁。');
    }

    if (context.colors.size === 0) {
      return undetermined('logo.r3', '標誌', '色彩頁未有角色，核對不到模式。', '先建立色彩頁。');
    }

    const payload = context.payloadOf('logo') as LogoPayload | null;
    const modes = payload?.modes.filter((mode) => mode.mode !== '') ?? [];

    if (modes.length < 4) {
      return fail(
        'logo.r3',
        '標誌／顏色模式',
        `只有 ${modes.length} 種模式。`,
        '四種模式都要有：主色、單色黑、反白、以及一個指定底色上的版本。',
      );
    }

    for (const mode of modes) {
      if (!context.colors.has(mode.color_role)) {
        return fail(
          'logo.r3',
          `標誌／${mode.mode}`,
          `引用了不存在的角色 ${mode.color_role === '' ? '（空白）' : mode.color_role}。`,
          '只可以引用色彩頁已有的角色名。',
        );
      }
    }

    return pass('logo.r3', '標誌／顏色模式', '四種模式都存在，角色都找得到。');
  },
};

const voiceR1: Checker = {
  ruleId: 'voice.r1',
  page: 'tone',
  run(context) {
    if (context.versionOf('tone') === 0) {
      return undetermined('voice.r1', '語氣', '語氣頁未有版本。', '先建立語氣頁。');
    }

    const payload = context.payloadOf('tone') as TonePayload | null;
    const banned = payload?.banned.filter((item) => item.term !== '') ?? [];

    if (banned.length === 0) {
      return undetermined(
        'voice.r1',
        '語氣／禁用',
        '未有任何禁用詞。空白不等於合格。',
        '列出三個真的不想見到的詞，並寫為咩。',
      );
    }

    for (const item of banned) {
      if (item.reason.trim() === '') {
        return fail(
          'voice.r1',
          `語氣／${item.term}`,
          `「${item.term}」沒有寫原因。`,
          '寫一句為咩禁；沒有原因的禁用詞，下一次就會被人解禁。',
        );
      }
    }

    return pass('voice.r1', '語氣／禁用', '每個禁用詞都有原因。');
  },
};

/**
 * 全部檢查器，按規則 id 排。
 *
 * `POLICY_RULES` 的次序是策略書的次序；這一支跟它一樣，摘要條的那一條
 * 「最重要」才會穩定（同一份內容，兩次跑出同一個 headline）。
 */
export const CHECKERS: readonly Checker[] = [
  platformR1,
  colorR1,
  colorR2,
  colorR3,
  colorR4,
  typeR1,
  typeR2,
  typeR3,
  logoR1,
  logoR2,
  logoR3,
  voiceR1,
];

export function checkerIds(): string[] {
  return CHECKERS.map((checker) => checker.ruleId);
}

/**
 * 跑檢查。`pageKey` 給定時只回那一頁的規則。
 *
 * 注意：`color.r4` 掛在色彩頁，但讀標誌頁的四種模式；`logo.r3` 掛在標誌頁，
 * 但要用色彩頁的角色核對。所以檢查是跨頁的：一頁的結果可能取決於另一頁的
 * 現行版本。這不是耦合，是事實（標誌的顏色模式本來就引用色彩角色）。
 */
export function runChecks(pages: readonly CheckPage[], pageKey?: string): CheckReport {
  const context = buildContext(pages);
  const target = pageKey === undefined ? null : (pages.find((page) => page.key === pageKey) ?? null);

  const items = CHECKERS.filter((checker) => {
    if (target === null) {
      return true;
    }

    // 自定義頁沒有專屬規則（C113）：回一個空報告，而不是借用別頁的規則。
    return target.kind === 'fixed' && checker.page === target.key;
  }).map((checker) => checker.run(context));

  if (target !== null && target.kind === 'fixed' && target.versionNo === 0) {
    // 未有版本：每一條相關規則都要講「無法判斷」，而不是靠 checker 各自記得。
    const rules = POLICY_RULES.filter((rule) => rule.slot === target.key);

    return {
      items: rules.map((rule) =>
        undetermined(rule.id, target.name, '這一頁未有版本。', '先寫這一頁，檢查才有東西可以看。'),
      ),
      summary: { pass: 0, fail: 0, undetermined: rules.length },
      headline: null,
    };
  }

  const summary: CheckSummary = {
    pass: items.filter((item) => item.state === 'pass').length,
    fail: items.filter((item) => item.state === 'fail').length,
    undetermined: items.filter((item) => item.state === 'undetermined').length,
  };

  const headline = items.find((item) => item.state === 'fail') ?? items.find((item) => item.state === 'undetermined') ?? null;

  return { items, summary, headline };
}

/** 自定義頁的報告：沒有規則，所以是空的一組，不是「全部通過」。 */
export function emptyReport(): CheckReport {
  return { items: [], summary: { pass: 0, fail: 0, undetermined: 0 }, headline: null };
}
