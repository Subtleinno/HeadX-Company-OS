import { describe, expect, it } from 'vitest';
import { loadStageEngine } from '../src/brand-guide/engine/index.js';

const ALL_STAGES = [
  'stage0',
  'stage1',
  'stage2',
  'stage3',
  'stage4a',
  'stage4b',
  'stage4c',
  'stage4d',
  'stage4e',
  'stage4f',
  'stage4g',
  'stage4h',
];

describe('brand-guide 引擎（reference core.js 原封載入）', () => {
  it('12 個 stage 全部載入，buildBrief 出到 schema', () => {
    for (const stage of ALL_STAGES) {
      const engine = loadStageEngine(stage);
      const brief = engine.buildBrief(engine.emptyState());

      expect(typeof brief.schema, `${stage} 缺少 schema`).toBe('string');
      expect(brief.schema.startsWith('brand/') || brief.schema.startsWith('headx.'), `${stage} schema 前綴不對`).toBe(true);
    }
  });

  it('每個 stage 都有討論 prompt（prompts.js 的 PROMPTS）', () => {
    for (const stage of ALL_STAGES) {
      const engine = loadStageEngine(stage);
      const keys = Object.keys(engine.prompts);

      expect(keys.length, `${stage} 沒有討論 prompt`).toBeGreaterThan(0);
    }
  });

  it('stage0：中醫診所行業會推導出規管 flag 與下游建議', () => {
    const engine = loadStageEngine('stage0');
    const state = engine.emptyState() as Record<string, unknown>;

    state.industry = ['ind_tcm'];
    (state as { text: Record<string, string> }).text = {
      what: '為都市女性提供針灸與中藥調理',
      who: '30-45 歲上班族',
      how: '預約按次收費',
    };

    const brief = engine.buildBrief(state) as Record<string, unknown>;
    const derived = brief.derived as Record<string, unknown>;

    expect(derived.regulated).toBe(true);
    expect(Array.isArray(derived.flags)).toBe(true);
    expect(derived.flags as string[]).toContain('tcm');

    const hints = engine.hints(state);
    expect(hints.length).toBeGreaterThan(0);
  });

  it('stage0：有 18 個討論 prompt，industry prompt 含選項清單', () => {
    const engine = loadStageEngine('stage0');

    expect(Object.keys(engine.prompts)).toHaveLength(18);

    const prompt = engine.prompts.industry(engine.emptyState());

    expect(prompt).toContain('【你的角色】');
    expect(prompt).toContain('【這份討論的目的】');
    expect(prompt).toContain('【可選項目完整清單');
  });

  it('stage1：定位宣言 draft 依賴定位維度', () => {
    const engine = loadStageEngine('stage1');
    const state = engine.emptyState() as Record<string, unknown>;

    // stage1 有 CAT（audience/pain/...）同 DIALS。塞入基本資料。
    (state as { audience: string[] }).audience = ['young'];
    (state as { category: string[] }).category = ['tcm'];

    const brief = engine.buildBrief(state) as Record<string, unknown>;

    expect(typeof brief.schema).toBe('string');
  });

  it('跨 stage 連繫：stage2 用 importPrior 讀到 stage1 的 anti-persona', () => {
    const e1 = loadStageEngine('stage1');
    const s1 = e1.emptyState() as Record<string, unknown>;
    (s1 as { anti: string[] }).anti = ['anti_clinical'];
    const brief1 = e1.buildBrief(s1) as Record<string, unknown>;

    const e2 = loadStageEngine('stage2');
    const s2 = e2.emptyState() as Record<string, unknown>;
    const linked = e2.importPrior(s2, { stage1: brief1 }) as Record<string, unknown>;

    // stage2 應該已經把 stage1 brief 拆成 s1 欄位。
    expect((linked as { s1: Record<string, unknown> }).s1).toBeTruthy();

    const brief2 = e2.buildBrief(linked) as Record<string, unknown>;
    // stage2 brief 應該帶有 stage1_context。
    expect(brief2.stage1_context).toBeTruthy();
  });

  it('跨 stage 連繫：stage4b 用 importPrior 讀到 stage0 與 stage4a 的 brief', () => {
    const e0 = loadStageEngine('stage0');
    const brief0 = e0.buildBrief(e0.emptyState()) as Record<string, unknown>;

    const e4a = loadStageEngine('stage4a');
    const brief4a = e4a.buildBrief(e4a.emptyState()) as Record<string, unknown>;

    const e4b = loadStageEngine('stage4b');
    const s4b = e4b.emptyState() as Record<string, unknown>;
    const linked = e4b.importPrior(s4b, { stage0: brief0, stage4a: brief4a }) as Record<string, unknown>;

    expect((linked as { s0: unknown }).s0).toBeTruthy();
    expect((linked as { s4a: unknown }).s4a).toBeTruthy();
  });

  it('跨 stage 連繫：stage4h 讀到 stage4g（最深鏈）', () => {
    const e4g = loadStageEngine('stage4g');
    const brief4g = e4g.buildBrief(e4g.emptyState()) as Record<string, unknown>;

    const e4h = loadStageEngine('stage4h');
    const s4h = e4h.emptyState() as Record<string, unknown>;
    const linked = e4h.importPrior(s4h, { stage4g: brief4g }) as Record<string, unknown>;

    expect((linked as { s4g: unknown }).s4g).toBeTruthy();
  });
});
