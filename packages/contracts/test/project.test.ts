import { describe, expect, it } from 'vitest';
import { deriveProjectState, parseProjectBriefDocument, type ProjectFacts } from '../src/project/index';

const EMPTY: ProjectFacts = {
  hasAgentRun: false,
  hasBrief: false,
  openNeedCount: 0,
  hasCompleteComposition: false,
  hasActiveRender: false,
  hasOutput: false,
  receivedAt: null,
};

describe('Project 狀態由事實推導', () => {
  it('逐項覆蓋待接手至已收貨，並保持優先次序', () => {
    expect(deriveProjectState(EMPTY)).toBe('awaiting_agent');
    expect(deriveProjectState({ ...EMPTY, hasAgentRun: true })).toBe('planning');
    expect(deriveProjectState({ ...EMPTY, hasBrief: true })).toBe('planning');
    expect(deriveProjectState({ ...EMPTY, hasAgentRun: true, openNeedCount: 1 })).toBe('waiting_materials');
    expect(deriveProjectState({ ...EMPTY, hasCompleteComposition: true })).toBe('ready_to_render');
    expect(deriveProjectState({ ...EMPTY, hasActiveRender: true })).toBe('rendering');
    expect(deriveProjectState({ ...EMPTY, hasOutput: true })).toBe('produced');
    expect(deriveProjectState({ ...EMPTY, hasOutput: true, receivedAt: '2026-11-16T00:00:00.000Z' })).toBe('received');
    expect(deriveProjectState({ ...EMPTY, openNeedCount: 1, hasOutput: true })).toBe('produced');
  });
});

describe('Brief document 契約', () => {
  it('只接受整理稿需要的欄位並正規化字串', () => {
    const result = parseProjectBriefDocument({
      objective: ' 目的 ',
      audience: ' 受眾 ',
      channel: ' IG ',
      format: ' Carousel ',
      language: ' 繁中 ',
      constraints: [' 不作保證 '],
      dueDate: '2026-12-01',
    });
    expect(result).toEqual({
      ok: true,
      value: {
        objective: '目的',
        audience: '受眾',
        channel: 'IG',
        format: 'Carousel',
        language: '繁中',
        constraints: ['不作保證'],
        dueDate: '2026-12-01',
      },
    });
  });

  it('空白內容與不存在日期不可成為 Brief 真相', () => {
    expect(parseProjectBriefDocument({}).ok).toBe(false);
    expect(parseProjectBriefDocument({
      objective: '目的', audience: '受眾', channel: 'IG', format: 'Carousel', language: '繁中',
      dueDate: '2026-02-31',
    }).ok).toBe(false);
  });
});
