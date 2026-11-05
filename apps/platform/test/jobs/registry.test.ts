import { describe, expect, it } from 'vitest';
import { createHandlerRegistry, type JobHandler } from '../../src/jobs/registry';

/**
 * handler 註冊表（issue #85「對外公開…」與第 6 點）。
 *
 * 這一層存在的理由只有一個：type 一定要對應到程式裡明寫的函數。
 * 如果 type 可以由 payload 或資料庫決定「要執行哪段程式」，那張表就變成
 * 遠端執行介面。所以註冊表是唯一的入口，而且未註冊的 type 領取不到。
 */

const noop: JobHandler = async () => undefined;

describe('handler 註冊表', () => {
  it('註冊了的 type 拿得回 handler，未註冊的拿不到', () => {
    const registry = createHandlerRegistry({ 'demo.noop': noop });

    expect(registry.get('demo.noop')).toBe(noop);
    expect(registry.get('demo.other')).toBeUndefined();
    expect(registry.has('demo.noop')).toBe(true);
    expect(registry.has('demo.other')).toBe(false);
  });

  it('types() 排序固定，用來做領取條件與啟動日誌', () => {
    const registry = createHandlerRegistry({ 'z.last': noop, 'a.first': noop, 'm.middle': noop });

    expect(registry.types()).toEqual(['a.first', 'm.middle', 'z.last']);
  });

  it('空註冊表可以存在（worker 起得到，但領取不到任何工作）', () => {
    const registry = createHandlerRegistry({});

    expect(registry.types()).toEqual([]);
    expect(registry.has('anything')).toBe(false);
  });

  it('type 名不合法就即刻擲錯，不會靜靜跳過', () => {
    for (const bad of ['Demo', 'has space', '1st', 'a..b', '']) {
      expect(() => createHandlerRegistry({ [bad]: noop })).toThrow(/type/);
    }
  });

  it('handler 不是函數就即刻擲錯', () => {
    expect(() =>
      createHandlerRegistry({ 'demo.broken': 'not a function' as unknown as JobHandler }),
    ).toThrow(/handler/);
  });

  it('註冊表是凍結的：事後改不動，避免有程式偷偷加一個 handler', () => {
    const handlers: Record<string, JobHandler> = { 'demo.noop': noop };
    const registry = createHandlerRegistry(handlers);

    handlers['demo.injected'] = noop;

    expect(registry.has('demo.injected')).toBe(false);
  });
});
