import { describe, expect, it } from 'vitest';
import {
  buildDesignDoc,
  buildGroupedView,
  buildTokenFile,
  isLayerKind,
  layerTitle,
  projectLayer,
  LAYER_KINDS,
} from '../src/brand-guide/layer.js';

const noApprovals = {};

describe('brand-guide layer 純函式', () => {
  it('LAYER_KINDS 有六個層，isLayerKind 判得對', () => {
    expect(LAYER_KINDS).toEqual([
      'design-doc',
      'tokens',
      'templates',
      'examples',
      'checks',
      'unfiled',
    ]);
    expect(isLayerKind('design-doc')).toBe(true);
    expect(isLayerKind('unfiled')).toBe(true);
    expect(isLayerKind('nonsense')).toBe(false);
  });

  it('layerTitle 每個層都有中文名', () => {
    for (const kind of LAYER_KINDS) {
      expect(layerTitle(kind).length).toBeGreaterThan(0);
    }
  });

  it('buildDesignDoc：由 01/02/03/04A 合成，含定位宣言與原因', () => {
    const briefs = {
      stage1: {
        status: 'complete',
        brand_name: '滿月堂',
        positioning_statement: { text: '為都市女性提供可信的針灸調理', source: 'human' },
        core_tension: { primary: '專業與親切', dials: [] },
        anti_persona: [{ id: 'ap1', name: '冷淡的權威', note: '不可出現' }],
      },
      stage2: {
        status: 'complete',
        sensory_statement: { text: '溫暖、乾淨、靜謐', source: 'human' },
        material_metaphor: { primary: [{ id: 'm1', name: '竹', note: '自然' }] },
      },
      stage3: {
        status: 'incomplete',
        voice_statement: { text: '溫柔而專業', source: 'human' },
        samples: { on_voice: ['我們會陪你慢慢好起來'], off_voice: [] },
      },
    };
    const approvals = {
      stage1: { state: 'approved', approvedBy: 'Billy', rationale: '鎖定都會女性的信任感' },
    };

    const { sections, exportText } = buildDesignDoc(briefs, approvals);

    expect(sections.length).toBeGreaterThan(0);
    const stage1 = sections.find((s) => s.stage === 'stage1');
    expect(stage1).toBeDefined();
    expect(stage1?.approval).toBe('approved');
    expect(stage1?.approvedBy).toBe('Billy');
    expect(stage1?.rationale).toContain('信任感');
    expect(exportText).toContain('design.md');
    expect(exportText).toContain('滿月堂');
    expect(exportText).toContain('原因：鎖定都會女性的信任感');
    expect(exportText).toContain('狀態：approved（Billy）');
  });

  it('buildDesignDoc：空 brief 唔出假空段', () => {
    const { sections, exportText } = buildDesignDoc({}, noApprovals);
    expect(sections).toEqual([]);
    expect(exportText).toContain('design.md');
  });

  it('buildTokenFile：抽出 palette 並偵測 4B↔4E 衝突', () => {
    const briefs = {
      stage4a: {
        status: 'complete',
        palette: { c_primary: '#1a1a1a', c_ink: '#000000' },
      },
      stage4b: {
        status: 'complete',
        surface_tokens: { radius: '12px', focus: '2px' },
      },
      stage4e: {
        status: 'complete',
        ui: { tokens: { radius: '16px', target_min: '44px' } },
      },
    };

    const { sections, conflicts, exportText } = buildTokenFile(briefs, noApprovals);

    expect(sections.length).toBeGreaterThan(0);
    // radius 在 4B（12px）與 4E（16px）不同 → 衝突。
    const radiusConflict = conflicts.find((c) => c.token === 'radius');
    expect(radiusConflict).toBeDefined();
    expect(radiusConflict?.sources.length).toBe(2);
    expect(exportText).toContain('衝突');
    expect(exportText).toContain('radius');
  });

  it('buildTokenFile：冇跨 stage 衝突就唔出衝突段', () => {
    const briefs = {
      stage4a: { status: 'complete', palette: { c_primary: '#1a1a1a' } },
    };
    const { conflicts } = buildTokenFile(briefs, noApprovals);
    expect(conflicts).toEqual([]);
  });

  it('buildGroupedView：範例層由 04H + 03 供料', () => {
    const briefs = {
      stage3: {
        status: 'complete',
        samples: { on_voice: ['像我們的句子'], off_voice: ['不像我們的句子'] },
      },
      stage4h: {
        status: 'incomplete',
        style_library: { entries: [] },
        library: { types: [{ id: 'lt1', name: '品牌形象', note: '' }] },
      },
    };
    const { sections } = buildGroupedView('examples', briefs, noApprovals);
    expect(sections.length).toBeGreaterThan(0);
    const stage3 = sections.find((s) => s.stage === 'stage3');
    expect(stage3).toBeDefined();
  });

  it('projectLayer：templates 層 completeness 計算正確', () => {
    const briefs = {
      stage4f: {
        status: 'complete',
        template_pack: [{ name: '貼文封面', file: 'cover.svg' }],
      },
    };
    const projection = projectLayer('templates', briefs, noApprovals);
    expect(projection.kind).toBe('templates');
    expect(projection.completeness.total).toBeGreaterThan(0);
    expect(projection.completeness.done).toBe(projection.completeness.total);
    expect(projection.exportName).toBe('brand-templates');
  });
});
