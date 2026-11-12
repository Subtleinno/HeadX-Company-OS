import { describe, expect, it } from 'vitest';
import type { BrandPayload } from '@company-os/contracts';
import { CHECKERS, checkerIds, looksLikeAdjective, runChecks, type CheckPage } from '../src/brand-check/checks';
import { POLICY_RULES } from '../src/brand-policy/rules';

/**
 * 驗證規則的檢查器（issue #59）。
 *
 * 這裡釘死四件事：
 *   1. 規則表與 checker 雙向對得上（表有 id 冇 checker／有 checker 冇 id 都要紅）。
 *   2. 每個 checker 講的是自己的 id，不是借別人的。
 *   3. 缺資料回「無法判斷」，不是「通過」—— 一個永遠綠的檢查比沒有檢查更貴。
 *   4. 跨頁讀得到：色彩規則讀標誌頁的模式，標誌規則讀色彩頁的角色。
 */

function page(key: string, payload: BrandPayload | Record<string, unknown>, versionNo = 1): CheckPage {
  return {
    key,
    name: key,
    kind: key.startsWith('custom-') ? 'custom' : 'fixed',
    versionNo,
    document: { payload: payload as Record<string, unknown> },
  };
}

function colorPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    stance: '先白，後墨，再藍。',
    roles: [
      { id: 'paper', group: 'reading', name: 'White', hex: '#FFFFFF', cmyk: '', dark: '', usage: '底色', reason: '先白' },
      { id: 'ink', group: 'reading', name: 'Ink', hex: '#1F1B2D', cmyk: '', dark: '', usage: '文字', reason: '定墨' },
      { id: 'brand.primary', group: 'brand', name: 'Blue', hex: '#2B3A8F', cmyk: '', dark: '', usage: '標記', reason: '只標記' },
      { id: 'surface', group: 'reading', name: 'Deep', hex: '#12101A', cmyk: '', dark: '', usage: '深色底', reason: '夜間' },
      { id: 'danger', group: 'function', name: 'Red', hex: '#C0362C', cmyk: '', dark: '', usage: '錯誤', reason: '系統講話' },
    ],
    order: { text: '白 → 墨 → 藍', reason: '順序就是優先級' },
    ratios: [],
    contrast_floor: 4.5,
    large_floor: 3,
    pairs: {
      allowed: [
        { fg: 'ink', bg: 'paper', use: 'body', reason: '正文' },
        { fg: 'paper', bg: 'brand.primary', use: 'large', reason: '標題' },
      ],
      forbidden: [],
    },
    tints: [],
    ...overrides,
  };
}

function logoPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    stance: '一個標記，四種場合。',
    logic_line: '',
    assets: [],
    lockups: [],
    construction: '',
    clear_space_x: { x: '字標高度', multiples: '2x', note: '' },
    min_size: { screen_px: 24, print_mm: 8 },
    modes: [
      { mode: '主色', color_role: 'brand.primary', note: '' },
      { mode: '單色黑', color_role: 'ink', note: '' },
      { mode: '反白', color_role: 'paper', note: '' },
      { mode: '深底', color_role: 'surface', note: '' },
    ],
    backgrounds: '',
    misuse: [],
    master_vector: '',
    ...overrides,
  };
}

describe('檢查器與規則表對得上', () => {
  it('表裡每個 id 都有 checker，每個 checker 都對得上一個 id', () => {
    const fromTable = POLICY_RULES.map((rule) => rule.id).sort();
    const fromCheckers = checkerIds().sort();

    expect(fromCheckers).toEqual(fromTable);
    expect(fromCheckers).toHaveLength(12);
  });

  it('checker 掛的頁就是規則所屬的槽（語氣槽名是 tone，id 用 voice）', () => {
    for (const checker of CHECKERS) {
      const rule = POLICY_RULES.find((item) => item.id === checker.ruleId);

      expect(rule, `${checker.ruleId} 在規則表裡找不到`).toBeDefined();
      expect(checker.page).toBe(rule?.slot);
    }
  });

  it('同一個 id 只可以有一個 checker', () => {
    const ids = checkerIds();

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('跑出來的結果一定用自己的 id，不會借別人的', () => {
    const pages = [
      page('platform', { tests: { real: '', relevant: '', unique: '' } }),
      page('color', colorPayload()),
      page('type', { families: [], roles: [] }),
      page('logo', logoPayload()),
      page('tone', { banned: [] }),
    ];

    for (const item of runChecks(pages).items) {
      const checker = CHECKERS.find((candidate) => candidate.ruleId === item.ruleId);

      expect(checker, `${item.ruleId} 沒有對應的 checker`).toBeDefined();
      expect(item.location.length).toBeGreaterThan(0);
      expect(item.detail.length).toBeGreaterThan(0);
    }
  });
});

describe('三態：缺資料回無法判斷，不是通過', () => {
  it('一頁都未有版本：全部無法判斷，冇一條通過', () => {
    const report = runChecks([
      page('platform', {}, 0),
      page('color', {}, 0),
      page('type', {}, 0),
      page('logo', {}, 0),
      page('tone', {}, 0),
    ]);

    expect(report.items).toHaveLength(12);
    expect(report.summary).toEqual({ pass: 0, fail: 0, undetermined: 12 });
    expect(report.items.every((item) => item.state === 'undetermined')).toBe(true);
  });

  it('色彩頁有版本但未指定內文配對：color.r2 無法判斷，不是「沒有不達標的配對」', () => {
    const report = runChecks([page('color', colorPayload({ pairs: { allowed: [], forbidden: [] } }))], 'color');
    const rule = report.items.find((item) => item.ruleId === 'color.r2');

    expect(rule?.state).toBe('undetermined');
    expect(rule?.fix).toContain('內文');
  });

  it('禁用詞清單是空的：voice.r1 無法判斷 —— 空白不等於合格', () => {
    const report = runChecks([page('tone', { banned: [] })], 'tone');

    expect(report.items.find((item) => item.ruleId === 'voice.r1')?.state).toBe('undetermined');
  });

  it('只有一頁未有版本時，那一頁的規則逐條講缺，不是靠 checker 自己記得', () => {
    const report = runChecks(
      [page('color', colorPayload()), page('logo', logoPayload(), 0)],
      'logo',
    );

    expect(report.items.map((item) => item.ruleId)).toEqual(['logo.r1', 'logo.r2', 'logo.r3']);
    expect(report.items.every((item) => item.state === 'undetermined')).toBe(true);
    expect(report.items[0]?.detail).toContain('未有版本');
  });
});

describe('個別規則的可量之處', () => {
  it('color.r2：實測低於 4.5:1 就紅，並講出實測值', () => {
    const roles = [
      ...(colorPayload().roles as { id: string }[]),
      { id: 'ink.soft', group: 'reading', name: 'Soft', hex: '#9A9A9A', cmyk: '', dark: '', usage: '次要文字', reason: '輕一點' },
    ];
    const pairs = { allowed: [{ fg: 'ink.soft', bg: 'paper', use: 'body', reason: '' }], forbidden: [] };
    const report = runChecks([page('color', colorPayload({ roles, pairs }))], 'color');
    const rule = report.items.find((item) => item.ruleId === 'color.r2');

    expect(rule?.state).toBe('fail');
    expect(rule?.detail).toMatch(/實測 2\.\d+:1/);
  });

  it('color.r1：四個必要角色缺一個就紅', () => {
    const roles = (colorPayload().roles as { id: string }[]).filter((role) => role.id !== 'surface');
    const report = runChecks([page('color', colorPayload({ roles }))], 'color');
    const rule = report.items.find((item) => item.ruleId === 'color.r1');

    expect(rule?.state).toBe('fail');
    expect(rule?.detail).toContain('surface');
  });

  it('color.r4：標誌模式引用功能色就紅 —— 而且是由色彩頁查出來', () => {
    const modes = [{ mode: '提示', color_role: 'danger', note: '' }];
    const report = runChecks(
      [page('color', colorPayload()), page('logo', logoPayload({ modes: [...(logoPayload().modes as unknown[]), ...modes] }))],
      'color',
    );
    const rule = report.items.find((item) => item.ruleId === 'color.r4');

    expect(rule?.state).toBe('fail');
    expect(rule?.detail).toContain('danger');
  });

  it('logo.r1：只寫「2x」但沒有定義 x 就紅', () => {
    const space = { x: '', multiples: '2x', note: '' };
    const report = runChecks([page('logo', logoPayload({ clear_space_x: space }))], 'logo');

    expect(report.items.find((item) => item.ruleId === 'logo.r1')?.state).toBe('fail');
  });

  it('logo.r2：px 與 mm 寫同一個數就紅', () => {
    const report = runChecks([page('logo', logoPayload({ min_size: { screen_px: 24, print_mm: 24 } }))], 'logo');
    const rule = report.items.find((item) => item.ruleId === 'logo.r2');

    expect(rule?.state).toBe('fail');
    expect(rule?.detail).toContain('同一個數');
  });

  it('type.r1：三個家族就紅', () => {
    const families = ['Serif', 'Sans', 'Mono'].map((name) => ({
      id: name,
      name,
      script: 'latin',
      license_web: '已購',
      license_print: '已購',
      file_ref: '',
    }));
    const report = runChecks([page('type', { families, roles: [] })], 'type');

    expect(report.items.find((item) => item.ruleId === 'type.r1')?.state).toBe('fail');
  });

  it('voice.r1：有詞冇原因就紅', () => {
    const report = runChecks([page('tone', { banned: [{ term: '尊貴', reason: '' }] })], 'tone');
    const rule = report.items.find((item) => item.ruleId === 'voice.r1');

    expect(rule?.state).toBe('fail');
    expect(rule?.detail).toContain('尊貴');
  });

  it('全部填好就是全綠，而且 headline 是 null', () => {
    const report = runChecks(
      [
        page('platform', { tests: { real: '二〇二四年幫三家診所改過預約流程', relevant: '客人問的第一句是幾時有位', unique: '只有我們同時做臨床與品牌' } }),
        page('color', colorPayload()),
        page('logo', logoPayload()),
        page('type', {
          families: [{ id: 'serif', name: 'Serif', script: 'latin', license_web: '已購', license_print: '已購', file_ref: '' }],
          roles: [{ role: 'body', family: 'Serif', weight: '400', size: '16', leading: '1.6', min: 14, measure: '32em', reason: '' }],
        }),
        page('tone', { banned: [{ term: '尊貴', reason: '客人不是來被抬高身份' }] }),
      ],
      'color',
    );

    expect(report.summary).toEqual({ pass: 4, fail: 0, undetermined: 0 });
    expect(report.headline).toBeNull();
  });
});

describe('報告的形狀', () => {
  it('給 pageKey 只回那一頁的規則；自定義頁回空報告而不是借用別頁', () => {
    const pages = [page('color', colorPayload()), page('custom-1', { title: '包裝' }), page('logo', logoPayload())];

    expect(runChecks(pages, 'color').items.map((item) => item.ruleId)).toEqual(['color.r1', 'color.r2', 'color.r3', 'color.r4']);

    const custom = runChecks(pages, 'custom-1');
    expect(custom.items).toEqual([]);
    expect(custom.summary).toEqual({ pass: 0, fail: 0, undetermined: 0 });
    expect(custom.headline).toBeNull();
  });

  it('headline 不通過優先，其次無法判斷', () => {
    const report = runChecks([page('color', colorPayload({ pairs: { allowed: [], forbidden: [] } }))], 'color');
    const firstFail = report.items.find((item) => item.state === 'fail');

    if (firstFail !== undefined) {
      expect(report.headline?.ruleId).toBe(firstFail.ruleId);
    } else {
      expect(report.headline?.state).toBe('undetermined');
    }
  });

  it('「證據」的界線寫得窄：太短或整句是價值形容詞才算形容詞', () => {
    expect(looksLikeAdjective('專業')).toBe(true);
    expect(looksLikeAdjective('以人為本。')).toBe(true);
    expect(looksLikeAdjective('用心')).toBe(true);
    expect(looksLikeAdjective('二〇二四年幫三家診所改過預約流程')).toBe(false);
    expect(looksLikeAdjective('客人問的第一句是幾時有位')).toBe(false);
  });
});
