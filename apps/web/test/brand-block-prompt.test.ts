import { describe, expect, it } from 'vitest';
import { buildBlockPrompt } from '../src/design/brand-block-prompt';

/**
 * Prompt 是這個工作流的實際介面：貼出去之後 agent 靠它知道要傾邊一格。
 * 所以測的是「這幾件事有冇出現」，不是整段文字逐字比對 —— 逐字比對會令
 * 每次改語氣都要改測試，最後冇人睇內容。
 */
describe('區塊 prompt', () => {
  const base = {
    brandName: 'Moonic',
    brandId: '8a1a1c1e-0000-4000-8000-000000000001',
    stageNum: '00',
    stageName: '業務基礎',
    stageId: 'stage0' as const,
    code: '00.1',
    title: '業務狀態',
    blockId: 'set:basic',
    decision: { text: '', at: null, by: '', actorType: 'human' as const },
    history: [],
    historyTotal: 0,
  };

  it('帶齊位置與識別碼', () => {
    const prompt = buildBlockPrompt({
      ...base,
      fields: [{ title: '你現在在哪一步？', kind: 'choice', values: ['準備中（未開業）'], options: ['只想法', '準備中（未開業）'] }],
    });

    expect(prompt).toContain('Moonic');
    expect(prompt).toContain('00 業務基礎');
    expect(prompt).toContain('00.1 業務狀態');
    expect(prompt).toContain(`brand: ${base.brandId}`);
    expect(prompt).toContain('stage: stage0');
    expect(prompt).toContain('block: set:basic');
  });

  it('已選與未填分開列，agent 唔會重新建議已定的選項', () => {
    const prompt = buildBlockPrompt({
      ...base,
      fields: [
        { title: '你現在在哪一步？', kind: 'choice', values: ['準備中（未開業）'], options: ['只想法', '準備中（未開業）'] },
        { title: '行業', kind: 'multi', values: [], options: ['中醫診所', '美容'] },
      ],
    });

    const doneSection = prompt.split('## 我而家嘅選擇')[1]?.split('## 仲未填')[0] ?? '';
    const todoSection = prompt.split('## 仲未填')[1]?.split('## 可以揀嘅選項')[0] ?? '';

    expect(doneSection).toContain('準備中（未開業）');
    expect(doneSection).not.toContain('行業');
    expect(todoSection).toContain('行業');
  });

  it('自由文字欄位唔會假裝有選項', () => {
    const prompt = buildBlockPrompt({
      ...base,
      fields: [{ title: '一句話說明', kind: 'text', values: [], options: [] }],
    });

    expect(prompt).toContain('自由文字，唔使揀選項');
  });

  it('全部填妥時講清楚，不是留一個空清單', () => {
    const prompt = buildBlockPrompt({
      ...base,
      fields: [{ title: '你現在在哪一步？', kind: 'choice', values: ['準備中'], options: ['準備中'] }],
    });

    expect(prompt).toContain('全部欄位都已填');
  });

  it('品牌未命名都有可讀的稱呼', () => {
    const prompt = buildBlockPrompt({ ...base, brandName: '   ', fields: [] });

    expect(prompt).toContain('（未命名品牌）');
  });

  it('冇任何選擇時唔會出一段空白', () => {
    const prompt = buildBlockPrompt({ ...base, fields: [] });

    expect(prompt).toContain('這一格還未有選擇');
  });

  it('未寫決策時講清楚未有共識，不是留空', () => {
    const prompt = buildBlockPrompt({ ...base, fields: [] });

    expect(prompt).toContain('## 目前決策（現況）');
    expect(prompt).toContain('未寫，這一格還未有共識');
    expect(prompt).toContain('未有舊版本');
  });

  it('帶上目前決策與之前的版本，agent 不用由零開始', () => {
    const prompt = buildBlockPrompt({
      ...base,
      fields: [],
      decision: { text: '先做旺角小店，月租控制在 4 萬以内。', at: '17/11 19:04', by: 'Billy', actorType: 'human' },
      history: [
        { at: '17/11 18:20', by: 'Billy', text: '考慮過銅鑼灣，租金太貴。', actorType: 'human' },
        { at: '17/11 17:05', by: 'brand-agent', text: '最初想做網店先。', actorType: 'agent' },
      ],
      historyTotal: 2,
    });

    expect(prompt).toContain('先做旺角小店');
    expect(prompt).toContain('考慮過銅鑼灣');
    expect(prompt).toContain('最初想做網店先');
    // 之前經 agent 寫的版本要標明身份，人才看得出邊一版是 AI 的結論。
    expect(prompt).toContain('AI Agent（brand-agent）');
    expect(prompt).toContain('共 2 版');
  });

  it('品牌集內的卡片：識別碼帶 set，寫回參數亦帶 setId', () => {
    const setId = '5f0c9d4e-0000-4000-8000-0000000000aa';

    const inSet = buildBlockPrompt({
      ...base,
      stageNum: '04B',
      stageName: '圖形表面',
      stageId: 'stage4b',
      code: '04B.1',
      setId,
      setName: '2026 夏季',
      fields: [],
    });

    // 同一個 block_id 在每一套品牌集都一樣，少了 set 那一行，agent 寫回時
    // 會改錯另一套 —— 這是資料錯誤，不是文案問題。
    expect(inSet).toContain(`set: ${setId}（2026 夏季）`);
    expect(inSet).toContain(`setId=${setId}`);

    const brandLevel = buildBlockPrompt({ ...base, fields: [] });

    expect(brandLevel).not.toContain('set: ');
  });

  it('寫回系統一節指出 MCP 工具與三個識別碼', () => {
    const prompt = buildBlockPrompt({ ...base, fields: [] });

    expect(prompt).toContain('brand_block_save_decision');
    expect(prompt).toContain(`brandId=${base.brandId}`);
    expect(prompt).toContain('stage=stage0');
    expect(prompt).toContain('blockId=set:basic');
    expect(prompt).toContain('一定要我明確批准');
  });
});
