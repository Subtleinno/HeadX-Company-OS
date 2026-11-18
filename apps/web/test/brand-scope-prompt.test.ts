import { describe, expect, it } from 'vitest';
import { buildScopePrompt, type ScopePromptStage } from '../src/design/brand-scope-prompt';

/**
 * 範圍層 prompt 是「接手整份」的介面：貼出去之後，agent 靠它知道這個範圍
 * 有哪幾站、已經定了甚麼、寫回時用哪一組識別碼。
 *
 * 最關鍵的一條：同一個品牌可以有幾套品牌集，`04B.1` 在每一套都存在，
 * `block_id` 也完全一樣。所以每一格的識別碼必須帶 `set:`，否則 agent
 * 寫回時會改錯另一套 —— 那不是文案問題，是改錯資料。
 */
describe('範圍層 prompt', () => {
  const brand = { id: '8a1a1c1e-0000-4000-8000-000000000001', name: 'Moonic' };

  function stage(overrides: Partial<ScopePromptStage> = {}): ScopePromptStage {
    return {
      id: 'stage4b',
      num: '04B',
      name: '圖形表面',
      blocks: [
        {
          blockId: 'set:surface',
          code: '04B.1',
          title: '圖形表面',
          decision: '幾何、單色、留白多。',
          at: '17/11 22:00',
          by: 'Billy Chung',
          actorType: 'human',
        },
      ],
      progress: { pct: 32, missing: 21 },
      ...overrides,
    };
  }

  it('品牌集：每一格都有自己的識別碼，連品牌集一齊寫', () => {
    const prompt = buildScopePrompt({
      brand,
      scope: { kind: 'brand-set', setId: '5f0c9d4e-0000-4000-8000-0000000000aa', setName: '2026 夏季' },
      stages: [stage()],
    });

    expect(prompt).toContain('品牌集「2026 夏季」');
    expect(prompt).toContain('## 識別碼：04B.1 圖形表面');
    expect(prompt).toContain(`brand: ${brand.id}`);
    expect(prompt).toContain('set: 5f0c9d4e-0000-4000-8000-0000000000aa（2026 夏季）');
    expect(prompt).toContain('stage: stage4b');
    expect(prompt).toContain('block: set:surface');
    expect(prompt).toContain('幾何、單色、留白多。');
  });

  it('兩套品牌集的同一格分得出：識別碼不相同', () => {
    const summer = buildScopePrompt({
      brand,
      scope: { kind: 'brand-set', setId: 'aaa', setName: '2026 夏季' },
      stages: [stage()],
    });
    const winter = buildScopePrompt({
      brand,
      scope: { kind: 'brand-set', setId: 'bbb', setName: '2026 冬季' },
      stages: [stage()],
    });

    expect(summer).toContain('set: aaa（2026 夏季）');
    expect(winter).toContain('set: bbb（2026 冬季）');
    expect(summer).not.toContain('bbb');
    expect(winter).not.toContain('aaa');
  });

  it('品牌層（01–03）：沒有 set 那一行，講明是品牌層', () => {
    const prompt = buildScopePrompt({
      brand,
      scope: { kind: 'brand', setId: null, setName: '' },
      stages: [stage({ id: 'stage1', num: '01', name: '品牌定位' })],
    });

    expect(prompt).toContain('品牌層');
    expect(prompt).not.toContain('set: ');
    expect(prompt).toContain('stage: stage1');
  });

  it('單一階段模組（04A／04G）：範圍寫出階段編號與名稱', () => {
    const prompt = buildScopePrompt({
      brand,
      scope: { kind: 'stage', setId: null, setName: '' },
      stages: [stage({ id: 'stage4g', num: '04G', name: '治理' })],
    });

    expect(prompt).toContain('範圍：04G 治理');
  });

  it('未填的範圍仍然可用：講明未有決策，並叫 agent 用工具去讀', () => {
    const prompt = buildScopePrompt({
      brand,
      scope: { kind: 'brand-set', setId: 'ccc', setName: '2026 夏季' },
      stages: [stage({ blocks: [] })],
    });

    expect(prompt).toContain('這個範圍還未有決策');
    expect(prompt).toContain('brand_block_list');
    expect(prompt).toContain('setId=ccc');
  });

  it('進度逐站列出；沒有 brief 的站不出假數字', () => {
    const prompt = buildScopePrompt({
      brand,
      scope: { kind: 'brand', setId: null, setName: '' },
      stages: [
        stage({ id: 'stage1', num: '01', name: '品牌定位', progress: { pct: 40, missing: 6 } }),
        stage({ id: 'stage2', num: '02', name: '品牌個性', progress: null }),
      ],
    });

    expect(prompt).toContain('01 品牌定位：40%（未填 6 項）');
    expect(prompt).not.toContain('02 品牌個性：');
  });
});
