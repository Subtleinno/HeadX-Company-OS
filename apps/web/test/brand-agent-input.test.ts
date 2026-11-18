import { describe, expect, it } from 'vitest';
import {
  buildAgentInput,
  buildScopeAgentInput,
  isEmptyAgentInput,
  isEmptyScopeAgentInput,
  type AgentInputBlock,
} from '../src/design/brand-agent-input';

/**
 * AI Agent 匯出的閘門。
 *
 * 這裡要守住三件事：只帶已填的決策、只帶未移除的檔案、檔案要連位置。
 * 任何一項失守，agent 就會拿到未決定的內容或者讀不到的檔名 —— 比沒有匯出更差。
 */

const context = {
  brandId: 'brand-1',
  brandName: 'Moonic 滿月堂',
  stageId: 'stage1',
  stageNum: '01',
  stageName: '定位與張力',
};

const sections = [
  { blockId: 'set:promise', code: '01.1', title: '承諾' },
  { blockId: 'set:tension', code: '01.2', title: '張力' },
  { blockId: 'set:empty', code: '01.3', title: '未填的一格' },
];

function block(overrides: Partial<AgentInputBlock> = {}): AgentInputBlock {
  return {
    decision: '',
    decisionAt: null,
    decisionByName: null,
    decisionActorType: 'human',
    files: [],
    ...overrides,
  };
}

describe('buildAgentInput', () => {
  it('只帶有內容的決策，未填的格子完全不提', () => {
    const payload = buildAgentInput({
      context,
      sections,
      blocks: {
        'set:promise': block({
          decision: ' 讓客人一次就明白我們做甚麼 ',
          decisionAt: '2026-11-17T10:00:00.000Z',
          decisionByName: 'Billy Chung',
        }),
        'set:tension': block({ decision: '   ' }),
      },
      origin: 'https://headx.example.com',
    });

    expect(payload.decisions).toEqual([
      {
        block: '01.1',
        title: '承諾',
        decision: '讓客人一次就明白我們做甚麼',
        by: 'Billy Chung',
        byType: 'human',
        at: '2026-11-17T10:00:00.000Z',
      },
    ]);
    // 01.2 只有空白、01.3 冇紀錄 —— 兩者都不應該出現。
    expect(payload.decisions).toHaveLength(1);
    expect(payload.files).toEqual([]);
  });

  it('檔案帶絕對位置，已移除的不匯出', () => {
    const payload = buildAgentInput({
      context,
      sections,
      blocks: {
        'set:promise': block({
          files: [
            {
              fileId: 'file a/1',
              name: '品牌簡報.pdf',
              contentType: 'application/pdf',
              sizeBytes: 2048,
              uploadedByName: 'Billy Chung',
              createdAt: '2026-11-17T09:00:00.000Z',
              removedAt: null,
            },
            {
              fileId: 'file-gone',
              name: '舊版.pdf',
              contentType: 'application/pdf',
              sizeBytes: 10,
              uploadedByName: 'Billy Chung',
              createdAt: '2026-11-16T09:00:00.000Z',
              removedAt: '2026-11-17T09:30:00.000Z',
            },
          ],
        }),
      },
      origin: 'https://headx.example.com/',
    });

    expect(payload.files).toHaveLength(1);
    expect(payload.files[0]).toMatchObject({
      block: '01.1',
      title: '承諾',
      name: '品牌簡報.pdf',
      url: 'https://headx.example.com/api/files/file%20a%2F1',
    });
  });

  it('跟畫面次序，沒有紀錄的格子跳過；品牌與階段只用識別碼與名', () => {
    const payload = buildAgentInput({
      context,
      sections,
      blocks: {
        'set:tension': block({ decision: '先講痛點', decisionActorType: 'agent', decisionByName: 'Claude' }),
        'set:promise': block({ decision: '先講承諾' }),
        'set:orphan': block({ decision: '孤兒紀錄' }),
      },
      origin: 'https://headx.example.com',
    });

    expect(payload.decisions.map((item) => item.block)).toEqual(['01.1', '01.2']);
    expect(payload.brand).toEqual({ id: 'brand-1', name: 'Moonic 滿月堂' });
    expect(payload.stage).toEqual({ id: 'stage1', code: '01', name: '定位與張力' });
  });

  it('匯出不含 brief／state：貼進對話不應該帶一整份選項庫', () => {
    const payload = buildAgentInput({
      context,
      sections,
      blocks: { 'set:promise': block({ decision: '一句話' }) },
      origin: 'https://headx.example.com',
    });

    expect(Object.keys(payload)).toEqual(['brand', 'stage', 'decisions', 'files']);
  });

  it('一粒都冇：就是空，不要用佔位字扮有內容', () => {
    const payload = buildAgentInput({ context, sections, blocks: {}, origin: 'https://headx.example.com' });

    expect(isEmptyAgentInput(payload)).toBe(true);
    expect(payload.decisions).toEqual([]);
    expect(payload.files).toEqual([]);
  });

  it('只有檔案沒有決策都算有內容', () => {
    const payload = buildAgentInput({
      context,
      sections,
      blocks: {
        'set:tension': block({
          files: [
            {
              fileId: 'f1',
              name: 'ref.png',
              contentType: 'image/png',
              sizeBytes: 1,
              uploadedByName: 'Billy Chung',
              createdAt: '2026-11-17T09:00:00.000Z',
              removedAt: null,
            },
          ],
        }),
      },
      origin: 'https://headx.example.com',
    });

    expect(isEmptyAgentInput(payload)).toBe(false);
  });
});

/**
 * 總覽層（品牌總覽 01–03、一個品牌集）的匯出閘門。
 *
 * 這一組要守住的是「分得清邊一站」：同一個位置編號在每套品牌集都會出現，
 * 所以每條決策要留在自己所屬的階段之內，而不是被攤平成一份沒有出處的清單。
 */
describe('buildScopeAgentInput', () => {
  function scopedBlock(
    code: string,
    title: string,
    overrides: Partial<AgentInputBlock> = {},
  ): AgentInputBlock & { blockId: string; code: string; title: string } {
    return { blockId: `block-${code}`, code, title, ...block(overrides) };
  }

  it('逐站分開，空站完全不輸出，但 scope 仍然講得出整個範圍有幾站', () => {
    const payload = buildScopeAgentInput({
      brand: { id: 'brand-1', name: 'Moonic 滿月堂' },
      scope: { kind: 'brand', id: null, name: '品牌總覽' },
      stages: [
        {
          id: 'stage1',
          code: '01',
          name: '定位與張力',
          blocks: [scopedBlock('01.10', '較後', { decision: '第十項' }), scopedBlock('01.2', '較前', { decision: '第二項' })],
        },
        { id: 'stage2', code: '02', name: '語氣', blocks: [] },
        { id: 'stage3', code: '03', name: '視覺', blocks: [scopedBlock('03.1', '色', { decision: '奶油白' })] },
      ],
      origin: 'https://headx.example.com',
    });

    // 位置編號按數字排序：01.2 要排 01.10 之前，不是字串比對。
    expect(payload.stages.map((stage) => stage.code)).toEqual(['01', '03']);
    expect(payload.stages[0]?.decisions.map((item) => item.block)).toEqual(['01.2', '01.10']);
    expect(payload.scope).toEqual({ kind: 'brand', id: null, name: '品牌總覽', stages: ['01', '02', '03'] });
    expect(payload.brand).toEqual({ id: 'brand-1', name: 'Moonic 滿月堂' });
  });

  it('品牌集認得自己的 id；未移除的檔案連位置，已移除的不出現', () => {
    const payload = buildScopeAgentInput({
      brand: { id: 'brand-1', name: 'Moonic 滿月堂' },
      scope: { kind: 'brand-set', id: 'set-1', name: '2026 夏季' },
      stages: [
        {
          id: 'stage4b',
          code: '04B',
          name: '圖形表面',
          blocks: [
            scopedBlock('04B.1', '標誌', {
              decision: '單線圓章',
              files: [
                {
                  fileId: 'f1',
                  name: 'logo.pdf',
                  contentType: 'application/pdf',
                  sizeBytes: 42,
                  uploadedByName: 'Billy Chung',
                  createdAt: '2026-11-17T09:00:00.000Z',
                  removedAt: null,
                },
                {
                  fileId: 'f2',
                  name: 'old.png',
                  contentType: 'image/png',
                  sizeBytes: 7,
                  uploadedByName: 'Billy Chung',
                  createdAt: '2026-11-17T08:00:00.000Z',
                  removedAt: '2026-11-17T10:00:00.000Z',
                },
              ],
            }),
          ],
        },
      ],
      origin: 'https://headx.example.com',
    });

    expect(payload.scope).toEqual({ kind: 'brand-set', id: 'set-1', name: '2026 夏季', stages: ['04B'] });
    expect(payload.stages[0]?.files).toEqual([
      {
        block: '04B.1',
        title: '標誌',
        fileId: 'f1',
        name: 'logo.pdf',
        type: 'application/pdf',
        bytes: 42,
        uploadedBy: 'Billy Chung',
        uploadedAt: '2026-11-17T09:00:00.000Z',
        url: 'https://headx.example.com/api/files/f1',
      },
    ]);
  });

  it('全部站都空：isEmptyScopeAgentInput 為真，不要出一份 empty 陣列扮有內容', () => {
    const payload = buildScopeAgentInput({
      brand: { id: 'brand-1', name: 'Moonic 滿月堂' },
      scope: { kind: 'brand-set', id: 'set-1', name: '2026 夏季' },
      stages: [
        { id: 'stage4b', code: '04B', name: '圖形表面', blocks: [scopedBlock('04B.1', '標誌', { decision: '   ' })] },
        { id: 'stage4c', code: '04C', name: '影像', blocks: [] },
      ],
      origin: 'https://headx.example.com',
    });

    expect(isEmptyScopeAgentInput(payload)).toBe(true);
    expect(payload.stages).toEqual([]);
    expect(payload.scope.stages).toEqual(['04B', '04C']);
  });
});

